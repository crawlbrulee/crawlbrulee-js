/**
 * Verification for async scrape completion webhooks.
 *
 * {@link verifyWebhookSignature} validates the signature crawlbrulee attaches to
 * every webhook delivery. It is a standalone, network-free helper built on Web
 * Crypto (`globalThis.crypto.subtle`) so it runs unchanged on Node.js 22+,
 * browsers, Bun, Deno, and edge runtimes — it never touches `node:crypto`.
 */

/** HTTP header carrying the primary webhook signature (always present). */
export const WEBHOOK_SIGNATURE_HEADER = 'X-Cwbl-Signature'

/**
 * HTTP header carrying a signature produced with the previous signing secret.
 * Present only during a signing-secret rotation grace window.
 */
export const WEBHOOK_SIGNATURE_ROTATED_HEADER = 'X-Cwbl-Signature-Rotated'

/** HTTP header carrying the unique event id, useful for delivery de-duplication. */
export const WEBHOOK_EVENT_ID_HEADER = 'X-Cwbl-Event-Id'

/** Default replay-protection window (seconds) applied to the signed timestamp. */
export const DEFAULT_WEBHOOK_TOLERANCE_SECONDS = 300

/** Which signature header satisfied verification. */
export type WebhookSignatureSource = 'primary' | 'rotated'

/**
 * Why a webhook signature failed to verify.
 *
 * - `missing_signature` — neither the primary nor the rotated header was present.
 * - `malformed_signature` — a header was present but not in the expected
 *   `t=<unix_seconds>,v1=<64_hex>` format.
 * - `timestamp_out_of_tolerance` — the signed timestamp drifted further from now
 *   than `toleranceSeconds` allows (replay protection).
 * - `signature_mismatch` — a well-formed, in-tolerance signature did not match
 *   the one computed from the payload and secret.
 */
export type WebhookVerificationFailureReason =
  | 'missing_signature'
  | 'malformed_signature'
  | 'timestamp_out_of_tolerance'
  | 'signature_mismatch'

/** Result of {@link verifyWebhookSignature}. Verification failure is returned, not thrown. */
export type WebhookVerificationResult =
  | { verified: true; signedWith: WebhookSignatureSource }
  | { verified: false; reason: WebhookVerificationFailureReason }

/** Options for {@link verifyWebhookSignature}. */
export interface VerifyWebhookSignatureOptions {
  /**
   * The raw request body, exactly as received. Pass the bytes/string the server
   * signed — do NOT re-serialize parsed JSON, or the signature will not match.
   */
  payload: string | Uint8Array
  /**
   * The request headers. Accepts a fetch `Headers` instance or a plain object
   * (Express/Node give lowercased keys, values possibly arrays). Lookup is
   * case-insensitive.
   */
  headers: Headers | Record<string, string | string[] | undefined>
  /** The current signing secret (`whsec_…`). */
  secret: string
  /**
   * Replay-protection window in seconds. Defaults to
   * {@link DEFAULT_WEBHOOK_TOLERANCE_SECONDS} (300). Pass `0` (or any falsy
   * value) to disable the timestamp check entirely.
   */
  toleranceSeconds?: number
}

const SIGNATURE_FORMAT = /^t=(\d+),v1=([0-9a-f]{64})$/

interface ParsedSignature {
  timestamp: number
  signature: string
}

/**
 * Verify a crawlbrulee webhook signature against the primary and rotated
 * headers.
 *
 * The signing scheme matches the backend:
 * - the signed payload is `` `${t}.${rawBody}` `` where `t` is the unix-seconds
 *   integer from the header and `rawBody` is the raw request body,
 * - the signature is `HMAC-SHA256(secret, signedPayload)` as lowercase hex,
 * - the header value is `t=<unix_seconds>,v1=<64_hex>`.
 *
 * The supplied `secret` is tried against the primary header first, then the
 * rotated header (which the API emits during a signing-secret rotation grace
 * window). Whichever matches wins, and the result reports which header it was.
 *
 * This NEVER throws on a verification failure — failures are normal control
 * flow and are returned as `{ verified: false, reason }`.
 *
 * @example
 * ```ts
 * const result = await verifyWebhookSignature({
 *   payload: rawBody,
 *   headers: req.headers,
 *   secret: process.env.CRAWLBRULEE_WEBHOOK_SECRET!,
 * })
 * if (!result.verified) return res.status(400).end()
 * ```
 */
export async function verifyWebhookSignature(
  options: VerifyWebhookSignatureOptions
): Promise<WebhookVerificationResult> {
  const { payload, headers, secret } = options
  const toleranceSeconds = options.toleranceSeconds ?? DEFAULT_WEBHOOK_TOLERANCE_SECONDS

  const primaryHeader = getHeader(headers, WEBHOOK_SIGNATURE_HEADER)
  const rotatedHeader = getHeader(headers, WEBHOOK_SIGNATURE_ROTATED_HEADER)

  if (primaryHeader === undefined && rotatedHeader === undefined) {
    return { verified: false, reason: 'missing_signature' }
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  const body = toBytes(payload)
  const key = await importHmacKey(secret)

  // Track the "best" failure reason so the result is informative: a real
  // mismatch should win over a malformed sibling header. Order from least to
  // most specific.
  let failure: WebhookVerificationFailureReason = 'malformed_signature'

  for (const source of ['primary', 'rotated'] as const) {
    const raw = source === 'primary' ? primaryHeader : rotatedHeader
    if (raw === undefined) continue

    const parsed = parseSignatureHeader(raw)
    if (!parsed) {
      // A malformed header can't verify; keep looking at the other one.
      continue
    }

    if (toleranceSeconds && Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
      failure = mostSpecificFailure(failure, 'timestamp_out_of_tolerance')
      continue
    }

    const expected = await computeSignatureHex(key, parsed.timestamp, body)
    if (constantTimeEqualHex(expected, parsed.signature)) {
      return { verified: true, signedWith: source }
    }

    failure = mostSpecificFailure(failure, 'signature_mismatch')
  }

  return { verified: false, reason: failure }
}

/**
 * Rank verification failures so the returned reason reflects the most
 * actionable problem encountered across the two headers.
 */
function mostSpecificFailure(
  current: WebhookVerificationFailureReason,
  candidate: WebhookVerificationFailureReason
): WebhookVerificationFailureReason {
  const rank: Record<WebhookVerificationFailureReason, number> = {
    missing_signature: 0,
    malformed_signature: 1,
    timestamp_out_of_tolerance: 2,
    signature_mismatch: 3,
  }
  return rank[candidate] > rank[current] ? candidate : current
}

/** Case-insensitive header lookup over `Headers` or a plain object. */
function getHeader(
  headers: Headers | Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return headers.get(name) ?? undefined
  }
  const target = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() !== target) continue
    const value = (headers as Record<string, string | string[] | undefined>)[key]
    if (Array.isArray(value)) return value[0]
    return value ?? undefined
  }
  return undefined
}

function parseSignatureHeader(value: string): ParsedSignature | null {
  const match = SIGNATURE_FORMAT.exec(value.trim())
  if (!match) return null
  const timestamp = Number(match[1])
  if (!Number.isSafeInteger(timestamp)) return null
  return { timestamp, signature: match[2]! }
}

function toBytes(payload: string | Uint8Array): Uint8Array {
  return typeof payload === 'string' ? new TextEncoder().encode(payload) : payload
}

/**
 * Web Crypto types, derived from the runtime global so we don't have to pull in
 * the DOM `lib` (the SDK compiles against `lib: ES2022` + `@types/node`).
 */
type SubtleCryptoLike = typeof globalThis.crypto.subtle
type CryptoKeyLike = Awaited<ReturnType<SubtleCryptoLike['importKey']>>

function importHmacKey(secret: string): Promise<CryptoKeyLike> {
  return getSubtle().importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
}

async function computeSignatureHex(
  key: CryptoKeyLike,
  timestamp: number,
  body: Uint8Array
): Promise<string> {
  const prefix = new TextEncoder().encode(`${timestamp}.`)
  const message = new Uint8Array(prefix.length + body.length)
  message.set(prefix, 0)
  message.set(body, prefix.length)
  const digest = await getSubtle().sign('HMAC', key, message)
  return toHex(new Uint8Array(digest))
}

function toHex(bytes: Uint8Array): string {
  let hex = ''
  for (const byte of bytes) {
    hex += byte.toString(16).padStart(2, '0')
  }
  return hex
}

/**
 * Length-checked, constant-time comparison of two lowercase hex strings. Folds
 * every byte into an accumulator with XOR — never early-returns on the first
 * mismatch — so timing does not leak how much of the signature matched.
 */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return diff === 0
}

function getSubtle(): SubtleCryptoLike {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error(
      'Web Crypto (globalThis.crypto.subtle) is not available in this runtime. crawlbrulee webhook verification requires Node.js 22+, Bun, Deno, or a modern browser/edge runtime.'
    )
  }
  return subtle
}
