# Architecture

The prototype keeps the original Vite application at `apps/web`; there is no backend or new monorepo infrastructure.

```text
React dashboard (App.tsx)
    subscribes to / invokes
SimulationController (src/lib/simulation/controller.ts)
    owns one active
Ledger (src/lib/ledger/index.ts)
    returns detached snapshots and ordered events
```

## Ledger

The accounting core imports neither React nor DOM APIs. It owns the budget, request map and ordered history behind private fields. Operations validate money, identity and transition state, prepare events, and commit synchronous accounting updates. Callers own execution and supply confirmed usage. An injectable clock makes event tests deterministic. The core can later move to a standalone package without changing its accounting model.

## Simulation controller

The controller owns the current Ledger, stable subscription snapshot, error state and run status. React consumes it with `useSyncExternalStore`. The subscription snapshot is a presentation cache; Ledger snapshots remain detached from internal accounting.

The contention and both-fit scenarios launch two promise tasks against the same Ledger. Both reservation attempts finish before settlement timers start. The rejected request never retries. The uncertain scenario reserves, marks a timeout uncertain, then attempts another reservation. The resolution button confirms mock usage separately.

An AbortController clears pending timers, resolving cancelled delays normally. A generation token also invalidates queued microtasks and callbacks. Reset aborts the old execution, creates a new Ledger and publishes only its state. Component cleanup cancels pending execution. Each async continuation checks its generation before accounting or publishing. Exceptions become visible errors and stop remaining scenario work.

## Dashboard

`App.tsx` renders amounts, progress segments, request status labels, errors and events from the controller snapshot. It never computes accounting totals from fixtures or changes Ledger internals. CSS provides light styling and a single-column layout on small screens. State labels supplement color. Run and scenario selection are disabled while running; Reset remains available. Money display uses two decimal places because every demo amount is an exact number of cents; the core retains micro-USD precision.

## Tests

Vitest exercises accounting outcomes, atomic invalid operations, numeric boundaries, defensive copies, idempotency, uncertainty, overruns and simulation lifecycle. Controller tests use fake timers, including reset before queued reservation microtasks and reset/unmount cancellation during delays. Manual browser smoke checks should complement these tests; there is no persistent end-to-end automation suite. Automated tests alone do not verify browser interactions or mobile layout.
