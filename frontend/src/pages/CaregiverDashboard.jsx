import React, { useCallback, useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useUser } from "@clerk/clerk-react";
import Header from "../components/Header";
import ShiftNoteTemplate from "../components/ShiftNoteTemplate";
import TaskTimerPanel from "../components/TaskTimerPanel";
import UpcomingCalendarPanel from "../components/UpcomingCalendarPanel";
import api from "../services/api";
import { listMyJobs } from "../services/jobs";
import { getMe } from "../services/me";

const CaregiverDashboard = () => {
  const [isAdmin, setIsAdmin] = useState(false);
  const [tenantId, setTenantId] = useState(null);
  const [tenantCheckLoading, setTenantCheckLoading] = useState(true);
  const [geofenceEnabled, setGeofenceEnabled] = useState(false);

  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [totalHours, setTotalHours] = useState(0);
  const [currentlyClockedIn, setCurrentlyClockedIn] = useState(false);
  const [activeShiftStartMs, setActiveShiftStartMs] = useState(null);
  const [liveShiftSeconds, setLiveShiftSeconds] = useState(0);
  const [jobs, setJobs] = useState([]);
  const [selectedJobId, setSelectedJobId] = useState("");
  const [jobsLoading, setJobsLoading] = useState(false);

  const [missedPunchRequests, setMissedPunchRequests] = useState([]);
  const [requestingEntry, setRequestingEntry] = useState(null);
  const [requestedTimeLocal, setRequestedTimeLocal] = useState("");
  const [requestReason, setRequestReason] = useState("");
  const [requestStatusMsg, setRequestStatusMsg] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);

  const navigate = useNavigate();
  const { user, isLoaded, isSignedIn } = useUser();

  useEffect(() => {
    let cancelled = false;

    if (!isLoaded) return;
    if (!isSignedIn) {
      setIsAdmin(false);
      setTenantId(null);
      setTenantCheckLoading(false);
      return;
    }

    setTenantCheckLoading(true);

    (async () => {
      try {
        const me = await getMe({ forceRefresh: true });
        if (cancelled) return;
        setIsAdmin(me?.role === "admin");
        setTenantId(me?.tenantId || null);
        setGeofenceEnabled(Boolean(me?.geofence?.enabled));
      } catch {
        // If /auth/me briefly fails during sign-in, we don't want to break the page.
        // Admin button will simply not render.
        if (cancelled) return;
        setIsAdmin(false);
        setTenantId(null);
        setGeofenceEnabled(false);
      } finally {
        if (cancelled) return;
        setTenantCheckLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  const logout = useCallback(() => {
    navigate("/sign-out", { replace: true });
  }, [navigate]);

  const calculateTotals = useCallback((logsData) => {
    const total = logsData.reduce((sum, log) => {
      const out = log.effectivePunchOut ?? log.punchOut;
      const inn = log.effectivePunchIn ?? log.punchIn;

      if (inn && out) {
        return (
          sum +
          (new Date(out) - new Date(inn)) /
            (1000 * 60 * 60)
        );
      }
      return sum;
    }, 0);

    setTotalHours(total);

    const activeShift = logsData.find((log) => {
      const inn = log.effectivePunchIn ?? log.punchIn;
      const out = log.effectivePunchOut ?? log.punchOut;
      return Boolean(inn && !out);
    });
    setCurrentlyClockedIn(!!activeShift);

    if (activeShift) {
      const activePunchIn = new Date(activeShift.effectivePunchIn ?? activeShift.punchIn).getTime();
      setActiveShiftStartMs(Number.isNaN(activePunchIn) ? null : activePunchIn);
      if (!Number.isNaN(activePunchIn)) {
        setLiveShiftSeconds(Math.max(0, Math.floor((Date.now() - activePunchIn) / 1000)));
      }
    } else {
      setActiveShiftStartMs(null);
      setLiveShiftSeconds(0);
    }
  }, []);

  useEffect(() => {
    if (!currentlyClockedIn || !activeShiftStartMs) return undefined;

    const tick = () => {
      setLiveShiftSeconds(Math.max(0, Math.floor((Date.now() - activeShiftStartMs) / 1000)));
    };

    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [currentlyClockedIn, activeShiftStartMs]);

  const toLocalDateTimeValue = (d) => {
    const date = d instanceof Date ? d : new Date(d);
    if (Number.isNaN(date.getTime())) return "";
    const tzOffsetMs = date.getTimezoneOffset() * 60 * 1000;
    const local = new Date(date.getTime() - tzOffsetMs);
    return local.toISOString().slice(0, 16);
  };

  const fetchMyRequests = useCallback(async () => {
    try {
      const res = await api.get("/missed-punch/requests/mine");
      setMissedPunchRequests(Array.isArray(res.data.requests) ? res.data.requests : []);
    } catch (err) {
      // Non-fatal; requests are an optional helper feature.
    }
  }, []);

  const fetchMyJobs = useCallback(async () => {
    try {
      setJobsLoading(true);
      const { jobs: availableJobs, defaultJobId } = await listMyJobs();
      setJobs(availableJobs);
      setSelectedJobId((current) => current || defaultJobId || availableJobs[0]?._id || "");
    } catch (err) {
      setJobs([]);
      setSelectedJobId("");
      setError(err?.response?.data?.message || "Failed to load jobs");
    } finally {
      setJobsLoading(false);
    }
  }, []);

  const fetchMyLogs = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const res = await api.get("/timeclock/my-logs");
      const logsData = res.data.logs || [];
      setLogs(logsData);
      calculateTotals(logsData);
      fetchMyRequests();
    } catch (err) {
      console.error("FETCH LOGS ERROR:", err);
      if (err.response?.status === 401) {
        logout();
        return;
      }
      setError(err.response?.data?.message || "Failed to load logs");
    } finally {
      setLoading(false);
    }
  }, [calculateTotals, fetchMyRequests, logout]);

  // Only requests location when the facility actually has geofencing on -
  // resolves to null (rather than rejecting) on any failure, so the punch
  // request still goes through and lets the backend return its own clear
  // error message if location turns out to be required.
  const getCurrentCoordsIfNeeded = () => {
    if (!geofenceEnabled) return Promise.resolve(null);
    if (!navigator.geolocation) return Promise.resolve(null);

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15000 }
      );
    });
  };

  const handlePunchIn = async () => {
    try {
      setError("");

      if (!selectedJobId) {
        setError("Select a job before punching in.");
        return;
      }

      setLoading(true);
      const coords = await getCurrentCoordsIfNeeded();
      await api.post("/timeclock/punch-in", { jobId: selectedJobId, ...coords });
      await fetchMyLogs();
    } catch (err) {
      console.error("PUNCH IN ERROR:", err);
      if (err.response?.status === 401) {
        logout();
        return;
      }
      setError(err.response?.data?.message || "Punch in failed");
    } finally {
      setLoading(false);
    }
  };

  const handlePunchOut = async () => {
    try {
      setError("");
      setLoading(true);
      const coords = await getCurrentCoordsIfNeeded();
      await api.post("/timeclock/punch-out", { ...coords });
      await fetchMyLogs();
    } catch (err) {
      console.error("PUNCH OUT ERROR:", err);
      if (err.response?.status === 401) {
        logout();
        return;
      }
      setError(err.response?.data?.message || "Punch out failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    fetchMyLogs();
    fetchMyJobs();
  }, [fetchMyJobs, fetchMyLogs, isLoaded, isSignedIn]);

  if (!isLoaded || tenantCheckLoading) {
    return (
      <div style={{ padding: 24 }}>
        <p>Checking facility setup…</p>
      </div>
    );
  }

  if (isSignedIn && !tenantId) {
    return <Navigate to="/tenant-setup" replace />;
  }

  const formatDateTime = (date) => (date ? new Date(date).toLocaleString() : "-");

  const formatDuration = (totalSeconds) => {
    if (!totalSeconds || totalSeconds < 0) return "00:00:00";
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const seconds = String(totalSeconds % 60).padStart(2, "0");
    return `${hours}:${minutes}:${seconds}`;
  };

  const latestRequestByEntryId = missedPunchRequests.reduce((acc, r) => {
    const entryId = r?.timeEntry?._id || r?.timeEntry;
    if (!entryId) return acc;
    const key = String(entryId);
    const existing = acc[key];
    if (!existing) {
      acc[key] = r;
      return acc;
    }
    const existingCreated = new Date(existing.createdAt || 0).getTime();
    const currentCreated = new Date(r.createdAt || 0).getTime();
    if (currentCreated > existingCreated) acc[key] = r;
    return acc;
  }, {});

  const openMissedPunchRequest = (entry) => {
    setRequestStatusMsg("");
    setRequestingEntry(entry || null);
    setRequestedTimeLocal(toLocalDateTimeValue(new Date()));
    setRequestReason("");
  };

  const submitMissedPunchRequest = async () => {
    if (!requestingEntry) return;
    setRequestBusy(true);
    setRequestStatusMsg("");
    try {
      await api.post("/missed-punch/requests", {
        timeEntryId: requestingEntry._id,
        missingField: "punchOut",
        requestedTime: new Date(requestedTimeLocal).toISOString(),
        reason: requestReason,
      });
      setRequestingEntry(null);
      await fetchMyRequests();
      await fetchMyLogs();
    } catch (err) {
      setRequestStatusMsg(err.response?.data?.message || "Failed to submit request");
    } finally {
      setRequestBusy(false);
    }
  };

  const cancelMissedPunchRequest = async (requestId) => {
    if (!requestId) return;
    setRequestBusy(true);
    setRequestStatusMsg("");
    try {
      await api.post(`/missed-punch/requests/${requestId}/cancel`, {});
      setRequestStatusMsg("Request cancelled.");
      await fetchMyRequests();
    } catch (err) {
      setRequestStatusMsg(err.response?.data?.message || "Failed to cancel request");
    } finally {
      setRequestBusy(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#f5f5f5",
        padding: "20px",
      }}
    >
      <Header title="Staff Dashboard" />
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "20px",
          }}
        >
          <div>
            <h1>Staff Dashboard</h1>
            {user?.primaryEmailAddress?.emailAddress && (
              <p>
                Signed in as: <strong>{user.primaryEmailAddress.emailAddress}</strong>
              </p>
            )}
          </div>
          <div>
            {isAdmin && (
              <button
                onClick={() => navigate("/admin")}
                style={{
                  background: "#007bff",
                  color: "white",
                  border: "none",
                  padding: "10px 20px",
                  borderRadius: "5px",
                  marginRight: "10px",
                }}
              >
                Switch to Admin View
              </button>
            )}
            <button
              onClick={logout}
              style={{
                background: "#dc3545",
                color: "white",
                border: "none",
                padding: "10px 20px",
                borderRadius: "5px",
              }}
            >
              Logout
            </button>
          </div>
        </div>

        {error && (
          <div
            style={{
              background: "#f8d7da",
              color: "#721c24",
              padding: "10px",
              borderRadius: "5px",
              marginBottom: "20px",
            }}
          >
            {error}
          </div>
        )}

        <UpcomingCalendarPanel />
        <TaskTimerPanel />

        <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
          <div
            style={{
              background: currentlyClockedIn ? "#ff6b6b" : "#4CAF50",
              color: "white",
              padding: "20px",
              borderRadius: "10px",
              flex: 1,
              textAlign: "center",
            }}
          >
            <h2 style={{ margin: "0 0 10px 0" }}>{totalHours.toFixed(2)} hrs</h2>
            <p>Total hours worked</p>
          </div>
          <div
            style={{
              background: currentlyClockedIn ? "#fff3cd" : "#d4edda",
              padding: "20px",
              borderRadius: "10px",
              flex: 1,
              textAlign: "center",
            }}
          >
            <h3>{currentlyClockedIn ? "🟢 CLOCKED IN" : "⏳ Clocked Out"}</h3>
              {currentlyClockedIn ? (
                <p style={{ margin: "8px 0 0", color: "#6b4f00", fontWeight: 700 }}>
                  Current shift: {formatDuration(liveShiftSeconds)}
                </p>
              ) : (
                <p style={{ margin: "8px 0 0", color: "#2f5d33", fontWeight: 600 }}>
                  You are currently off shift
                </p>
              )}
          </div>
        </div>

        <div
          style={{
            background: "white",
            padding: "20px",
            borderRadius: "10px",
            marginBottom: "20px",
            textAlign: "center",
          }}
        >
          <div style={{ marginBottom: 16, textAlign: "left" }}>
            <label style={{ display: "block", fontSize: 13, color: "#6b7280", marginBottom: 6 }}>
              Job for next shift
            </label>
            <select
              value={selectedJobId}
              onChange={(event) => setSelectedJobId(event.target.value)}
              disabled={jobsLoading || currentlyClockedIn || loading || jobs.length === 0}
              style={{
                width: "100%",
                maxWidth: 360,
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #d1d5db",
              }}
            >
              <option value="">Select a job</option>
              {jobs.map((job) => (
                <option key={job._id} value={job._id}>
                  {job.name}
                </option>
              ))}
            </select>
            {jobs.length === 0 && !jobsLoading ? (
              <div style={{ marginTop: 8, color: "#b45309", fontSize: 13 }}>
                No active jobs are configured for this facility yet. Ask an admin to add one.
              </div>
            ) : null}
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: "20px" }}>
            <button
              onClick={handlePunchIn}
              disabled={loading || currentlyClockedIn || !selectedJobId || jobs.length === 0}
              style={{
                padding: "15px 30px",
                backgroundColor:
                  loading || currentlyClockedIn || !selectedJobId || jobs.length === 0
                    ? "#ccc"
                    : "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "16px",
                cursor:
                  loading || currentlyClockedIn || !selectedJobId || jobs.length === 0
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {loading ? "Processing..." : "🟢 Punch In"}
            </button>
            <button
              onClick={handlePunchOut}
              disabled={loading || !currentlyClockedIn}
              style={{
                padding: "15px 30px",
                backgroundColor: loading || !currentlyClockedIn ? "#ccc" : "#f44336",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "16px",
                cursor: loading || !currentlyClockedIn ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Processing..." : "🔴 Punch Out"}
            </button>
          </div>
        </div>

        <div style={{ background: "white", padding: "20px", borderRadius: "10px" }}>
          <h3>My Recent Shifts ({logs.length})</h3>
          {loading ? (
            <p>Loading shifts...</p>
          ) : logs.length === 0 ? (
            <p>No shifts yet. Punch in to start tracking!</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8f9fa" }}>
                  <th style={{ padding: "12px", textAlign: "left" }}>Date</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Job</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Punch In</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Punch Out</th>
                  <th style={{ padding: "12px", textAlign: "right" }}>Hours</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const inn = log.effectivePunchIn ?? log.punchIn;
                  const out = log.effectivePunchOut ?? log.punchOut;

                  const hours =
                    inn && out
                      ? (
                          (new Date(out) - new Date(inn)) /
                          (1000 * 60 * 60)
                        ).toFixed(2)
                      : "-";

                  const isCorrected = Boolean(log.effectivePunchOut && !log.punchOut);
                  const isMissingPunchOut = !log.punchOut && !log.effectivePunchOut;
                  const latestRequest = latestRequestByEntryId[String(log._id)];
                  const reqStatus = latestRequest?.status;
                  const hasPending = reqStatus === "pending";
                  const isRejected = reqStatus === "rejected";
                  const isCancelled = reqStatus === "cancelled";
                  const canRequestNew = isMissingPunchOut && (!latestRequest || isCancelled || isRejected);

                  return (
                    <tr key={log._id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "12px" }}>
                        {log.punchIn
                          ? new Date(log.punchIn).toLocaleDateString()
                          : "-"}
                      </td>
                      <td style={{ padding: "12px" }}>
                        {log.jobSnapshot?.name || log.job?.name || "-"}
                      </td>
                      <td style={{ padding: "12px" }}>{formatDateTime(log.punchIn)}</td>
                      <td style={{ padding: "12px" }}>
                        <span style={{ color: log.punchOut ? "#28a745" : "#ffc107" }}>
                          {formatDateTime(out)}
                        </span>
                        {isCorrected && (
                          <span style={{ marginLeft: 8, color: "#6b7280", fontSize: 12 }}>
                            (corrected)
                          </span>
                        )}

                        {isMissingPunchOut && (
                          <div style={{ marginTop: 8 }}>
                            {hasPending && (
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                <span style={{
                                  display: "inline-flex", alignItems: "center", gap: 4,
                                  background: "#fef3c7", color: "#92400e",
                                  fontSize: 12, fontWeight: 600, padding: "3px 8px",
                                  borderRadius: 99, border: "1px solid #fde68a",
                                }}>
                                  ⏳ Pending review
                                </span>
                                <button
                                  onClick={() => cancelMissedPunchRequest(latestRequest?._id)}
                                  disabled={requestBusy}
                                  style={{
                                    padding: "3px 10px", borderRadius: 6, fontSize: 12,
                                    border: "1px solid #e5e7eb", background: "white",
                                    cursor: requestBusy ? "not-allowed" : "pointer", color: "#374151",
                                  }}
                                >
                                  Withdraw
                                </button>
                              </div>
                            )}
                            {isRejected && (
                              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                <span style={{
                                  display: "inline-flex", alignItems: "center", gap: 4,
                                  background: "#fee2e2", color: "#991b1b",
                                  fontSize: 12, fontWeight: 600, padding: "3px 8px",
                                  borderRadius: 99, border: "1px solid #fca5a5",
                                }}>
                                  ✕ Rejected
                                </span>
                                <button
                                  onClick={() => openMissedPunchRequest(log)}
                                  disabled={requestBusy}
                                  style={{
                                    padding: "3px 10px", borderRadius: 6, fontSize: 12,
                                    border: "1px solid #e5e7eb", background: "white",
                                    cursor: requestBusy ? "not-allowed" : "pointer", color: "#374151",
                                  }}
                                >
                                  Re-submit
                                </button>
                              </div>
                            )}
                            {canRequestNew && !isRejected && (
                              <button
                                onClick={() => openMissedPunchRequest(log)}
                                disabled={requestBusy}
                                style={{
                                  padding: "5px 12px", borderRadius: 6, fontSize: 13,
                                  border: "1px solid #d1d5db", background: "white",
                                  cursor: requestBusy ? "not-allowed" : "pointer",
                                  color: "#1d4ed8", fontWeight: 500,
                                }}
                              >
                                + Request punch-out
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: "12px", textAlign: "right", fontWeight: "bold" }}>
                        {hours}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Request History */}
        {missedPunchRequests.length > 0 && (
          <div style={{ background: "white", padding: "20px", borderRadius: "10px", marginTop: 20 }}>
            <h3 style={{ marginTop: 0, marginBottom: 12 }}>My Punch-Out Requests</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ backgroundColor: "#f8f9fa" }}>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }}>Shift Date</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }}>Requested Time</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }}>Status</th>
                  <th style={{ padding: "10px 12px", textAlign: "left", fontWeight: 600, color: "#374151" }}>Submitted</th>
                </tr>
              </thead>
              <tbody>
                {missedPunchRequests.map((req) => {
                  const statusStyles = {
                    pending:   { bg: "#fef3c7", color: "#92400e", border: "#fde68a", label: "⏳ Pending" },
                    approved:  { bg: "#d1fae5", color: "#065f46", border: "#6ee7b7", label: "✓ Approved" },
                    rejected:  { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5", label: "✕ Rejected" },
                    cancelled: { bg: "#f3f4f6", color: "#6b7280", border: "#e5e7eb", label: "— Withdrawn" },
                  };
                  const s = statusStyles[req.status] || statusStyles.cancelled;
                  const shiftDate = req.timeEntry?.punchIn
                    ? new Date(req.timeEntry.punchIn).toLocaleDateString()
                    : "-";
                  return (
                    <tr key={req._id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                      <td style={{ padding: "10px 12px" }}>{shiftDate}</td>
                      <td style={{ padding: "10px 12px" }}>
                        {req.requestedTime ? new Date(req.requestedTime).toLocaleString() : "-"}
                      </td>
                      <td style={{ padding: "10px 12px" }}>
                        <span style={{
                          display: "inline-block", padding: "3px 10px", borderRadius: 99,
                          fontSize: 12, fontWeight: 600,
                          background: s.bg, color: s.color, border: `1px solid ${s.border}`,
                        }}>
                          {s.label}
                        </span>
                      </td>
                      <td style={{ padding: "10px 12px", color: "#6b7280", fontSize: 13 }}>
                        {req.createdAt ? new Date(req.createdAt).toLocaleDateString() : "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Shift Note Dictation and Form Template */}
        <div style={{ marginTop: 24 }}>
          <ShiftNoteTemplate />
        </div>
      </div>

      {/* Missed Punch Request Modal */}
      {requestingEntry && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget && !requestBusy) setRequestingEntry(null); }}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            backgroundColor: "rgba(0,0,0,0.45)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 16,
          }}
        >
          <div style={{
            background: "white", borderRadius: 14, padding: 28,
            width: "100%", maxWidth: 460,
            boxShadow: "0 25px 60px rgba(0,0,0,0.25)",
          }}>
            <h3 style={{ margin: "0 0 16px 0", fontSize: 18, color: "#111827" }}>
              Request Missed Punch-Out
            </h3>

            {/* Shift context */}
            <div style={{
              background: "#f8fafc", borderRadius: 8, padding: "10px 14px",
              marginBottom: 20, border: "1px solid #e2e8f0",
            }}>
              <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 2 }}>Shift</div>
              <div style={{ fontWeight: 600, color: "#1e293b" }}>
                {requestingEntry.punchIn ? new Date(requestingEntry.punchIn).toLocaleString() : "-"}
              </div>
              {(requestingEntry.jobSnapshot?.name || requestingEntry.job?.name) && (
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                  {requestingEntry.jobSnapshot?.name || requestingEntry.job?.name}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                Requested punch-out time
              </label>
              <input
                type="datetime-local"
                value={requestedTimeLocal}
                onChange={(e) => setRequestedTimeLocal(e.target.value)}
                style={{
                  width: "100%", padding: "9px 12px",
                  borderRadius: 8, border: "1px solid #d1d5db",
                  fontSize: 14, boxSizing: "border-box",
                }}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 6 }}>
                Reason <span style={{ fontWeight: 400, color: "#9ca3af" }}>(optional)</span>
              </label>
              <textarea
                rows={3}
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                placeholder="Forgot to punch out, device issue, emergency, etc."
                style={{
                  width: "100%", padding: "9px 12px",
                  borderRadius: 8, border: "1px solid #d1d5db",
                  fontSize: 14, resize: "vertical", boxSizing: "border-box",
                  fontFamily: "inherit",
                }}
              />
            </div>

            {requestStatusMsg && (
              <div style={{
                marginBottom: 16, padding: "10px 14px",
                background: "#fee2e2", color: "#991b1b",
                borderRadius: 8, fontSize: 14,
              }}>
                {requestStatusMsg}
              </div>
            )}

            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={submitMissedPunchRequest}
                disabled={requestBusy || !requestedTimeLocal}
                style={{
                  flex: 1, padding: "11px 0", borderRadius: 8, border: "none",
                  background: requestBusy || !requestedTimeLocal ? "#94a3b8" : "#2563eb",
                  color: "white", fontWeight: 600, fontSize: 15,
                  cursor: requestBusy || !requestedTimeLocal ? "not-allowed" : "pointer",
                }}
              >
                {requestBusy ? "Submitting…" : "Submit Request"}
              </button>
              <button
                onClick={() => setRequestingEntry(null)}
                disabled={requestBusy}
                style={{
                  padding: "11px 20px", borderRadius: 8,
                  border: "1px solid #d1d5db", background: "white",
                  fontWeight: 500, fontSize: 15, color: "#374151",
                  cursor: requestBusy ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CaregiverDashboard;
 
//         setUserInfo(parsed.caregiver || null);
//       }
//      catch (err) {
//       console.error("FETCH LOGS ERROR:", err);

//       // ✅ 401 MUST EXIT IMMEDIATELY
//       if (err.response?.status === 401) {
//         logout();
//         return;
//       }

//       setError(
//         err.response?.data?.message ||
//           err.message ||
//           "Failed to load logs"
//       );
//     } finally {
//       setLoading(false);
//     }
//   };

//   // 🟢 Punch In
//   const handlePunchIn = async () => {
//     try {
//       setLoading(true);
//       setError("");

//       await api.post("/api/timeclock/punch-in");
//       await fetchMyLogs();
//     } catch (err) {
//       console.error("PUNCH IN ERROR:", err);

//       if (err.response?.status === 401) {
//         logout();
//         return;
//       }

//       setError(err.response?.data?.message || "Punch in failed");
//     } finally {
//       setLoading(false);
//     }
//   };

//   // 🔴 Punch Out
//   const handlePunchOut = async () => {
//     try {
//       setLoading(true);
//       setError("");

//       await api.post("/api/timeclock/punch-out");
//       await fetchMyLogs();
//     } catch (err) {
//       console.error("PUNCH OUT ERROR:", err);

//       if (err.response?.status === 401) {
//         logout();
//         return;
//       }

//       setError(err.response?.data?.message || "Punch out failed");
//     } finally {
//       setLoading(false);
//     }
//   };

//   useEffect(() => {
//     fetchMyLogs();
//   }, []);

//   const formatDateTime = (date) =>
//     date ? new Date(date).toLocaleString() : "-";

//   return (
//     <div style={{ minHeight: "100vh", background: "#f5f5f5" }}>
//       <Header />

//       <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "20px" }}>
//         {/* Header */}
//         <div
//           style={{
//             display: "flex",
//             justifyContent: "space-between",
//             alignItems: "center",
//             marginBottom: "20px",
//           }}
//         >
//           <div>
//             <h1>Caregiver Dashboard</h1>
//             {userInfo && (
//               <p style={{ color: "#666" }}>
//                 Welcome, <strong>{userInfo.email}</strong>
//               </p>
//             )}
//           </div>

//           <button
//             onClick={logout}
//             style={{
//               background: "#dc3545",
//               color: "#fff",
//               border: "none",
//               padding: "8px 16px",
//               borderRadius: "4px",
//               cursor: "pointer",
//             }}
//           >
//             Logout
//           </button>
//         </div>

//         {/* Error */}
//         {error && (
//           <div
//             style={{
//               background: "#f8d7da",
//               color: "#721c24",
//               padding: "12px",
//               borderRadius: "4px",
//               marginBottom: "20px",
//             }}
//           >
//             {error}
//           </div>
//         )}

//         {/* Summary */}
//         <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
//           <div
//             style={{
//               flex: 1,
//               background: "#667eea",
//               color: "#fff",
//               padding: "20px",
//               borderRadius: "10px",
//               textAlign: "center",
//             }}
//           >
//             <h2>{totalHours.toFixed(2)} hrs</h2>
//             <p>Total hours worked</p>
//           </div>

//           <div
//             style={{
//               flex: 1,
//               background: "#fff",
//               padding: "20px",
//               borderRadius: "10px",
//               border: currentlyClockedIn
//                 ? "2px solid #28a745"
//                 : "1px solid #ddd",
//             }}
//           >
//             <h3>
//               {currentlyClockedIn ? "🟢 CLOCKED IN" : "⏳ CLOCKED OUT"}
//             </h3>
//           </div>
//         </div>

//         {/* Punch Buttons */}
//         <div
//           style={{
//             background: "#fff",
//             padding: "20px",
//             borderRadius: "8px",
//             marginBottom: "20px",
//             textAlign: "center",
//           }}
//         >
//           <button
//             onClick={handlePunchIn}
//             disabled={loading || currentlyClockedIn}
//             style={{
//               marginRight: "10px",
//               padding: "12px 24px",
//               background: "#28a745",
//               color: "#fff",
//               border: "none",
//               borderRadius: "6px",
//             }}
//           >
//             Punch In
//           </button>

//           <button
//             onClick={handlePunchOut}
//             disabled={loading || !currentlyClockedIn}
//             style={{
//               padding: "12px 24px",
//               background: "#dc3545",
//               color: "#fff",
//               border: "none",
//               borderRadius: "6px",
//             }}
//           >
//             Punch Out
//           </button>
//         </div>

//         {/* Logs */}
//         <div
//           style={{
//             background: "#fff",
//             padding: "20px",
//             borderRadius: "8px",
//           }}
//         >
//           <h2>My Shifts</h2>

//           {logs.length === 0 ? (
//             <p>No shifts yet.</p>
//           ) : (
//             <table style={{ width: "100%", borderCollapse: "collapse" }}>
//               <thead>
//                 <tr>
//                   <th>Date</th>
//                   <th>Punch In</th>
//                   <th>Punch Out</th>
//                   <th>Hours</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {logs.map((log) => {
//                   const hours =
//                     log.punchIn && log.punchOut
//                       ? (
//                           (new Date(log.punchOut) -
//                             new Date(log.punchIn)) /
//                           (1000 * 60 * 60)
//                         ).toFixed(2)
//                       : "-";

//                   return (
//                     <tr key={log._id}>
//                       <td>
//                         {log.punchIn
//                           ? new Date(log.punchIn).toLocaleDateString()
//                           : "-"}
//                       </td>
//                       <td>{formatDateTime(log.punchIn)}</td>
//                       <td>{formatDateTime(log.punchOut)}</td>
//                       <td>{hours}</td>
//                     </tr>
//                   );
//                 })}
//               </tbody>
//             </table>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// };

// export default CaregiverDashboard;





// import React, { useEffect, useState, useCallback } from "react";
// import { useNavigate } from "react-router-dom";
// import Header from "../components/Header";
// import api from "../services/api";

// const CaregiverDashboard = () => {
//   const [loading, setLoading] = useState(false);
//   const [logs, setLogs] = useState([]);
//   const [error, setError] = useState("");
//   const [totalHours, setTotalHours] = useState(0);
//   const [currentlyClockedIn, setCurrentlyClockedIn] = useState(false);
//   const [userInfo, setUserInfo] = useState(null);

//   const navigate = useNavigate();

//   // 🔐 Logout
//   const logout = useCallback(() => {
//     localStorage.removeItem("token");
//     localStorage.removeItem("user");
//     navigate("/login", { replace: true });
//   }, [navigate]);

//   // ⏱ Calculate hours
//   const calculateTotals = useCallback((logsData) => {
//     const total = logsData.reduce((sum, log) => {
//       if (log.punchIn && log.punchOut) {
//         return (
//           sum +
//           (new Date(log.punchOut) - new Date(log.punchIn)) /
//             (1000 * 60 * 60)
//         );
//       }
//       return sum;
//     }, 0);

//     setTotalHours(total);
//   }, []);

//   // 📡 Fetch caregiver logs
//   // const fetchMyLogs = async () => {
//   //   try {
//   //     setLoading(true);
//   //     setError("");

//   //     // ✅ caregiver-specific route
//   //     const res = await api.get("/caregiver/timelogs");
//   //     const logsData = res.data.logs || [];

//   //     setLogs(logsData);
//   //     calculateTotals(logsData);

//   //     const activeShift = logsData.find(
//   //       (log) => log.punchIn && !log.punchOut
//   //     );
//   //     setCurrentlyClockedIn(Boolean(activeShift));

//   //     const storedUser = localStorage.getItem("user");
//   //     if (storedUser) {
//   //       const parsed = JSON.parse(storedUser);
//   //       setUserInfo(parsed.caregiver || null);
//   //     }
//   //   } catch (err) {
//   //     console.error("FETCH LOGS ERROR:", err);

//   //     if (err.response?.status === 401) {
//   //       logout();
//   //       return;
//   //     }

//   //     setError("Failed to load logs");
//   //   } finally {
//   //     setLoading(false);
//   //   }
//   // };
//   const fetchMyLogs = async () => {
//   try {
//     setError("");
//     setLoading(true);
//     const res = await api.get("/timeclock/my-logs");  // ✅ Fixed
//     setLogs(res.data.logs || []);
//   } catch (err) {
//     console.error("FETCH LOGS ERROR:", err);
//     setError(err.response?.data?.message || "Failed to load logs");
//   } finally {
//     setLoading(false);
//   }
// };

  // 🟢 Punch In
  // const handlePunchIn = async () => {
  //   try {
  //     setLoading(true);
  //     setError("");

  //     await api.post("/timeclock/punch-in");
  //     await fetchMyLogs();
  //   } catch (err) {
  //     console.error("PUNCH IN ERROR:", err);

  //     if (err.response?.status === 401) {
  //       logout();
  //       return;
  //     }

  //     setError("Punch in failed");
  //   } finally {
  //     setLoading(false);
  //   }
  // };

  // // 🔴 Punch Out
  // const handlePunchOut = async () => {
  //   try {
  //     setLoading(true);
  //     setError("");

  //     await api.post("/timeclock/punch-out");
  //     await fetchMyLogs();
  //   } catch (err) {
  //     console.error("PUNCH OUT ERROR:", err);

  //     if (err.response?.status === 401) {
  //       logout();
  //       return;
  //     }

  //     setError("Punch out failed");
  //   } finally {
  //     setLoading(false);
  //   }
  // };

/*
  Duplicate implementation below caused build failure due to a mid-file `import React...`.
  Kept temporarily for reference during the Clerk migration.

  import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";
import api from "../services/api";

const CaregiverDashboard = () => {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [error, setError] = useState("");
  const [totalHours, setTotalHours] = useState(0);
  const [currentlyClockedIn, setCurrentlyClockedIn] = useState(false);
  const [userInfo, setUserInfo] = useState(null);
  const navigate = useNavigate();

  const logout = useCallback(() => {
    navigate("/sign-out", { replace: true });
  }, [navigate]);

  const calculateTotals = useCallback((logsData) => {
    const total = logsData.reduce((sum, log) => {
      if (log.punchIn && log.punchOut) {
        return sum + (new Date(log.punchOut) - new Date(log.punchIn)) / (1000 * 60 * 60);
      }
      return sum;
    }, 0);
    setTotalHours(total);

    const activeShift = logsData.find(log => log.punchIn && !log.punchOut);
    setCurrentlyClockedIn(!!activeShift);
  }, []);

  // ✅ FIXED: backend route is /my-logs
  const fetchMyLogs = async () => {
    try {
      setError("");
      setLoading(true);
      const res = await api.get("/timeclock/my-logs");
      const logsData = res.data.logs || [];
      
      setLogs(logsData);
      calculateTotals(logsData);  // ✅ Restores totals/clocked-in

      const storedUser = localStorage.getItem("user");
      if (storedUser) {
        try {
          const parsed = JSON.parse(storedUser);
          setUserInfo(parsed.staff || parsed.caregiver || null);
        } catch (e) {
          console.warn("Could not parse user info");
        }
      }
    } catch (err) {
      console.error("FETCH LOGS ERROR:", err);
      if (err.response?.status === 401) {
        logout();  // ✅ Auto-logout on 401
        return;
      }
      setError(err.response?.data?.message || "Failed to load logs");
    } finally {
      setLoading(false);
    }
  };

  const handlePunchIn = async () => {
    try {
      setError("");
      setLoading(true);
      await api.post("/timeclock/punch-in", {});
      await fetchMyLogs();
    } catch (err) {
      console.error("PUNCH IN ERROR:", err);
      if (err.response?.status === 401) {
        logout();
        return;
      }
      setError(err.response?.data?.message || "Punch in failed");
    } finally {
      setLoading(false);
    }
  };

  const handlePunchOut = async () => {
    try {
      setError("");
      setLoading(true);
      await api.post("/timeclock/punch-out", {});
      await fetchMyLogs();
    } catch (err) {
      console.error("PUNCH OUT ERROR:", err);
      if (err.response?.status === 401) {
        logout();
        return;
      }
      setError(err.response?.data?.message || "Punch out failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyLogs();
  }, []);

  const formatDateTime = (date) => date ? new Date(date).toLocaleString() : "-";

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#f5f5f5", padding: "20px" }}>
      <Header title="Staff Dashboard" />
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <div>
            <h1>Staff Dashboard</h1>
            {userInfo && <p>Welcome, <strong>{userInfo.email}</strong></p>}
          </div>
          <button onClick={logout} style={{ background: "#dc3545", color: "white", border: "none", padding: "10px 20px", borderRadius: "5px" }}>
            Logout
          </button>
        </div>

        {error && (
          <div style={{ background: "#f8d7da", color: "#721c24", padding: "10px", borderRadius: "5px", marginBottom: "20px" }}>
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: "20px", marginBottom: "20px" }}>
          <div style={{ 
            background: currentlyClockedIn ? "#ff6b6b" : "#4CAF50", 
            color: "white", padding: "20px", borderRadius: "10px", flex: 1, textAlign: "center" 
          }}>
            <h2 style={{ margin: "0 0 10px 0" }}>{totalHours.toFixed(2)} hrs</h2>
            <p>Total hours worked</p>
          </div>
          <div style={{ 
            background: currentlyClockedIn ? "#fff3cd" : "#d4edda", 
            padding: "20px", borderRadius: "10px", flex: 1, textAlign: "center" 
          }}>
            <h3>{currentlyClockedIn ? "🟢 CLOCKED IN" : "⏳ Clocked Out"}</h3>
          </div>
        </div>

        <div style={{ background: "white", padding: "20px", borderRadius: "10px", marginBottom: "20px", textAlign: "center" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: "20px" }}>
            <button
              onClick={handlePunchIn}
              disabled={loading || currentlyClockedIn}
              style={{
                padding: "15px 30px",
                backgroundColor: loading || currentlyClockedIn ? "#ccc" : "#4CAF50",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "16px",
                cursor: loading || currentlyClockedIn ? "not-allowed" : "pointer"
              }}
            >
              {loading ? "Processing..." : "🟢 Punch In"}
            </button>
            <button
              onClick={handlePunchOut}
              disabled={loading || !currentlyClockedIn}
              style={{
                padding: "15px 30px",
                backgroundColor: loading || !currentlyClockedIn ? "#ccc" : "#f44336",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "16px",
                cursor: loading || !currentlyClockedIn ? "not-allowed" : "pointer"
              }}
            >
              {loading ? "Processing..." : "🔴 Punch Out"}
            </button>
          </div>
        </div>

        <div style={{ background: "white", padding: "20px", borderRadius: "10px" }}>
          <h3>My Recent Shifts ({logs.length})</h3>
          {loading ? (
            <p>Loading shifts...</p>
          ) : logs.length === 0 ? (
            <p>No shifts yet. Punch in to start tracking!</p>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8f9fa" }}>
                  <th style={{ padding: "12px", textAlign: "left" }}>Date</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Punch In</th>
                  <th style={{ padding: "12px", textAlign: "left" }}>Punch Out</th>
                  <th style={{ padding: "12px", textAlign: "right" }}>Hours</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const hours = log.punchIn && log.punchOut
                    ? ((new Date(log.punchOut) - new Date(log.punchIn)) / (1000 * 60 * 60)).toFixed(2)
                    : "-";
                  return (
                    <tr key={log._id} style={{ borderBottom: "1px solid #eee" }}>
                      <td style={{ padding: "12px" }}>
                        {log.punchIn ? new Date(log.punchIn).toLocaleDateString() : "-"}
                      </td>
                      <td style={{ padding: "12px" }}>{formatDateTime(log.punchIn)}</td>
                      <td style={{ padding: "12px" }}>
                        <span style={{ color: log.punchOut ? "#28a745" : "#ffc107" }}>
                          {formatDateTime(log.punchOut)}
                        </span>
                      </td>
                      <td style={{ padding: "12px", textAlign: "right", fontWeight: "bold" }}>{hours}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
};

export default CaregiverDashboard;
*/