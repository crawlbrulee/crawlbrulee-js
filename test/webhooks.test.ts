import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CrawlbruleeError,
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_SIGNATURE_ROTATED_HEADER,
  verifyWebhookSignature,
  type ScrapeCompleteWebhook,
} from '../src/index.js'

import { buildClient, createFetchQueue, jsonResponse, lastCallOf } from './helpers.js'

/**
 * Compute a webhook signature header the same way the backend does:
 * `t=<unix_seconds>,v1=<hex(HMAC-SHA256(secret, `${t}.${body}`))>`.
 */
async function signWebhook(secret: string, timestamp: number, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const digest = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${body}`)
  )
  const hex = Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
  return `t=${timestamp},v1=${hex}`
}

const SECRET = 'whsec_test_current'
const OLD_SECRET = 'whsec_test_previous'
const NOW_SECONDS = 1_700_000_000
const BODY = JSON.stringify({
  event_id: 'evt_1',
  timestamp: '2026-06-13T12:00:00.000Z',
  event: 'scrape.complete',
  data: { job_id: 'job-1', status: 'success', url: 'https://example.com/', completed_at: 'x' },
})

describe('verifyWebhookSignature', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW_SECONDS * 1000)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('verifies a valid primary signature (real round-trip)', async () => {
    const sig = await signWebhook(SECRET, NOW_SECONDS, BODY)

    const result = await verifyWebhookSignature({
      payload: BODY,
      headers: { [WEBHOOK_SIGNATURE_HEADER]: sig },
      secret: SECRET,
    })

    expect(result).toEqual({ verified: true, signedWith: 'primary' })
  })

  it('verifies via the rotated header when the primary was signed with a different secret', async () => {
    // Receiver still holds OLD_SECRET; primary is signed with the new secret it
    // does not yet know, while the rotated header is signed with OLD_SECRET.
    const primary = await signWebhook(SECRET, NOW_SECONDS, BODY)
    const rotated = await signWebhook(OLD_SECRET, NOW_SECONDS, BODY)

    const result = await verifyWebhookSignature({
      payload: BODY,
      headers: {
        [WEBHOOK_SIGNATURE_HEADER]: primary,
        [WEBHOOK_SIGNATURE_ROTATED_HEADER]: rotated,
      },
      secret: OLD_SECRET,
    })

    expect(result).toEqual({ verified: true, signedWith: 'rotated' })
  })

  it('verifies via the rotated header when the primary header is absent', async () => {
    const rotated = await signWebhook(OLD_SECRET, NOW_SECONDS, BODY)

    const result = await verifyWebhookSignature({
      payload: BODY,
      headers: { [WEBHOOK_SIGNATURE_ROTATED_HEADER]: rotated },
      secret: OLD_SECRET,
    })

    expect(result).toEqual({ verified: true, signedWith: 'rotated' })
  })

  it('fails with signature_mismatch on a tampered body', async () => {
    const sig = await signWebhook(SECRET, NOW_SECONDS, BODY)

    const result = await verifyWebhookSignature({
      payload: `${BODY} `, // one extra byte
      headers: { [WEBHOOK_SIGNATURE_HEADER]: sig },
      secret: SECRET,
    })

    expect(result).toEqual({ verified: false, reason: 'signature_mismatch' })
  })

  it('fails with signature_mismatch on the wrong secret', async () => {
    const sig = await signWebhook(SECRET, NOW_SECONDS, BODY)

    const result = await verifyWebhookSignature({
      payload: BODY,
      headers: { [WEBHOOK_SIGNATURE_HEADER]: sig },
      secret: 'whsec_wrong',
    })

    expect(result).toEqual({ verified: false, reason: 'signature_mismatch' })
  })

  it('fails with malformed_signature on a badly-formatted header', async () => {
    const result = await verifyWebhookSignature({
      payload: BODY,
      headers: { [WEBHOOK_SIGNATURE_HEADER]: 'not-a-signature' },
      secret: SECRET,
    })

    expect(result).toEqual({ verified: false, reason: 'malformed_signature' })
  })

  it('fails with missing_signature when neither header is present', async () => {
    const result = await verifyWebhookSignature({
      payload: BODY,
      headers: {},
      secret: SECRET,
    })

    expect(result).toEqual({ verified: false, reason: 'missing_signature' })
  })

  it('rejects a timestamp outside the tolerance window', async () => {
    const stale = NOW_SECONDS - 301 // default tolerance is 300s
    const sig = await signWebhook(SECRET, stale, BODY)

    const result = await verifyWebhookSignature({
      payload: BODY,
      headers: { [WEBHOOK_SIGNATURE_HEADER]: sig },
      secret: SECRET,
    })

    expect(result).toEqual({ verified: false, reason: 'timestamp_out_of_tolerance' })
  })

  it('verifies the same stale-timestamp payload when toleranceSeconds is 0', async () => {
    const stale = NOW_SECONDS - 10_000
    const sig = await signWebhook(SECRET, stale, BODY)

    const result = await verifyWebhookSignature({
      payload: BODY,
      headers: { [WEBHOOK_SIGNATURE_HEADER]: sig },
      secret: SECRET,
      toleranceSeconds: 0,
    })

    expect(result).toEqual({ verified: true, signedWith: 'primary' })
  })

  it('accepts a fetch Headers instance (case-insensitive)', async () => {
    const sig = await signWebhook(SECRET, NOW_SECONDS, BODY)
    const headers = new Headers()
    headers.set(WEBHOOK_SIGNATURE_HEADER, sig)

    const result = await verifyWebhookSignature({ payload: BODY, headers, secret: SECRET })

    expect(result).toEqual({ verified: true, signedWith: 'primary' })
  })

  it('accepts a plain lowercased header object (Express/Node shape)', async () => {
    const sig = await signWebhook(SECRET, NOW_SECONDS, BODY)

    const result = await verifyWebhookSignature({
      payload: BODY,
      headers: { 'x-cwbl-signature': sig },
      secret: SECRET,
    })

    expect(result).toEqual({ verified: true, signedWith: 'primary' })
  })

  it('accepts header values delivered as string arrays', async () => {
    const sig = await signWebhook(SECRET, NOW_SECONDS, BODY)

    const result = await verifyWebhookSignature({
      payload: BODY,
      headers: { 'x-cwbl-signature': [sig] },
      secret: SECRET,
    })

    expect(result).toEqual({ verified: true, signedWith: 'primary' })
  })

  it('verifies a raw Uint8Array payload', async () => {
    const sig = await signWebhook(SECRET, NOW_SECONDS, BODY)

    const result = await verifyWebhookSignature({
      payload: new TextEncoder().encode(BODY),
      headers: { [WEBHOOK_SIGNATURE_HEADER]: sig },
      secret: SECRET,
    })

    expect(result).toEqual({ verified: true, signedWith: 'primary' })
  })
})

describe('Crawlbrulee.fetchScrapeResultFromWebhook', () => {
  function webhook(overrides: Partial<ScrapeCompleteWebhook['data']> = {}): ScrapeCompleteWebhook {
    return {
      event_id: 'evt_1',
      timestamp: '2026-06-13T12:00:00.000Z',
      event: 'scrape.complete',
      data: {
        job_id: 'job-42',
        status: 'success',
        url: 'https://example.com/',
        completed_at: '2026-06-13T12:00:00.000Z',
        response_meta: {
          usage: { credits: 1, engine: 'text', proxy: 'basic', screenshot_slices: 0 },
        },
        ...overrides,
      },
    }
  }

  it('fetches the result for a success webhook', async () => {
    const q = createFetchQueue()
    q.enqueue(jsonResponse({ url: 'https://example.com/', markdown: '# done' }))
    const client = buildClient(q.fetch)

    const res = await client.fetchScrapeResultFromWebhook(webhook())

    expect(lastCallOf(q.mock).url).toBe('https://api.test.example/api/scrape/result/job-42')
    expect(res.markdown).toBe('# done')
  })

  it('throws with the failure message for a failed webhook', async () => {
    const client = buildClient(createFetchQueue().fetch)

    await expect(
      client.fetchScrapeResultFromWebhook(webhook({ status: 'failed', error: 'antibot blocked' }))
    ).rejects.toMatchObject({
      name: 'CrawlbruleeError',
      errorName: 'job_failed',
      message: 'antibot blocked',
    })
  })

  it('throws for a cancelled webhook', async () => {
    const client = buildClient(createFetchQueue().fetch)

    await expect(
      client.fetchScrapeResultFromWebhook(webhook({ status: 'cancelled' }))
    ).rejects.toMatchObject({
      name: 'CrawlbruleeError',
      errorName: 'client_closed_request',
    })
  })

  it('throws on a non-scrape.complete event', async () => {
    const client = buildClient(createFetchQueue().fetch)
    const bogus = { ...webhook(), event: 'other.event' } as unknown as ScrapeCompleteWebhook

    await expect(client.fetchScrapeResultFromWebhook(bogus)).rejects.toBeInstanceOf(
      CrawlbruleeError
    )
  })
})
