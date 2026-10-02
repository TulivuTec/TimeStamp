const path = require("path");
const express = require("express");
const cors = require("cors");

// Always load env from backend/.env, regardless of the process working directory.
require("dotenv").config({ path: path.join(__dirname, ".env") });

const connectDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const adminRoutes = require("./routes/adminRoutes");
const staffRoutes = require("./routes/staffRoutes");
const timeClockRoutes = require("./routes/timeClockRoutes");
const missedPunchRoutes = require("./routes/missedPunchRoutes");
const billingRoutes = require("./routes/billingRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const estimateRoutes = require("./routes/estimateRoutes");
const tenantRoutes = require("./routes/tenantRoutes");
const tenantOtpRoutes = require("./routes/tenantOtpRoutes");
const superadminRoutes = require("./routes/superadminRoutes");
const jobRoutes = require("./routes/jobRoutes");
const trainingRoutes = require("./routes/trainingRoutes");
const activityRoutes = require("./routes/activityRoutes");
const operationsRoutes = require("./routes/operationsRoutes");
const { stripeWebhookHandler } = require("./controllers/stripeWebhookController");
const { handlePayrollWebhook } = require("./controllers/payrollController");

const app = express();

// Safety net: an unhandled promise rejection in any async route handler
// would otherwise crash the whole process (Node 15+ default) and take
// down the app for every tenant. Log it and keep the server alive instead.
process.on("unhandledRejection", (reason) => {
  console.error("🚨 UNHANDLED REJECTION (server kept alive):", reason);
});

// 1. Connect to MongoDB
connectDB();

// 2. ✅ FIXED CORS - Single cors() middleware with dynamic origin validation
// Supports optional comma-separated ALLOWED_ORIGINS env var for additional deployments.
const allowedOrigins = new Set([
  "http://localhost:3000",
  "http://localhost:3001",
  "https://timecapcha-frontend.onrender.com",
  "https://timecapcha.onrender.com",
  "https://timecapcha.app",
  "https://www.timecapcha.app",
  "https://api.timecapcha.app",
]);

const extraAllowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);
extraAllowedOrigins.forEach((o) => allowedOrigins.add(o));

const clerkAuthorizedParties = (
  process.env.CLERK_AUTHORIZED_PARTIES || Array.from(allowedOrigins).join(",")
)
  .split(",")
  .map((origin) => origin.trim())
  .filter((origin) => /^https?:\/\//i.test(origin));

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.has(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS blocked for origin: ${origin}`);
      callback(null, false);
    }
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true
}));

// 3. Body parsers for JSON and URL-encoded requests
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);
app.post("/api/payroll/webhook", express.raw({ type: "application/json" }), handlePayrollWebhook);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3.5 Clerk auth (optional during migration)
// If CLERK_SECRET_KEY is configured, Clerk will parse/validate auth info from requests.
// We keep this optional so existing JWT auth continues to work until the frontend is migrated.
{
  const clerkSecretKey = process.env.CLERK_SECRET_KEY;
  // Support common env var names across CRA/Vite + backend.
  const clerkPublishableKey =
    process.env.CLERK_PUBLISHABLE_KEY ||
    process.env.VITE_CLERK_PUBLISHABLE_KEY ||
    process.env.REACT_APP_CLERK_PUBLISHABLE_KEY;

  if (clerkSecretKey) {
    const { clerkMiddleware } = require("@clerk/express");
    if (!clerkPublishableKey) {
      console.warn(
        "⚠️  CLERK_SECRET_KEY is set but no publishable key was found (CLERK_PUBLISHABLE_KEY/VITE_CLERK_PUBLISHABLE_KEY/REACT_APP_CLERK_PUBLISHABLE_KEY). Continuing without publishableKey."
      );
    }
    if (clerkAuthorizedParties.length) {
      console.log(
        "Clerk authorized parties:",
        clerkAuthorizedParties.join(", ")
      );
    }

    app.use(
      clerkMiddleware({
        secretKey: clerkSecretKey,
        ...(clerkPublishableKey ? { publishableKey: clerkPublishableKey } : {}),
        ...(clerkAuthorizedParties.length
          ? { authorizedParties: clerkAuthorizedParties }
          : {}),
      })
    );
  }
}

// 4. Health and test endpoints
app.get("/", (req, res) => {
  res.json({
    message: "Staff Time Clock API ✅",
    status: "running",
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/ping", (req, res) => {
  res.json({ ping: "ok", timestamp: new Date().toISOString() });
});

app.post("/api/test", (req, res) => {
  res.json({ message: "POST test OK", body: req.body });
});

// 🔍 DEBUG ENDPOINT
app.options("/api/debug-cors", (req, res) => {
  res.json({ 
    origin: req.headers.origin,
    method: req.headers['access-control-request-method']
  });
});

// Optional mock API endpoints (disabled by default).
// These previously shadowed the real JWT+DB-backed routes in production.
const ENABLE_MOCK_API = process.env.ENABLE_MOCK_API === "true";
if (ENABLE_MOCK_API) {
  app.get("/api/admin/timelogs", (req, res) => {
    res.json({
      logs: [
        {
          _id: "1",
          staff: {
            _id: "cg1",
            firstName: "Sarah",
            lastName: "Jones",
            email: "sarah.jones@test.com",
          },
          punchIn: "2025-12-28T10:00:00Z",
          punchOut: "2025-12-28T18:00:00Z",
          totalHours: "8.00",
        },
      ],
      totalHoursPerStaff: [],
    });
  });

  app.get("/api/timeclock/mylogs", (req, res) => {
    res.json({
      logs: [
        {
          _id: "cg1-1",
          punchIn: "2025-12-28T10:00:00Z",
          punchOut: "2025-12-28T18:00:00Z",
        },
      ],
    });
  });

  app.get("/api/timeclock/my-logs", (req, res) => {
    res.json({
      logs: [
        {
          _id: "cg1-1",
          punchIn: "2025-12-28T10:00:00Z",
          punchOut: "2025-12-28T18:00:00Z",
        },
      ],
    });
  });

  app.post("/api/timeclock/punch-in", (req, res) => {
    res.json({
      message: "Clocked in successfully!",
      punchIn: new Date().toISOString(),
      logId: "new-shift-" + Date.now(),
    });
  });

  app.post("/api/timeclock/punch-out", (req, res) => {
    res.json({
      message: "Clocked out successfully!",
      punchOut: new Date().toISOString(),
      hours: Math.random() * 8 + 1,
    });
  });

  app.get("/api/timeclock/status", (req, res) => {
    res.json({
      clockedIn: Math.random() > 0.5,
      currentShift:
        Math.random() > 0.5 ? { punchIn: "2025-12-28T14:00:00Z" } : null,
    });
  });

  app.post("/api/auth/login", (req, res) => {
    const { email, password } = req.body;

    const users = [
      {
        email: "admin@example.com",
        password: "Admin123!",
        role: "admin",
        id: "1",
      },
      {
        email: "sarah.jones@test.com",
        password: "Sarah123!",
        role: "staff",
        id: "2",
      },
    ];

    const user = users.find((u) => u.email === email && u.password === password);

    if (user) {
      return res.json({
        message: "Login successful",
        token: `fake-token-for-${user.role}`,
        staff: { email: user.email, role: user.role, id: user.id },
      });
    }

    res.status(401).json({ message: "Invalid credentials" });
  });
}

// 6. Additional API routes
app.use("/api/auth", authRoutes);

// High-reliability multipart form dictation endpoint with direct Deepgram transcription
const multer = require("multer");
const upload = multer({ limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB max limit
app.post("/api/dictate-file", upload.single("audio"), async (req, res) => {
  try {
    if (!process.env.DEEPGRAM_API_KEY) {
      return res.status(500).json({ message: "DEEPGRAM_API_KEY not configured on server" });
    }
    if (!req.file) {
      return res.status(400).json({ message: "No audio file uploaded" });
    }

    const axios = require("axios");
    const response = await axios.post(
      "https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=en-US",
      req.file.buffer,
      {
        headers: {
          "Authorization": `Token ${process.env.DEEPGRAM_API_KEY}`,
          "Content-Type": req.file.mimetype || "audio/webm",
        },
        timeout: 30000, // 30 second timeout
      }
    );

    const transcript = response.data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "";
    res.json({ transcript: transcript.trim() });
  } catch (err) {
    console.error("Deepgram file transcription error:", err?.response?.data || err?.message);
    res.status(500).json({
      message: "Transcription processing failed",
      detail: err?.response?.data?.message || err?.message,
    });
  }
});
app.use("/api/admin", adminRoutes);
app.use("/api/billing", billingRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/estimates", estimateRoutes);
app.use("/api/tenant", tenantRoutes);
app.use("/api/tenant/otp", tenantOtpRoutes);
app.use("/api/staff", staffRoutes);
app.use("/api/caregivers", staffRoutes); // backward-compat alias (old frontend builds)
app.use("/api/jobs", jobRoutes);
app.use("/api/timeclock", timeClockRoutes);
app.use("/api/missed-punch", missedPunchRoutes);
app.use("/api/superadmin", superadminRoutes);
app.use("/api/training", trainingRoutes);
app.use("/api/activities", activityRoutes);
app.use("/api/operations", operationsRoutes);

// Temporary: Gusto OAuth callback handler for token generation
app.get("/api/auth/gusto/callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("No authorization code received.");

  const clientId = process.env.GUSTO_CLIENT_ID;
  const clientSecret = process.env.GUSTO_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return res.status(503).send("GUSTO_CLIENT_ID / GUSTO_CLIENT_SECRET are not configured on this server.");
  }

  const https = require("https");
  const redirectUri = process.env.GUSTO_OAUTH_REDIRECT_URI || "http://localhost:5001/api/auth/gusto/callback";

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
    grant_type: "authorization_code",
  }).toString();

  const options = {
    hostname: "api.gusto-demo.com",
    path: "/oauth/token",
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  const tokenReq = https.request(options, (tokenRes) => {
    let data = "";
    tokenRes.on("data", (chunk) => { data += chunk; });
    tokenRes.on("end", () => {
      try {
        const parsed = JSON.parse(data);
        console.log("\n✅ GUSTO TOKEN RESPONSE:", JSON.stringify(parsed, null, 2));
        if (parsed.access_token) {
          res.send(`<h2>Success!</h2><p>Copy this access token into your .env as GUSTO_COMPANY_ACCESS_TOKEN:</p><pre style="word-break:break-all">${parsed.access_token}</pre><p>Refresh token: <pre>${parsed.refresh_token || "none"}</pre></p>`);
        } else {
          res.status(400).send(`<h2>Token exchange failed</h2><pre>${data}</pre>`);
        }
      } catch (e) {
        res.status(500).send(`<h2>Parse error</h2><pre>${data}</pre>`);
      }
    });
  });
  tokenReq.on("error", (err) => res.status(500).send(err.message));
  tokenReq.write(body);
  tokenReq.end();
});

// 7. 404 handler (LAST - catches everything else)
app.use((req, res) => {
  res.status(404).json({ 
    message: `Route not found: ${req.method} ${req.originalUrl}` 
  });
});

// 8. Global error handler (ALSO LAST)
app.use((err, req, res, next) => {
  console.error("🚨 SERVER ERROR:", err.stack);
  res.status(500).json({
    message: "Internal server error",
    error: process.env.NODE_ENV === "development" ? err.message : "Something went wrong",
  });
});

// 9. Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/`);
  console.log(`📍 Ping: http://localhost:${PORT}/api/ping`);
  console.log(`🔍 CORS Debug: http://localhost:${PORT}/api/debug-cors`);
  console.log(`📊 Admin Logs: http://localhost:${PORT}/api/admin/timelogs`);
});



