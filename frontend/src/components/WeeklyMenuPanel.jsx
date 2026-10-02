import React, { useCallback, useEffect, useState } from "react";
import {
  copyPreviousWeeklyMenu,
  createWeeklyMenu,
  deleteWeeklyMenu,
  listWeeklyMenus,
  updateWeeklyMenu,
} from "../services/operations";

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const EMPTY_MEAL = { day: 0, mealName: "", description: "" };

function toDateInput(date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function mondayFor(value) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  return toDateInput(date);
}

function formatWeek(value) {
  return new Date(`${toDateInput(new Date(value))}T12:00:00`).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function WeeklyMenuPanel() {
  const [weekStart, setWeekStart] = useState(() => mondayFor());
  const [menu, setMenu] = useState(null);
  const [mealForm, setMealForm] = useState(EMPTY_MEAL);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    const start = new Date(`${weekStart}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    try {
      const menus = await listWeeklyMenus({ from: start.toISOString(), to: end.toISOString() });
      setMenu(menus.find((item) => new Date(item.weekStartDate).toISOString().slice(0, 10) === weekStart) || null);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load weekly menu.");
    } finally {
      setLoading(false);
    }
  }, [weekStart]);

  useEffect(() => { refresh(); }, [refresh]);

  const saveMenu = async (meals) => {
    if (!menu) return;
    setBusy(true);
    setError("");
    try {
      const updated = await updateWeeklyMenu(menu._id, { meals });
      setMenu(updated);
      setMealForm(EMPTY_MEAL);
    } catch (err) {
      setError(err.response?.data?.message || "Could not save menu.");
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    setBusy(true);
    setError("");
    try {
      const created = await createWeeklyMenu({ weekStartDate: weekStart, meals: [] });
      setMenu(created);
    } catch (err) {
      setError(err.response?.data?.message || "Could not create menu.");
    } finally {
      setBusy(false);
    }
  };

  const handleCopyPrevious = async () => {
    setBusy(true);
    setError("");
    try {
      const copied = await copyPreviousWeeklyMenu(weekStart);
      setMenu(copied);
    } catch (err) {
      if (err.response?.data?.code === "MENU_EXISTS") {
        const confirmed = window.confirm("A menu already exists for this week. Replace it with last week's meals? The copied menu will be saved as a draft.");
        if (!confirmed) return;
        try {
          const copied = await copyPreviousWeeklyMenu(weekStart, true);
          setMenu(copied);
          return;
        } catch (replaceError) {
          setError(replaceError.response?.data?.message || "Could not replace this week's menu.");
          return;
        }
      }
      setError(err.response?.data?.message || "Could not copy the previous week's menu.");
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!menu) return;
    setBusy(true);
    setError("");
    try {
      setMenu(await updateWeeklyMenu(menu._id, { status: menu.status === "published" ? "draft" : "published" }));
    } catch (err) {
      setError(err.response?.data?.message || "Could not update menu status.");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!menu || !window.confirm(`Delete the menu for the week of ${formatWeek(menu.weekStartDate)}?`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteWeeklyMenu(menu._id);
      setMenu(null);
    } catch (err) {
      setError(err.response?.data?.message || "Could not delete menu.");
    } finally {
      setBusy(false);
    }
  };

  const handleAddMeal = async (event) => {
    event.preventDefault();
    if (!menu) return;
    await saveMenu([...(menu.meals || []), {
      day: Number(mealForm.day),
      mealName: mealForm.mealName.trim(),
      description: mealForm.description.trim(),
    }]);
  };

  const handleRemoveMeal = async (mealId) => {
    if (!menu || !window.confirm("Remove this meal from the weekly menu?")) return;
    await saveMenu(menu.meals.filter((meal) => meal._id !== mealId));
  };

  return (
    <section style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20 }}>Weekly menu</h2>
          <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 14 }}>Set meals for the week, then publish them to the calendar.</p>
        </div>
        {menu && <span style={{ color: menu.status === "published" ? "#166534" : "#92400e", background: menu.status === "published" ? "#dcfce7" : "#fef3c7", borderRadius: 4, padding: "4px 8px", fontSize: 12, fontWeight: 700 }}>{menu.status === "published" ? "Published" : "Draft"}</span>}
      </div>

      <div style={{ display: "flex", alignItems: "end", gap: 10, flexWrap: "wrap", marginTop: 16 }}>
        <label style={{ display: "grid", gap: 4, fontSize: 13, color: "#475569" }}>
          Week of Monday
          <input type="date" value={weekStart} onChange={(event) => setWeekStart(mondayFor(event.target.value))} style={{ padding: 8, border: "1px solid #cbd5e1", borderRadius: 6 }} />
        </label>
        <button type="button" onClick={handleCopyPrevious} disabled={busy || loading} style={{ padding: "9px 12px", border: "1px solid #cbd5e1", borderRadius: 6, background: "#fff", cursor: busy ? "wait" : "pointer" }}>Copy previous week</button>
        {menu && <>
          <button type="button" onClick={handlePublish} disabled={busy} style={{ padding: "9px 12px", border: 0, borderRadius: 6, background: menu.status === "published" ? "#fef3c7" : "#166534", color: menu.status === "published" ? "#713f12" : "#fff", cursor: busy ? "wait" : "pointer" }}>{menu.status === "published" ? "Unpublish" : "Publish menu"}</button>
          <button type="button" onClick={handleDelete} disabled={busy} style={{ padding: "9px 12px", border: "1px solid #fecaca", borderRadius: 6, background: "#fff", color: "#b42318", cursor: busy ? "wait" : "pointer" }}>Delete menu</button>
        </>}
      </div>

      {error && <p role="alert" style={{ color: "#b42318" }}>{error}</p>}
      {loading ? <p aria-live="polite" style={{ color: "#64748b" }}>Loading menu…</p> : !menu ? (
        <div style={{ marginTop: 16, padding: 14, background: "#f8fafc", borderRadius: 6 }}>
          <p style={{ margin: "0 0 10px", color: "#475569" }}>No menu for the week of {formatWeek(weekStart)}.</p>
          <button type="button" onClick={handleCreate} disabled={busy} style={{ padding: "8px 12px", border: 0, borderRadius: 6, background: "#166534", color: "#fff", cursor: busy ? "wait" : "pointer" }}>Create blank menu</button>
        </div>
      ) : (
        <>
          <form className="weeklyMenuMealForm" onSubmit={handleAddMeal} style={{ display: "grid", gap: 8, alignItems: "center", marginTop: 16 }}>
            <select aria-label="Day" value={mealForm.day} onChange={(event) => setMealForm((current) => ({ ...current, day: event.target.value }))} style={{ minWidth: 0, padding: 9, border: "1px solid #cbd5e1", borderRadius: 6 }}>
              {DAY_NAMES.map((day, index) => <option value={index} key={day}>{day}</option>)}
            </select>
            <input aria-label="Meal name" value={mealForm.mealName} onChange={(event) => setMealForm((current) => ({ ...current, mealName: event.target.value }))} maxLength={60} placeholder="Breakfast, lunch…" required style={{ minWidth: 0, padding: 9, border: "1px solid #cbd5e1", borderRadius: 6 }} />
            <input aria-label="Meal details" value={mealForm.description} onChange={(event) => setMealForm((current) => ({ ...current, description: event.target.value }))} maxLength={1000} placeholder="Meal details" style={{ minWidth: 0, padding: 9, border: "1px solid #cbd5e1", borderRadius: 6 }} />
            <button type="submit" disabled={busy || !mealForm.mealName.trim()} style={{ padding: "9px 12px", border: 0, borderRadius: 6, background: "#166534", color: "#fff", cursor: busy ? "wait" : "pointer" }}>Add meal</button>
          </form>

          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            {DAY_NAMES.map((day, dayIndex) => {
              const meals = (menu.meals || []).filter((meal) => meal.day === dayIndex);
              return <div key={day} style={{ display: "grid", gridTemplateColumns: "minmax(100px, 140px) minmax(0, 1fr)", gap: 12, borderTop: "1px solid #edf1f5", paddingTop: 9 }}>
                <strong>{day}</strong>
                {meals.length ? <div style={{ display: "grid", gap: 6 }}>
                  {meals.map((meal) => <div key={meal._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 8 }}>
                    <div><strong>{meal.mealName}</strong>{meal.description && <span style={{ color: "#475569" }}> · {meal.description}</span>}</div>
                    <button type="button" onClick={() => handleRemoveMeal(meal._id)} disabled={busy} aria-label={`Remove ${meal.mealName} on ${day}`} style={{ border: "1px solid #fecaca", borderRadius: 4, background: "#fff", color: "#b42318", padding: "3px 7px", cursor: busy ? "wait" : "pointer" }}>Remove</button>
                  </div>)}
                </div> : <span style={{ color: "#94a3b8" }}>No meals</span>}
              </div>;
            })}
          </div>
        </>
      )}
    </section>
  );
}