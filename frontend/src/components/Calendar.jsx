import React, { useCallback, useEffect, useMemo, useState } from "react";
import { listSchedules, updateSchedule } from "../services/activities";
import {
  createCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
} from "../services/operations";

const STORAGE_KEY = "timestampPlannerNotes";

function pad2(n) {
  return String(n).padStart(2, "0");
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  return `${y}-${m}-${d}`;
}

function formatHuman(date) {
  return date.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatLocalInput(value) {
  if (!value) return "";
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function getScheduledActivities(schedules) {
  return schedules.flatMap((schedule) => {
    if (schedule.status !== "published") return [];
    const [year, month, day] = new Date(schedule.weekStartDate).toISOString().slice(0, 10).split("-").map(Number);
    return (schedule.activities || []).map((activity, index) => {
      const [hours, minutes] = String(activity.time || "00:00").split(":").map(Number);
      const startAt = new Date(year, month - 1, day + activity.day, hours, minutes);
      return {
        key: `${schedule._id}-${index}`,
        kind: "activity",
        scheduleId: schedule._id,
        index,
        title: activity.activityName,
        details: activity.notes || "",
        startAt,
        durationMinutes: activity.durationMinutes || 60,
        activity,
      };
    });
  });
}

function loadNotes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveNotes(notes) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export default function Calendar() {
  const today = useMemo(() => new Date(), []);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(() => toDateKey(today));
  const [notes, setNotes] = useState(() => loadNotes());
  const [draft, setDraft] = useState(() => notes[toDateKey(today)] || "");
  const [events, setEvents] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [eventForm, setEventForm] = useState(null);
  const [editingEventId, setEditingEventId] = useState(null);
  const [activityForm, setActivityForm] = useState(null);
  const [editingActivity, setEditingActivity] = useState(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const refreshSharedCalendar = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const from = new Date(year, month, 1).toISOString();
      const to = new Date(year, month + 1, 0, 23, 59, 59, 999).toISOString();
      const [nextEvents, nextSchedules] = await Promise.all([
        listCalendarEvents({ from, to }),
        listSchedules(),
      ]);
      setEvents(nextEvents);
      setSchedules(nextSchedules);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load shared calendar.");
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useEffect(() => {
    refreshSharedCalendar();
  }, [refreshSharedCalendar]);

  const monthLabel = useMemo(() => {
    return cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }, [cursor]);

  const scheduledActivities = useMemo(() => getScheduledActivities(schedules), [schedules]);

  const entriesByDate = useMemo(() => {
    const byDate = new Map();
    const add = (key, entry) => byDate.set(key, [...(byDate.get(key) || []), entry]);
    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0);
    events.forEach((event) => {
      const startAt = new Date(event.startAt);
      const endAt = new Date(event.endAt || event.startAt);
      const firstDay = new Date(Math.max(
        new Date(startAt.getFullYear(), startAt.getMonth(), startAt.getDate()).getTime(),
        monthStart.getTime()
      ));
      const lastDay = new Date(Math.min(
        new Date(endAt.getFullYear(), endAt.getMonth(), endAt.getDate()).getTime(),
        monthEnd.getTime()
      ));
      for (const day = new Date(firstDay); day <= lastDay; day.setDate(day.getDate() + 1)) {
        const key = toDateKey(day);
        add(key, {
          ...event,
          key: event._id,
          kind: "event",
          startAt,
          endAt: event.endAt ? new Date(event.endAt) : null,
          continues: key !== toDateKey(startAt),
        });
      }
    });
    scheduledActivities.forEach((activity) => add(toDateKey(activity.startAt), activity));
    byDate.forEach((entries) => entries.sort((a, b) => a.startAt - b.startAt));
    return byDate;
  }, [events, month, scheduledActivities, year]);

  const { cells, noteKeysThisMonth } = useMemo(() => {
    const firstDow = new Date(year, month, 1).getDay(); // 0..6
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const out = [];
    for (let i = 0; i < firstDow; i++) out.push(null);
    for (let day = 1; day <= daysInMonth; day++) {
      out.push(new Date(year, month, day));
    }

    const noteKeys = new Set();
    Object.keys(notes || {}).forEach((k) => {
      if (k.startsWith(`${year}-${pad2(month + 1)}-`) && String(notes[k] || "").trim()) {
        noteKeys.add(k);
      }
    });

    return { cells: out, noteKeysThisMonth: noteKeys };
  }, [month, notes, year]);

  const selectedDate = useMemo(() => {
    const [y, m, d] = selectedKey.split("-").map((n) => Number(n));
    return new Date(y, (m || 1) - 1, d || 1);
  }, [selectedKey]);

  const onPrev = () => {
    const next = new Date(year, month - 1, 1);
    setCursor(next);
    setSelectedKey(toDateKey(next));
    setDraft(notes[toDateKey(next)] || "");
  };

  const onNext = () => {
    const next = new Date(year, month + 1, 1);
    setCursor(next);
    setSelectedKey(toDateKey(next));
    setDraft(notes[toDateKey(next)] || "");
  };

  const onPick = (date) => {
    const key = toDateKey(date);
    setSelectedKey(key);
    setDraft(notes[key] || "");
  };

  const onSave = () => {
    const next = { ...(notes || {}) };
    const trimmed = String(draft || "").trim();
    if (!trimmed) {
      delete next[selectedKey];
    } else {
      next[selectedKey] = draft;
    }

    setNotes(next);
    saveNotes(next);
  };

  const onClear = () => {
    setDraft("");
    const next = { ...(notes || {}) };
    delete next[selectedKey];
    setNotes(next);
    saveNotes(next);
  };

  const selectedHasNote = Boolean(String(notes[selectedKey] || "").trim());
  const selectedEntries = entriesByDate.get(selectedKey) || [];

  const beginNewEvent = () => {
    setEditingEventId(null);
    setEventForm({
      title: "",
      details: "",
      startAt: formatLocalInput(new Date(`${selectedKey}T09:00:00`)),
      endAt: "",
    });
  };

  const beginEditEvent = (event) => {
    setEditingEventId(event._id);
    setEventForm({
      title: event.title,
      details: event.details || "",
      startAt: formatLocalInput(event.startAt),
      endAt: formatLocalInput(event.endAt) || "",
    });
  };

  const saveEvent = async (event) => {
    event.preventDefault();
    setError("");
    const payload = {
      ...eventForm,
      startAt: new Date(eventForm.startAt).toISOString(),
      endAt: eventForm.endAt ? new Date(eventForm.endAt).toISOString() : null,
    };
    try {
      if (editingEventId) await updateCalendarEvent(editingEventId, payload);
      else await createCalendarEvent(payload);
      setEventForm(null);
      setEditingEventId(null);
      await refreshSharedCalendar();
    } catch (err) {
      setError(err.response?.data?.message || "Could not save calendar event.");
    }
  };

  const removeEvent = async (event) => {
    if (!window.confirm(`Delete "${event.title}"?`)) return;
    try {
      await deleteCalendarEvent(event._id);
      await refreshSharedCalendar();
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete calendar event.");
    }
  };

  const beginEditActivity = (entry) => {
    setEditingActivity({ scheduleId: entry.scheduleId, index: entry.index });
    setActivityForm({
      activityName: entry.activity.activityName,
      time: entry.activity.time,
      durationMinutes: entry.activity.durationMinutes || 60,
      notes: entry.activity.notes || "",
    });
  };

  const saveActivity = async (event) => {
    event.preventDefault();
    const schedule = schedules.find((item) => item._id === editingActivity?.scheduleId);
    if (!schedule) return;
    const activities = schedule.activities.map((activity, index) => index === editingActivity.index
      ? { ...activity, ...activityForm, durationMinutes: Number(activityForm.durationMinutes) }
      : activity
    );
    try {
      await updateSchedule(schedule._id, { activities });
      setActivityForm(null);
      setEditingActivity(null);
      await refreshSharedCalendar();
    } catch (err) {
      setError(err.response?.data?.message || "Could not update activity.");
    }
  };

  const removeActivity = async (entry) => {
    if (!window.confirm(`Remove "${entry.title}" from the schedule?`)) return;
    const schedule = schedules.find((item) => item._id === entry.scheduleId);
    if (!schedule) return;
    try {
      await updateSchedule(schedule._id, {
        activities: schedule.activities.filter((_, index) => index !== entry.index),
      });
      await refreshSharedCalendar();
    } catch (err) {
      setError(err.response?.data?.message || "Could not remove activity.");
    }
  };

  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const dows = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="calendarWrap">
      <div className="calendarHeader">
        <button type="button" className="btn" onClick={onPrev}>
          ←
        </button>
        <h2>{monthLabel}</h2>
        <button type="button" className="btn" onClick={onNext}>
          →
        </button>
      </div>

      {error && <div role="alert" style={{ marginBottom: 12, padding: 10, background: "#fee2e2", color: "#991b1b", borderRadius: 6 }}>{error}</div>}
      {loading && <p aria-live="polite" style={{ color: "#64748b" }}>Loading shared calendar…</p>}

      <div className="card">
        <div className="calendarGrid" style={{ marginBottom: 10 }}>
          {dows.map((d) => (
            <div key={d} className="calendarDow">
              {d}
            </div>
          ))}
        </div>

        <div className="calendarGrid">
          {cells.map((date, idx) => {
            if (!date) {
              return <div key={`empty-${idx}`} className="dayCell dayCellMuted" />;
            }

            const key = toDateKey(date);
            const hasNote = noteKeysThisMonth.has(key);
            const hasSharedItems = entriesByDate.has(key);
            const isToday = isSameDay(date, today);
            const isSelected = key === selectedKey;

            const className = [
              "dayCell",
              isToday ? "today" : "",
              isSelected ? "selected" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div
                key={key}
                className={className}
                onClick={() => onPick(date)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onPick(date);
                }}
              >
                <div className="dayNumber">{date.getDate()}</div>
                {(hasNote || hasSharedItems) && <div className="noteDot" title={hasSharedItems ? "Has scheduled items" : "Has a personal note"} />}
              </div>
            );
          })}
        </div>
      </div>

      <section className="card" style={{ marginTop: 16, padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h3 style={{ margin: 0 }}>Shared schedule</h3>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>{formatHuman(selectedDate)}</p>
          </div>
          <button type="button" className="btn btnPrimary" onClick={beginNewEvent}>Add event</button>
        </div>

        {selectedEntries.length === 0 ? <p style={{ color: "#64748b", marginBottom: 0 }}>No events or activities on this day.</p> : (
          <div style={{ display: "grid", gap: 8, marginTop: 14 }}>
            {selectedEntries.map((entry) => (
              <article key={`${entry.kind}-${entry.key}`} style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, padding: 12, border: "1px solid #e2e8f0", borderRadius: 6 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong style={{ overflowWrap: "anywhere" }}>{entry.title}</strong>
                    <span style={{ fontSize: 11, fontWeight: 600, color: entry.kind === "activity" ? "#166534" : "#075985", background: entry.kind === "activity" ? "#dcfce7" : "#e0f2fe", padding: "3px 6px", borderRadius: 4 }}>{entry.kind === "activity" ? "Activity" : "Event"}</span>
                  </div>
                  <p style={{ margin: "5px 0 0", fontSize: 13, color: "#475569" }}>
                    {entry.continues ? "Continues" : new Date(entry.startAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                    {entry.kind === "activity" ? ` · ${entry.durationMinutes} min` : entry.endAt ? ` – ${new Date(entry.endAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
                  </p>
                  {entry.details && <p style={{ whiteSpace: "pre-wrap", margin: "5px 0 0", color: "#475569", fontSize: 13 }}>{entry.details}</p>}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {entry.kind === "event" ? (
                    <>
                      <button type="button" className="btn" onClick={() => beginEditEvent(entry)}>Edit</button>
                      <button type="button" className="btn" onClick={() => removeEvent(entry)} aria-label={`Delete ${entry.title}`}>Delete</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="btn" onClick={() => beginEditActivity(entry)}>Edit</button>
                      <button type="button" className="btn" onClick={() => removeActivity(entry)} aria-label={`Remove ${entry.title}`}>Remove</button>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}

        {eventForm && (
          <form onSubmit={saveEvent} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginTop: 16, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
            <input value={eventForm.title} onChange={(event) => setEventForm((current) => ({ ...current, title: event.target.value }))} maxLength={120} placeholder="Event title" aria-label="Event title" required />
            <input type="datetime-local" value={eventForm.startAt} onChange={(event) => setEventForm((current) => ({ ...current, startAt: event.target.value }))} aria-label="Event start" required />
            <input type="datetime-local" value={eventForm.endAt} onChange={(event) => setEventForm((current) => ({ ...current, endAt: event.target.value }))} aria-label="Event end (optional)" />
            <input value={eventForm.details} onChange={(event) => setEventForm((current) => ({ ...current, details: event.target.value }))} maxLength={2000} placeholder="Details (optional)" aria-label="Event details" />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btnPrimary" type="submit">{editingEventId ? "Save event" : "Create event"}</button>
              <button className="btn" type="button" onClick={() => { setEventForm(null); setEditingEventId(null); }}>Cancel</button>
            </div>
          </form>
        )}

        {activityForm && (
          <form onSubmit={saveActivity} style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 16, paddingTop: 14, borderTop: "1px solid #e2e8f0" }}>
            <input value={activityForm.activityName} onChange={(event) => setActivityForm((current) => ({ ...current, activityName: event.target.value }))} maxLength={120} placeholder="Activity name" aria-label="Activity name" required />
            <input type="time" value={activityForm.time} onChange={(event) => setActivityForm((current) => ({ ...current, time: event.target.value }))} aria-label="Activity time" required />
            <input type="number" min="1" value={activityForm.durationMinutes} onChange={(event) => setActivityForm((current) => ({ ...current, durationMinutes: event.target.value }))} aria-label="Duration in minutes" required />
            <input value={activityForm.notes} onChange={(event) => setActivityForm((current) => ({ ...current, notes: event.target.value }))} maxLength={500} placeholder="Notes (optional)" aria-label="Activity notes" />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btnPrimary" type="submit">Save activity</button>
              <button className="btn" type="button" onClick={() => { setActivityForm(null); setEditingActivity(null); }}>Cancel</button>
            </div>
          </form>
        )}
      </section>

      <div className="card noteEditor">
        <div className="noteMeta">
            <span>Personal note · {formatHuman(selectedDate)}</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" className="btn btnPrimary" onClick={onSave}>
              Save
            </button>
            <button
              type="button"
              className="btn"
              onClick={onClear}
              disabled={!selectedHasNote && !String(draft || "").trim()}
              title="Clear note for this day"
            >
              Clear
            </button>
          </div>
        </div>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a simple note for this day (stored locally in this browser)…"
        />
      </div>
    </div>
  );
}
