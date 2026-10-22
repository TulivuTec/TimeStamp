import React, { useEffect, useState } from "react";
import {
  deletePushSubscription,
  getPushConfig,
  savePushSubscription,
} from "../services/operations";

function decodeVapidKey(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export default function TaskPushNotifications() {
  const [publicKey, setPublicKey] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const supported =
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window;

  useEffect(() => {
    if (!supported) return;
    let cancelled = false;
    (async () => {
      try {
        const key = await getPushConfig();
        if (cancelled) return;
        setPublicKey(key || "");
        if (!key || Notification.permission !== "granted") return;
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
          await savePushSubscription(subscription.toJSON());
          if (!cancelled) setEnabled(true);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(
            error.response?.data?.message ||
              "Could not check phone notification settings."
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supported]);

  const enable = async () => {
    setBusy(true);
    setMessage("");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage("Allow notifications in your browser settings to receive reminders.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription =
        (await registration.pushManager.getSubscription()) ||
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: decodeVapidKey(publicKey),
        }));
      await savePushSubscription(subscription.toJSON());
      setEnabled(true);
      setMessage("Phone reminders are enabled on this device.");
    } catch (error) {
      setMessage(
        error.response?.data?.message || "Could not enable phone reminders."
      );
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await deletePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setEnabled(false);
      setMessage("Phone reminders are disabled on this device.");
    } catch (error) {
      setMessage(
        error.response?.data?.message || "Could not disable phone reminders."
      );
    } finally {
      setBusy(false);
    }
  };

  if (!supported) {
    return <p style={{ color: "#64748b" }}>Phone push notifications are not supported by this browser.</p>;
  }

  if (!publicKey) {
    return <p style={{ color: "#64748b" }}>Email reminders are available; phone push is not configured on the server.</p>;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
      <button
        type="button"
        disabled={busy}
        onClick={enabled ? disable : enable}
        style={{ padding: "8px 12px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", cursor: busy ? "wait" : "pointer" }}
      >
        {busy ? "Updating…" : enabled ? "Disable phone reminders" : "Enable phone reminders"}
      </button>
      {message && <span role="status" style={{ color: "#475569", fontSize: 13 }}>{message}</span>}
    </div>
  );
}
