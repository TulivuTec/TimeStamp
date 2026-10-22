import React, { useEffect, useState } from "react";
import {
  createOperationsTask,
  deleteOperationsTask,
  listTaskAssignees,
  listOperationsTasks,
  listTaskSessions,
  updateOperationsTask,
} from "../services/operations";

const STATUSES = [
  { value: "todo", label: "To Do" },
  { value: "doing", label: "Doing" },
  { value: "done", label: "Done" },
];
const EMPTY_FORM = { title: "", details: "", dueDate: "", reminderAt: "", reminderEmail: "", assignedTo: "" };

function toDateInput(value) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function formatDate(value) {
  return value ? new Date(value).toLocaleDateString() : "No due date";
}

function toDateTimeInput(value) {
  if (!value) return "";
  const date = new Date(value);
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}

function formatDuration(startedAt, endedAt) {
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((end - new Date(startedAt).getTime()) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m${endedAt ? "" : " · running"}`;
}

export default function OperationsWorkspacePanel() {
  const [view, setView] = useState("board");
  const [tasks, setTasks] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = async () => {
    try {
      const [nextTasks, nextSessions, nextAssignees] = await Promise.all([
        listOperationsTasks(),
        listTaskSessions(),
        listTaskAssignees(),
      ]);
      setTasks(nextTasks);
      setSessions(nextSessions);
      setAssignees(nextAssignees);
      setError("");
    } catch (err) {
      setError(err.response?.data?.message || "Could not load Operations data.");
    }
  };

  useEffect(() => { refresh(); }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    const payload = {
      ...form,
      dueDate: form.dueDate || null,
      reminderAt: form.reminderAt ? new Date(form.reminderAt).toISOString() : null,
      reminderEmail: form.reminderEmail.trim(),
      assignedTo: form.assignedTo || null,
    };
    try {
      if (editingId) await updateOperationsTask(editingId, payload);
      else await createOperationsTask(payload);
      resetForm();
      await refresh();
    } catch (err) {
      setError(err.response?.data?.message || "Could not save task.");
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (task, status) => {
    setError("");
    try {
      const updated = await updateOperationsTask(task._id, { status });
      setTasks((current) => current.map((item) => item._id === task._id ? updated : item));
    } catch (err) {
      setError(err.response?.data?.message || "Could not update task status.");
    }
  };

  const handleDelete = async (task) => {
    if (!window.confirm(`Delete "${task.title}"?`)) return;
    try {
      await deleteOperationsTask(task._id);
      setTasks((current) => current.filter((item) => item._id !== task._id));
      if (editingId === task._id) resetForm();
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete task.");
    }
  };

  const beginEdit = (task) => {
    setEditingId(task._id);
    setForm({
      title: task.title,
      details: task.details || "",
      dueDate: toDateInput(task.dueDate),
      reminderAt: toDateTimeInput(task.reminderAt),
      reminderEmail: task.reminderEmail || "",
      assignedTo: task.assignedTo?._id || task.assignedTo || "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Operations work</h2>
        <div role="tablist" aria-label="Operations views" style={{ display: "flex", gap: 4, borderBottom: "1px solid #d1d5db" }}>
          <button type="button" role="tab" aria-selected={view === "board"} onClick={() => setView("board")} style={{ padding: "8px 12px", border: 0, borderBottom: view === "board" ? "2px solid #166534" : "2px solid transparent", background: "transparent", cursor: "pointer" }}>Kanban</button>
          <button type="button" role="tab" aria-selected={view === "sessions"} onClick={() => setView("sessions")} style={{ padding: "8px 12px", border: 0, borderBottom: view === "sessions" ? "2px solid #166534" : "2px solid transparent", background: "transparent", cursor: "pointer" }}>Task time</button>
        </div>
      </div>

      {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}

      {view === "board" ? (
        <>
          <form className="operationsTaskForm" onSubmit={handleSubmit} style={{ display: "grid", gap: 8, alignItems: "start", marginBottom: 18 }}>
            <input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} maxLength={120} placeholder="Task title" aria-label="Task title" required style={{ minWidth: 0, padding: 9, border: "1px solid #cbd5e1", borderRadius: 6 }} />
            <input value={form.details} onChange={(event) => setForm((current) => ({ ...current, details: event.target.value }))} maxLength={2000} placeholder="Details (optional)" aria-label="Task details" style={{ minWidth: 0, padding: 9, border: "1px solid #cbd5e1", borderRadius: 6 }} />
            <input type="date" value={form.dueDate} onChange={(event) => setForm((current) => ({ ...current, dueDate: event.target.value }))} aria-label="Due date" style={{ minWidth: 0, padding: 8, border: "1px solid #cbd5e1", borderRadius: 6 }} />
            <select value={form.assignedTo} onChange={(event) => setForm((current) => ({ ...current, assignedTo: event.target.value }))} aria-label="Assign caregiver" style={{ minWidth: 0, padding: 8, border: "1px solid #cbd5e1", borderRadius: 6 }}>
              <option value="">Unassigned</option>
              {assignees.map((staff) => <option key={staff._id} value={staff._id}>{`${staff.firstName} ${staff.lastName}`.trim()} ({staff.email})</option>)}
            </select>
            <input type="email" value={form.reminderEmail} onChange={(event) => setForm((current) => ({ ...current, reminderEmail: event.target.value }))} maxLength={254} placeholder="Extra reminder email (optional)" aria-label="Extra reminder email" style={{ minWidth: 0, padding: 9, border: "1px solid #cbd5e1", borderRadius: 6 }} />
            <label style={{ display: "grid", gap: 4, color: "#475569", fontSize: 12 }}>
              Email and phone reminder
              <input type="datetime-local" value={form.reminderAt} onChange={(event) => setForm((current) => ({ ...current, reminderAt: event.target.value }))} disabled={!form.assignedTo && !form.reminderEmail.trim()} aria-label="Reminder date and time" style={{ minWidth: 0, padding: 8, border: "1px solid #cbd5e1", borderRadius: 6 }} />
            </label>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="submit" disabled={busy} style={{ padding: "9px 12px", border: 0, borderRadius: 6, background: "#166534", color: "#fff", cursor: busy ? "wait" : "pointer" }}>{editingId ? "Save" : "Add"}</button>
              {editingId && <button type="button" onClick={resetForm} style={{ padding: "9px 10px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", cursor: "pointer" }}>Cancel</button>}
            </div>
          </form>

          <div className="operationsKanbanBoard" style={{ display: "grid", gap: 12, alignItems: "start" }}>
            {STATUSES.map((status) => (
              <section key={status.value} aria-label={status.label} style={{ minWidth: 0, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 6, padding: 10 }}>
                <h3 style={{ margin: "2px 0 10px", fontSize: 15 }}>{status.label} <span style={{ color: "#64748b", fontWeight: 400 }}>({tasks.filter((task) => task.status === status.value).length})</span></h3>
                <div style={{ display: "grid", gap: 8 }}>
                  {tasks.filter((task) => task.status === status.value).map((task) => (
                    <article key={task._id} style={{ background: "#fff", border: "1px solid #dbe3ec", borderRadius: 5, padding: 10 }}>
                      <strong style={{ overflowWrap: "anywhere" }}>{task.title}</strong>
                      {task.details && <p style={{ whiteSpace: "pre-wrap", margin: "6px 0", color: "#475569", fontSize: 13 }}>{task.details}</p>}
                      <p style={{ margin: "6px 0 10px", color: "#64748b", fontSize: 12 }}>{formatDate(task.dueDate)}</p>
                      {task.assignedTo && <p style={{ margin: "6px 0 10px", color: "#475569", fontSize: 12 }}>Assigned to: {assignees.find((staff) => staff._id === (task.assignedTo?._id || task.assignedTo))?.firstName || "Caregiver"}</p>}
                      {task.reminderEmail && <p style={{ margin: "6px 0 10px", color: "#475569", fontSize: 12 }}>Also emails: {task.reminderEmail}</p>}
                      {task.reminderAt && <p style={{ margin: "6px 0 10px", color: "#475569", fontSize: 12 }}>Reminder: {new Date(task.reminderAt).toLocaleString()}</p>}
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <select aria-label={`Move ${task.title}`} value={task.status} onChange={(event) => handleStatusChange(task, event.target.value)} style={{ maxWidth: "100%", padding: "5px 6px", border: "1px solid #cbd5e1", borderRadius: 4 }}>
                          {STATUSES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                        </select>
                        <button type="button" onClick={() => beginEdit(task)} style={{ border: "1px solid #cbd5e1", borderRadius: 4, background: "#fff", padding: "5px 8px", cursor: "pointer" }}>Edit</button>
                        <button type="button" onClick={() => handleDelete(task)} style={{ border: "1px solid #fecaca", borderRadius: 4, background: "#fff", color: "#b42318", padding: "5px 8px", cursor: "pointer" }}>Delete</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : (
        <div style={{ overflowX: "auto" }}>
          {!sessions.length ? <p style={{ color: "#64748b" }}>No task sessions recorded yet.</p> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr>{["Staff", "Task", "Started", "Stopped", "Duration"].map((heading) => <th key={heading} align="left" style={{ padding: "9px 8px", borderBottom: "1px solid #dbe3ec" }}>{heading}</th>)}</tr></thead>
              <tbody>
                {sessions.map((session) => {
                  const staff = session.staffId;
                  const staffName = staff ? `${staff.firstName || ""} ${staff.lastName || ""}`.trim() || staff.email : "-";
                  return <tr key={session._id}>
                    <td style={{ padding: "9px 8px", borderBottom: "1px solid #edf1f5" }}>{staffName}</td>
                    <td style={{ padding: "9px 8px", borderBottom: "1px solid #edf1f5" }}>{session.taskName}</td>
                    <td style={{ padding: "9px 8px", borderBottom: "1px solid #edf1f5" }}>{new Date(session.startedAt).toLocaleString()}</td>
                    <td style={{ padding: "9px 8px", borderBottom: "1px solid #edf1f5" }}>{session.endedAt ? new Date(session.endedAt).toLocaleString() : "Running"}</td>
                    <td style={{ padding: "9px 8px", borderBottom: "1px solid #edf1f5", whiteSpace: "nowrap" }}>{formatDuration(session.startedAt, session.endedAt)}</td>
                  </tr>;
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}