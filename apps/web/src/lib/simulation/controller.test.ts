import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SimulationController } from './controller'

describe('simulation lifecycle', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it.each([
    ['contention', 400_000, 600_000, ['completed', 'rejected']],
    ['both-fit', 550_000, 450_000, ['completed', 'completed']],
  ] as const)('runs %s through the real Ledger', async (scenario, spent, available, statuses) => {
    const controller = new SimulationController(10)
    const running = controller.run(scenario)
    await vi.runAllTimersAsync()
    await running
    expect(controller.getSnapshot()).toMatchObject({ running: false, error: null, ledger: { spent, available, reserved: 0 } })
    expect(controller.getSnapshot().ledger.requests.map((request) => request.status)).toEqual(statuses)
  })
  it('holds the timeout reservation until mock resolution', async () => {
    const controller = new SimulationController(10)
    const running = controller.run('uncertain')
    await vi.runAllTimersAsync()
    await running
    expect(controller.getSnapshot().ledger).toMatchObject({ spent: 0, reserved: 600_000, available: 400_000 })
    expect(controller.getSnapshot().ledger.requests.map((request) => request.status)).toEqual(['uncertain', 'rejected'])
    controller.resolve()
    expect(controller.getSnapshot().ledger).toMatchObject({ spent: 350_000, reserved: 0, available: 650_000 })
  })
  it.each(['contention', 'both-fit', 'uncertain'] as const)('reset isolates an in-flight %s run from the next run', async (scenario) => {
    const controller = new SimulationController(10)
    const oldRun = controller.run(scenario)
    await vi.advanceTimersByTimeAsync(0)
    controller.reset()
    const reset = controller.getSnapshot()
    await vi.runAllTimersAsync()
    await oldRun
    expect(controller.getSnapshot()).toEqual(reset)
    expect(reset.ledger.requests).toHaveLength(0)
    expect(reset.events.map((event) => event.type)).toEqual(['run_started'])
    const newRun = controller.run('both-fit')
    await vi.runAllTimersAsync()
    await newRun
    const state = controller.getSnapshot()
    expect(state.ledger.spent).toBe(550_000)
    expect(state.events.every((event) => event.runId === state.ledger.runId)).toBe(true)
  })
  it('keeps a new active run isolated while old callbacks finish cancelling', async () => {
    const controller = new SimulationController(100)
    const oldRun = controller.run('uncertain')
    await vi.advanceTimersByTimeAsync(100)
    expect(controller.getSnapshot().ledger.requests[0].status).toBe('uncertain')
    controller.reset()
    const newRun = controller.run('both-fit')
    const newRunId = controller.getSnapshot().ledger.runId
    await vi.runAllTimersAsync()
    await Promise.all([oldRun, newRun])
    const state = controller.getSnapshot()
    expect(state.ledger).toMatchObject({ runId: newRunId, spent: 550_000, reserved: 0, available: 450_000 })
    expect(state.events).toHaveLength(5)
    expect(state.events.every((event) => event.runId === newRunId)).toBe(true)
    expect(state.events.some((event) => event.type === 'uncertain')).toBe(false)
  })
  it('invalidates microtasks when reset happens before reservation', async () => {
    const controller = new SimulationController(10)
    const running = controller.run('both-fit')
    controller.reset()
    const reset = controller.getSnapshot()
    await vi.runAllTimersAsync()
    await running
    expect(controller.getSnapshot()).toEqual(reset)
  })
  it('cancels on unmount without stale publications or rejected promises', async () => {
    const controller = new SimulationController(10)
    const listener = vi.fn()
    const unsubscribe = controller.subscribe(listener)
    const running = controller.run('both-fit')
    await vi.advanceTimersByTimeAsync(0)
    unsubscribe()
    controller.cancel()
    const cancelled = controller.getSnapshot()
    listener.mockClear()
    await vi.runAllTimersAsync()
    await expect(running).resolves.toBeUndefined()
    expect(controller.getSnapshot()).toEqual(cancelled)
    expect(listener).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })
  it('prevents overlapping simulations and reports resolution errors', async () => {
    const controller = new SimulationController(10)
    const running = controller.run('both-fit')
    const runId = controller.getSnapshot().ledger.runId
    await controller.run('contention')
    expect(controller.getSnapshot().ledger.runId).toBe(runId)
    await vi.runAllTimersAsync()
    await running
    controller.resolve()
    expect(controller.getSnapshot().error).toContain('conflicts')
    controller.reset()
    expect(controller.getSnapshot().error).toBeNull()
  })
})
