const mongoose = require("mongoose");
const PushSubscription = require("../models/PushSubscription");
const Staff = require("../models/staff");

function getVapidPublicKey() {
  return (process.env.VAPID_PUBLIC_KEY || "").trim();
}

async function getCurrentStaff(req) {
  const id = req.user?.staffId || req.user?.id;
  if (id && mongoose.Types.ObjectId.isValid(id)) {
    return Staff.findById(id).select("_id tenantId role isActive").lean();
  }
  const clerkUserId = req.user?.clerkUserId || id;
  if (clerkUserId) {
    return Staff.findOne({ clerkUserId })
      .select("_id tenantId role isActive")
      .lean();
  }
  return null;
}

async function requireCurrentStaff(req, res) {
  const staff = await getCurrentStaff(req);
  if (!staff || !staff.tenantId || staff.isActive === false) {
    res.status(403).json({ message: "Active facility staff account required." });
    return null;
  }
  return staff;
}

function isSupportedPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return (
      host === "fcm.googleapis.com" ||
      host.endsWith(".push.services.mozilla.com") ||
      host === "push.services.mozilla.com" ||
      host.endsWith(".push.apple.com") ||
      host === "web.push.apple.com"
    );
  } catch {
    return false;
  }
}

async function getPushConfiguration(req, res) {
  const publicKey = getVapidPublicKey();
  if (
    !publicKey ||
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.VAPID_SUBJECT
  ) {
    return res.status(503).json({
      message: "Phone push notifications are not configured on the server.",
      code: "PUSH_NOT_CONFIGURED",
    });
  }
  return res.json({ publicKey });
}

async function savePushSubscription(req, res) {
  try {
    const staff = await requireCurrentStaff(req, res);
    if (!staff) return;
    const subscription = req.body;
    const endpoint = subscription?.endpoint;
    const p256dh = subscription?.keys?.p256dh;
    const auth = subscription?.keys?.auth;

    if (
      typeof endpoint !== "string" ||
      endpoint.length > 2048 ||
      !isSupportedPushEndpoint(endpoint) ||
      typeof p256dh !== "string" ||
      typeof auth !== "string" ||
      p256dh.length > 512 ||
      auth.length > 512
    ) {
      return res.status(400).json({ message: "A valid browser push subscription is required." });
    }

    await PushSubscription.findOneAndUpdate(
      { staffId: staff._id, endpoint },
      {
        $set: {
          tenantId: staff.tenantId,
          keys: { p256dh, auth },
          expirationTime: Number.isFinite(subscription.expirationTime)
            ? subscription.expirationTime
            : null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.status(204).end();
  } catch (error) {
    if (error.code === 11000) return res.status(204).end();
    console.error("Could not save push subscription:", error);
    return res.status(500).json({ message: "Could not save push subscription." });
  }
}

async function deletePushSubscription(req, res) {
  try {
    const staff = await requireCurrentStaff(req, res);
    if (!staff) return;
    const endpoint = req.body?.endpoint;
    if (typeof endpoint !== "string" || endpoint.length > 2048) {
      return res.status(400).json({ message: "A valid push endpoint is required." });
    }
    await PushSubscription.deleteOne({ staffId: staff._id, endpoint });
    return res.status(204).end();
  } catch (error) {
    console.error("Could not remove push subscription:", error);
    return res.status(500).json({ message: "Could not remove push subscription." });
  }
}

module.exports = {
  getPushConfiguration,
  savePushSubscription,
  deletePushSubscription,
};
