/** In-memory accounting. Atomic only within one Ledger in one JS process. */
export type RequestStatus = 'reserved' | 'completed' | 'rejected' | 'uncertain' | 'released'
export interface LedgerRequest {
  agentId: string
  requestId: string
  reservedAmount: number
  actualCost?: number
  status: RequestStatus
  reason?: string
}
export type EventType = 'run_started' | 'reserved' | 'rejected' | 'settled' | 'released' | 'uncertain'
export interface LedgerEvent {
  sequence: number
  timestamp: string
  runId: string
  agentId: string | null
  requestId: string | null
  type: EventType
  amount: number
  reason?: string
}
export interface LedgerSnapshot {
  runId: string
  limit: number
  spent: number
  reserved: number
  available: number
  overrun: number
  requests: LedgerRequest[]
}
export type UsageConfirmation = { charged: true; actualCost: number } | { charged: false }

function money(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer in micro-USD`)
  }
}
function identifier(value: string, label: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must not be empty`)
}
function add(a: number, b: number) {
  const result = a + b
  if (!Number.isSafeInteger(result)) throw new Error('Money total exceeds safe integer range')
  return result
}

export class Ledger {
  readonly #runId: string
  readonly #limit: number
  readonly #clock: () => string
  #spent = 0
  #reserved = 0
  #requests = new Map<string, LedgerRequest>()
  #events: LedgerEvent[] = []

  constructor(runId: string, limit: number, clock: () => string = () => new Date().toISOString()) {
    identifier(runId, 'Run ID')
    money(limit, 'Budget limit')
    this.#runId = runId
    this.#limit = limit
    this.#clock = clock
    this.#events.push(this.#event('run_started', limit))
  }

  #event(type: EventType, amount: number, request?: LedgerRequest, reason?: string): LedgerEvent {
    // Prepare the event before mutating accounting, including a potentially throwing clock.
    const timestamp = this.#clock()
    if (typeof timestamp !== 'string' || !Number.isFinite(Date.parse(timestamp))) {
      throw new Error('Clock must return a valid timestamp string')
    }
    return {
      sequence: this.#events.length + 1, timestamp, runId: this.#runId,
      agentId: request?.agentId ?? null, requestId: request?.requestId ?? null,
      type, amount, ...(reason === undefined ? {} : { reason }),
    }
  }

  reserve(agentId: string, requestId: string, amount: number): LedgerRequest {
    identifier(agentId, 'Agent ID')
    identifier(requestId, 'Request ID')
    money(amount, 'Reserve amount')
    if (this.#requests.has(requestId)) throw new Error(`Request ID already used: ${requestId}`)
    const available = this.#limit - this.#spent - this.#reserved
    const accepted = amount <= available
    const reason = accepted ? undefined : `Insufficient budget: requested ${amount} micro-USD; available ${available} micro-USD`
    const request: LedgerRequest = { agentId, requestId, reservedAmount: amount, status: accepted ? 'reserved' : 'rejected', ...(reason ? { reason } : {}) }
    const nextReserved = accepted ? add(this.#reserved, amount) : this.#reserved
    add(this.#spent, nextReserved)
    const event = this.#event(accepted ? 'reserved' : 'rejected', amount, request, reason)
    // Synchronous check + commit with no await; injected clocks must be pure.
    this.#requests.set(requestId, request)
    this.#reserved = nextReserved
    this.#events.push(event)
    return { ...request }
  }

  #request(requestId: string) {
    const request = this.#requests.get(requestId)
    if (!request) throw new Error(`Unknown request: ${requestId}`)
    return request
  }

  settle(requestId: string, actualCost: number): void {
    money(actualCost, 'Actual cost')
    const request = this.#request(requestId)
    if (request.status === 'completed') {
      if (request.actualCost === actualCost) return
      throw new Error('Settlement conflicts with the recorded actual cost')
    }
    if (request.status !== 'reserved' && request.status !== 'uncertain') throw new Error(`Cannot settle a ${request.status} request`)
    const spent = add(this.#spent, actualCost)
    const reserved = this.#reserved - request.reservedAmount
    add(spent, reserved)
    const reason = actualCost > request.reservedAmount ? 'Actual cost exceeded reservation; full cost recorded' : undefined
    const event = this.#event('settled', actualCost, request, reason)
    this.#spent = spent
    this.#reserved = reserved
    this.#requests.set(requestId, { ...request, status: 'completed', actualCost, reason })
    this.#events.push(event)
  }

  release(requestId: string, confirmation: { charged: false }): void {
    if (!confirmation || confirmation.charged !== false) throw new Error('Release requires confirmation that the request was not charged')
    const request = this.#request(requestId)
    if (request.status !== 'reserved' && request.status !== 'uncertain') throw new Error(`Cannot release a ${request.status} request`)
    const reason = 'Confirmed no charge'
    const event = this.#event('released', request.reservedAmount, request, reason)
    this.#reserved -= request.reservedAmount
    this.#requests.set(requestId, { ...request, status: 'released', actualCost: 0, reason })
    this.#events.push(event)
  }

  markUncertain(requestId: string, reason: string): void {
    identifier(reason, 'Uncertainty reason')
    const request = this.#request(requestId)
    if (request.status !== 'reserved') throw new Error(`Cannot mark a ${request.status} request uncertain`)
    const event = this.#event('uncertain', request.reservedAmount, request, reason)
    this.#requests.set(requestId, { ...request, status: 'uncertain', reason })
    this.#events.push(event)
  }

  resolveUncertain(requestId: string, confirmation: UsageConfirmation): void {
    const request = this.#request(requestId)
    if (request.status !== 'uncertain' && request.status !== 'completed') throw new Error(`Cannot reconcile a ${request.status} request`)
    if (confirmation?.charged === true) this.settle(requestId, confirmation.actualCost)
    else if (confirmation?.charged === false) this.release(requestId, confirmation)
    else throw new Error('Resolution requires a confirmed usage result')
  }

  snapshot(): LedgerSnapshot {
    return {
      runId: this.#runId, limit: this.#limit, spent: this.#spent, reserved: this.#reserved,
      available: this.#limit - this.#spent - this.#reserved,
      overrun: Math.max(0, this.#spent + this.#reserved - this.#limit),
      requests: [...this.#requests.values()].map((request) => ({ ...request })),
    }
  }

  events(): LedgerEvent[] { return this.#events.map((event) => ({ ...event })) }
}
