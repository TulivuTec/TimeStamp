jest.mock("web-push", () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));
jest.mock("../models/OperationsTask", () => ({
  findOneAndUpdate: jest.fn(),
  updateOne: jest.fn(),
}));
jest.mock("../models/PushSubscription", () => ({
  find: jest.fn(),
  deleteOne: jest.fn(),
}));
jest.mock("../models/staff", () => ({ findOne: jest.fn() }));
jest.mock("../utils/mailer", () => ({
  isMailerConfigured: jest.fn(),
  sendMail: jest.fn(),
}));

const webpush = require("web-push");
const OperationsTask = require("../models/OperationsTask");
const PushSubscription = require("../models/PushSubscription");
const Staff = require("../models/staff");
const { isMailerConfigured, sendMail } = require("../utils/mailer");
const {
  processDueTaskReminders,
  startOperationsTaskReminderScheduler,
} = require("../utils/operationsTaskReminders");

const makeTask = (overrides = {}) => ({
  _id: { toString: () => "task1" },
  tenantId: "tenant1",
  assignedTo: "staff1",
  title: "Give meds",
  details: "8am",
  dueDate: new Date("2030-01-01T10:00:00Z"),
  reminderEmailSentAt: null,
  reminderPushSentAt: null,
  ...overrides,
});

const staffRecord = { _id: "staff1", email: "c@example.com", firstName: "Cara" };

const mockStaff = (record) =>
  Staff.findOne.mockReturnValue({ select: jest.fn().mockResolvedValue(record) });

const mockSubscriptions = (subs) =>
  PushSubscription.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(subs) });

const lastUpdateSet = () => OperationsTask.updateOne.mock.calls.at(-1)[1].$set;

describe("operations task reminders", () => {
  let errorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.VAPID_PUBLIC_KEY = "pub";
    process.env.VAPID_PRIVATE_KEY = "priv";
    process.env.VAPID_SUBJECT = "mailto:admin@example.com";
    isMailerConfigured.mockReturnValue(true);
    sendMail.mockResolvedValue();
    webpush.sendNotification.mockResolvedValue();
    OperationsTask.updateOne.mockResolvedValue({});
    mockStaff(staffRecord);
    mockSubscriptions([{ _id: "s1", endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: "a", auth: "b" } }]);
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => errorSpy.mockRestore());

  test("does nothing when no reminder is due", async () => {
    OperationsTask.findOneAndUpdate.mockResolvedValue(null);
    await processDueTaskReminders();
    expect(sendMail).not.toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
  });

  test("claims only due, open, assigned tasks that are not locked", async () => {
    OperationsTask.findOneAndUpdate.mockResolvedValue(null);
    await processDueTaskReminders();
    const [filter, update] = OperationsTask.findOneAndUpdate.mock.calls[0];
    expect(filter.status).toEqual({ $ne: "done" });
    expect(filter.reminderAt.$lte).toBeInstanceOf(Date);
    expect(filter.assignedTo).toEqual({ $ne: null });
    expect(JSON.stringify(filter.$and)).toContain("reminderLockUntil");
    expect(update.$set.reminderLockUntil.getTime()).toBeGreaterThan(Date.now());
  });

  test("sends email and push and records both as sent", async () => {
    OperationsTask.findOneAndUpdate
      .mockResolvedValueOnce(makeTask())
      .mockResolvedValueOnce(null);
    await processDueTaskReminders();

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(sendMail.mock.calls[0][0].to).toBe("c@example.com");
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
    const set = lastUpdateSet();
    expect(set.reminderEmailSentAt).toBeInstanceOf(Date);
    expect(set.reminderPushSentAt).toBeInstanceOf(Date);
    expect(set.reminderLockUntil).toBeNull();
  });

  test("skips and closes out the reminder when the caregiver is inactive or missing", async () => {
    mockStaff(null);
    OperationsTask.findOneAndUpdate
      .mockResolvedValueOnce(makeTask())
      .mockResolvedValueOnce(null);
    await processDueTaskReminders();

    expect(sendMail).not.toHaveBeenCalled();
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    const update = OperationsTask.updateOne.mock.calls[0][1];
    expect(update.$set.reminderEmailSentAt).toBeInstanceOf(Date);
    expect(update.$set.reminderPushSentAt).toBeInstanceOf(Date);
  });

  test("when email fails, push is still recorded and the email is left to retry", async () => {
    sendMail.mockRejectedValue(new Error("smtp down"));
    OperationsTask.findOneAndUpdate
      .mockResolvedValueOnce(makeTask())
      .mockResolvedValueOnce(null);
    await processDueTaskReminders();

    const set = lastUpdateSet();
    expect(set.reminderEmailSentAt).toBeUndefined();
    expect(set.reminderPushSentAt).toBeInstanceOf(Date);
    expect(set.reminderLockUntil.getTime()).toBeGreaterThan(Date.now());
  });

  test("does not resend a channel that already succeeded", async () => {
    OperationsTask.findOneAndUpdate
      .mockResolvedValueOnce(makeTask({ reminderEmailSentAt: new Date() }))
      .mockResolvedValueOnce(null);
    await processDueTaskReminders();

    expect(sendMail).not.toHaveBeenCalled();
    expect(webpush.sendNotification).toHaveBeenCalledTimes(1);
  });

  test("deletes expired push subscriptions (410) without failing the reminder", async () => {
    webpush.sendNotification.mockRejectedValue(
      Object.assign(new Error("gone"), { statusCode: 410 })
    );
    OperationsTask.findOneAndUpdate
      .mockResolvedValueOnce(makeTask())
      .mockResolvedValueOnce(null);
    await processDueTaskReminders();

    expect(PushSubscription.deleteOne).toHaveBeenCalledWith({ _id: "s1" });
    expect(lastUpdateSet().reminderPushSentAt).toBeInstanceOf(Date);
  });

  test("keeps the subscription and retries on other push errors", async () => {
    webpush.sendNotification.mockRejectedValue(
      Object.assign(new Error("server error"), { statusCode: 500 })
    );
    OperationsTask.findOneAndUpdate
      .mockResolvedValueOnce(makeTask())
      .mockResolvedValueOnce(null);
    await processDueTaskReminders();

    expect(PushSubscription.deleteOne).not.toHaveBeenCalled();
    expect(lastUpdateSet().reminderPushSentAt).toBeUndefined();
  });

  test("still emails when VAPID keys are missing", async () => {
    delete process.env.VAPID_PRIVATE_KEY;
    OperationsTask.findOneAndUpdate
      .mockResolvedValueOnce(makeTask())
      .mockResolvedValueOnce(null);
    await processDueTaskReminders();

    expect(sendMail).toHaveBeenCalledTimes(1);
    expect(webpush.sendNotification).not.toHaveBeenCalled();
    const set = lastUpdateSet();
    expect(set.reminderEmailSentAt).toBeInstanceOf(Date);
    expect(set.reminderPushSentAt).toBeUndefined();
  });

  test("scheduler registers an unref'd interval only once", () => {
    jest.useFakeTimers();
    const spy = jest.spyOn(global, "setInterval");
    OperationsTask.findOneAndUpdate.mockResolvedValue(null);
    startOperationsTaskReminderScheduler();
    startOperationsTaskReminderScheduler();
    expect(spy).toHaveBeenCalledTimes(1);
    jest.advanceTimersByTime(60 * 1000);
    expect(OperationsTask.findOneAndUpdate).toHaveBeenCalled();
    spy.mockRestore();
    jest.useRealTimers();
  });
});
