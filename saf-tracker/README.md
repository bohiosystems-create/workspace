# SAF Ledger

Black-on-white tracker for Sustainable Aviation Fuel certificates: holdings, tCO₂e avoided, and a Stripe Checkout flow to buy more.

```bash
npm install
cp .env.example .env   # add STRIPE_SECRET_KEY (test key sk_test_...)
export $(grep -v '^#' .env | cut -d' ' -f1 | xargs) && npm start
```

Without `STRIPE_SECRET_KEY` it runs in **demo mode** (sample data, simulated purchases, no payment).

- Checkout: `POST /api/checkout` creates a Stripe Checkout Session; on return `/api/confirm` verifies `payment_status=paid` server-side and records the certificate (idempotent per session). Optional webhook: `POST /api/webhook` (`checkout.session.completed`).
- Conversion (`CO2_PER_CERT`, default 2.53): 1 certificate = 1 t SAF ≈ 3.16 tCO₂/t jet × ~80% lifecycle reduction. Adjust to your registry's methodology.
- Price (`PRICE_PER_CERT_USD`, default 2400) is a placeholder. Storage is a JSON file (`data/`); swap for a DB in production.
