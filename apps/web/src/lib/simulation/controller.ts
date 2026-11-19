import { Ledger } from '../ledger'
import type { LedgerEvent, LedgerSnapshot } from '../ledger'

export const scenarios = [
  { id: 'contention', name: 'Budget contention', description: 'Two agents request $0.60 each. Only one reservation fits in a $1.00 budget.' },
  { id: 'both-fit', name: 'Both requests fit', description: 'Two $0.40 reservations share a $1.00 budget. Each settles at its actual cost.' },
  { id: 'uncertain', name: 'Uncertain timeout', description: 'A timeout keeps $0.60 reserved until you confirm the mock usage.' },
] as const
export type ScenarioId = typeof scenarios[number]['id']
export interface SimulationState {
  ledger: LedgerSnapshot
  events: LedgerEvent[]
  running: boolean
  error: string | null
}

/** Cancellation resolves normally, so resetting never creates rejected timer promises. */
function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, milliseconds)
    signal.addEventListener('abort', finish, { once: true })
  })
}

export class SimulationController {
  #generation = 0
  #ledger = new Ledger('run-001', 1_000_000)
  #abort = new AbortController()
  #listeners = new Set<() => void>()
  #state: SimulationState = { ledger: this.#ledger.snapshot(), events: this.#ledger.events(), running: false, error: null }
  readonly #delayMs: number

  constructor(delayMs = 850) { this.#delayMs = delayMs }
  getSnapshot = (): SimulationState => this.#state
  subscribe = (listener: () => void) => {
    this.#listeners.add(listener)
    return () => { this.#listeners.delete(listener) }
  }
  #publish(running: boolean, error: string | null = null) {
    this.#state = { ledger: this.#ledger.snapshot(), events: this.#ledger.events(), running, error }
    this.#listeners.forEach((listener) => listener())
  }
  reset = () => {
    this.#abort.abort()
    this.#abort = new AbortController()
    this.#generation++
    this.#ledger = new Ledger(`run-${String(this.#generation + 1).padStart(3, '0')}`, 1_000_000)
    this.#publish(false)
  }
  cancel = () => {
    this.#abort.abort()
    this.#generation++
    this.#publish(false)
  }
  async run(scenario: ScenarioId): Promise<void> {
    if (this.#state.running) return
    this.reset()
    const generation = this.#generation
    const ledger = this.#ledger
    const signal = this.#abort.signal
    const active = () => !signal.aborted && generation === this.#generation
    this.#publish(true)
    try {
      if (scenario === 'uncertain') {
        ledger.reserve('Research agent', 'req-research', 600_000)
        this.#publish(true)
        await delay(this.#delayMs, signal)
        if (!active()) return
        ledger.markUncertain('req-research', 'Mock provider timed out; charge not yet confirmed')
        this.#publish(true)
        await delay(this.#delayMs, signal)
        if (!active()) return
        ledger.reserve('Review agent', 'req-review', 600_000)
      } else {
        const amount = scenario === 'contention' ? 600_000 : 400_000
        // Both asynchronous tasks attempt reservation before either can settle.
        const requests = await Promise.all([
          Promise.resolve().then(() => active() ? ledger.reserve('Research agent', 'req-research', amount) : null),
          Promise.resolve().then(() => active() ? ledger.reserve('Review agent', 'req-review', amount) : null),
        ])
        if (!active()) return
        this.#publish(true)
        await Promise.all(requests.map(async (request, index) => {
          if (!request || request.status !== 'reserved') return
          await delay(this.#delayMs * (index + 1), signal)
          if (!active()) return
          ledger.settle(request.requestId, scenario === 'contention' ? 400_000 : index === 0 ? 250_000 : 300_000)
          this.#publish(true)
        }))
      }
      if (active()) this.#publish(false)
    } catch (error) {
      if (active()) {
        // Stop sibling tasks too if a simulation operation fails.
        this.#abort.abort()
        this.#publish(false, error instanceof Error ? error.message : 'Simulation failed')
      }
    }
  }
  resolve = () => {
    if (this.#state.running) return
    try {
      this.#ledger.resolveUncertain('req-research', { charged: true, actualCost: 350_000 })
      this.#publish(false)
    } catch (error) {
      this.#publish(false, error instanceof Error ? error.message : 'Reconciliation failed')
    }
  }
}
