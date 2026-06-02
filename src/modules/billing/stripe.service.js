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

function constructWebhookEvent(rawBody, signature) {
  const stripe = getStripeClient();

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is required");
  }

  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

module.exports = {
  constructWebhookEvent,
  createOffSessionPaymentIntent,
};
