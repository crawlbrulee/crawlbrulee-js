/**
 * The user-agent version must match the published package version.
 *
 * `USER_AGENT` spells the version out as a literal, so a release that bumps
 * package.json and forgets it ships a client announcing the previous version —
 * which is exactly what happened here at 0.10.0, and what the python sdk shipped
 * at 0.8.0 while still reporting 0.7.0. Nothing else compares the two, and the
 * mismatch is invisible from inside: every test passes, the build is clean, and
 * the only evidence is in our own request logs, attributing traffic to a version
 * that was never released.
 */
import { describe, expect, test } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { USER_AGENT } from '../src/config'

const packageVersion = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../package.json'), 'utf8')
).version as string

describe('USER_AGENT', () => {
  test('reports the version in package.json', () => {
    expect(USER_AGENT).toContain(`/${packageVersion} `)
  })

  test('is the full shape a server can attribute traffic with', () => {
    expect(USER_AGENT).toBe(`@crawlbrulee/sdk/${packageVersion} (node)`)
  })
})
