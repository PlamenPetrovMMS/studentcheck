// stripe.js
import Stripe from "stripe";

/**
 * Create a Stripe service with minimal, KISS-style methods.
 *
 * @param {object} opts
 * @param {string} opts.secretKey
 * @param {string} opts.webhookSecret
 * @param {string} opts.appUrl
 * @param {object} opts.priceToPlan  // { "price_123": "pro", "price_456": "enterprise" }
 * @param {object} opts.db          // your DB adapter (see interface below)
 */
export function createStripeService(opts) {
  const {
    secretKey,
    webhookSecret,
    appUrl,
    priceToPlan = {},
    db,
  } = opts;

  if (!secretKey) throw new Error("Missing Stripe secret key");
  if (!webhookSecret) throw new Error("Missing Stripe webhook secret");
  if (!appUrl) throw new Error("Missing APP URL");
  if (!db) throw new Error("Missing db adapter");

  const stripe = new Stripe(secretKey);

  // --- Helpers (small, predictable) ---

  function requireKnownPrice(priceId) {
    const plan = priceToPlan[priceId];
    if (!plan) {
      throw new Error(`Unknown priceId: ${priceId}`);
    }
    return plan;
  }

  function pickSubscriptionStatus(sub) {
    // Stripe subscription statuses include: trialing, active, past_due, canceled, unpaid, incomplete...
    // We'll store the raw status string and interpret it elsewhere.
    return sub?.status || "unknown";
  }

  function safePeriodEnd(sub) {
    // current_period_end is a Unix timestamp (seconds)
    const sec = sub?.current_period_end;
    return typeof sec === "number" ? new Date(sec * 1000) : null;
  }

  function getSubItemPriceId(sub) {
    // For subscriptions, the plan/price is typically in:
    // sub.items.data[0].price.id
    const firstItem = sub?.items?.data?.[0];
    return firstItem?.price?.id || null;
  }

  async function ensureCustomerForOrg(orgId, orgEmail) {
    // KISS: store stripe_customer_id in DB; create if missing
    const org = await db.getOrgById(orgId);
    if (!org) throw new Error("Org not found");

    if (org.stripe_customer_id) return org.stripe_customer_id;

    const customer = await stripe.customers.create({
      email: orgEmail || org.email || undefined,
      metadata: { orgId: String(orgId) },
    });

    await db.updateOrgStripeCustomerId(orgId, customer.id);
    return customer.id;
  }

  // --- Public API ---

  /**
   * Create Stripe Checkout session for a subscription.
   * Server whitelists priceId -> plan (no client tampering).
   */
  async function createCheckoutSession({ orgId, orgEmail, priceId }) {
    // Validate + map
    const plan = requireKnownPrice(priceId);

    const customerId = await ensureCustomerForOrg(orgId, orgEmail);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing/cancelled`,
      // Metadata is how we connect Stripe -> our DB in webhooks
      metadata: { orgId: String(orgId), plan },
    });

    return { url: session.url };
  }

  /**
   * Create Stripe Customer Portal session.
   * Generate on demand; do NOT store the URL.
   */
  async function createPortalSession({ orgId, returnUrl }) {
    const org = await db.getOrgById(orgId);
    if (!org?.stripe_customer_id) {
      throw new Error("No stripe_customer_id for this org");
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: returnUrl || `${appUrl}/settings/billing`,
    });

    return { url: session.url };
  }

  /**
   * Verify webhook signature and process event.
   * IMPORTANT: req.body must be RAW buffer (express.raw).
   */
  async function handleWebhook(rawBody, signatureHeader) {
    if (!signatureHeader) throw new Error("Missing stripe-signature header");

    const event = stripe.webhooks.constructEvent(
      rawBody,
      signatureHeader,
      webhookSecret
    );

    // Idempotency: skip if already processed
    const already = await db.wasStripeEventProcessed(event.id);
    if (already) return { ok: true, ignored: true };

    // Process only what we need (KISS: minimal event set)
    switch (event.type) {
      case "checkout.session.completed":
        await onCheckoutSessionCompleted(event.data.object);
        break;

      case "customer.subscription.updated":
        await onSubscriptionUpdated(event.data.object);
        break;

      case "customer.subscription.deleted":
        await onSubscriptionDeleted(event.data.object);
        break;

      // Optional: you can add these later
      // case "invoice.payment_failed":
      // case "invoice.paid":

      default:
        // Ignore everything else
        break;
    }

    await db.markStripeEventProcessed(event.id, event.type);
    return { ok: true };
  }

  // --- Event handlers (KISS: small + direct) ---

  async function onCheckoutSessionCompleted(session) {
    // session.customer and session.subscription are the linkage we want
    const orgId = session?.metadata?.orgId;
    if (!orgId) throw new Error("Missing orgId in session.metadata");

    const customerId = session.customer;
    const subscriptionId = session.subscription;

    // Save customer/subscription linkage early
    if (customerId) await db.updateOrgStripeCustomerId(orgId, customerId);
    if (subscriptionId) await db.updateOrgStripeSubscriptionId(orgId, subscriptionId);

    // Optionally set a "pending activation" state
    // Real plan/status will be set by subscription.updated, but we can also fetch now:
    if (subscriptionId) {
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      await applySubscriptionToOrg(orgId, sub);
    }
  }

  async function onSubscriptionUpdated(subscription) {
    const customerId = subscription.customer;
    if (!customerId) return;

    const org = await db.getOrgByStripeCustomerId(customerId);
    if (!org) return;

    await applySubscriptionToOrg(org.id, subscription);
  }

  async function onSubscriptionDeleted(subscription) {
    const customerId = subscription.customer;
    if (!customerId) return;

    const org = await db.getOrgByStripeCustomerId(customerId);
    if (!org) return;

    // Downgrade
    await db.updateOrgBillingState(org.id, {
      plan: "free",
      subscription_status: pickSubscriptionStatus(subscription),
      stripe_subscription_id: subscription.id || null,
      current_period_end: safePeriodEnd(subscription),
    });
  }

  async function applySubscriptionToOrg(orgId, subscription) {
    const priceId = getSubItemPriceId(subscription);
    const plan = priceId && priceToPlan[priceId] ? priceToPlan[priceId] : "free";

    await db.updateOrgBillingState(orgId, {
      plan,
      subscription_status: pickSubscriptionStatus(subscription),
      stripe_subscription_id: subscription.id || null,
      current_period_end: safePeriodEnd(subscription),
    });
  }

  return {
    createCheckoutSession,
    createPortalSession,
    handleWebhook,
  };
}
