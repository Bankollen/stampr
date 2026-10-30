/*
 * Stampr settings you may need to change. Fill in the Lemon Squeezy values once the store and
 * the two Pro products exist (see README.md → "Selling Pro"). Until storeId is set, the page
 * shows Pro as "coming soon" and license keys can't be activated.
 */
window.STAMPR_CONFIG = {
  lemonSqueezy: {
    storeId: null, // number — Lemon Squeezy → Settings → Stores
    productIds: [], // numbers — the Pro yearly and Pro lifetime products
    checkoutYearly: '', // checkout link for Pro yearly
    checkoutLifetime: '', // checkout link for Pro lifetime
  },
  prices: {
    yearly: '$12',
    yearlyNote: 'per year',
    lifetime: '$29',
    lifetimeNote: 'one-time payment',
  },
  contactEmail: '', // shown on the terms/privacy pages and in the Pro dialog
};
