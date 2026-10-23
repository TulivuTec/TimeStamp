const nodemailer = require("nodemailer");

function normalizeEmailList(value) {
  return (value || "")
    .toString()
    .split(/[,;\n]/)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
}

function getMailConfig() {
  const host = process.env.SMTP_HOST;
  const portRaw = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  const from = process.env.MAIL_FROM || user || null;

  const port = portRaw ? Number(portRaw) : 587;
  const secure = (process.env.SMTP_SECURE || "").toLowerCase() === "true";

  return {
    host,
    port,
    secure,
    auth: user && pass ? { user, pass } : null,
    from,
  };
}

function isMailerConfigured() {
  const cfg = getMailConfig();
  return Boolean(cfg.host && cfg.from);
}

function createTransport() {
  const cfg = getMailConfig();

  if (!cfg.host) {
    const err = new Error("SMTP is not configured (missing SMTP_HOST)");
    err.code = "MAIL_NOT_CONFIGURED";
    throw err;
  }

  const transportOptions = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
  };

  if (cfg.auth) {
    transportOptions.auth = cfg.auth;
  }

  return nodemailer.createTransport(transportOptions);
}

async function sendMail({ to, subject, text, html, attachments, fromName }) {
  const cfg = getMailConfig();
  if (!cfg.from) {
    const err = new Error("MAIL_FROM is not configured");
    err.code = "MAIL_NOT_CONFIGURED";
    throw err;
  }

  const transport = createTransport();

  let from = cfg.from;
  const safeName = String(fromName || "").replace(/[\r\n"<>]/g, "").trim();
  if (safeName) {
    const address = (cfg.from.match(/<([^>]+)>/) || [null, cfg.from])[1].trim();
    from = { name: safeName.slice(0, 80), address };
  }

  return transport.sendMail({
    from,
    to,
    subject,
    text,
    html,
    attachments,
  });
}

function getFacilitySignupNotificationRecipients() {
  const explicitRecipients = normalizeEmailList(
    process.env.FACILITY_SIGNUP_NOTIFICATION_EMAILS
  );

  if (explicitRecipients.length) {
    return [...new Set(explicitRecipients)];
  }

  return [
    ...new Set([
      ...normalizeEmailList(process.env.SUPERADMIN_EMAIL),
      ...normalizeEmailList(process.env.DEDICATED_NOTIFICATION_EMAIL),
      "pkaranjaxn@gmail.com",
      "hubtulivu@gmail.com",
    ]),
  ];
}

async function sendFacilitySignupNotification({ tenant, createdBy, source }) {
  const recipients = getFacilitySignupNotificationRecipients();
  if (!recipients.length) {
    return { sent: false, reason: "no-recipients" };
  }

  const tenantName = tenant?.name || "Unnamed facility";
  const tenantId = tenant?._id ? tenant._id.toString() : "unknown";
  const tenantCode = tenant?.tenantCode || "n/a";
  const createdByEmail = createdBy?.email || "unknown";
  const createdByName = [createdBy?.firstName, createdBy?.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();

  const subject = `[TimeStamp] New facility signup: ${tenantName}`;
  const text = [
    "A new facility has signed up in TimeStamp.",
    `Facility: ${tenantName}`,
    `Tenant ID: ${tenantId}`,
    `Tenant Code: ${tenantCode}`,
    `Created by: ${createdByName || createdByEmail}`,
    `Creator email: ${createdByEmail}`,
    `Source: ${source || "unknown"}`,
  ].join("\n");

  const html = `
    <p>A new facility has signed up in TimeStamp.</p>
    <ul>
      <li><strong>Facility:</strong> ${tenantName}</li>
      <li><strong>Tenant ID:</strong> ${tenantId}</li>
      <li><strong>Tenant Code:</strong> ${tenantCode}</li>
      <li><strong>Created by:</strong> ${createdByName || createdByEmail}</li>
      <li><strong>Creator email:</strong> ${createdByEmail}</li>
      <li><strong>Source:</strong> ${source || "unknown"}</li>
    </ul>
  `;

  await sendMail({
    to: recipients.join(","),
    subject,
    text,
    html,
  });

  return { sent: true, recipients };
}

async function sendPayrollFailureAlert({ payrollRun, eventType, tenantName }) {
  if (!isMailerConfigured()) return { sent: false, reason: "mail-not-configured" };

  const recipients = getFacilitySignupNotificationRecipients();
  if (!recipients.length) return { sent: false, reason: "no-recipients" };

  const runId = payrollRun?._id ? payrollRun._id.toString() : "unknown";
  const providerPayrollId = payrollRun?.providerPayrollId || "n/a";
  const periodStart = payrollRun?.payPeriodStart
    ? new Date(payrollRun.payPeriodStart).toLocaleDateString()
    : "unknown";
  const periodEnd = payrollRun?.payPeriodEnd
    ? new Date(payrollRun.payPeriodEnd).toLocaleDateString()
    : "unknown";
  const errorDetail = payrollRun?.lastError || "No error detail available";
  const facility = tenantName || "Unknown facility";

  const subject = `[TimeStamp] ⚠️ Payroll failure — ${facility} (${periodStart} – ${periodEnd})`;

  const text = [
    `A payroll run has failed for ${facility}.`,
    ``,
    `Event:           ${eventType}`,
    `Pay period:      ${periodStart} – ${periodEnd}`,
    `PayrollRun ID:   ${runId}`,
    `Provider ID:     ${providerPayrollId}`,
    `Error:           ${errorDetail}`,
    ``,
    `Log into the TimeStamp admin panel and review the payroll run.`,
    `If a resubmission is needed, cancel the run in Gusto first.`,
  ].join("\n");

  const html = `
    <p>A payroll run has failed for <strong>${facility}</strong>.</p>
    <table style="border-collapse:collapse;font-family:monospace;font-size:13px">
      <tr><td style="padding:4px 12px 4px 0"><strong>Event</strong></td><td>${eventType}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><strong>Pay period</strong></td><td>${periodStart} – ${periodEnd}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><strong>PayrollRun ID</strong></td><td>${runId}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><strong>Provider ID</strong></td><td>${providerPayrollId}</td></tr>
      <tr><td style="padding:4px 12px 4px 0"><strong>Error</strong></td><td style="color:#b71c1c">${errorDetail}</td></tr>
    </table>
    <p style="margin-top:16px">Log into the TimeStamp admin panel and review the payroll run.<br>
    If a resubmission is needed, cancel the run in Gusto first.</p>
  `;

  try {
    await sendMail({ to: recipients.join(","), subject, text, html });
    return { sent: true, recipients };
  } catch (err) {
    console.warn("Payroll failure alert email failed to send:", err.message);
    return { sent: false, reason: err.message };
  }
}

module.exports = {
  getMailConfig,
  isMailerConfigured,
  getFacilitySignupNotificationRecipients,
  sendMail,
  sendFacilitySignupNotification,
  sendPayrollFailureAlert,
};
