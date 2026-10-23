const webpush = require("web-push");
const OperationsTask = require("../models/OperationsTask");
const PushSubscription = require("../models/PushSubscription");
const Staff = require("../models/staff");
const Tenant = require("../models/Tenant");
const { isMailerConfigured, sendMail } = require("./mailer");

const REMINDER_POLL_INTERVAL_MS = 60 * 1000;
const REMINDER_LOCK_MS = 5 * 60 * 1000;
const REMINDER_BATCH_SIZE = 25;

let reminderTimer = null;

function getVapidConfig() {
  const publicKey = (process.env.VAPID_PUBLIC_KEY || "").trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY || "").trim();
  const subject = (process.env.VAPID_SUBJECT || "").trim();
  if (!publicKey || !privateKey || !subject) return null;
  return { publicKey, privateKey, subject };
}

async function sendTaskEmail(task, staff) {
  if (!isMailerConfigured()) throw new Error("Task reminder email is not configured.");
  const recipients = [...new Set([staff?.email, task.reminderEmail].filter(Boolean))];
  if (!recipients.length) throw new Error("Task reminder has no email recipient.");
  const tenant = task.tenantId ? await Tenant.findById(task.tenantId).select("name").lean() : null;
  const facilityName = tenant?.name || "TimeStamp";
  const reminderStamp = task.reminderAt ? new Date(task.reminderAt) : new Date();
  const timeZone = task.reminderTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  }).format(reminderStamp);
  const dueDate = task.dueDate
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone,
      }).format(new Date(task.dueDate))
    : "not specified";
  const greeting = staff?.firstName ? `Hi ${staff.firstName},` : "Hi there,";
  await sendMail({
    fromName: facilityName,
    to: recipients.join(","),
    subject: `Task reminder: ${task.title}`,
    text: [
      greeting,
      "",
      `This is a task reminder from ${facilityName}.`,
      `Task: ${task.title}`,
      task.details ? `Details: ${task.details}` : null,
      `Due: ${dueDate}`,
      `Reminder set for: ${dateLabel}`,
      "",
      "Sign in to TimeStamp to review and update the task.",
    ]
      .filter(Boolean)
      .join("\n"),
  });
}

async function sendTaskPush(task, staff) {
  const subscriptions = await PushSubscription.find({
    tenantId: task.tenantId,
    staffId: staff._id,
  }).lean();
  if (!subscriptions.length) return;

  const vapid = getVapidConfig();
  if (!vapid) throw new Error("Task reminder phone push is not configured.");
  webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

  const payload = JSON.stringify({
    title: "TimeStamp task reminder",
    body: task.title,
    url: "/staff",
  });
  const results = await Promise.allSettled(
    subscriptions.map(async (storedSubscription) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: storedSubscription.endpoint,
            keys: storedSubscription.keys,
          },
          payload
        );
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: storedSubscription._id });
          return;
        }
        throw error;
      }
    })
  );
  const failed = results.find((result) => result.status === "rejected");
  if (failed) throw failed.reason;
}

async function claimDueReminder(now) {
  return OperationsTask.findOneAndUpdate(
    {
      status: { $ne: "done" },
      reminderAt: { $lte: now },
      $and: [
        {
          $or: [
            { assignedTo: { $ne: null } },
            { reminderEmail: { $nin: [null, ""] } },
          ],
        },
        {
          $or: [
            { reminderLockUntil: null },
            { reminderLockUntil: { $lt: now } },
          ],
        },
        {
          $or: [
            { reminderEmailSentAt: null },
            { reminderPushSentAt: null },
          ],
        },
      ],
    },
    { $set: { reminderLockUntil: new Date(now.getTime() + REMINDER_LOCK_MS) } },
    { sort: { reminderAt: 1 }, new: true }
  );
}

async function deliverOneReminder(task) {
  const staff = task.assignedTo
    ? await Staff.findOne({
        _id: task.assignedTo,
        tenantId: task.tenantId,
        role: "staff",
        isActive: { $ne: false },
      }).select("_id email firstName")
    : null;
  if (!staff && !task.reminderEmail) {
    console.error("Task reminder skipped: assigned caregiver is missing or inactive.", {
      taskId: task._id.toString(),
    });
    await OperationsTask.updateOne(
      { _id: task._id },
      {
        $set: {
          reminderEmailSentAt: new Date(),
          reminderPushSentAt: new Date(),
        },
        $unset: { reminderLockUntil: 1 },
      }
    );
    return;
  }

  const now = new Date();
  const updates = {};
  let failed = false;
  if (!task.reminderEmailSentAt) {
    try {
      await sendTaskEmail(task, staff);
      updates.reminderEmailSentAt = now;
    } catch (error) {
      failed = true;
      console.error("Task reminder email failed:", error.message);
    }
  }

  if (!task.reminderPushSentAt) {
    try {
      if (staff) await sendTaskPush(task, staff);
      updates.reminderPushSentAt = now;
    } catch (error) {
      failed = true;
      console.error("Task reminder push failed:", error.message);
    }
  }

  if (failed) {
    updates.reminderLockUntil = new Date(Date.now() + REMINDER_LOCK_MS);
  } else {
    updates.reminderLockUntil = null;
  }
  await OperationsTask.updateOne({ _id: task._id }, { $set: updates });
}

async function processDueTaskReminders() {
  for (let count = 0; count < REMINDER_BATCH_SIZE; count += 1) {
    const task = await claimDueReminder(new Date());
    if (!task) return;
    await deliverOneReminder(task);
  }
}

function startOperationsTaskReminderScheduler() {
  if (reminderTimer) return;
  reminderTimer = setInterval(() => {
    processDueTaskReminders().catch((error) => {
      console.error("Operations task reminder cycle failed:", error);
    });
  }, REMINDER_POLL_INTERVAL_MS);
  reminderTimer.unref?.();
}

module.exports = {
  processDueTaskReminders,
  startOperationsTaskReminderScheduler,
};
