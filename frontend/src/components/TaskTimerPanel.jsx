import React, { useEffect, useState } from "react";
import { listMyTaskSessions, startTaskSession, stopTaskSession } from "../services/operations";

function formatElapsed(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : "-";
}

export default function TaskTimerPanel() {
  const [sessions, setSessions] = useState([]);
  const [taskName, setTaskName] = useState("");
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const activeSession = sessions.find((session) => !session.endedAt) || null;
  const activeStartedAt = activeSession?.startedAt;

  useEffect(() => {
    let cancelled = false;
    listMyTaskSessions()
      .then((items) => {
        if (!cancelled) setSessions(items);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || "Could not load task sessions.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!activeStartedAt) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [activeStartedAt]);

  const handleStart = async (event) => {
    event.preventDefault();
    const normalizedName = taskName.trim();
    if (!normalizedName) return;
    setBusy(true);
    setError("");
    try {
      const session = await startTaskSession(normalizedName);
      if (session) setSessions((current) => [session, ...current]);
      setTaskName("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not start task timer.");
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    setError("");
    try {
      const stopped = await stopTaskSession();
      setSessions((current) => current.map((session) =>
        session._id === stopped?._id ? stopped : session
      ));
    } catch (err) {
      setError(err.response?.data?.message || "Could not stop task timer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: "0 0 4px", fontSize: 20 }}>Task timer</h2>
          <p style={{ margin: 0, color: "#6b7280", fontSize: 14 }}>Tracked separately from your shift.</p>
        </div>
        {activeSession && (
          <div aria-live="polite" style={{ fontVariantNumeric: "tabular-nums", fontSize: 24, fontWeight: 700 }}>
            {formatElapsed(now - new Date(activeSession.startedAt).getTime())}
          </div>
        )}
      </div>

      {error && <p role="alert" style={{ color: "#b42318", marginBottom: 0 }}>{error}</p>}

      {activeSession ? (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
          <strong>{activeSession.taskName}</strong>
          <button type="button" onClick={handleStop} disabled={busy} style={{ padding: "9px 16px", border: 0, borderRadius: 6, background: "#b42318", color: "#fff", cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Stopping…" : "Stop task"}
          </button>
        </div>
      ) : (
        <form onSubmit={handleStart} style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
          <input
            value={taskName}
            onChange={(event) => setTaskName(event.target.value)}
            maxLength={160}
            placeholder="What task are you working on?"
            aria-label="Task name"
            required
            style={{ flex: "1 1 240px", minWidth: 0, padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 6 }}
          />
          <button type="submit" disabled={busy || !taskName.trim()} style={{ padding: "9px 16px", border: 0, borderRadius: 6, background: "#166534", color: "#fff", cursor: busy ? "wait" : "pointer" }}>
            {busy ? "Starting…" : "Start task"}
          </button>
        </form>
      )}

      {sessions.length > 0 && (
        <details style={{ marginTop: 18 }}>
          <summary style={{ cursor: "pointer", fontWeight: 600 }}>Recent task sessions</summary>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr><th align="left">Task</th><th align="left">Started</th><th align="left">Duration</th></tr></thead>
              <tbody>
                {sessions.slice(0, 8).map((session) => {
                  const end = session.endedAt ? new Date(session.endedAt).getTime() : now;
                  return (
                    <tr key={session._id}>
                      <td style={{ padding: "7px 8px 7px 0" }}>{session.taskName}</td>
                      <td style={{ padding: "7px 8px 7px 0" }}>{formatDate(session.startedAt)}</td>
                      <td style={{ padding: "7px 0", fontVariantNumeric: "tabular-nums" }}>
                        {formatElapsed(end - new Date(session.startedAt).getTime())}{!session.endedAt ? " · running" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}