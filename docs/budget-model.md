# Budget model

## Money

All accounting uses non-negative safe integers in micro-USD: **1 USD = 1,000,000 micro-USD**. Limits, reservation amounts and actual costs allow zero. Negative, fractional, NaN, infinite and unsafe values throw before any state mutation. Combined totals are checked for safe-integer overflow too. UI dollar formatting is presentation only.

```text
available = limit - spent - reserved
exposure overrun = max(0, spent + reserved - limit)
```

`spent` is confirmed cost. `reserved` sums outstanding holds for reserved and uncertain requests. `available` is signed and can become negative after an actual-cost overrun. Overrun includes outstanding holds as well as confirmed spending; after all holds clear, it is confirmed spending beyond the limit.

## Operations and transitions

Create a run with `new Ledger(runId, limit, clock?)`. The optional clock returns a timestamp string; default timestamps use ISO UTC. Treat injected clocks as pure synchronous functions. Events have increasing sequence numbers; timestamps need not be unique or monotonic.

| Operation | Allowed state | Result |
| --- | --- | --- |
| `reserve(agentId, requestId, amount)` | Unused request ID | `reserved` if available covers amount; otherwise `rejected`, with a reason |
| `settle(requestId, actualCost)` | `reserved` or `uncertain` | `completed`: add the full actual cost to spent, remove the entire hold |
| `settle(requestId, sameCost)` | `completed` | No-op: no double charge or extra event |
| `release(requestId, { charged: false })` | `reserved` or `uncertain` | `released`: remove the hold after explicit no-charge confirmation |
| `markUncertain(requestId, reason)` | `reserved` | `uncertain`: keep the full hold |
| `resolveUncertain(requestId, confirmation)` | `uncertain` | Settle confirmed cost or release confirmed no-charge usage |

A charged reconciliation can repeat the same settlement on `completed`; a different cost throws. No-charge release is not repeatable. Rejected and released IDs remain consumed within that run. A completed request cannot be released or marked uncertain. Unknown IDs, duplicate IDs, invalid transitions and invalid confirmations throw without changing state or history. Rejection for insufficient budget is a recorded outcome, rather than a validation exception.

A timeout alone never releases money. `release` and `resolveUncertain` require trusted usage confirmation from their caller; this prototype supplies only mock confirmations.

## Overruns and arithmetic limits

If actual cost exceeds its hold, record the full cost and release the hold normally. Never cap the charge to the hold or budget. A request event explains an exceeded reservation; the snapshot exposes overrun and signed availability. Future reservations require sufficient availability, including zero-amount requests when availability is negative.

If an actual cost would exceed JavaScript's safe-integer range, either by itself or when combined with other spent/held money, the operation throws atomically. The pending reservation remains held. Callers must escalate this numeric-capacity failure; they must not interpret it as a free request. Arbitrary-precision accounting is not implemented.

## Events and concurrency

Events include `sequence`, `timestamp`, `runId`, nullable `agentId`/`requestId`, `type`, integer `amount` and an optional reason. The session initialization event uses null agent/request IDs and records the budget limit. Reserve/rejection events record the requested amount; settlement records actual cost; release/uncertainty records the hold amount. A request's `reservedAmount` is its original requested hold, even after settlement or rejection; the snapshot's `reserved` is the current aggregate hold.

Reservation checks and updates are synchronous with no `await` in between. This protects competing asynchronous tasks sharing **one Ledger instance in one JavaScript process**. Separate instances, workers and processes do not coordinate. There is no distributed lock.

Snapshots, request results and event arrays contain detached copies of internal records. External mutation does not change Ledger state. An idempotent settlement emits no new event.
