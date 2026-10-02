const express = require("express");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");
const {
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listOperationsTasks,
  createOperationsTask,
  updateOperationsTask,
  deleteOperationsTask,
  listMyTaskSessions,
  listTaskSessions,
  startTaskSession,
  stopTaskSession,
} = require("../controllers/operationsController");

router.use(auth);

router.get("/calendar-events", authorizeRoles("admin", "staff"), listCalendarEvents);
router.post("/calendar-events", authorizeRoles("admin", "staff"), createCalendarEvent);
router.patch("/calendar-events/:id", authorizeRoles("admin", "staff"), updateCalendarEvent);
router.delete("/calendar-events/:id", authorizeRoles("admin", "staff"), deleteCalendarEvent);

router.get("/tasks", authorizeRoles("admin"), listOperationsTasks);
router.post("/tasks", authorizeRoles("admin"), createOperationsTask);
router.patch("/tasks/:id", authorizeRoles("admin"), updateOperationsTask);
router.delete("/tasks/:id", authorizeRoles("admin"), deleteOperationsTask);

router.get("/task-sessions/my", authorizeRoles("admin", "staff"), listMyTaskSessions);
router.post("/task-sessions/start", authorizeRoles("admin", "staff"), startTaskSession);
router.post("/task-sessions/stop", authorizeRoles("admin", "staff"), stopTaskSession);
router.get("/task-sessions", authorizeRoles("admin"), listTaskSessions);

module.exports = router;