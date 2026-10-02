import api from "./api";

export async function listCalendarEvents(params = {}) {
  const response = await api.get("/operations/calendar-events", { params });
  return Array.isArray(response.data?.events) ? response.data.events : [];
}

export async function createCalendarEvent(payload) {
  const response = await api.post("/operations/calendar-events", payload);
  return response.data?.event || null;
}

export async function updateCalendarEvent(id, payload) {
  const response = await api.patch(`/operations/calendar-events/${id}`, payload);
  return response.data?.event || null;
}

export async function deleteCalendarEvent(id) {
  await api.delete(`/operations/calendar-events/${id}`);
}

export async function listOperationsTasks() {
  const response = await api.get("/operations/tasks");
  return Array.isArray(response.data?.tasks) ? response.data.tasks : [];
}

export async function createOperationsTask(payload) {
  const response = await api.post("/operations/tasks", payload);
  return response.data?.task || null;
}

export async function updateOperationsTask(id, payload) {
  const response = await api.patch(`/operations/tasks/${id}`, payload);
  return response.data?.task || null;
}

export async function deleteOperationsTask(id) {
  await api.delete(`/operations/tasks/${id}`);
}

export async function listMyTaskSessions() {
  const response = await api.get("/operations/task-sessions/my");
  return Array.isArray(response.data?.sessions) ? response.data.sessions : [];
}

export async function listTaskSessions() {
  const response = await api.get("/operations/task-sessions");
  return Array.isArray(response.data?.sessions) ? response.data.sessions : [];
}

export async function startTaskSession(taskName) {
  const response = await api.post("/operations/task-sessions/start", { taskName });
  return response.data?.session || null;
}

export async function stopTaskSession() {
  const response = await api.post("/operations/task-sessions/stop");
  return response.data?.session || null;
}