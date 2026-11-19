import { describe, expect, it } from 'vitest'
import { Ledger } from './index'

const create = (limit = 1_000_000) => new Ledger('test-run', limit, () => '2026-01-01T00:00:00.000Z')
function unchanged(ledger: Ledger, operation: () => unknown) {
  const before = { snapshot: ledger.snapshot(), events: ledger.events() }
  expect(operation).toThrow()
  expect({ snapshot: ledger.snapshot(), events: ledger.events() }).toEqual(before)
}

describe('Ledger accounting', () => {
  it('admits only one of two asynchronous competing reservations before settlement', async () => {
    const ledger = create()
    const results = await Promise.all(['a', 'b'].map((id) => Promise.resolve().then(() => ledger.reserve(id, id, 600_000))))
    expect(results.map((result) => result.status)).toEqual(['reserved', 'rejected'])
    expect(ledger.snapshot()).toMatchObject({ reserved: 600_000, available: 400_000 })
    ledger.settle('a', 400_000)
    expect(ledger.snapshot()).toMatchObject({ spent: 400_000, reserved: 0, available: 600_000 })
    expect(ledger.snapshot().requests[1].status).toBe('rejected')
  })
  it('fits both requests and returns unused reservations on settlement', () => {
    const ledger = create()
    ledger.reserve('a', 'a', 400_000)
    ledger.reserve('b', 'b', 400_000)
    expect(ledger.snapshot()).toMatchObject({ spent: 0, reserved: 800_000, available: 200_000 })
    ledger.settle('a', 250_000)
    expect(ledger.snapshot()).toMatchObject({ spent: 250_000, reserved: 400_000, available: 350_000 })
    ledger.settle('b', 300_000)
    expect(ledger.snapshot()).toMatchObject({ spent: 550_000, reserved: 0, available: 450_000 })
  })
  it('holds uncertain usage until a confirmed reconciliation', () => {
    const ledger = create()
    ledger.reserve('a', 'a', 600_000)
    ledger.markUncertain('a', 'Timeout; usage unknown')
    expect(ledger.snapshot()).toMatchObject({ reserved: 600_000, spent: 0, available: 400_000 })
    expect(ledger.reserve('b', 'b', 600_000).status).toBe('rejected')
    ledger.resolveUncertain('a', { charged: true, actualCost: 350_000 })
    expect(ledger.snapshot()).toMatchObject({ reserved: 0, spent: 350_000, available: 650_000 })
    const events = ledger.events()
    ledger.resolveUncertain('a', { charged: true, actualCost: 350_000 })
    expect(ledger.events()).toEqual(events)
    unchanged(ledger, () => ledger.resolveUncertain('a', { charged: true, actualCost: 450_000 }))
  })
  it('requires explicit no-charge confirmation for release, including uncertain usage', () => {
    const ledger = create()
    ledger.reserve('a', 'a', 600_000)
    // Exercise JavaScript callers bypassing the TypeScript contract.
    // @ts-expect-error intentional invalid input
    unchanged(ledger, () => ledger.release('a', { charged: true }))
    ledger.markUncertain('a', 'Timeout')
    // @ts-expect-error intentional invalid input
    unchanged(ledger, () => ledger.resolveUncertain('a', {}))
    ledger.resolveUncertain('a', { charged: false })
    expect(ledger.snapshot()).toMatchObject({ spent: 0, reserved: 0, available: 1_000_000 })
    expect(ledger.snapshot().requests[0]).toMatchObject({ status: 'released', actualCost: 0 })
    unchanged(ledger, () => ledger.settle('a', 10))
    ledger.reserve('b', 'b', 400_000)
    ledger.release('b', { charged: false })
    expect(ledger.snapshot().reserved).toBe(0)
  })
  it('makes identical settlements idempotent and rejects conflicts and invalid transitions', () => {
    const ledger = create()
    ledger.reserve('a', 'a', 600_000)
    unchanged(ledger, () => ledger.reserve('b', 'a', 1))
    unchanged(ledger, () => ledger.resolveUncertain('a', { charged: true, actualCost: 1 }))
    ledger.settle('a', 400_000)
    const before = ledger.events()
    ledger.settle('a', 400_000)
    expect(ledger.events()).toEqual(before)
    unchanged(ledger, () => ledger.settle('a', 400_001))
    unchanged(ledger, () => ledger.release('a', { charged: false }))
    unchanged(ledger, () => ledger.markUncertain('a', 'Timeout'))
    unchanged(ledger, () => ledger.settle('missing', 1))
    ledger.reserve('b', 'b', 900_000)
    unchanged(ledger, () => ledger.reserve('b', 'b', 1))
    unchanged(ledger, () => ledger.settle('b', 1))
    unchanged(ledger, () => ledger.release('b', { charged: false }))
    unchanged(ledger, () => ledger.markUncertain('b', 'Timeout'))
  })
  it.each([-1, NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])('rejects invalid money %s without state changes', (value) => {
    expect(() => create(value)).toThrow()
    const ledger = create()
    unchanged(ledger, () => ledger.reserve('a', 'a', value))
    ledger.reserve('a', 'a', 10)
    unchanged(ledger, () => ledger.settle('a', value))
    ledger.markUncertain('a', 'Timeout')
    unchanged(ledger, () => ledger.resolveUncertain('a', { charged: true, actualCost: value }))
  })
  it('rejects empty IDs and reasons without changing accounting or history', () => {
    expect(() => new Ledger(' ', 0)).toThrow()
    const ledger = create()
    unchanged(ledger, () => ledger.reserve('', 'a', 10))
    unchanged(ledger, () => ledger.reserve('a', ' ', 10))
    ledger.reserve('a', 'a', 10)
    unchanged(ledger, () => ledger.markUncertain('a', ''))
  })
  it('accepts zero money and the maximum safe limit', () => {
    const ledger = create(0)
    ledger.reserve('a', 'a', 0)
    ledger.settle('a', 0)
    expect(ledger.snapshot()).toMatchObject({ limit: 0, spent: 0, reserved: 0, available: 0 })
    const max = create(Number.MAX_SAFE_INTEGER)
    max.reserve('a', 'a', Number.MAX_SAFE_INTEGER)
    max.settle('a', Number.MAX_SAFE_INTEGER)
    expect(max.snapshot()).toMatchObject({ available: 0, spent: Number.MAX_SAFE_INTEGER })
  })
  it('detects overflow of spent and the sum of spent plus outstanding holds atomically', () => {
    const ledger = create(Number.MAX_SAFE_INTEGER)
    ledger.reserve('a', 'a', Number.MAX_SAFE_INTEGER - 1)
    ledger.reserve('b', 'b', 1)
    unchanged(ledger, () => ledger.settle('a', Number.MAX_SAFE_INTEGER))
    ledger.settle('a', Number.MAX_SAFE_INTEGER - 1)
    unchanged(ledger, () => ledger.settle('b', 2))
    ledger.settle('b', 1)
    ledger.reserve('c', 'c', 0)
    unchanged(ledger, () => ledger.settle('c', 1))
  })
  it('records full actual cost beyond the reservation and budget, then blocks reservations', () => {
    const ledger = create()
    ledger.reserve('a', 'a', 600_000)
    ledger.reserve('b', 'b', 400_000)
    ledger.settle('a', 1_200_000)
    expect(ledger.snapshot()).toMatchObject({ spent: 1_200_000, reserved: 400_000, available: -600_000, overrun: 600_000 })
    expect(ledger.events().at(-1)?.reason).toContain('exceeded')
    expect(ledger.reserve('c', 'c', 1).status).toBe('rejected')
    ledger.settle('b', 0)
    expect(ledger.snapshot()).toMatchObject({ spent: 1_200_000, reserved: 0, available: -200_000, overrun: 200_000 })
  })
  it('returns detached snapshots, event lists and reserve results with ordered clocked events', () => {
    const ledger = create()
    const result = ledger.reserve('a', 'a', 600_000)
    result.status = 'released'
    const snapshot = ledger.snapshot()
    snapshot.spent = 999
    snapshot.requests[0].reservedAmount = 0
    snapshot.requests.length = 0
    const events = ledger.events()
    events[0].amount = 0
    events.length = 0
    expect(ledger.snapshot()).toMatchObject({ spent: 0, reserved: 600_000, requests: [{ status: 'reserved', reservedAmount: 600_000 }] })
    expect(ledger.events()).toEqual([
      { sequence: 1, timestamp: '2026-01-01T00:00:00.000Z', runId: 'test-run', agentId: null, requestId: null, type: 'run_started', amount: 1_000_000 },
      { sequence: 2, timestamp: '2026-01-01T00:00:00.000Z', runId: 'test-run', agentId: 'a', requestId: 'a', type: 'reserved', amount: 600_000 },
    ])
  })
  it('keeps state unchanged if the injected clock fails validation', () => {
    let now = '2026-01-01T00:00:00Z'
    const ledger = new Ledger('test', 1_000_000, () => now)
    ledger.reserve('a', 'a', 600_000)
    now = 'invalid'
    unchanged(ledger, () => ledger.settle('a', 1))
    unchanged(ledger, () => ledger.release('a', { charged: false }))
    unchanged(ledger, () => ledger.markUncertain('a', 'Timeout'))
    unchanged(ledger, () => ledger.reserve('b', 'b', 1))
  })
})
