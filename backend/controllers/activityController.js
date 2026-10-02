const ActivityTemplate = require("../models/ActivityTemplate");
const WeeklyActivitySchedule = require("../models/WeeklyActivitySchedule");

const DAY_NAMES = [
  "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
];

async function requireTenantId(req, res) {
  const { tenantId } = req.user || {};
  if (!tenantId) {
    res
      .status(403)
      .json({ message: "Tenant is not assigned for this account.", code: "TENANT_REQUIRED" });
    return null;
  }
  return tenantId;
}

// ── Templates ──────────────────────────────────────────────────────────────

async function listTemplates(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const templates = await ActivityTemplate.find({ tenantId })
      .sort({ category: 1, name: 1 })
      .lean();

    return res.json({ count: templates.length, templates });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function createTemplate(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const { name, category, defaultDurationMinutes } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: "name is required." });

    const template = await ActivityTemplate.create({
      tenantId,
      name: name.trim(),
      category: category || "Other",
      defaultDurationMinutes: defaultDurationMinutes ? Number(defaultDurationMinutes) : 60,
    });

    return res.status(201).json({ template });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function updateTemplate(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const template = await ActivityTemplate.findOne({ _id: req.params.id, tenantId });
    if (!template) return res.status(404).json({ message: "Template not found." });

    if (req.body.name != null) template.name = req.body.name.trim();
    if (req.body.category != null) template.category = req.body.category;
    if (req.body.defaultDurationMinutes != null)
      template.defaultDurationMinutes = Number(req.body.defaultDurationMinutes);

    await template.save();
    return res.json({ template });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function deleteTemplate(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const template = await ActivityTemplate.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!template) return res.status(404).json({ message: "Template not found." });

    return res.json({ message: "Template deleted." });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

// ── Schedules ──────────────────────────────────────────────────────────────

async function listSchedules(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const filter = { tenantId };
    if (req.user?.role !== "admin") filter.status = "published";

    const schedules = await WeeklyActivitySchedule.find(filter)
      .sort({ weekStartDate: -1 })
      .lean();

    return res.json({ count: schedules.length, schedules });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function getSchedule(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const schedule = await WeeklyActivitySchedule.findOne({ _id: req.params.id, tenantId })
      .populate("activities.facilitatorId", "firstName lastName")
      .lean();

    if (!schedule) return res.status(404).json({ message: "Schedule not found." });
    if (req.user?.role !== "admin" && schedule.status !== "published") {
      return res.status(403).json({ message: "Schedule is not published." });
    }

    return res.json({ schedule });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function createSchedule(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const { weekStartDate, activities } = req.body;
    if (!weekStartDate) return res.status(400).json({ message: "weekStartDate is required." });

    const schedule = await WeeklyActivitySchedule.create({
      tenantId,
      weekStartDate: new Date(weekStartDate),
      status: "draft",
      activities: Array.isArray(activities) ? activities : [],
    });

    return res.status(201).json({ schedule });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A schedule for this week already exists." });
    }
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function updateSchedule(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const schedule = await WeeklyActivitySchedule.findOne({ _id: req.params.id, tenantId });
    if (!schedule) return res.status(404).json({ message: "Schedule not found." });

    if (req.user?.role !== "admin") {
      if (schedule.status !== "published") {
        return res.status(403).json({ message: "Only published schedules can be edited by staff." });
      }
      if (req.body.status != null) {
        return res.status(403).json({ message: "Only admins can change schedule status." });
      }
    }

    if (req.body.status != null) schedule.status = req.body.status;
    if (Array.isArray(req.body.activities)) schedule.activities = req.body.activities;

    await schedule.save();
    return res.json({ schedule });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function deleteSchedule(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const schedule = await WeeklyActivitySchedule.findOneAndDelete({
      _id: req.params.id,
      tenantId,
    });
    if (!schedule) return res.status(404).json({ message: "Schedule not found." });

    return res.json({ message: "Schedule deleted." });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function exportSchedule(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;

    const schedule = await WeeklyActivitySchedule.findOne({ _id: req.params.id, tenantId })
      .populate("activities.facilitatorId", "firstName lastName")
      .lean();

    if (!schedule) return res.status(404).json({ message: "Schedule not found." });

    const byDay = Array.from({ length: 7 }, (_, i) => ({
      day: i,
      dayName: DAY_NAMES[i],
      activities: [],
    }));

    for (const slot of schedule.activities) {
      byDay[slot.day].activities.push({
        time: slot.time,
        activityName: slot.activityName,
        durationMinutes: slot.durationMinutes,
        facilitator: slot.facilitatorId
          ? `${slot.facilitatorId.firstName} ${slot.facilitatorId.lastName}`
          : null,
        notes: slot.notes,
      });
    }

    for (const d of byDay) {
      d.activities.sort((a, b) => a.time.localeCompare(b.time));
    }

    return res.json({
      weekStartDate: schedule.weekStartDate,
      status: schedule.status,
      byDay,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

module.exports = {
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
};
