# VITICO Wholesale Platform — MVP Specification

Status: **Draft for review** · Owner: VITICO · Last updated: 2026-10-06

This document defines what we are building for the VITICO B2B wholesale portal,
based on the VITICO Master B2B Wholesale Platform Requirements, the Wave Grocery
solution response (30 Sep 2026), and decisions confirmed with VITICO.

---

## 1. Goals & scope

A **production MVP** of a B2B wholesale ordering portal for VITICO's customers in
Fiji, the wider Pacific, New Zealand and Australia.

| Phase | In MVP | Summary |
|---|---|---|
| 1 — Core B2B | ✅ | Company accounts & users, catalogue, cart, orders/PO, pricing engine, FCCC reference pricing, admin |
| 2 — Account & loyalty | ✅ | Tiers, rebates (4 types), rebate wallet & targets, dashboard, account centre (Odoo invoices/statements) |
| 3 — Container trading | ✅ | 20FT / 40FT / 40HC builder with live CBM & weight |
| 4 — Deal Drops | ✅ | Limited-allocation deals, combo deals, countdowns, 10% non-refundable bond |
| 5 — Payments & integrations | Partial | Odoo live sync; M-Paisa / MyCash as **manual** flow (API later) |
| 6 — Advanced management | Partial | Basic sales-rep role + **price-override approvals** only; commissions/advanced reports later |

Out of scope for MVP: native iOS/Android apps, commission calculation, demand
forecasting, automatic container optimisation, credit scoring, supplier portal.

## 2. Platform & architecture

- **Client**: responsive web app, installable as a **PWA** (offline shell, web push).
- **Stack**: Next.js (App Router) + TypeScript, PostgreSQL via Prisma, Tailwind + shadcn/ui,
  Auth.js (email + password), Zod validation.
- **Background jobs**: `pg-boss` (Postgres-backed queue) in a separate worker process —
  Odoo sync, notifications, rebate calculation, Deal Drop expiry.
- **Hosting (AWS)**: ECS Fargate (web + worker containers), RDS PostgreSQL, S3 (images,
  payment proofs, documents), SES (email), SNS (SMS), CloudFront, Secrets Manager.
  Infrastructure as code with Terraform. Local dev via Docker Compose.
- **Repo layout** (single repo):
  ```
  apps/web          Next.js app (customer portal + admin + API routes)
  apps/worker       background job runner
  packages/db       Prisma schema, migrations, seed (realistic fake data)
  packages/pricing  pure pricing engine (heavily unit-tested)
  packages/odoo     Odoo JSON-RPC client + sync mappers
  infra/            Terraform
  docs/             this spec, ADRs
  ```
- **Branding**: neutral placeholder theme via design tokens; VITICO logo/colours supplied later.

## 3. Users, companies & roles

**Customer side** — a `Company` has many `User`s.

| Role | Can |
|---|---|
| Owner | Everything for the company; manage users; set per-user order limits; approve orders |
| Purchasing | Browse, build carts/containers, submit orders (approval required above their FJD limit) |
| Accounts | View invoices, statements, balances, payments, rebate wallet; pay/upload proof |

**Internal side**

| Role | Can |
|---|---|
| Super Admin | Everything incl. settings, pricing rules, integrations |
| Admin / Ops | Catalogue, stock, orders, Deal Drops, containers, customers |
| Pricing Manager | Approve/reject price overrides; manage price lists & rules |
| Sales Rep | Assigned customers only: view, order on behalf, build containers, request price overrides |
| Accounts (internal) | Verify bank deposit / M-Paisa / MyCash payments, credit limits |

**Signup**: a business applies (company details, tax ID/TIN, delivery region) → VITICO
approves, assigns tier, region, credit terms, sales rep → Owner invites further users.

**Data isolation**: every customer query is scoped by `companyId`; enforced in a
data-access layer plus tests. Customers only ever see their own prices, orders and documents.

## 4. Catalogue & stock

**Product**: SKU, name, brand, category, images, description, unit, carton qty, MOQ,
order multiple, carton CBM, carton weight (kg), base price (FJD ex-VAT), VAT category,
active flag, tags, FCCC reference (see §6), allowed regions.

**Stock ledger** (this platform is the source of truth for stock):

```
available = on_hand − reserved − allocated
```

- `reserved` — submitted, not-yet-dispatched orders
- `allocated` — held for Deal Drops and confirmed containers
- All movements recorded as immutable `StockMovement` rows (receipt, adjustment,
  reservation, release, dispatch) with user and reason.
- Concurrency: reservation uses row-level locks (`SELECT … FOR UPDATE`) inside a
  transaction, so stock cannot be oversold.
- Admin CSV import/export for products and stock.

## 5. Pricing engine

All prices are **FJD, excluding VAT**. One pure function, `price(customer, product, qty,
deliveryRegion, date) → { unitPrice, source, breakdown[] }`, is used everywhere:
catalogue, cart, checkout, container builder, Deal Drops, and Odoo export.

### 5.1 Price sources

| Source | Definition |
|---|---|
| Contract price | Negotiated price per customer × product (optional region, qty min, validity dates) |
| Deal Drop / Promotion | Active deal or promo price the customer is eligible for |
| Tier price | Per-product tier price if set, **otherwise** tier-wide % discount off base (Standard 0%, Plus 3%, VIP 5%, Partner 8% — editable) |
| Quantity break | Per-product break table (e.g. 1–9, 10–49, 50–99, 100+) — % or fixed price |
| Base price | Product base price |

### 5.2 Resolution (fixed priority, admin-reorderable)

1. Collect every **applicable** source for the inputs.
2. Pick the highest-priority one. Default order:
   **Contract → Deal Drop/Promo → Tier → Quantity break → Base**.
3. Apply the **region uplift** last (see 5.3), unless the chosen source is region-specific
   (e.g. a contract price set for that island).
4. Return the full breakdown so the UI can explain the price ("VIP price, Vanua Levu +5%").

The UI shows "Buy N more to unlock $X" whenever a better quantity break exists.

> **Open question for VITICO:** should tier and quantity-break discounts combine
> (e.g. VIP 5% off the qty-break price) instead of first-match-wins? The engine supports
> both via a per-rule `combinable` flag; the default is **not** combinable.

### 5.3 Regions

Regions are a hierarchy (country → island group), each with an uplift (% or fixed per unit):

- **Fiji**: Viti Levu (base), Vanua Levu, Taveuni, Lau / Lomaiviti / Yasawa / outer islands
- **Pacific export**: Samoa, Tonga, Vanuatu, Solomon Islands, Kiribati, Tuvalu, Cook Islands, others
- **NZ & Australia**

### 5.4 Price overrides & approvals

- Sales reps (or admins) may set a line price **below or above** the calculated price, with a
  required reason.
- Any override puts the order into **Pending Price Approval**; a Pricing Manager approves or
  rejects. Every request and decision is written to an audit trail.
- Prices below cost or a minimum margin (configurable) are flagged in red.

### 5.5 Currency & tax

- Everything is priced and invoiced in **FJD**.
- Export customers also see an **indicative local-currency price** (NZD, AUD, WST, TOP,
  VUV, SBD, AUD for Kiribati/Tuvalu, NZD for Cook Is.). Rates are updated daily from an FX
  feed and admins can override them.
- **VAT**: 15% added at checkout for delivery within Fiji; **0% (zero-rated) for exports**.
  *(Assumption: please confirm with VITICO's accountant.)*

## 6. FCCC reference pricing

- Per product (optionally per region): FCCC controlled/max price, unit basis, effective and
  expiry dates, source/reference number.
- Shown beside the VITICO price with the customer's saving (`FCCC − VITICO price`, in $ and %).
- Admin alert if a calculated VITICO price would exceed the FCCC price.
- Expired FCCC prices are hidden automatically; admins are warned 14 days before expiry.

## 7. Cart, checkout & orders

- Cart supports quantity changes, MOQ and order-multiple validation, saved lists, quick
  reorder, CSV/SKU quick-add, PO number, delivery instructions, and requested delivery date.
- Delivery: pickup, or delivery to the company's delivery addresses (region drives pricing and VAT).
- **Order approval**: if a Purchasing user's order exceeds their FJD limit (set by Owner)
  → **Pending Customer Approval**, and the Owner approves or rejects.
- **Statuses**: Draft → Pending Customer Approval → Pending Price Approval → Submitted →
  Confirmed → Processing → Ready → Dispatched → Completed; plus On Hold, Partially
  Fulfilled, Cancelled. Transitions are defined in one state machine; each one is logged
  and can trigger notifications.

## 8. Payments

| Method | MVP behaviour |
|---|---|
| Credit account / terms | Allowed when the order total ≤ available credit (limit − Odoo outstanding balance); terms such as Net 7/14/30 |
| Bank deposit | Customer uploads proof + reference; internal Accounts verifies |
| M-Paisa (Vodafone) | Manual: pay to the merchant number, enter transaction ID, internal verification |
| MyCash (Digicel) | Manual: same as M-Paisa |
| Rebate wallet | Can be used as tender (full or partial) for orders and Deal Drop bonds |

Payment methods are plugins behind one interface, so the M-Paisa/MyCash APIs can be
added later without changing checkout.

## 9. Odoo integration (Odoo Online, JSON-RPC external API)

| Data | Direction | Trigger |
|---|---|---|
| Customers ↔ `res.partner` | Two-way; portal is master for portal fields, Odoo for accounting fields | On change + nightly reconcile |
| Orders → `sale.order` | Portal → Odoo | On Confirmed; status updates pushed on change |
| Invoices, credit notes, payments, balances ← `account.move` / `account.payment` | Odoo → portal | Every 15 min + on demand |

- Uses an API key for a dedicated Odoo integration user; credentials are kept in AWS Secrets Manager.
- Every sync is idempotent (external IDs stored on both sides), retried with backoff,
  logged in a `SyncLog` table, and visible on an admin integration screen with manual retry.
- Products and stock are **not** synced to Odoo in the MVP (the portal is master); this can be added later.
- Development: local Odoo in Docker, then the VITICO test database (URL, DB, user, API key to be provided).

## 10. Phase 2 — Tiers, rebates & account centre

**Tiers**: Standard / Plus / VIP / Partner. A tier drives pricing (§5), Deal Drop access,
default credit terms, and rebate rates. It is assigned manually, and can be suggested
automatically from trailing 12-month spend.

**Rebate types** (all configurable rules with validity, eligible tiers, products/categories):

| Type | Rule |
|---|---|
| Spend target | Spend ≥ X in a period (month/quarter/year) → earn Y% (supports multiple steps) |
| Product/category cashback | Earn Y% on eligible lines when the order is Completed |
| Early payment | Invoice paid within N days of issue (from Odoo) → earn Y% |
| Annual/contract | Per-customer contract terms, settled at period end (admin confirms) |

**Rebate wallet ledger**: pending → available → used / expired, with full transaction
history. Earned rebates become available after the order is completed and paid. Optional
expiry is supported.

**Customer dashboard**: available credit, outstanding balance, active orders, rebate wallet,
target progress ("spend $X more to earn Y%"), live Deal Drops, total savings (FCCC +
rebates + deals).

**Account centre**: invoices, statements, credit notes, payment history (from Odoo, PDF
download), company profile, users, addresses.

## 11. Phase 3 — Container builder

- Container types are admin-editable. Defaults:

  | Type | Max usable CBM | Max payload |
  |---|---|---|
  | 20FT | 28 | 21,700 kg |
  | 40FT | 58 | 26,500 kg |
  | 40HC | 68 | 26,500 kg |

- Per container: destination port/region, route, customer and product restrictions.
- As the customer or rep adds cartons, the builder shows live CBM, weight, remaining
  capacity and utilisation %. It warns at 90% and blocks submission above 100% of either limit.
- Line prices come from the same pricing engine (destination region applies).
- Submitting the container creates an order of type `CONTAINER` and stores the final
  composition snapshot (lines, CBM, weight).
- Customers and sales reps (for assigned customers) can build containers.

## 12. Phase 4 — Deal Drops

- **Deal Drop**: name, products (single SKU or **combo** of fixed SKU quantities), deal
  price, total allocation, max per customer, eligible tiers/regions/customers, start and end
  time (countdown), status (Scheduled → Live → Sold Out / Ended → Closed).
- **Secure Deal** (atomic transaction): check eligibility → lock allocation → take the bond →
  create the reservation → decrement the allocation → notify. Everything succeeds or nothing
  does, so stock cannot be double-allocated.
- **Bond**: **10% of the deal value, non-refundable**, payable by any method including the
  rebate wallet. It is **deducted from the final invoice** when the deal completes. If the
  customer does not complete the deal, the bond is forfeited (accounted in Odoo).
- Stock for the deal is moved to `allocated` when the deal goes live; any remainder is
  released when it ends.
- Notifications: new eligible deal, ending soon, low stock, secured, and payment due.

## 13. Notifications

Channels: **email (AWS SES)**, **SMS (AWS SNS, Twilio as fallback)**, **web push (PWA)**,
and an **in-app notification centre**. Each user sets their channel preferences per event
type. Templates are editable in admin.

Events: account approved, order status changes, approval requests/decisions, payment
verified, invoice issued / overdue reminder, rebate earned / target progress, and the Deal
Drop events above.

## 14. Admin panel

Screens: dashboard, companies & users (approve signups, tiers, credit, assign reps),
products & stock, pricing (base, tier, quantity breaks, contracts, region uplifts, priority
order), FCCC, promotions, Deal Drops, container types, orders (status, approvals), payments
verification, rebate rules & wallet adjustments, notifications/templates, Odoo sync log,
settings, and an audit log.

## 15. Reporting (MVP)

Sales by period, region, customer, product and category; top customers; Deal Drop
performance; rebate liability; container utilisation; stock on hand and aging. All reports
can be exported to CSV.

## 16. Security & non-functional requirements

- HTTPS everywhere, passwords hashed with argon2, optional TOTP 2FA for internal users,
  rate-limited login, CSRF protection.
- Company-scoped data access enforced in one place and covered by tests.
- An audit log for pricing, approvals, payments, stock, and admin changes.
- RDS automated backups (daily, 14-day retention) and S3 versioning.
- Data belongs to VITICO; full export is available (CSV + DB dump).
- Testing: unit tests (the pricing engine targets 100% branch coverage), integration tests
  against Postgres, and Playwright end-to-end tests for critical flows. CI runs on GitHub Actions.

## 17. Delivery plan (one PR each)

1. **Foundation**: repo scaffold, CI, Docker Compose, DB schema, auth, companies/users/roles, admin shell, seed data
2. **Catalogue & stock**: products, categories, search/filters, stock ledger, CSV import
3. **Pricing engine + FCCC**: engine package, admin pricing screens, price display
4. **Cart, checkout & orders**: approvals, price overrides, state machine, payments (manual methods + credit)
5. **Notifications**: email, SMS, push, in-app
6. **Odoo integration**: partners, sales orders, invoices/payments, sync admin
7. **Phase 2**: tiers, rebates, wallet, dashboard, account centre
8. **Phase 3**: container builder
9. **Phase 4**: Deal Drops
10. **AWS infrastructure**: Terraform, deploy pipeline, staging + production
11. **Reports & hardening**: reports, PWA polish, security review, load test

## 18. Open items needed from VITICO

- [ ] Odoo test database credentials (URL, DB name, integration user, API key)
- [ ] Logo, brand colours, domain name
- [ ] Confirm tier/quantity-break combinability (§5.2) and default tier %
- [ ] Confirm VAT treatment for exports (§5.5)
- [ ] Region list and uplift values
- [ ] M-Paisa / MyCash merchant numbers (API access later)
- [ ] AWS account (or we create one), plus the SES sending domain and SMS sender ID
- [ ] Real product and customer data when ready (replacing the seed data)
