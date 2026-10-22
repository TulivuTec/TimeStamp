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

export async function listTaskAssignees() {
  const response = await api.get("/operations/tasks/assignees");
  return Array.isArray(response.data?.staff) ? response.data.staff : [];
}

export async function listMyOperationsTasks() {
  const response = await api.get("/operations/tasks/mine");
  return Array.isArray(response.data?.tasks) ? response.data.tasks : [];
}

export async function updateMyOperationsTaskStatus(id, status) {
  const response = await api.patch(`/operations/tasks/mine/${id}`, { status });
  return response.data?.task || null;
}

export async function getPushConfig() {
  const response = await api.get("/operations/notifications/push-config");
  return response.data?.publicKey || null;
}

export async function savePushSubscription(subscription) {
  await api.post("/operations/notifications/push-subscriptions", subscription);
}

export async function deletePushSubscription(endpoint) {
  await api.delete("/operations/notifications/push-subscriptions", { data: { endpoint } });
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

export async function listWeeklyMenus(params = {}) {
  const response = await api.get("/operations/menus", { params });
  return Array.isArray(response.data?.menus) ? response.data.menus : [];
}

export async function createWeeklyMenu(payload) {
  const response = await api.post("/operations/menus", payload);
  return response.data?.menu || null;
}

export async function updateWeeklyMenu(id, payload) {
  const response = await api.patch(`/operations/menus/${id}`, payload);
  return response.data?.menu || null;
}

export async function deleteWeeklyMenu(id) {
  await api.delete(`/operations/menus/${id}`);
}

export async function copyPreviousWeeklyMenu(weekStartDate, replace = false) {
  const response = await api.post("/operations/menus/copy-previous", { weekStartDate, replace });
  return response.data?.menu || null;
}