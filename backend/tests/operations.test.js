jest.mock("../models/CalendarEvent", () => ({
  find: jest.fn(),
  create: jest.fn(),
  findOne: jest.fn(),
  findOneAndDelete: jest.fn(),
}));
jest.mock("../models/OperationsTask", () => ({
  find: jest.fn(),
  create: jest.fn(),
  findOne: jest.fn(),
  findOneAndDelete: jest.fn(),
}));
jest.mock("../models/TaskSession", () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
}));
jest.mock("../models/WeeklyMenu", () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  findOneAndDelete: jest.fn(),
}));
jest.mock("../models/WeeklyActivitySchedule", () => ({ findOne: jest.fn() }));
jest.mock("../models/ActivityTemplate", () => ({}));
jest.mock("../models/staff", () => ({ findById: jest.fn(), findOne: jest.fn() }));

const CalendarEvent = require("../models/CalendarEvent");
const OperationsTask = require("../models/OperationsTask");
const TaskSession = require("../models/TaskSession");
const WeeklyMenu = require("../models/WeeklyMenu");
const Staff = require("../models/staff");
const WeeklyActivitySchedule = require("../models/WeeklyActivitySchedule");
const { updateSchedule } = require("../controllers/activityController");
const {
  listCalendarEvents,
  createCalendarEvent,
  updateCalendarEvent,
  createOperationsTask,
  startTaskSession,
  stopTaskSession,
  listWeeklyMenus,
  createWeeklyMenu,
  copyPreviousWeeklyMenu,
} = require("../controllers/operationsController");

const tenantId = "64a000000000000000000001";
const staffId = "64a000000000000000000002";

function makeResponse() {
  const response = { status: jest.fn(), json: jest.fn() };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response;
}

function mockCurrentStaff() {
  const query = {
    select: jest.fn(),
    lean: jest.fn(),
  };
  query.select.mockReturnValue(query);
  query.lean.mockResolvedValue({ _id: staffId, tenantId });
  Staff.findById.mockReturnValue(query);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCurrentStaff();
});

describe("shared calendar handlers", () => {
  test("lists events scoped to the tenant and overlapping the requested range", async () => {
    const events = [{ _id: "event-1" }];
    const query = { sort: jest.fn(), lean: jest.fn().mockResolvedValue(events) };
    query.sort.mockReturnValue(query);
    CalendarEvent.find.mockReturnValue(query);
    const response = makeResponse();

    await listCalendarEvents({
      user: { tenantId },
      query: { from: "2026-10-01T00:00:00.000Z", to: "2026-10-31T23:59:59.999Z" },
    }, response);

    expect(CalendarEvent.find).toHaveBeenCalledWith(expect.objectContaining({
      tenantId,
      startAt: { $lte: new Date("2026-10-31T23:59:59.999Z") },
      $or: [
        { endAt: { $gte: new Date("2026-10-01T00:00:00.000Z") } },
        { endAt: null, startAt: { $gte: new Date("2026-10-01T00:00:00.000Z") } },
      ],
    }));
    expect(response.json).toHaveBeenCalledWith({ events });
  });

  test("rejects an event without a valid title or start date", async () => {
    const response = makeResponse();

    await createCalendarEvent({
      user: { tenantId, staffId },
      body: { title: "", startAt: "not-a-date" },
    }, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(CalendarEvent.create).not.toHaveBeenCalled();
  });

  test("does not update an event outside the current tenant", async () => {
    CalendarEvent.findOne.mockResolvedValue(null);
    const response = makeResponse();

    await updateCalendarEvent({
      user: { tenantId },
      params: { id: "event-from-another-tenant" },
      body: { title: "Changed" },
    }, response);

    expect(CalendarEvent.findOne).toHaveBeenCalledWith({
      _id: "event-from-another-tenant",
      tenantId,
    });
    expect(response.status).toHaveBeenCalledWith(404);
  });
});

describe("Operations Kanban handlers", () => {
  test("rejects invalid card status values", async () => {
    const response = makeResponse();

    await createOperationsTask({
      user: { tenantId, staffId },
      body: { title: "Review supply order", status: "blocked" },
    }, response);

    expect(response.status).toHaveBeenCalledWith(400);
    expect(OperationsTask.create).not.toHaveBeenCalled();
  });
});

describe("published activity schedule permissions", () => {
  test("allows staff to edit activities on a published schedule", async () => {
    const schedule = {
      status: "published",
      activities: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    WeeklyActivitySchedule.findOne.mockResolvedValue(schedule);
    const response = makeResponse();
    const activities = [{ day: 1, time: "09:00", activityName: "Morning group" }];

    await updateSchedule({
      user: { tenantId, role: "staff" },
      params: { id: "schedule-1" },
      body: { activities },
    }, response);

    expect(schedule.activities).toEqual(activities);
    expect(schedule.save).toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith({ schedule });
  });

  test("prevents staff from editing a draft schedule or its status", async () => {
    const schedule = {
      status: "draft",
      activities: [],
      save: jest.fn(),
    };
    WeeklyActivitySchedule.findOne.mockResolvedValue(schedule);
    const response = makeResponse();

    await updateSchedule({
      user: { tenantId, role: "staff" },
      params: { id: "schedule-2" },
      body: { status: "published" },
    }, response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(schedule.save).not.toHaveBeenCalled();
  });
});

describe("independent task timer handlers", () => {
  test("starts a task session without looking up or changing a shift entry", async () => {
    const session = { _id: "session-1", taskName: "Prepare activity room" };
    TaskSession.findOne.mockResolvedValue(null);
    TaskSession.create.mockResolvedValue(session);
    const response = makeResponse();

    await startTaskSession({
      user: { tenantId, staffId },
      body: { taskName: " Prepare activity room " },
    }, response);

    expect(TaskSession.create).toHaveBeenCalledWith({
      tenantId,
      staffId,
      taskName: "Prepare activity room",
    });
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith({ session });
  });

  test("rejects a second active task timer", async () => {
    TaskSession.findOne.mockResolvedValue({ _id: "active-session" });
    const response = makeResponse();

    await startTaskSession({
      user: { tenantId, staffId },
      body: { taskName: "Second task" },
    }, response);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(TaskSession.create).not.toHaveBeenCalled();
  });

  test("stops only the current tenant and staff member's active timer", async () => {
    const session = { endedAt: null, save: jest.fn().mockResolvedValue(undefined) };
    TaskSession.findOne.mockResolvedValue(session);
    const response = makeResponse();

    await stopTaskSession({ user: { tenantId, staffId } }, response);

    expect(TaskSession.findOne).toHaveBeenCalledWith({ tenantId, staffId, endedAt: null });
    expect(session.endedAt).toBeInstanceOf(Date);
    expect(session.save).toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith({ session });
  });
});

describe("weekly menu handlers", () => {
  test("limits staff menu reads to published menus in their tenant", async () => {
    const menus = [{ status: "published" }];
    const query = { sort: jest.fn(), lean: jest.fn().mockResolvedValue(menus) };
    query.sort.mockReturnValue(query);
    WeeklyMenu.find.mockReturnValue(query);
    const response = makeResponse();

    await listWeeklyMenus({ user: { tenantId, role: "staff" }, query: {} }, response);

    expect(WeeklyMenu.find).toHaveBeenCalledWith({ tenantId, status: "published" });
    expect(response.json).toHaveBeenCalledWith({ menus });
  });

  test("normalizes new menu dates to Monday and validates meals", async () => {
    const menu = { weekStartDate: new Date("2026-10-05T00:00:00.000Z") };
    WeeklyMenu.create.mockResolvedValue(menu);
    const response = makeResponse();

    await createWeeklyMenu({
      user: { tenantId },
      body: {
        weekStartDate: "2026-10-07",
        meals: [{ day: 2, mealName: "Lunch", description: "Soup and bread" }],
      },
    }, response);

    expect(WeeklyMenu.create).toHaveBeenCalledWith({
      tenantId,
      weekStartDate: new Date("2026-10-05T00:00:00.000Z"),
      meals: [{ day: 2, mealName: "Lunch", description: "Soup and bread" }],
      status: "draft",
    });
    expect(response.status).toHaveBeenCalledWith(201);
  });

  test("requires explicit replacement when the selected week already has a menu", async () => {
    const previous = {
      meals: [{ day: 0, mealName: "Breakfast", description: "Oatmeal" }],
    };
    const previousQuery = { lean: jest.fn().mockResolvedValue(previous) };
    WeeklyMenu.findOne
      .mockReturnValueOnce(previousQuery)
      .mockResolvedValueOnce({ _id: "existing-menu" });
    const response = makeResponse();

    await copyPreviousWeeklyMenu({
      user: { tenantId },
      body: { weekStartDate: "2026-10-12" },
    }, response);

    expect(response.status).toHaveBeenCalledWith(409);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ code: "MENU_EXISTS" }));
    expect(WeeklyMenu.create).not.toHaveBeenCalled();
  });

  test("copies previous week's meals as a draft after replacement is confirmed", async () => {
    const previous = {
      meals: [{ day: 3, mealName: "Dinner", description: "Vegetable pasta" }],
    };
    const previousQuery = { lean: jest.fn().mockResolvedValue(previous) };
    const current = { meals: [], status: "published", save: jest.fn().mockResolvedValue(undefined) };
    WeeklyMenu.findOne
      .mockReturnValueOnce(previousQuery)
      .mockResolvedValueOnce(current);
    const response = makeResponse();

    await copyPreviousWeeklyMenu({
      user: { tenantId },
      body: { weekStartDate: "2026-10-12", replace: true },
    }, response);

    expect(current.meals).toEqual(previous.meals);
    expect(current.status).toBe("draft");
    expect(current.save).toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith({ menu: current });
  });
});