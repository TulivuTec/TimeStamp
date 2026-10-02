import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listSchedules } from "../services/activities";
import { listCalendarEvents } from "../services/operations";

function toActivityDate(schedule, activity) {
  const [year, month, day] = new Date(schedule.weekStartDate).toISOString().slice(0, 10).split("-").map(Number);
  const [hours, minutes] = String(activity.time || "00:00").split(":").map(Number);
  return new Date(year, month - 1, day + activity.day, hours, minutes);
}

export default function UpcomingCalendarPanel() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listCalendarEvents({ from: new Date().toISOString() }),
      listSchedules(),
    ])
      .then(([events, schedules]) => {
        if (cancelled) return;
        const upcomingEvents = events.map((event) => ({
          key: event._id,
          title: event.title,
          startAt: new Date(event.startAt),
          kind: "Event",
        }));
        const upcomingActivities = schedules
          .filter((schedule) => schedule.status === "published")
          .flatMap((schedule) => (schedule.activities || []).map((activity, index) => ({
            key: `${schedule._id}-${index}`,
            title: activity.activityName,
            startAt: toActivityDate(schedule, activity),
            kind: "Activity",
          })));
        const now = Date.now();
        setItems([...upcomingEvents, ...upcomingActivities]
          .filter((item) => item.startAt.getTime() >= now)
          .sort((a, b) => a.startAt - b.startAt)
          .slice(0, 4));
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.message || "Upcoming calendar items are unavailable.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 18, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 19 }}>Coming up</h2>
        <Link to="/calendar" style={{ color: "#166534", fontWeight: 600 }}>Open calendar</Link>
      </div>
      {error ? <p role="alert" style={{ color: "#b42318", marginBottom: 0 }}>{error}</p> : !items.length ? (
        <p style={{ color: "#64748b", marginBottom: 0 }}>No upcoming activities or events.</p>
      ) : (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          {items.map((item) => (
            <div key={`${item.kind}-${item.key}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: "1px solid #edf1f5", paddingTop: 8 }}>
              <div style={{ minWidth: 0 }}>
                <strong style={{ overflowWrap: "anywhere" }}>{item.title}</strong>
                <span style={{ marginLeft: 8, color: "#64748b", fontSize: 12 }}>{item.kind}</span>
              </div>
              <time dateTime={item.startAt.toISOString()} style={{ color: "#475569", fontSize: 13, whiteSpace: "nowrap" }}>
                {item.startAt.toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </time>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}