---
name: barion
description: Integrate the Barion payment API (v2) with the barion-api TypeScript package. Use when building payment flows, verifying Barion IPNs/webhooks via GetPaymentState, wiring SvelteKit or Hono adapters, handling reservation (2-step) payments, refunds, or debugging Barion status/error behavior. Covers endpoints, auth (POSKey), payment statuses, sandbox vs prod, and the critical rule that IPN bodies are never trusted.
---

# Barion API + barion-api package

This skill teaches an AI agent how to integrate **Barion** (a Hungarian online
payment
wallet / gateway) using the **`barion-api`** TypeScript package — a framework-agnostic,
edge-compatible core with adapters for SvelteKit, Hono, Next.js, Express, Fastify,
Nuxt (Nitro/h3), and Astro.

## 1. Barion API overview

### Base URLs

| Environment         | Base URL                           |
| ------------------- | ---------------------------------- |
| Sandbox (`test`)    | `https://api.test.barion.com/api/` |
| Production (`prod`) | `https://api.barion.com/api/`      |

### Authentication

- **`POSKey`** (a GUID) is the merchant credential, issued in the Barion dashboard.
- It is sent in **every** request body (POST) or query string (GET) — the package
  injects it automatically.
- **Never expose `POSKey` to the browser.** All Barion calls must run server-side.

### Endpoints (API v2)

The package covers all of these. Path is appended to the base URL + `v2/`.

| Operation              | Method + path                          | Package method                 |
| ---------------------- | -------------------------------------- | ------------------------------ |
| Payment Start          | `POST /v2/Payment/Start`               | `barion.payments.start`        |
| Payment Get State      | `POST /v2/Payment/GetPaymentState`     | `barion.payments.getState`     |
| Finalize Reservation   | `POST /v2/Payment/FinalizeReservation` | `barion.payments.finalize`     |
| Cancel Reservation     | `POST /v2/Payment/CancelReservation`   | `barion.payments.cancel`       |
| Refund                 | `POST /v2/Payment/Refund`              | `barion.payments.refund`       |
| Transfer Send          | `POST /v2/Transfer/Send`               | `barion.transfers.send`        |
| Email Transfer         | `POST /v2/EmailTransfer`               | `barion.transfers.email`       |
| Bank Transfer Start    | `POST /v2/BankTransfer/Start`          | `barion.bankTransfer.start`    |
| Bank Transfer Complete | `POST /v2/BankTransfer/Complete`       | `barion.bankTransfer.complete` |
| Update Bank Account    | `POST /v2/UpdateBankAccount`           | `barion.bankAccount.update`    |
| Withdraw               | `POST /v2/Withdraw`                    | `barion.withdraw`              |
| Query Accounts         | `POST /v2/QueryAccounts`               | `barion.accounts.query`        |
| Query Balance Change   | `POST /v2/QueryBalanceChange`          | `barion.balanceChange.query`   |
| Download Statement     | `GET /v2/DownloadStatement`            | `barion.statement.download`    |
| Health Check           | `GET /v2/HealthCheck`                  | `barion.healthCheck`           |

### Payment flow

1. `Payment/Start` → returns `PaymentId` + `GatewayUrl`.
2. Redirect the customer to `GatewayUrl` (Barion Smart Gateway).
3. Customer pays on the Barion-hosted page.
4. Barion sends an **IPN** `POST` to your `CallbackUrl` (carrying `PaymentId`).
5. **Verify** with `GetPaymentState(PaymentId)` — the only source of truth.
6. For `Reservation` payments (2-step), later `FinalizeReservation` or `CancelReservation`.

### Payment statuses (from `GetPaymentState`)

`Prepared`, `Started`, `InProgress`, `WaitingForPayment`, `Reserved`,
`Succeeded`, `PartiallySucceeded`, `Failed`, `Cancelled`, `Expired`.

- Fulfill orders only on `Succeeded` (and handle `PartiallySucceeded` carefully).
- `Reserved` means funds are held (2-step) — capture with `finalize` or release with `cancel`.

### IPN / webhook — the critical security rule

**The Barion IPN body is NEVER trusted.** Unlike Stripe, Barion does **not**
HMAC-sign its IPNs. The only reliable verification is to call `GetPaymentState`
with the `PaymentId` from the IPN, then act on the returned `Status`.

### Currency & locale limits

- Currencies: primarily `HUF`; also `EUR`, `USD`, `CZK`. Validate before sending.
- Locales: `hu-HU`, `en-US`, `de-DE`, `sk-SK`, `fr-FR`, `cs-CZ`, `sl-SI`, `el-GR`,
  `pl-PL`, `it-IT`, `es-ES`, `ro-RO`, `bg-BG`, `hr-HR` (used for the gateway UI).

### Error codes

Barion returns an `Errors[]` array (each with `ErrorCode`, `Title`, `Description`).
Common codes: `ModelValidationError`, `AuthenticationError`, `PaymentNotFound`,
`InsufficientFunds`, etc. The package maps these to `BarionError` (with `.status`
and `.errors[]`).

## 2. The barion-api package

### Subpath exports

- `@DezBenedek/barion-api/core` — framework-agnostic client, types, webhook primitives.
- `@DezBenedek/barion-api/sveltekit` — SvelteKit adapter (`createBarionFromSvelteEnv` from `$env`).
- `@DezBenedek/barion-api/hono` — Hono adapter (`createBarionFromHonoEnv` from `c.env`/process.env).
- `@DezBenedek/barion-api/next` — Next.js App Router adapter (Web-standard, no `next` dep).
- `@DezBenedek/barion-api/express` — Express adapter (bridges `req`/`res`; type-only `express` dep).
- `@DezBenedek/barion-api/fastify` — Fastify adapter (bridges `request`/`reply`; type-only `fastify` dep).
- `@DezBenedek/barion-api/nuxt` — Nuxt/Nitro (h3) adapter (`defineEventHandler`; runtime `h3` peer).
- `@DezBenedek/barion-api/astro` — Astro adapter (structural `APIContext` type, no `astro` dep).

Every adapter exports the same trio: `createBarionFromEnv` (or the framework-named
variant) / `handleBarionWebhook` / `redirectToGateway`, and re-exports the core
types. The webhook handler status policy is identical across adapters:
transient verify failure → 500 (Barion retries); business failure → 200 + logged;
missing `PaymentId` → 400.

### Create a client

```ts
import { createBarion } from '@DezBenedek/barion-api/core';

const barion = createBarion({
	posKey: process.env.BARION_POS_KEY!, // GUID, server-side only
	environment: 'test' // 'test' | 'prod'
	// optional: apiVersion ('v2'), timeout (30000), retries (0), logger, fetch
});
```

### Namespaced API

```
barion.payments.start / startSimple / getState / finalize / cancel / refund
barion.transfers.send / email
barion.bankTransfer.start / complete
barion.bankAccount.update
barion.withdraw
barion.accounts.query
barion.balanceChange.query
barion.statement.download   // returns { data: ArrayBuffer, contentType, status }
barion.healthCheck()
```

### Convenience helpers (small projects)

- `barion.payments.startSimple({ amount, payee, orderNumber, redirectUrl, callbackUrl, ... })`
  — minimal params with sane defaults (`HUF`, `hu-HU`, `Immediate`, guest checkout,
  `FundingSources: ['All']`; `POSTransactionId` defaults to `orderNumber`). Optional
  overrides: `currency`, `locale`, `paymentType`, `guestCheckOut`, `fundingSources`,
  `posTransactionId`, `payerHint`, `items`.
- Status helpers (from `@DezBenedek/barion-api/core`): `isPaidStatus` (Succeeded),
  `isRefundableStatus` (Succeeded | PartiallySucceeded), `isFinalStatus` (terminal),
  `isFailedStatus` (Failed | Cancelled | Expired).
- Webhook convenience callbacks: `onSucceeded` (fires on `Succeeded`) and `onFailed`
  (fires on `Failed`/`Cancelled`/`Expired`), in addition to the always-firing
  `onPayment`. All three are optional. `PartiallySucceeded` triggers `onPayment` only.

Every method has typed request/response types. `fetch` is injectable
(`createBarion({ fetch })`) for testing and runtime portability (edge/Node).

### Errors

- `BarionError` — business error from Barion (HTTP error or non-empty `Errors[]`).
  Has `.status: number` and `.errors: BarionApiError[]`.
- `TransportError` — network/timeout/non-JSON (transient, retryable).

## 3. Integration recipes

### Start a payment + redirect (SvelteKit)

```ts
// src/routes/pay/+server.ts
import { redirectToGateway } from '@DezBenedek/barion-api/sveltekit';
import { barion } from '$lib/server/barion';

export const GET = async () => {
	const res = await barion().payments.start({
		PaymentType: 'Immediate',
		GuestCheckOut: true,
		FundingSources: ['All'],
		Currency: 'HUF',
		Locale: 'hu-HU',
		OrderNumber: 'ORDER-123',
		Transactions: [{ POSTransactionId: 'TX-1', Payee: 'shop@example.com', Total: 1500 }],
		RedirectUrl: 'https://shop.example.com/return',
		CallbackUrl: 'https://shop.example.com/api/barion/webhook'
	});
	redirectToGateway(res); // throws a 303 redirect to GatewayUrl
};
```

### High-level webhook handler (SvelteKit)

```ts
// src/routes/api/barion/webhook/+server.ts
import { handleBarionWebhook } from '@DezBenedek/barion-api/sveltekit';
import { barion } from '$lib/server/barion';

export const POST = (event) =>
	handleBarionWebhook({
		client: barion(), // verifies via GetPaymentState
		onPayment: async ({ paymentState, paymentId }) => {
			if (paymentState.Status === 'Succeeded') await fulfillOrder(paymentId);
		},
		isProcessed: (paymentId) => orderAlreadyFulfilled(paymentId) // idempotency
	})(event);
```

Handler status policy:

- Transient verification failure (network/timeout) → **500** (Barion retries the IPN).
- Business failure (unknown payment, or an error in `onPayment`) → **200** + logged
  (avoids retry storms).
- Missing/invalid `PaymentId` → **400**.

### High-level webhook handler (Hono)

```ts
import { createBarionFromHonoEnv, honoWebhook } from '@DezBenedek/barion-api/hono';

app.post('/api/barion/webhook', async (c) => {
	const barion = createBarionFromHonoEnv(c);
	return honoWebhook({ client: barion, onPayment, isProcessed })(c);
});
```

### Low-level webhook primitives (composable)

```ts
import { parseWebhookRequest, verifyPayment, respondOk } from '@DezBenedek/barion-api/core';

const parsed = await parseWebhookRequest(request); // { paymentId, raw } | null
if (!parsed) return new Response('bad request', { status: 400 });
const state = await verifyPayment(barion, parsed.paymentId); // GetPaymentState
if (state.Status === 'Succeeded') await fulfillOrder(parsed.paymentId);
return respondOk(); // 200 { Status: 'Ok' }
```

### Reservation (2-step) payment

```ts
// 1. Start with Reservation
const { paymentId } = await barion.payments.start({ PaymentType: 'Reservation', ... })
// ... customer pays, funds are RESERVED (not captured) ...

// 2a. Capture (supports partial capture):
await barion.payments.finalize({ PaymentId: paymentId, Transactions: [{ POSTransactionId: 'TX-1', Total: 1500 }] })

// 2b. Or release:
await barion.payments.cancel({ PaymentId: paymentId, Transactions: [{ POSTransactionId: 'TX-1' }] })
```

### Refund

```ts
await barion.payments.refund({
	PaymentId,
	TransactionsToRefund: [{ POSTransactionId: 'TX-1', AmountToRefund: 1500 }]
});
```

## 4. Common pitfalls

- **Never trust the IPN body.** Always verify via `GetPaymentState`. There is no HMAC.
- **`RedirectUrl` ≠ `CallbackUrl`.** `RedirectUrl` is where the _customer's browser_
  goes after paying; `CallbackUrl` is where _Barion's server_ POSTs the IPN. They are
  different and must not be swapped.
- **POSKey is server-side only.** Never put it in client bundles or expose it to the
  browser. Use `$env/dynamic/private` (SvelteKit) or server env (Hono).
- **Sandbox key vs prod key.** The sandbox `POSKey` only works against
  `environment: 'test'`; the production key only against `'prod'`. Mismatching them
  fails with an auth error.
- **Reservation = 2 steps.** `Reservation` payments only reserve funds; you must
  explicitly `finalize` (capture) or `cancel` (release). `Immediate` captures at once.
- **Idempotency.** Barion may send the same IPN more than once. Always check
  `isProcessed(paymentId)` before fulfilling, or you may double-fulfill.
- **Callback URL must be public.** For local dev use a tunnel (e.g. `cloudflared
tunnel`) so Barion can reach your webhook.
- **Currency validation.** Sending an unsupported currency yields a
  `ModelValidationError`. Stick to `HUF`/`EUR`/`USD`/`CZK`.
- **Transients vs business errors.** Only retry on `TransportError` / 5xx. A
  `BarionError` is not retryable (retrying the same bad request wastes effort).

## 5. References

- README: package root (`README.md`).
- Runnable examples: `examples/sveltekit-app`, `examples/hono-app`.
- Types & TSDoc: import from `@DezBenedek/barion-api/core` (editor hover for full signatures).

## 6. Endpoint/field verification note

Some Barion endpoint paths and field names in this package come from API knowledge
and were validated internally (typed request/response + mocked tests). Before going
live, cross-check field names against the live sandbox and adjust if the Barion
response shape differs. The IPN-security rule (verify via `GetPaymentState`) and the
overall flow are stable and authoritative.
