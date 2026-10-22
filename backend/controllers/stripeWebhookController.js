const Tenant = require("../models/Tenant");
const { getPlan } = require("../config/plans");
const {
  getStripeClient,
  getPlanIdForStripePriceId,
  isSubscriptionAccessEnabled,
} = require("../config/stripeBilling");
const { isMailerConfigured, sendMail } = require("../utils/mailer");

function getPurchaseRecipient(session) {
  return (
    session?.customer_details?.email ||
    session?.customer_email ||
    session?.metadata?.adminEmail ||
    null
  );
}

function getStripeObjectId(value) {
  return typeof value === "string" ? value : value?.id || null;
}

function getInvoiceSubscriptionId(invoice) {
  return getStripeObjectId(
    invoice?.subscription ||
      invoice?.parent?.subscription_details?.subscription
  );
}

function formatMoneyFromMinorUnits(amount, currency) {
  if (typeof amount !== "number" || Number.isNaN(amount)) return null;

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: (currency || "usd").toUpperCase(),
  }).format(amount / 100);
}

async function sendPurchaseConfirmationEmail({ tenant, session, subscription }) {
  if (!isMailerConfigured()) return;

  const to = getPurchaseRecipient(session);
  if (!to) return;

  const plan = getPlan(tenant?.planId || session?.metadata?.planId || null);
  const planName = plan?.name || "Paid";
  const price = subscription?.items?.data?.[0]?.price || null;
  const formattedAmount = formatMoneyFromMinorUnits(price?.unit_amount, price?.currency);
  const renewalDate = subscription?.current_period_end
    ? new Date(subscription.current_period_end * 1000).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const billingUrl = `${(process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "")}/admin/billing`;

  const subject = `TimeStamp purchase confirmed: ${planName}`;
  const summaryLine = formattedAmount ? `${planName} plan for ${formattedAmount}/month` : `${planName} plan`;
  const periodLine = renewalDate ? `Your current billing period renews on ${renewalDate}.` : "Your subscription is now active.";

  const text = [
    `Hello,`,
    "",
    `Your TimeStamp purchase is confirmed for ${tenant?.name || "your facility"}.`,
    `Plan: ${summaryLine}`,
    periodLine,
    "",
    `You can review billing details here: ${billingUrl}`,
    "",
    "If you did not authorize this purchase, contact support immediately.",
  ].join("\n");

  await sendMail({ to, subject, text });
}

async function sendTrialStartedEmail({ tenant, session, subscription }) {
  if (!isMailerConfigured()) return;

  const to = getPurchaseRecipient(session);
  if (!to) return;

  const plan = getPlan(tenant?.planId || session?.metadata?.planId || null);
  const planName = plan?.name || "Pro";
  const price = subscription?.items?.data?.[0]?.price || null;
  const formattedAmount = formatMoneyFromMinorUnits(price?.unit_amount, price?.currency);
  const trialEndDate = subscription?.trial_end
    ? new Date(subscription.trial_end * 1000).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;
  const billingUrl = `${(process.env.APP_BASE_URL || "http://localhost:3000").replace(/\/$/, "")}/admin/billing`;

  const subject = `Your TimeStamp ${planName} trial has started`;
  const chargeLine = trialEndDate && formattedAmount
    ? `Your card will be automatically charged ${formattedAmount} on ${trialEndDate} unless you cancel before then.`
    : "Your card will be automatically charged when the trial ends unless you cancel before then.";

  const text = [
    `Hello,`,
    "",
    `Your 15-day free trial of the ${planName} plan has started for ${tenant?.name || "your facility"}.`,
    trialEndDate ? `Trial ends: ${trialEndDate}` : null,
    chargeLine,
    "",
    `Manage or cancel anytime here: ${billingUrl}`,
  ].filter(Boolean).join("\n");

  await sendMail({ to, subject, text });
}

async function findTenantFromEventObject(object) {
  const metadataTenantId = object?.metadata?.tenantId;
  if (metadataTenantId) {
    const byId = await Tenant.findById(metadataTenantId);
    if (byId) return byId;
  }

  const customerId =
    typeof object?.customer === "string"
      ? object.customer
      : object?.customer?.id || null;
  if (customerId) {
    const byCustomer = await Tenant.findOne({ stripeCustomerId: customerId });
    if (byCustomer) return byCustomer;
  }

  const subscriptionId =
    typeof object?.subscription === "string"
      ? object.subscription
      : object?.subscription?.id || object?.id || null;
  if (subscriptionId) {
    const bySubscription = await Tenant.findOne({ stripeSubscriptionId: subscriptionId });
    if (bySubscription) return bySubscription;
  }

  return null;
}

async function applySubscriptionToTenant(tenant, subscription) {
  if (!tenant || !subscription) return;

  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id || null;
  const priceId = subscription.items?.data?.[0]?.price?.id || null;
  const mappedPlanId = getPlanIdForStripePriceId(priceId);
  const subscriptionStatus = subscription.status || null;

  if (customerId) tenant.stripeCustomerId = customerId;
  tenant.stripeSubscriptionId = subscription.id || tenant.stripeSubscriptionId;
  tenant.stripePriceId = priceId;
  tenant.subscriptionStatus = subscriptionStatus;
  const periodEndDate = subscription.current_period_end
    ? new Date(subscription.current_period_end * 1000)
    : null;
  tenant.currentPeriodEnd = periodEndDate && !isNaN(periodEndDate) ? periodEndDate : null;

  if (subscription.trial_end) {
    tenant.trialEndsAt = new Date(subscription.trial_end * 1000);
    tenant.hasUsedTrial = true;
  } else {
    tenant.trialEndsAt = null;
  }

  if (mappedPlanId) {
    tenant.planId = mappedPlanId;
  }

  tenant.planSelected = Boolean(mappedPlanId && isSubscriptionAccessEnabled(subscriptionStatus));
  await tenant.save();
}

async function handleCheckoutCompleted(session) {
  const tenant = await findTenantFromEventObject(session);
  if (!tenant) return;

  if (session.customer) {
    tenant.stripeCustomerId = session.customer;
  }

  if (session.subscription) {
    tenant.stripeSubscriptionId = session.subscription;
  }

  await tenant.save();

  if (session.subscription) {
    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.retrieve(session.subscription);
    await applySubscriptionToTenant(tenant, subscription);

    try {
      if (subscription.status === "trialing") {
        await sendTrialStartedEmail({ tenant, session, subscription });
      } else {
        await sendPurchaseConfirmationEmail({ tenant, session, subscription });
      }
    } catch (error) {
      console.error("Stripe purchase confirmation email failed:", error);
    }
  }
}

async function handleInvoicePaymentFailed(invoice) {
  const tenant = await findTenantFromEventObject(invoice);
  if (!tenant) return;

  tenant.subscriptionStatus = "past_due";
  if (!isSubscriptionAccessEnabled(tenant.subscriptionStatus)) {
    tenant.planSelected = false;
  }
  await tenant.save();
}

async function handleInvoicePaymentSucceeded(invoice) {
  const tenant = await findTenantFromEventObject(invoice);
  if (!tenant) return;

  const invoiceSubscriptionId = getInvoiceSubscriptionId(invoice);
  if (
    !invoiceSubscriptionId ||
    invoiceSubscriptionId !== tenant.stripeSubscriptionId
  ) {
    return;
  }

  const stripe = getStripeClient();
  const subscription = await stripe.subscriptions.retrieve(invoiceSubscriptionId);
  const subscriptionCustomerId = getStripeObjectId(subscription?.customer);
  const invoiceCustomerId = getStripeObjectId(invoice?.customer);

  if (
    !subscription ||
    subscription.id !== tenant.stripeSubscriptionId ||
    (tenant.stripeCustomerId &&
      subscriptionCustomerId !== tenant.stripeCustomerId) ||
    (invoiceCustomerId && invoiceCustomerId !== subscriptionCustomerId)
  ) {
    return;
  }

  await applySubscriptionToTenant(tenant, subscription);
}

async function stripeWebhookHandler(req, res) {
  const stripeSignature = req.headers["stripe-signature"];
  const webhookSecret = (process.env.STRIPE_WEBHOOK_SECRET || "").trim();

  if (!webhookSecret) {
    return res.status(500).json({
      message: "Stripe webhook secret is not configured.",
      code: "STRIPE_WEBHOOK_SECRET_MISSING",
    });
  }

  let event;

  try {
    const stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(req.body, stripeSignature, webhookSecret);
  } catch (error) {
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object);
        break;
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const tenant = await findTenantFromEventObject(event.data.object);
        if (tenant) {
          await applySubscriptionToTenant(tenant, event.data.object);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const tenant = await findTenantFromEventObject(event.data.object);
        if (tenant) {
          await applySubscriptionToTenant(tenant, event.data.object);
          tenant.planSelected = false;
          tenant.subscriptionStatus = event.data.object.status || "canceled";
          await tenant.save();
        }
        break;
      }
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object);
        break;
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object);
        break;
      default:
        break;
    }

    return res.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook handling failed:", error);
    return res.status(500).json({
      message: "Stripe webhook processing failed",
      detail: process.env.NODE_ENV !== "production" ? error.message : undefined,
    });
  }
}

module.exports = {
  stripeWebhookHandler,
};