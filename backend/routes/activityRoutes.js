const express = require("express");

const router = express.Router();
const auth = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/roleMiddleware");
const {
  listTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  listSchedules,
  getSchedule,
  createSchedule,
  updateSchedule,
  deleteSchedule,
  exportSchedule,
} = require("../controllers/activityController");

// Templates — admin only
router.get("/templates", auth, authorizeRoles("admin"), listTemplates);
router.post("/templates", auth, authorizeRoles("admin"), createTemplate);
router.patch("/templates/:id", auth, authorizeRoles("admin"), updateTemplate);
router.delete("/templates/:id", auth, authorizeRoles("admin"), deleteTemplate);

// Schedules — export and specific-id routes before the generic list
router.get("/schedules", auth, authorizeRoles("admin", "staff"), listSchedules);
router.post("/schedules", auth, authorizeRoles("admin"), createSchedule);
router.get("/schedules/:id/export", auth, authorizeRoles("admin", "staff"), exportSchedule);
router.get("/schedules/:id", auth, authorizeRoles("admin", "staff"), getSchedule);
router.patch("/schedules/:id", auth, authorizeRoles("admin", "staff"), updateSchedule);
router.delete("/schedules/:id", auth, authorizeRoles("admin"), deleteSchedule);

module.exports = router;
