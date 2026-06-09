const { getStripeClient } = require("../../config/stripe");

async function createOffSessionPaymentIntent(payload, idempotencyKey) {
  const stripe = getStripeClient();

  return stripe.paymentIntents.create(
    {
      amount: payload.amount,
      currency: payload.currency,
      customer: payload.customer,
      payment_method: payload.paymentMethod,
      confirm: true,
      off_session: true,
      expand: ["latest_charge"],
      metadata: payload.metadata,
    },
    {
      idempotencyKey,
    }
  );
}

async function createCustomer(payload) {
  const stripe = getStripeClient();

  return stripe.customers.create({
    email: payload.email || undefined,
    name: payload.name || undefined,
    metadata: payload.metadata || {},
  });
}

async function createSetupIntent(payload) {
  const stripe = getStripeClient();

  return stripe.setupIntents.create({
    customer: payload.customer,
    payment_method_types: ["card"],
    usage: "off_session",
    metadata: payload.metadata || {},
  });
}

async function retrievePaymentMethod(paymentMethodId) {
  const stripe = getStripeClient();

  return stripe.paymentMethods.retrieve(paymentMethodId);
}

async function attachPaymentMethod(paymentMethodId, customerId) {
  const stripe = getStripeClient();

  return stripe.paymentMethods.attach(paymentMethodId, {
    customer: customerId,
  }).catch((error) => {
    if (error.code !== "resource_already_exists") throw error;
    return retrievePaymentMethod(paymentMethodId);
  });
}

async function setDefaultPaymentMethod(customerId, paymentMethodId) {
  const stripe = getStripeClient();

  return stripe.customers.update(customerId, {
    invoice_settings: {
      default_payment_method: paymentMethodId,
    },
  });
}

function constructWebhookEvent(rawBody, signature) {
  const stripe = getStripeClient();

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is required");
  }

  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

module.exports = {
  attachPaymentMethod,
  constructWebhookEvent,
  createCustomer,
  createOffSessionPaymentIntent,
  createSetupIntent,
  retrievePaymentMethod,
  setDefaultPaymentMethod,
};
