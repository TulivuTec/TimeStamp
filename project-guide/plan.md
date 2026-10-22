# Project Implementation Plan: TimeStamp Evolution

This document outlines the roadmap for transitioning to Clerk authentication, implementing per-tenant pricing/feature gating, and (later) implementing the Geofenced Time Tracking system.

---

## Current Sprint Status (Updated: July 6, 2026)

### UI — June 25, 2026
- [x] **Admin Dashboard — log controls** — added search, date range filters, sort options (newest/oldest/longest/shortest), and pagination for admin time logs
- [x] **Admin Dashboard — responsive actions row** — primary action buttons now wrap cleanly on smaller screens instead of overflowing
- [x] **Staff Dashboard — live shift timer** — while clocked in, staff now see a real-time duration counter (`HH:MM:SS`) for the active shift
- [x] **Admin Dashboard — totals ranking table** — replaced totals bullet list with a sortable rank table (hours/name sorting)

### UI — July 6, 2026
- [x] **New facility onboarding** — `TenantSetupPage.jsx` now shows two cards: "Create a new facility" (new) and "Join with invite code"; new subscribers no longer land on invite-only screen after Clerk sign-up
- [x] **Bootstrap route fix** — `POST /api/tenant/bootstrap` opened to any authenticated user with no tenant; creator auto-promoted to admin role

### UI — Remaining Improvements (Undone)
- [ ] Add consistent empty-state call-to-action blocks on payroll/admin sections
- [ ] Replace browser `window.confirm` dialogs in user management with in-app confirmation modals
- [ ] Add sticky headers to long data tables (admin logs, user management, payroll runs)

### UI — May 21, 2026
- [x] **Admin Dashboard — Invite Staff button + modal** — green "✉️ Invite Staff" button added to all admin dashboards; modal collects email, calls `POST /tenant/otp/send-join`, shows OTP copy-code on success with onboarding instructions
- [x] **Invite API 500 fix** — `tenantOtpController.js` now wraps `sendMail()` in try/catch; any SMTP delivery failure (including TLS cert errors) falls through to copy-code response instead of returning 500

### UI — May 18, 2026
- [x] **Caregiver missed punch request form** — redesigned as a proper modal dialog (replaces disconnected bottom panel)
  - Modal shows shift context (punch-in time + job name) so staff know which shift they are editing
  - Reason field upgraded from single-line input to textarea
  - Error messages styled inline in red inside the modal; backdrop click closes it
- [x] **Missed punch status badges** — all four states now shown in the shifts table:
  - ⏳ Pending — amber badge + "Withdraw" button
  - ✕ Rejected — red badge + "Re-submit" button
  - — Withdrawn/Cancelled — shows "+  Request punch-out" button again
  - No request + missing punch-out — shows "+ Request punch-out" button
- [x] **My Punch-Out Requests history section** — appears below the shifts table showing shift date, requested time, color-coded status badge, and submission date for all past requests
- [x] **`backend/scripts/seedJobs.js`** — new idempotent seed script to insert sample jobs for testing without needing a paid plan
  - Inserts: Homecare Staff, Homecare Manager, Admin
  - Uses native MongoDB collection API to bypass Mongoose 9 pre-validate hook compatibility
  - Safe to re-run; skips jobs that already exist
  - Successfully seeded to all tenants

### Jobs Architecture (clarified May 18, 2026)
- Jobs are **TimeStamp-managed**, not synced from Gusto/payroll
- Admins create jobs through the Admin Dashboard → 🧩 Jobs panel
- The `gustoJobUuid` field is an optional manual link to a Gusto job position (only needed for payroll submission)
- Creating jobs via UI requires `dataManagement` feature — available on Standard ($35/mo) and Pro ($55/mo) plans only
- For dev/testing: run `cd backend && node scripts/seedJobs.js`

### Stripe Billing — Nearly Done
- [x] Checkout works end-to-end
- [x] Webhook reaches Render backend (`/api/stripe/webhook`)
- [x] Plan activates correctly (`standard_10`, `pro_25`)
- [x] Invalid `currentPeriodEnd` date bug fixed and deployed
- [x] Duplicate subscription investigation complete — all three flagged IDs (`sub_1TFpzsGlYnDvUBQGCt6kS7Ie`, `sub_1TEjo6GlYnDvUBQGzi0Pepra`, `sub_1TPtGnGlYnDvUBQGZEBYCRGr`) confirmed test-mode only; no live subscriptions exist, no customers charged
- [ ] Do one clean end-to-end checkout test on deployed app to confirm webhook auto-activates plan without manual script

### Gusto Payroll — Phase B COMPLETE ✅ (Sandbox)
- [x] Gusto sandbox credentials in backend `.env` and Render environment
- [x] Draft payroll runs, payroll profiles, and webhook ingestion built
- [x] `PAYROLL_PROVIDER_MODE=live` pointed at `https://api.gusto-demo.com` (sandbox)
- [x] Partner-managed company created (`44196a95-66a8-428e-86ea-9cb1183b966d`) — required for payroll write access
- [x] Employee Alexander Hamilton fully onboarded: home address, work address, job (Caregiver), compensation ($24.50/hr), federal taxes (W-4 Single), state taxes (CA), bank account, W-4 + direct deposit forms signed via Gusto Flow
- [x] Company onboarding complete: addresses, industry (NAICS 621610), bank info (routing 021000021), pay schedule (weekly), state taxes (CA), all forms signed
- [x] Company bank account verified — UUID `12a5f771-3113-404c-a6eb-f2824d478d74` (status: `verified`)
- [x] `backend/scripts/verifyCompanyBank.js` — automates sandbox bank verification via `send_test_deposits` → `verify`
- [x] `backend/scripts/gustoOnboardAndSubmit.js` — idempotent 14-step script; falls back to existing open payrolls; auto-saves refresh token
- [x] **Gusto sandbox company approved** (May 26, 2026) — Tatiana / Gusto Embedded Support confirmed approval via email
- [x] **Payroll SUBMITTED** — `providerPayrollId: fef1d6d6-6903-4642-b2e5-419b7a0d002e`
  - Period: 2026-04-29 → 2026-05-12, check date: 2026-05-15
  - Gross: **$1,960.00** (80 hrs × $24.50) · Taxes: **$548.52** · Net: **$1,411.48**
  - Submitted status: 202 Accepted
- [ ] Update MongoDB `PayrollRun` document with `providerPayrollId = fef1d6d6-6903-4642-b2e5-419b7a0d002e` and `status = "submitted"`
- [ ] Gusto webhook fires back and updates `PayrollRun.status` in MongoDB
- [ ] Admin UI for payroll review and submission (currently automation script only)

### Phase 4 Security, Testing & Monitoring — COMPLETE ✅ (July 11, 2026)
- [x] Verification token logging secured — only logs when `GUSTO_WEBHOOK_VERIFICATION_TOKEN` is not yet set
- [x] Jest installed, `npm test` script added
- [x] 39 unit tests covering webhook signature verification, status mapping, and payroll profile validation — all passing
- [x] Failed payroll alert emails — `sendPayrollFailureAlert` fires on `payroll.processing_failed` and `payroll.partially_reversed` webhook events, sends to facility admins and platform owners
- [x] Runbook — retry, rollback, and incident handling documentation (`project-guide/payroll-runbook.md`)
- [x] Staged rollout — sandbox → pilot → general release plan (`project-guide/payroll-staged-rollout.md`)

### Phase 2 Webhooks — COMPLETE ✅ (July 11, 2026)
- [x] Webhook endpoint `POST /api/payroll/webhook` live on Render
- [x] Gusto webhook subscription registered — UUID `b1d27760-b7be-4bb4-9c0c-a16f76c824d5`, subscription type: Payroll
- [x] Subscription state: **Active** (verified July 11, 2026)
- [x] `GUSTO_WEBHOOK_VERIFICATION_TOKEN` set in Render environment variables
- [x] HMAC SHA-256 signature verification, deduplication, and audit log all live
- [x] PayrollRun and PayrollRunItem status reconciliation wired to all Gusto event types
- [x] CORS fix deployed — `https://api.timecapcha.app` added to allowed origins

### Operations Task Assignment & Reminders — IMPLEMENTED (Oct 21, 2026; needs live verification)
- [x] Admins can assign Operations tasks to an active caregiver in the same facility and set a custom reminder date/time
- [x] Caregiver dashboard shows "my tasks" (`GET /api/operations/tasks/mine`) and lets the assignee update status only
- [x] Reminder scheduler (`backend/utils/operationsTaskReminders.js`) polls every 60s, atomically claims due tasks, and sends email + Web Push to the assigned caregiver only; per-channel retry, expired subscriptions pruned
- [x] Push subscriptions stored per device (`PushSubscription`); service worker `frontend/public/sw.js`
- [x] 14 new unit tests (backend suite: 69 passing)
- [ ] Generate VAPID keys and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` in Render (see `project-guide/setup.md`); confirm SMTP is configured
- [ ] End-to-end test on deployed app: assign task with near-future reminder, confirm email + phone push; iPhone needs site added to Home Screen
- [ ] Note: scheduler runs in the web process; a sleeping host delays reminders

### Security Review — Oct 21, 2026
- [x] Stripe `invoice.payment_succeeded` now ignores invoices not belonging to the tenant's current subscription and re-verifies status with Stripe (3 tests)
- [ ] Legacy JWT path in `authMiddleware.js` trusts token role and ignores `isActive` — fail closed
- [ ] Gusto is parked: set `PAYROLL_PROVIDER_MODE=disabled`, gate the temporary OAuth callback in `server.js` (logs tokens), revoke stored `GustoToken` records
- [ ] Remove/gate `/api/test` and `ENABLE_MOCK_API` mock routes (confirm unset in production)
- [ ] Add auth + rate limiting to `/api/dictate-file`

### Before Going Live — Required
- [x] Set `ENABLE_DEV_BOOTSTRAP=false` in Render — confirmed `NODE_ENV=production` disables dev bootstrap
- [x] Replace `JWT_SECRET=supersecretkey123` with a strong random secret in Render
- [x] Strengthen `SUPERADMIN_ACCESS_KEY` to a long random string in Render
- [x] Stripe duplicate subscriptions — all flagged IDs were test-mode only; no live duplicates exist, no customers double-billed
- [x] New facility onboarding fixed — new user can now sign up, create facility, and reach plan selection without being stuck on invite-only screen
- [ ] Test the full flow on deployed app as a brand new user: sign up → create facility → select plan → confirm admin features unlock
- [ ] Gusto payroll must remain sandbox/pilot only until Phase 4 of the payroll production roadmap is complete (monitoring, runbooks, staged rollout)

---

## Gusto Integration — Key Facts & UUIDs (April 30, 2026)

### Sandbox Identifiers
| Item | Value |
|---|---|
| API Base URL | `https://api.gusto-demo.com` |
| API Version Header | `X-Gusto-API-Version: 2026-02-01` (enforced — no older version accepted) |
| Partner Company UUID | `44196a95-66a8-428e-86ea-9cb1183b966d` |
| Company Location UUID | `3c93887f-d377-4d49-aea0-a751cbdd8336` |
| Test Employee | Alexander Hamilton — `1d8a8091-fd7b-49d4-8a29-8261ed6ba5f3` |
| Employee Job UUID | `c4665ec0-d169-44f8-a5d0-87ff56c6dc9e` (Caregiver, $24.50/hr, Nonexempt) |
| Employee Bank Account | `7db10b05-46fd-44ea-a6d4-5a9c67b49846` |
| Company Bank Account | `12a5f771-3113-404c-a6eb-f2824d478d74` (routing: 021000021, status: **verified**) |
| Active Payroll UUID | `aff2706c-4342-4fbc-9429-cd22e25e9c9d` (2026-05-19 → 2026-05-25, check: 2026-05-28, 80 hrs loaded, unprocessed) |

### Critical Lessons Learned
- Only **partner-managed companies** (`POST /v1/partner_managed_companies`) support payroll write endpoints — UI-created companies return 401 on all write operations
- Address endpoints are **plural and POST**: `POST /v1/employees/{uuid}/home_addresses` (not PUT, not singular)
- Refresh tokens are **single-use** and rotate on every call — always save the new token immediately; the automation script handles this automatically
- Compensation `effective_date` must be ≥ Gusto's minimum (the last paid date or hire date). Error message will say "Minimum effective date is YYYY-MM-DD"
- CA state_setup EDD Account Number is checksum-validated in UI — cannot use fake numbers. Bypass via direct API: `PUT /v1/companies/{uuid}/tax_requirements/CA` with `state` field inside each `requirement_set` object
- `employee_form_signing` resets after company `state_setup` changes — must re-sign after any company state configuration change
- `flow_type` only accepts a single value per API call — comma-separated values silently fail
- `sign_all_forms` Gusto Flow must run **after** `state_setup` is complete, otherwise new state forms will invalidate the signing
- Sandbox bank verification CAN be automated: `POST /v1/companies/{uuid}/company_bank_accounts/{bank_uuid}/send_test_deposits` returns `{deposit_1, deposit_2}`, then `PUT .../verify` with those amounts — instant verification. See `backend/scripts/verifyCompanyBank.js`

### Payroll Submission Sequence (Future Reference)
```
1. POST /v1/companies/{uuid}/payrolls            → create off-cycle payroll
2. GET  /v1/companies/{uuid}/payrolls/{uuid}     → prepare (get compensations + version)
3. PUT  /v1/companies/{uuid}/payrolls/{uuid}     → update with employee hours
4. PUT  /v1/companies/{uuid}/payrolls/{uuid}/calculate
5. Poll GET until payroll.calculated_at != null  (every 3s, timeout 90s)
6. POST /v1/companies/{uuid}/payrolls/{uuid}/submit
7. Save payroll_uuid → MongoDB PayrollRun.providerPayrollId, status = "submitted"
```

### Resuming After Gusto Company Approval
Bank is verified. The only remaining blocker is `needs_approval` (Gusto risk review).

1. Email `embedded@gusto.com` — subject: "Sandbox company approval needed", include UUID `44196a95-66a8-428e-86ea-9cb1183b966d`
2. Wait for `company.approved` webhook (Gusto internal review)
3. Once approved, run the automation script — it will find the existing open payroll (`aff2706c`) and proceed directly to calculate + submit:
```bash
cd backend
node scripts/gustoOnboardAndSubmit.js
```

---

## 1. Authentication Migration: Clerk Integration
Replace the custom `LoginPage.jsx` and backend JWT logic with Clerk for improved security and user management.

### Fix: Sign-In / Sign-Up / Clerk Reroute Errors (Practical Reset Plan)
You can simplify this a lot by first getting basic sign-in working end-to-end with one role, then layering admin/caregiver authorization on top. The current errors usually mean: email is not verified, keys or URLs don’t match localhost, or your route protection logic is blocking you even though you’re signed in.

Below is a practical way to reset and make it work without extra hustle.

#### 1) Basic sanity checks in Clerk dashboard
Do these first to remove hidden landmines.

- Clerk dashboard → Instance settings → Domains & URLs
    - Ensure `http://localhost:3000` is an allowed origin and redirect URL.
    - If you access the backend directly in a browser, also allow `http://localhost:5001`.
- Email & SMS
    - Use a real email you can access.
    - Sign up once and confirm the verification email.
- Paths
    - Ensure Sign-in URL and Sign-up URL match your SPA routes:
        - `/sign-in`
        - `/sign-up`

Once you have one confirmed test user, stick with that user until everything works.

#### 2) Minimal frontend setup (React / CRA)
Goal: get Clerk sign-in/sign-up components working and status visible, before adding any redirects or protection.

- Confirm your app is wrapped with `ClerkProvider` in `frontend/src/index.js` (already done).
- Confirm routes exist in `frontend/src/App.jsx` (required for Clerk navigation):
    - `/sign-in/*`
    - `/sign-up/*`
    - `/post-sign-in`

#### Further Considerations
- If you later add nested caregiver routes, consider giving “Dashboard” exact-match too (React Router `NavLink end`) so it won’t stay highlighted on sub-pages.
- Set env vars (CRA reads these only at startup):
    - `REACT_APP_CLERK_PUBLISHABLE_KEY=pk_...`
    - `REACT_APP_API_BASE_URL=http://localhost:5001` (matches `backend/.env` `PORT=5001`)
    - Restart `npm start` after changing `.env`.

At this stage, you should be able to:

- Go to `/sign-up`, register, verify email.
- Go to `/sign-in` and sign in with same credentials.
- Hit `/post-sign-in` and have the app route you to `/caregiver` or `/admin`.

If this still gives “verification failed” or “not authorized”, the problem is almost certainly mis-matched URLs/ports or a broken custom flow around Clerk’s components.

#### 3) Simplify backend: treat Clerk like a token provider
Instead of Clerk running your whole authorization logic, let it issue a session token, and let your Node/Express backend validate it.

- Frontend already attaches the Clerk token via `ClerkTokenBridge` + axios interceptor.
- Backend: set `CLERK_SECRET_KEY` so Clerk middleware + `authMiddleware.js` can validate Clerk sessions.
- Verify the key handshake by testing:
    - `GET http://localhost:5001/api/ping` returns 200
    - After signing in, `GET http://localhost:5001/api/auth/me` returns 200 with `{ user: { role: ... } }`

#### 4) Add clean role-based access (admin vs caregiver)
Once “any signed-in user” works, then add separation.

- In Clerk dashboard, set `publicMetadata.role = "admin"` for your admin test user.
- In the app, `/admin` should block only on role mismatch (not on sign-in).
- If an admin signs up before role is set, they will route as caregiver until metadata is updated and they sign in again.

#### 5) Common “verification failed / not authorized” culprits
- Missing `/sign-up` route (Clerk tries to navigate there from the SignIn UI).
- Using keys from a different Clerk instance (publishable key != secret key instance).
- Mixing local and deployed URLs in Clerk redirect settings.
- Backend port mismatch: frontend defaults to `http://localhost:5000` unless `REACT_APP_API_BASE_URL` overrides it.
- Backend port mismatch: frontend defaults to `http://localhost:5001` unless `REACT_APP_API_BASE_URL` overrides it.
- Backend missing `CLERK_SECRET_KEY`, causing `/api/auth/me` to return 401 even though frontend is signed in.

### Admin vs Caregiver Sign-Up (Current App Setup)
Because the backend stores `TimeEntry.caregiver` as a MongoDB ObjectId, the app must link every signed-in Clerk user to a local `Caregiver` document (even admins).

- **Caregiver sign-up (self-serve)**
    - Allow caregivers to use Clerk self-sign-up (`<SignUp />`) and then sign in.
    - On the first authenticated API request, the backend links the Clerk user to a local `Caregiver` record by:
        - `clerkUserId` match, otherwise
        - email match, otherwise
        - auto-provision a new `Caregiver` record.
    - Default role is `caregiver` unless Clerk claims specify otherwise.

- **Admin account creation (NOT self-serve)**
    - Do **not** rely on open self-signup to create admins.
    - Create admins using one of these approaches:
        - **Clerk Dashboard / Manual**: create the user (or allow them to sign up), then set `publicMetadata.role = "admin"`.
        - **Invite-only**: use Clerk invitations so only trusted emails can create accounts.
    - After role is set in Clerk, the backend will ensure a local `Caregiver` record exists for that Clerk user with `role: "admin"` (so admin requests and time logs queries work).
    - Important: If an admin initially signs up without the role metadata set, they will be treated as `caregiver` until the Clerk role is updated.

#### Operational Checklist
- **Backend env**
    - Set `CLERK_SECRET_KEY`.
    - Set a publishable key in one of: `CLERK_PUBLISHABLE_KEY` (preferred), `VITE_CLERK_PUBLISHABLE_KEY`, or `REACT_APP_CLERK_PUBLISHABLE_KEY`.
    - Confirm backend boots without 500s: `GET /api/ping` returns 200.

- **Frontend env**
    - Set `REACT_APP_CLERK_PUBLISHABLE_KEY`.
    - Set `REACT_APP_API_BASE_URL` to the running backend (ex: `http://localhost:5001`).
    - Restart `npm start` after any `.env` change (CRA only reads env at startup).

- **Caregiver onboarding (self-signup)**
    - User signs up via Clerk UI.
    - After sign-in, hit an authenticated endpoint once (the app already calls `/api/auth/me` during post-sign-in).
    - Verify in MongoDB `Caregiver` collection:
        - A record exists with `email` matching the Clerk email.
        - `clerkUserId` is set to `user_...`.
        - `role` is `caregiver`.

- **Admin onboarding (invite/manual)**
    - Create/invite the user in Clerk.
    - In Clerk dashboard, set `publicMetadata.role = "admin"` for that user.
    - Have the user sign in once (so the backend links/provisions the local record).
    - Verify in MongoDB `Caregiver` collection:
        - A record exists with `clerkUserId = user_...`.
        - `role` is `admin`.
    - Verify via API:
        - Authenticated `GET /api/auth/me` returns `role: "admin"`.
        - Admin endpoints (ex: `GET /api/admin/timelogs`) return 200 (not 403).

### Multi-Admin Management (How to Add/Remove Admins)
The app supports multiple admins. The role source of truth is **Clerk Public Metadata** (`publicMetadata.role`). The backend mirrors that role into MongoDB so authorization works consistently.

#### Add an admin (recommended: Clerk metadata)
- Create the user (invite or allow sign-up), then in Clerk Dashboard set:
    - `publicMetadata.role = "admin"`
- Have the user make one authenticated request (sign in and visit the app) so the backend links/provisions the local `Caregiver` record.

#### Add an admin (from inside the app)
- Use the Admin Dashboard → **User Management** section.
- Click **Promote** on a user.
- This calls `POST /api/admin/promote` and updates both:
    - Clerk user `publicMetadata.role = "admin"` (when `CLERK_SECRET_KEY` is configured)
    - Local MongoDB `Caregiver.role = "admin"`

#### Add an admin (CLI script)
- Run from the `backend/` folder:
    - `node createAdmin.js admin@yourdomain.com`
- This promotes the local MongoDB record and attempts to update Clerk metadata when `CLERK_SECRET_KEY` is available.

#### Dev-only bootstrap (quick initial admin setup)
- In `backend/.env` (non-production only):
    - `ENABLE_DEV_BOOTSTRAP=true`
    - `ADMIN_EMAILS=admin1@yourdomain.com,admin2@yourdomain.com`
- On next sign-in/request, matching emails are auto-promoted to admin if Clerk metadata isn’t set.

#### Remove admin access (demotion)
- Admin Dashboard → User Management → **Demote**
    - Calls `POST /api/admin/demote` and updates both Clerk metadata + MongoDB role.
- Safety: the backend prevents demoting the **last active admin** and prevents self-demotion.

#### Delete user (Clerk + local deprovision)
- Admin Dashboard → User Management → **Delete**
    - Calls `DELETE /api/admin/users/:caregiverId`
    - Deletes the Clerk account (so they cannot sign in)
    - Marks the local MongoDB `Caregiver.isActive=false` to preserve TimeEntry history
- Safety: the backend prevents deleting the **last active admin** and prevents self-delete.

- **Time tracking integrity check**
    - As a caregiver, call punch-in/out.
    - Verify new `TimeEntry` documents have:
        - `caregiver` stored as an ObjectId (not a `user_...` string).

- **If you see the error: “Cast to ObjectId failed for value \"user_...\" at path caregiver”**
    - A Clerk user id is being written where an ObjectId is expected.
    - Confirm the backend is linking Clerk users to the `Caregiver` model (a `Caregiver` doc must exist with `clerkUserId`).
    - Confirm the timeclock endpoints are using the linked caregiver `_id` for `TimeEntry.caregiver`.

- **Frontend Changes**:
    - Replace `LoginPage.jsx` with Clerk's `<SignIn />` and `<SignUp />` components.
    - Update `App.jsx` to use `ClerkProvider`.
    - Use `useAuth()` and `useUser()` hooks for session management.
    - Update `PrivateRoute.jsx` to leverage Clerk's `SignedIn` and `SignedOut` components.
- **Backend Changes**:
    - Remove custom JWT middleware.
    - Implement `@clerk/clerk-sdk-node` to validate session tokens in `authMiddleware.js`.
    - Sync Clerk user data with the local MongoDB `Caregiver` model via Webhooks.

### Superadmin access key (extra privacy gate)
The app supports a distinct `superadmin` role with a read-only UI at `/superadmin`.

In addition to Clerk authentication + role checks, superadmin API routes are protected by a required access key header. This is a simple “shared secret” layer so `/api/superadmin/*` stays private even if someone signs in with a superadmin account on an untrusted machine.

#### How it works
- Backend requires the request header: `x-superadmin-key`
- Expected value comes from: `SUPERADMIN_ACCESS_KEY` in `backend/.env`
- If the key is missing or invalid, the backend returns `401` with:
    - `code: "SUPERADMIN_KEY_REQUIRED"`

#### Post-sign-in UX (recommended)
- Superadmins can sign in normally.
- On `/superadmin`, the UI prompts for the access key.
- Once entered, the key is stored in browser local storage and automatically attached to superadmin API calls only.

#### Setup steps (local/dev)
1. Set the key in `backend/.env`:
     - `SUPERADMIN_ACCESS_KEY=your-long-random-string`
2. Restart the backend server.
3. Sign in as a user whose MongoDB role is `superadmin`.
4. Visit `/superadmin`, enter the key, click **Save key**, then **Refresh**.

Notes:
- This is not a substitute for production-grade security controls (e.g., IP allowlists / VPN / device trust), but it’s a practical extra gate.
- If you need to revoke access on a shared machine, use **Clear** on the `/superadmin` page (or clear site data) to remove the saved key.

## 2. Multi-Tenant Pricing & Plan Enforcement (Per Facility)

Goal: plans are **per tenant (facility)**, and the backend enforces both **seat limits** and **feature access**.

For the step-by-step operational setup (create/choose a tenant, generate a facility code, assign users, and select a plan), see: `project-guide/tenantcreate.md`.

### Plan catalog (initial / Stripe later)
Define plans centrally (backend config), with two key dimensions:

- **Seat limit**: maximum caregivers allowed for the tenant.
- **Features**:
    - `dataManagement` (admin management: view logs, manage caregivers, approve missed punches, promote/demote, etc.)
    - `printing` (facility export/print endpoints)

Current plan rules:

- Free: up to **2 caregivers**, no `dataManagement`, no `printing`
- Standard: **$35/mo**, up to **20 caregivers**, `dataManagement` yes, `printing` yes, `payroll` no
- Pro: **$55/mo**, up to **40 caregivers**, `dataManagement` yes, `printing` yes, `payroll` yes

### Tenant identity & binding
Design choice: “easy, safe, secure” means **no tenant switching**.

- Each local `Caregiver` record belongs to exactly one `tenantId`.
- Every authenticated request attaches `req.user.tenantId` from the linked caregiver record.
- Admin actions are always scoped to `req.user.tenantId`.

### Facility code (`tenantCode`) (human-friendly)
To make tenant selection safe and non-confusing in production (without using phone/email/PII), each tenant has a stable, human-friendly code:

- Stored on the `Tenant` model as `tenantCode` (uppercase, no dashes).
- Display in the UI as `XXXX-XXXX` for readability.
- Used by ops/scripts to target a tenant explicitly (preferred alternative to `TENANT_NAME`).

The frontend can read this via `GET /api/auth/me` (returns `tenantCode` and `tenantName` in the `user` payload) and also via `GET /api/billing/me` (returns `tenant.tenantCode`).

### Tenant scoping (what to enforce)
Two layers:

1) **Soft scoping** (ownership checks)
     - Before acting on a target user/record, verify it belongs to the same tenant.

2) **Hard scoping** (data carries `tenantId`)
     - Persist `tenantId` on core records (TimeEntry, missed punch request, corrections).
     - Filter queries by `tenantId` directly (faster + harder to regress).

### Feature gating (server-side)
Enforcement must happen on the backend (frontend is only UX).

- Block admin features until the tenant has `planSelected=true`.
- Apply feature checks by endpoint:
    - `dataManagement` gates “admin management” features (view logs, manage caregivers, review missed punches, promote/demote/delete)
    - `printing` gates export/printing endpoints

### “View logs” vs “print/export” split
To keep access clean:

- Viewing logs stays on a “view” endpoint gated by `viewLogs`.
- Export/print moves to a separate endpoint gated by `printing`.

### Seat limits (caregiver creation)
Enforce seat caps at create-time:

- When an admin creates a new caregiver, count caregivers in the tenant and block if at limit.
- Keep the behavior deterministic and tenant-scoped.

### Security hardening (admin-only timeclock reads)
Close the ID-based data leakage risk:

- Make `GET /api/timeclock/:caregiverId` and `GET /api/timeclock/:caregiverId/total-hours` admin-only.
- Always tenant-scope the underlying queries.

### One-time migration / backfill (production-safe)
Existing databases need tenant fields populated.

- Run the backfill script to assign `tenantId`:
    - In production, run with an explicit tenant target (required):
        - `TENANT_ID="<tenantObjectId>" node backend/backfillTenantId.js`
        - OR `TENANT_CODE="<tenantCode>" node backend/backfillTenantId.js`
- Script is idempotent (safe to re-run).

#### One-time populate: generate missing `tenantCode` values
Existing tenants may not have a code yet. Run the code backfill:

- Default is safe: `DRY_RUN=true` (no DB writes)
- One tenant (recommended):
    - `TENANT_ID="<tenantObjectId>" DRY_RUN=false node backend/backfillTenantCode.js`
- All tenants (production requires confirmation):
    - `ALLOW_ALL_TENANTS=true CONFIRM=YES DRY_RUN=false node backend/backfillTenantCode.js`

### Stripe integration (in progress)
Current implementation status:

- Stripe Checkout is wired for paid plan selection.
- Stripe Customer Portal session creation is wired for existing Stripe customers.
- Stripe webhook handling is mounted at `/api/stripe/webhook`.
- `Tenant` stores Stripe customer/subscription identifiers and billing status.
- Plan enforcement now checks paid subscription state before granting paid-plan access.

Configuration and rollout notes:

- Stripe test-mode env values must be set in `backend/.env` before paid-plan checkout can run.
- The repo now includes `backend/.env.example` and `frontend/.env.example` starter files.
- Stripe CLI is the recommended local webhook-forwarding tool.
- Webhooks remain the source of truth for paid subscription activation.

### Payroll integration (future / provider-backed)
Payroll should be integrated as a provider-backed workflow, not as custom payroll logic built inside the app.

TimeStamp already has the operational foundations a payroll workflow needs:

- tenant-scoped staff records
- tenant-scoped time entries
- admin review and management flows

That means payroll can fit naturally into the current product, but only if TimeStamp remains the operational layer and a payroll provider such as Gusto remains the compliance and payment layer.

#### How payroll fits into this app
Example future flow:

1. Admin adds and manages employees in TimeStamp.
2. TimeStamp stores operational data such as worker identity, role, hours worked, and future payroll metadata.
3. Admin clicks **Run Payroll**.
4. The backend sends normalized payroll inputs to Gusto.
5. Gusto calculates taxes, deductions, and net pay, then handles payroll execution and filings.
6. Gusto sends payments.
7. Gusto webhooks update payroll status back in TimeStamp.

TimeStamp should remain the source of truth for time capture and admin workflows.
Gusto should remain the source of truth for payroll execution, tax handling, and compliance.

#### Clear path to full payroll integration

TimeStamp currently supports the payroll foundation only:

- staff payroll profile metadata
- draft payroll runs
- payroll run item snapshots
- gross-pay previews
- duplicate payroll-run prevention
- tenant-scoped payroll data

TimeStamp is not yet production-ready for live payroll execution.

What is still undone:

- provider API integration for payroll submission
- provider credential and environment setup
- webhook endpoint and signature verification
- provider-driven payroll status synchronization
- admin payroll UI for review and submission
- production monitoring, alerting, and support runbooks
- backend automated tests for payroll workflows
- sandbox and pilot validation with the provider

Expected path to production:

1. Keep TimeStamp as the operational payroll-prep layer only.
2. Add provider submission for draft payroll runs.
3. Add webhook processing so provider events become the source of truth for payroll status.
4. Add admin UI for review, submission, and payroll history.
5. Add monitoring, error handling, runbooks, and release controls.
6. Validate end-to-end in provider sandbox before any production rollout.

Production expectation:

- TimeStamp prepares and submits payroll inputs.
- A provider such as Gusto performs payroll calculation, deductions, payment execution, filings, and regulated data handling.
- TimeStamp stores local audit history, provider references, and payroll status only.

Policy boundary:

- Do not store SSNs, bank account numbers, routing numbers, or tax election data locally.
- Do not implement tax logic, withholding logic, payment disbursement, or filing workflows in-house.
- Treat local payroll totals as preview-only until confirmed by the provider.

For detailed manual verification, see `project-guide/payroll-postman-test-guide.md`.
For the phased production delivery plan, see `project-guide/payroll-production-roadmap.md`.

#### Completion plan update (August 5, 2026)
The roadmap was re-checked against Gusto Embedded's own "5 Key Steps" guide (Requirements → Design → Integrate → Test → Deploy — [source](https://embedded.gusto.com/blog/how-to-embed-payroll-5-key-steps/)). That review found two concrete gaps not previously tracked, now the top priority items in `payroll-production-roadmap.md`:

1. **OAuth token refresh is script-only, not server-side.** The deployed `gustoProvider.js` reads a static access token from env with no refresh logic; only the offline `gustoOnboardAndSubmit.js` script rotates and saves tokens. Live admin-triggered submissions will fail once the ~2-hour token expires. Must be fixed before payroll can run reliably outside a manually-babysat sandbox session.
2. **Payroll access isn't role-scoped.** Any `admin` with the `payroll` feature flag can both view and submit payroll runs — there's no separate "can view" vs. "can run/approve" permission, which Gusto's guide flags as a persona/access-level design step, not an afterthought.

Full gap-by-gap breakdown, including test-coverage and deploy-readiness gaps, is in the new "Alignment With Gusto's 5-Step Embedded Payroll Framework" section at the top of `payroll-production-roadmap.md`.

#### Critical compliance boundary
Do not build payroll logic directly in this app.

Payroll involves:

- tax law compliance
- withholding rules
- filings
- employee payment regulations
- highly sensitive personal and banking data

Because of that, TimeStamp must not implement any of the following in-house:

- tax calculations
- net-pay calculations treated as authoritative
- payroll disbursement logic
- tax filing workflows
- withholding workflows
- direct handling of SSNs
- direct handling of bank account or routing details
- storage of tax election data
- homemade payroll compliance rules

TimeStamp may prepare operational payroll inputs such as:

- approved hours
- compensation type
- payroll eligibility
- worker classification metadata
- provider linkage IDs

However, a payroll provider such as Gusto must remain responsible for:

- payroll calculation
- deductions and withholding
- payment execution
- filings
- compliance updates
- regulated payroll data collection and management

Any local payroll math in TimeStamp must be treated as preview-only and never as the source of truth for employee pay.

#### Compliance rules for implementation
When payroll work begins, follow these rules:

- Do not store SSNs, routing numbers, bank account numbers, or tax election data in local app models unless a provider integration explicitly requires a secure delegated pattern.
- Do not write custom tax or withholding logic in backend services.
- Do not send employee payments directly from this app.
- Do not treat locally estimated payroll totals as final payroll truth.
- Do use provider webhooks as the source of truth for payroll run status.
- Do keep local payroll records limited to operational metadata, audit history, and provider references.
- Do keep payroll records tenant-scoped and access-controlled.
- Do document any future payroll fields with a clear reason for why they are stored locally instead of delegated to the provider.

#### Stripe vs payroll
Stripe and payroll solve different problems.

| Area | Stripe | Payroll Provider (Gusto) |
| --- | --- | --- |
| Purpose | Customer billing | Paying employees and contractors |
| Primary use in TimeStamp | Subscription plans and customer payments | Staff payroll execution |
| Complexity | Medium | Very high |
| Compliance burden | Moderate | Extreme |
| Suitable to build in-house | Often yes | No |

Recommended product architecture:

- Stripe -> collect customer money
- Gusto -> pay employees and contractors

#### Proposed payroll roadmap
**Phase A: Payroll data foundation**
Prepare the app to support payroll without storing unnecessary regulated data locally.

Possible future additions:

- compensation type (`hourly`, `salary`, `contractor`)
- compensation rate or salary reference
- payroll eligibility flags
- worker classification metadata
- payroll provider linkage IDs
- approved-hours views for payroll periods

At this stage, avoid storing SSNs, bank details, tax elections, or filing data locally unless there is a clear provider-driven requirement.

**Phase B: Admin payroll run workflow**
Add an admin payroll workflow that uses provider APIs.

Possible future flow:

- admin selects payroll period
- app summarizes approved hours by worker
- admin reviews workers and totals
- backend sends the pay run payload to Gusto
- app stores payroll run references and statuses

This app should validate operational completeness, not payroll legality.

**Phase C: Webhooks and audit trail**
Use provider webhooks to keep the app synchronized.

Future webhook events may update:

- payroll run status
- payment status
- failure reasons
- correction state
- audit history for admin review

This keeps TimeStamp operationally useful without taking ownership of payroll compliance.

#### Product and monetization fit
Payroll can become a strong premium capability in the future.

Potential premium features:

- staff payroll
- contractor payouts
- event worker payments
- payroll-period summaries
- payroll export and reconciliation views

However, the implementation priority should remain architecture and compliance first, not feature marketing.

#### Current scope boundary
Payroll foundation is partially implemented.

The app today supports:

- staff management
- tenant scoping
- time tracking
- billing via Stripe
- payroll profile metadata for staff
- draft payroll runs with worker snapshots and gross-pay previews

The app does not yet support:

- payroll provider integration
- payroll webhooks
- employee tax workflows
- bank or SSN handling

Manual verification steps for this payroll foundation are documented in `project-guide/payroll-postman-test-guide.md`.

---

## 3. Feature: Location-Validated Geofenced Time Tracking
Ensure caregivers are physically present at the facility when clocking in or out.

### Phase A: Data Capture & Storage
- **Geolocation API**: Integrate `navigator.geolocation` in the punch-in/out flow.
- **Reverse Geocoding**: Use an external API (e.g., Google Maps, OpenStreetMap/Nominatim) to convert coordinates to addresses.
- **Schema Update**: Update `TimeEntry.js` to include:
    ```javascript
    location: {
      lat: Number,
      lng: Number,
      address: String,
      isWithinFence: Boolean
    }
    ```

### Phase B: Geofencing Logic
- **Admin Configuration**: Add a `Facility` model to store approved addresses and allowed radii (e.g., 200 meters).
- **Validation Engine**:
    - Calculate distance between user coordinates and facility coordinates (Haversine formula).
    - Block the request if the distance exceeds the allowed radius.
- **Error Handling**: Provide clear feedback: *"You are currently 0.5 miles from the facility. Please clock in once you arrive."*

### Phase C: Admin Dashboard Enhancements
- **Map View**: Integrate a map (e.g., Leaflet or Google Maps) to show punch locations.
- **Audit Logs**: Highlight "Off-site" attempts or manual overrides.
- **Manual Override**: Add a "Force Punch" button available only to Admin roles for exceptional cases.

---

## 4. Additional Recommendations

### For Caregivers
- **Shift Reminders**: Push notifications or SMS alerts 15 minutes before a scheduled shift starts.
- **Earnings Preview**: A simple dashboard showing estimated pay for the current period based on logged hours.
- **Shift Notes/Handover**: A text area to leave notes for the next caregiver (e.g., "Patient had a restless night"). **(Future Phase: Requires HIPAA-compliant encryption for Protected Health Information/PHI)**.
- **Offline Support**: Allow "caching" a punch if the caregiver has poor signal, syncing it automatically once back online (with original timestamp).

### For Admins
- **Payroll Export**: One-click export of time logs to CSV or Excel formatted for common payroll software (QuickBooks, ADP).
- **Overtime Alerts**: Automatic flags when a caregiver exceeds 40 hours in a work week.
- **Document Management**: Track caregiver certifications (CPR, CNA license) and send alerts when they are nearing expiration.
- **Scheduling Module**: A calendar view to assign shifts, making it easy to see gaps in coverage.
- **Attendance Analytics**: Reports on punctuality and frequency of missed punches.
