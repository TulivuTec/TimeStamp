const mockConstructEvent = jest.fn();
const mockRetrieveSubscription = jest.fn();
const mockTenantFindById = jest.fn();
const mockTenantFindOne = jest.fn();
const mockGetPlanIdForStripePriceId = jest.fn();
const mockIsSubscriptionAccessEnabled = jest.fn();

jest.mock("../models/Tenant", () => ({
  findById: mockTenantFindById,
  findOne: mockTenantFindOne,
}));

jest.mock("../config/stripeBilling", () => ({
  getStripeClient: jest.fn(() => ({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockRetrieveSubscription },
  })),
  getPlanIdForStripePriceId: mockGetPlanIdForStripePriceId,
  isSubscriptionAccessEnabled: mockIsSubscriptionAccessEnabled,
  getPlan: jest.fn(),
}));

jest.mock("../utils/mailer", () => ({
  isMailerConfigured: jest.fn(() => false),
  sendMail: jest.fn(),
}));

const { stripeWebhookHandler } = require("../controllers/stripeWebhookController");

const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

function makeResponse() {
  const response = {
    status: jest.fn(),
    json: jest.fn(),
    send: jest.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  response.send.mockReturnValue(response);
  return response;
}

function makeTenant(overrides = {}) {
  return {
    _id: "tenant-1",
    stripeCustomerId: "cus_current",
    stripeSubscriptionId: "sub_current",
    stripePriceId: "price_standard",
    subscriptionStatus: "past_due",
    planId: "standard_10",
    planSelected: false,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function deliverInvoicePaymentSucceeded(invoice) {
  mockConstructEvent.mockReturnValue({
    type: "invoice.payment_succeeded",
    data: { object: invoice },
  });

  const response = makeResponse();
  await stripeWebhookHandler(
    {
      body: Buffer.from(JSON.stringify(invoice)),
      headers: { "stripe-signature": "test-signature" },
    },
    response
  );
  return response;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = "test-webhook-secret";
  mockTenantFindById.mockResolvedValue(null);
  mockIsSubscriptionAccessEnabled.mockImplementation((status) =>
    ["active", "trialing"].includes(status)
  );
  mockGetPlanIdForStripePriceId.mockReturnValue("standard_10");
});

afterAll(() => {
  if (originalWebhookSecret === undefined) {
    delete process.env.STRIPE_WEBHOOK_SECRET;
  } else {
    process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret;
  }
});

describe("Stripe invoice payment success webhook", () => {
  test("does not restore access from a previous subscription's payment", async () => {
    const tenant = makeTenant();
    mockTenantFindOne.mockResolvedValue(tenant);

    const response = await deliverInvoicePaymentSucceeded({
      customer: "cus_current",
      subscription: "sub_previous",
    });

    expect(response.json).toHaveBeenCalledWith({ received: true });
    expect(mockRetrieveSubscription).not.toHaveBeenCalled();
    expect(tenant.subscriptionStatus).toBe("past_due");
    expect(tenant.planSelected).toBe(false);
    expect(tenant.save).not.toHaveBeenCalled();
  });

  test("restores access for a paid renewal on the current active subscription", async () => {
    const tenant = makeTenant();
    mockTenantFindOne.mockResolvedValue(tenant);
    mockRetrieveSubscription.mockResolvedValue({
      id: "sub_current",
      customer: "cus_current",
      status: "active",
      current_period_end: 1790000000,
      items: { data: [{ price: { id: "price_standard" } }] },
    });

    const response = await deliverInvoicePaymentSucceeded({
      customer: "cus_current",
      parent: {
        subscription_details: { subscription: "sub_current" },
      },
    });

    expect(response.json).toHaveBeenCalledWith({ received: true });
    expect(mockRetrieveSubscription).toHaveBeenCalledWith("sub_current");
    expect(tenant.subscriptionStatus).toBe("active");
    expect(tenant.planSelected).toBe(true);
    expect(tenant.save).toHaveBeenCalledTimes(1);
  });

  test("does not grant access if Stripe reports the current subscription is canceled", async () => {
    const tenant = makeTenant();
    mockTenantFindOne.mockResolvedValue(tenant);
    mockRetrieveSubscription.mockResolvedValue({
      id: "sub_current",
      customer: "cus_current",
      status: "canceled",
      items: { data: [{ price: { id: "price_standard" } }] },
    });

    await deliverInvoicePaymentSucceeded({
      customer: "cus_current",
      subscription: "sub_current",
    });

    expect(tenant.subscriptionStatus).toBe("canceled");
    expect(tenant.planSelected).toBe(false);
    expect(tenant.save).toHaveBeenCalledTimes(1);
  });
});
