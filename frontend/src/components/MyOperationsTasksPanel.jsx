import React, { useEffect, useState } from "react";
import {
  listMyOperationsTasks,
  updateMyOperationsTaskStatus,
} from "../services/operations";
import TaskPushNotifications from "./TaskPushNotifications";

const STATUS_OPTIONS = [
  { value: "todo", label: "To Do" },
  { value: "doing", label: "Doing" },
  { value: "done", label: "Done" },
];

export default function MyOperationsTasksPanel() {
  const [tasks, setTasks] = useState([]);
  const [error, setError] = useState("");
  const [busyTaskId, setBusyTaskId] = useState(null);

  const refresh = async () => {
    try {
      setTasks(await listMyOperationsTasks());
      setError("");
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || "Could not load your assigned tasks."
      );
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const changeStatus = async (task, status) => {
    setBusyTaskId(task._id);
    setError("");
    try {
      const updated = await updateMyOperationsTaskStatus(task._id, status);
      setTasks((current) =>
        current.map((item) => (item._id === task._id ? updated : item))
      );
    } catch (requestError) {
      setError(
        requestError.response?.data?.message || "Could not update task status."
      );
    } finally {
      setBusyTaskId(null);
    }
  };

  return (
    <section style={{ background: "#fff", padding: 20, borderRadius: 10, marginBottom: 20 }}>
      <h2 style={{ marginTop: 0 }}>My assigned tasks</h2>
      <p style={{ color: "#64748b", marginTop: -6 }}>
        Tasks assigned to you by your facility admin.
      </p>
      <TaskPushNotifications />
      {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
      {!tasks.length ? (
        <p style={{ color: "#64748b" }}>You don’t have any assigned tasks yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {tasks.map((task) => (
            <article key={task._id} style={{ border: "1px solid #e2e8f0", borderRadius: 6, padding: 12 }}>
              <strong>{task.title}</strong>
              {task.details && <p style={{ whiteSpace: "pre-wrap", color: "#475569" }}>{task.details}</p>}
              {task.dueDate && <p style={{ margin: "6px 0", color: "#64748b", fontSize: 13 }}>Due {new Date(task.dueDate).toLocaleDateString()}</p>}
              {task.reminderAt && <p style={{ margin: "6px 0", color: "#64748b", fontSize: 13 }}>Reminder {new Date(task.reminderAt).toLocaleString()}</p>}
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
                Status
                <select
                  value={task.status}
                  disabled={busyTaskId === task._id}
                  onChange={(event) => changeStatus(task, event.target.value)}
                  aria-label={`Status for ${task.title}`}
                  style={{ padding: 6, border: "1px solid #cbd5e1", borderRadius: 4 }}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
