# API Documentation

This document outlines the primary API endpoints available in the TimeStamp backend.

## Base URL

- Local: `http://localhost:<PORT>/api` (commonly `5001` in this repo)

## Authentication & Authorization

The backend supports Clerk (preferred) and a legacy JWT fallback.

- Frontend sends `Authorization: Bearer <token>`.
- Backend verifies the token in `authMiddleware` and sets `req.user` including `role`.

### Auth (`/auth`)

- `GET /auth/me` (Signed-in): returns the authenticated user info/role used for routing.
	- Also includes `tenantId`, plus `tenantCode` and `tenantName` when assigned.

## Tenant setup (`/tenant`)

These endpoints are designed to replace “run a backfill script” for non-technical onboarding.

- `POST /tenant/bootstrap` (Admin-only)
	- Creates a new facility (Tenant) and assigns it to the current admin account **only if** they are currently unassigned.
	- Body (optional): `{ name?: string }`
	- Returns `{ tenant }`.

### Invite codes (OTP) (`/tenant/otp`)

TimeStamp uses **one-time invite codes** for joining an existing facility.

- `POST /tenant/otp/send-join` (Admin-only)
	- Sends a 6-digit invite code to an email address.
	- Body: `{ toEmail: string }`
	- If mail is not configured, returns a copyable code instead.

- `POST /tenant/otp/redeem-join` (Signed-in)
	- Joins the facility using a 6-digit invite code.
	- Body: `{ code: string }`
	- The signed-in user’s email must match the invite recipient.

## Billing / Plans (`/billing`) (Admin-only)

- `GET /billing/plans`
	- Returns `{ plans }`.

- `GET /billing/me`
	- Returns `{ tenant, plan }`.
	- If unassigned: `403 { code: "TENANT_REQUIRED" }`.

- `POST /billing/select-plan`
	- Body: `{ planId: string }`
	- Sets the plan for the tenant and returns `{ tenant, plan }`.

## Timeclock (`/timeclock`)

- `POST /timeclock/punch-in` (Signed-in): starts a new shift (server captures `punchIn`).
- `POST /timeclock/punch-out` (Signed-in): ends the active shift (server captures `punchOut`).
- `GET /timeclock/my-logs` (Signed-in): returns `{ logs }` sorted by `punchIn`.
	- Each log includes the raw fields (`punchIn`, `punchOut`) and effective fields:
		- `effectivePunchIn`
		- `effectivePunchOut`
	- Effective fields account for approved missed punch overlays without mutating stored punches.

Tenant requirement:
- If the current account has no `tenantId`, these endpoints return `403 { code: "TENANT_REQUIRED" }`.

## Calendar, Operations tasks, and task timers (`/operations`)

All routes require authentication and a tenant assignment. Calendar events are shared across the tenant. Task sessions are independent of timeclock shifts and are not included in payroll hours.

### Shared calendar events (Admin and staff)

- `GET /operations/calendar-events?from=<ISO>&to=<ISO>`
	- Returns `{ events }`; optional date bounds include events that overlap the range.
- `POST /operations/calendar-events`
	- Body: `{ title, startAt, endAt?, details? }`; returns `{ event }`.
- `PATCH /operations/calendar-events/:id`
	- Accepts the same fields partially; events are tenant-scoped.
- `DELETE /operations/calendar-events/:id`
	- Deletes an event in the current tenant.

Published weekly activities are available through `GET /activities/schedules`. Admins create and publish schedules. Staff can edit activities only on published schedules; only admins can change publish status or delete schedules.

### Operations Kanban (Admin-only)

- `GET /operations/tasks` returns `{ tasks }`.
- `POST /operations/tasks` body: `{ title, details?, dueDate? }`; returns `{ task }`.
- `PATCH /operations/tasks/:id` accepts partial task fields, including `status: "todo" | "doing" | "done"`.
- `DELETE /operations/tasks/:id` deletes a task in the current tenant.

### Task timers (Admin and staff)

- `GET /operations/task-sessions/my` returns the signed-in user's recent `{ sessions }`.
- `POST /operations/task-sessions/start` body: `{ taskName }`; returns `{ session }`.
- `POST /operations/task-sessions/stop` ends the current task timer and returns `{ session }`.
- `GET /operations/task-sessions` (Admin-only) returns recent tenant task sessions with staff details.

Only one task timer may be active per staff member at a time. Task timers can run whether the staff member is clocked in or out and do not modify timeclock entries.

### Weekly menus (Admin-managed, staff-visible when published)

- `GET /operations/menus?from=<ISO>&to=<ISO>` returns `{ menus }`; staff receive published menus only.
- `POST /operations/menus` (Admin-only) body: `{ weekStartDate, meals? }`; dates are normalized to Monday and new menus start as drafts.
- `PATCH /operations/menus/:id` (Admin-only) accepts `{ meals? }` and/or `{ status: "draft" | "published" }`.
- `DELETE /operations/menus/:id` (Admin-only) deletes a menu.
- `POST /operations/menus/copy-previous` (Admin-only) body: `{ weekStartDate, replace? }`; copies the prior week's meals into a draft. Existing menus return `409 { code: "MENU_EXISTS" }` unless `replace: true` is supplied.

Meals contain `{ day, mealName, description? }`, where day is `0` for Monday through `6` for Sunday. Published meals appear on their date in the shared calendar.

## Admin (`/admin`) (Admin-only)

- `GET /admin/timelogs`:
	- Query params (optional):
		- `caregiverId`
		- `startDate` (ISO string)
		- `endDate` (ISO string)
	- Returns `{ count, logs }` sorted by `punchIn`.
	- Each log includes `effectivePunchIn` / `effectivePunchOut` when an overlay exists.

- `POST /admin/promote`:
	- Promote a caregiver to admin (also updates Clerk publicMetadata.role when linked).
- `POST /admin/demote`:
	- Demote an admin back to caregiver.
- `DELETE /admin/users/:caregiverId`:
	- Deprovision a user (Clerk delete when linked + local deactivate).

### Admin: Missed punch requests

- `GET /admin/missed-punch-requests?status=pending|approved|rejected|cancelled|all`
- `POST /admin/missed-punch-requests/:id/approve`
	- Approving creates/updates an overlay record for effective times.
- `POST /admin/missed-punch-requests/:id/reject`

## Missed punch requests (`/missed-punch`) (Signed-in)

- `POST /missed-punch/requests`
	- Body: `{ timeEntryId, missingField: "punchOut", requestedTime, reason }`
	- Constraints:
		- Underlying punches are never edited.
		- A request is only allowed when the punch is actually missing.
- `GET /missed-punch/requests/mine`
	- List the signed-in caregiver’s requests.
- `POST /missed-punch/requests/:id/cancel`
	- Cancels a pending request.

Tenant requirement:
- If the current account has no `tenantId`, these endpoints return `403 { code: "TENANT_REQUIRED" }`.

---

Note: Some legacy endpoints mentioned in older docs may no longer be active.
