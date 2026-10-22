# Setup Guide

Follow these steps to get the TimeStamp project running on your local machine.

## Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- [MongoDB](https://www.mongodb.com/try/download/community) (Local instance or MongoDB Atlas)
- npm (comes with Node.js)

## Backend Setup

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `backend` folder and add the following variables:
   ```env
   PORT=5001
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret
   # Required if the frontend uses Clerk
   CLERK_SECRET_KEY=your_clerk_secret_key
   # Optional but recommended
   CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key

   # Optional mail delivery (needed for tenant OTP emails and purchase confirmation emails)
   SMTP_HOST=smtp.example.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=mailer@example.com
   SMTP_PASS=replace_with_mail_password
   MAIL_FROM=TimeStamp <mailer@example.com>

   # Optional phone push notifications for Operations task reminders
   # Generate with: node -e "console.log(require('web-push').generateVAPIDKeys())"
   VAPID_PUBLIC_KEY=your_vapid_public_key
   VAPID_PRIVATE_KEY=your_vapid_private_key
   VAPID_SUBJECT=mailto:admin@example.com

   # Required for Stripe paid plans
   APP_BASE_URL=http://localhost:3000
   STRIPE_SECRET_KEY=your_stripe_secret_key
   STRIPE_WEBHOOK_SECRET=whsec_replace_me
   # Standard plan: $35/month recurring price ID from Stripe Dashboard
   STRIPE_PRICE_STANDARD_10=price_replace_standard
   # Pro plan: $55/month recurring price ID from Stripe Dashboard
   STRIPE_PRICE_PRO_25=price_replace_pro

   # Optional explicit Stripe return URLs
   STRIPE_SUCCESS_URL=http://localhost:3000/admin/billing?checkout=success
   STRIPE_CANCEL_URL=http://localhost:3000/admin/billing?checkout=cancel
   STRIPE_PORTAL_RETURN_URL=http://localhost:3000/admin/billing
   ```
   You can copy the starter values from `backend/.env.example`.
   Email reminders use the SMTP settings above. Phone push reminders require the
   three VAPID settings; keep the private key secret and use the same keys across
   all backend instances. Caregivers must enable notifications from their signed-in
   dashboard on an HTTPS site (localhost is supported for development). On iPhones,
   push generally requires adding the site to the Home Screen and opening it there.
4. Start the development server:
   ```bash
   npm run dev
   ```

## Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file in the `frontend` folder and add:
   ```env
   REACT_APP_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
   # Optional override (NO /api suffix)
   REACT_APP_API_BASE_URL=http://localhost:5001
   ```
   You can copy the starter values from `frontend/.env.example`.
4. Start the React application:
   ```bash
   npm start
   ```

## Running Both Simultaneously

You can open two terminal windows, one for the backend and one for the frontend, and run the start commands in each.

## If Sign-In "Works" But You Get Unauthorized

If you sign in via Clerk and then see an Unauthorized error on `/post-sign-in`, it means the backend cannot validate the Clerk session token.

- Ensure `backend/.env` includes `CLERK_SECRET_KEY=...`
- Restart the backend (`npm run dev`)
- Confirm MongoDB is running (the backend maps Clerk users to a staff record)

## Stripe Local Testing

Stripe is now wired for paid plans. To test it locally:

1. Fill in the Stripe variables in `backend/.env` from `backend/.env.example`.
2. Use Stripe test-mode price IDs for `STRIPE_PRICE_STANDARD_10` and `STRIPE_PRICE_PRO_25`.
3. Start the backend and frontend.
4. In another terminal, run Stripe CLI webhook forwarding:
   ```bash
   stripe listen --forward-to localhost:5001/api/stripe/webhook
   ```
5. Copy the webhook signing secret printed by Stripe CLI into `STRIPE_WEBHOOK_SECRET` and restart the backend.
6. Open `/admin/billing`, choose a paid plan, and complete Stripe Checkout with test card details.

Notes:
- Paid plans activate only after Stripe webhook confirmation.
- Free plan selection still activates immediately without Stripe.
- If checkout returns to the billing page before the webhook finishes, refresh after a few seconds.
- Purchase confirmation emails require SMTP to be configured in `backend/.env`; otherwise the subscription still activates, but no email is sent.
