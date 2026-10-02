const mongoose = require("mongoose");
const CalendarEvent = require("../models/CalendarEvent");
const OperationsTask = require("../models/OperationsTask");
const TaskSession = require("../models/TaskSession");
const WeeklyMenu = require("../models/WeeklyMenu");
const Staff = require("../models/staff");

const TASK_STATUSES = new Set(["todo", "doing", "done"]);

async function requireTenantId(req, res) {
  const tenantId = req.user?.tenantId;
  if (!tenantId) {
    res.status(403).json({
      message: "Tenant is not assigned for this account.",
      code: "TENANT_REQUIRED",
    });
    return null;
  }
  return tenantId;
}

async function resolveCurrentStaff(req) {
  const candidate = req.user?.staffId || req.user?.id;
  if (!candidate) return null;
  if (mongoose.Types.ObjectId.isValid(candidate)) {
    return Staff.findById(candidate).select("_id tenantId").lean();
  }
  return Staff.findOne({ clerkUserId: candidate }).select("_id tenantId").lean();
}

function parseDate(value) {
  if (value == null || value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function applyCalendarFields(body, target, creating) {
  if (creating || Object.hasOwn(body, "title")) {
    const title = String(body.title || "").trim();
    if (!title || title.length > 120) return "A title of 1 to 120 characters is required.";
    target.title = title;
  }

  if (creating || Object.hasOwn(body, "details")) {
    const details = String(body.details || "").trim();
    if (details.length > 2000) return "Details must be 2000 characters or fewer.";
    target.details = details;
  }

  if (creating || Object.hasOwn(body, "startAt")) {
    const startAt = parseDate(body.startAt);
    if (!startAt) return "A valid start date is required.";
    target.startAt = startAt;
  }

  if (creating || Object.hasOwn(body, "endAt")) {
    const endAt = parseDate(body.endAt);
    if (endAt === undefined) return "End date must be valid.";
    target.endAt = endAt;
  }

  if (target.endAt && target.endAt < target.startAt) {
    return "End date must be on or after the start date.";
  }
  return null;
}

function applyTaskFields(body, target, creating) {
  if (creating || Object.hasOwn(body, "title")) {
    const title = String(body.title || "").trim();
    if (!title || title.length > 120) return "A title of 1 to 120 characters is required.";
    target.title = title;
  }

  if (creating || Object.hasOwn(body, "details")) {
    const details = String(body.details || "").trim();
    if (details.length > 2000) return "Details must be 2000 characters or fewer.";
    target.details = details;
  }

  if (Object.hasOwn(body, "status")) {
    if (!TASK_STATUSES.has(body.status)) return "Status must be todo, doing, or done.";
    target.status = body.status;
  }

  if (creating || Object.hasOwn(body, "dueDate")) {
    const dueDate = parseDate(body.dueDate);
    if (dueDate === undefined) return "Due date must be valid.";
    target.dueDate = dueDate;
  }
  return null;
}

function normalizeWeekStart(value) {
  const date = parseDate(value);
  if (!date) return null;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = monday.getUTCDay();
  monday.setUTCDate(monday.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return monday;
}

function validateMeals(value) {
  if (!Array.isArray(value)) return { error: "meals must be an array." };
  const meals = [];
  for (const meal of value) {
    const day = Number(meal?.day);
    const mealName = String(meal?.mealName || "").trim();
    const description = String(meal?.description || "").trim();
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      return { error: "Each meal needs a day from 0 (Monday) to 6 (Sunday)." };
    }
    if (!mealName || mealName.length > 60) {
      return { error: "Each meal needs a name of 1 to 60 characters." };
    }
    if (description.length > 1000) {
      return { error: "Meal descriptions must be 1000 characters or fewer." };
    }
    meals.push({ day, mealName, description });
  }
  return { meals };
}

async function listWeeklyMenus(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    if (from === undefined || to === undefined) {
      return res.status(400).json({ message: "Date range must be valid." });
    }
    const filter = { tenantId };
    if (req.user?.role !== "admin") filter.status = "published";
    if (from || to) {
      filter.weekStartDate = {};
      if (from) filter.weekStartDate.$gte = normalizeWeekStart(from);
      if (to) filter.weekStartDate.$lte = normalizeWeekStart(to);
    }
    const menus = await WeeklyMenu.find(filter).sort({ weekStartDate: 1 }).lean();
    return res.json({ menus });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function createWeeklyMenu(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const weekStartDate = normalizeWeekStart(req.body.weekStartDate);
    if (!weekStartDate) return res.status(400).json({ message: "A valid weekStartDate is required." });
    const { meals, error } = validateMeals(req.body.meals || []);
    if (error) return res.status(400).json({ message: error });
    const menu = await WeeklyMenu.create({ tenantId, weekStartDate, meals, status: "draft" });
    return res.status(201).json({ menu });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A menu already exists for this week." });
    }
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function updateWeeklyMenu(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const menu = await WeeklyMenu.findOne({ _id: req.params.id, tenantId });
    if (!menu) return res.status(404).json({ message: "Weekly menu not found." });

    if (Object.hasOwn(req.body, "meals")) {
      const { meals, error } = validateMeals(req.body.meals);
      if (error) return res.status(400).json({ message: error });
      menu.meals = meals;
    }
    if (Object.hasOwn(req.body, "status")) {
      if (!["draft", "published"].includes(req.body.status)) {
        return res.status(400).json({ message: "Status must be draft or published." });
      }
      menu.status = req.body.status;
    }
    await menu.save();
    return res.json({ menu });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function deleteWeeklyMenu(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const menu = await WeeklyMenu.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!menu) return res.status(404).json({ message: "Weekly menu not found." });
    return res.json({ message: "Weekly menu deleted." });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function copyPreviousWeeklyMenu(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const targetWeekStart = normalizeWeekStart(req.body.weekStartDate);
    if (!targetWeekStart) {
      return res.status(400).json({ message: "A valid weekStartDate is required." });
    }
    const previousWeekStart = new Date(targetWeekStart);
    previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);
    const previousMenu = await WeeklyMenu.findOne({ tenantId, weekStartDate: previousWeekStart }).lean();
    if (!previousMenu) {
      return res.status(404).json({ message: "No menu exists for the previous week." });
    }

    const currentMenu = await WeeklyMenu.findOne({ tenantId, weekStartDate: targetWeekStart });
    if (currentMenu && req.body.replace !== true) {
      return res.status(409).json({
        message: "A menu already exists for this week. Confirm replacement to continue.",
        code: "MENU_EXISTS",
      });
    }

    const meals = previousMenu.meals.map(({ day, mealName, description }) => ({ day, mealName, description }));
    if (currentMenu) {
      currentMenu.meals = meals;
      currentMenu.status = "draft";
      await currentMenu.save();
      return res.json({ menu: currentMenu });
    }

    const menu = await WeeklyMenu.create({
      tenantId,
      weekStartDate: targetWeekStart,
      meals,
      status: "draft",
    });
    return res.status(201).json({ menu });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A menu already exists for this week." });
    }
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function listCalendarEvents(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const from = parseDate(req.query.from);
    const to = parseDate(req.query.to);
    if (from === undefined || to === undefined) {
      return res.status(400).json({ message: "Date range must be valid." });
    }
    const filter = { tenantId };
    if (from && to) {
      filter.startAt = { $lte: to };
      filter.$or = [
        { endAt: { $gte: from } },
        { endAt: null, startAt: { $gte: from } },
      ];
    } else if (from) {
      filter.$or = [
        { endAt: { $gte: from } },
        { endAt: null, startAt: { $gte: from } },
      ];
    } else if (to) {
      filter.startAt = { $lte: to };
    }
    const events = await CalendarEvent.find(filter).sort({ startAt: 1 }).lean();
    return res.json({ events });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function createCalendarEvent(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const staff = await resolveCurrentStaff(req);
    if (!staff || String(staff.tenantId) !== String(tenantId)) {
      return res.status(403).json({ message: "Staff record not found in this tenant." });
    }
    const fields = {};
    const validationError = applyCalendarFields(req.body, fields, true);
    if (validationError) return res.status(400).json({ message: validationError });
    const event = await CalendarEvent.create({
      ...fields,
      tenantId,
      createdBy: staff._id,
    });
    return res.status(201).json({ event });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function updateCalendarEvent(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const event = await CalendarEvent.findOne({ _id: req.params.id, tenantId });
    if (!event) return res.status(404).json({ message: "Calendar event not found." });
    const validationError = applyCalendarFields(req.body, event, false);
    if (validationError) return res.status(400).json({ message: validationError });
    await event.save();
    return res.json({ event });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function deleteCalendarEvent(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const event = await CalendarEvent.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!event) return res.status(404).json({ message: "Calendar event not found." });
    return res.json({ message: "Calendar event deleted." });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function listOperationsTasks(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const tasks = await OperationsTask.find({ tenantId })
      .sort({ dueDate: 1, createdAt: -1 })
      .lean();
    return res.json({ tasks });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function createOperationsTask(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const staff = await resolveCurrentStaff(req);
    if (!staff || String(staff.tenantId) !== String(tenantId)) {
      return res.status(403).json({ message: "Staff record not found in this tenant." });
    }
    const fields = {};
    const validationError = applyTaskFields(req.body, fields, true);
    if (validationError) return res.status(400).json({ message: validationError });
    const task = await OperationsTask.create({ ...fields, tenantId, createdBy: staff._id });
    return res.status(201).json({ task });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function updateOperationsTask(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const task = await OperationsTask.findOne({ _id: req.params.id, tenantId });
    if (!task) return res.status(404).json({ message: "Task not found." });
    const validationError = applyTaskFields(req.body, task, false);
    if (validationError) return res.status(400).json({ message: validationError });
    await task.save();
    return res.json({ task });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function deleteOperationsTask(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const task = await OperationsTask.findOneAndDelete({ _id: req.params.id, tenantId });
    if (!task) return res.status(404).json({ message: "Task not found." });
    return res.json({ message: "Task deleted." });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function listMyTaskSessions(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const staff = await resolveCurrentStaff(req);
    if (!staff || String(staff.tenantId) !== String(tenantId)) {
      return res.status(403).json({ message: "Staff record not found in this tenant." });
    }
    const sessions = await TaskSession.find({ tenantId, staffId: staff._id })
      .sort({ startedAt: -1 })
      .limit(50)
      .lean();
    return res.json({ sessions });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function listTaskSessions(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const sessions = await TaskSession.find({ tenantId })
      .populate("staffId", "firstName lastName email")
      .sort({ startedAt: -1 })
      .limit(500)
      .lean();
    return res.json({ sessions });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function startTaskSession(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const staff = await resolveCurrentStaff(req);
    if (!staff || String(staff.tenantId) !== String(tenantId)) {
      return res.status(403).json({ message: "Staff record not found in this tenant." });
    }
    const taskName = String(req.body.taskName || "").trim();
    if (!taskName || taskName.length > 160) {
      return res.status(400).json({ message: "Task name of 1 to 160 characters is required." });
    }
    const active = await TaskSession.findOne({ tenantId, staffId: staff._id, endedAt: null });
    if (active) return res.status(409).json({ message: "A task timer is already active." });
    const session = await TaskSession.create({ tenantId, staffId: staff._id, taskName });
    return res.status(201).json({ session });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A task timer is already active." });
    }
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

async function stopTaskSession(req, res) {
  try {
    const tenantId = await requireTenantId(req, res);
    if (!tenantId) return;
    const staff = await resolveCurrentStaff(req);
    if (!staff || String(staff.tenantId) !== String(tenantId)) {
      return res.status(403).json({ message: "Staff record not found in this tenant." });
    }
    const session = await TaskSession.findOne({ tenantId, staffId: staff._id, endedAt: null });
    if (!session) return res.status(404).json({ message: "No active task timer found." });
    session.endedAt = new Date();
    await session.save();
    return res.json({ session });
  } catch (error) {
    return res.status(500).json({ message: error.message || "Server error" });
  }
}

module.exports = {
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
  listWeeklyMenus,
  createWeeklyMenu,
  updateWeeklyMenu,
  deleteWeeklyMenu,
  copyPreviousWeeklyMenu,
};