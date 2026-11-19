# AgentLedger

Shared budgets and execution traces for parallel AI agents.

When agents run in parallel, independent spending checks can overcommit a shared budget. AgentLedger explores a reserve → execute → settle model: hold money before work starts, then record actual usage and return the unused hold. An uncertain timeout keeps its hold until usage is confirmed.

**Status: local prototype.** All providers and costs are simulated. There are no real AI API calls or API charges. This is not a provider billing guarantee.

## Implemented

- A React-independent, in-memory Ledger using integer micro-USD.
- Synchronous reservation checks within a single Ledger instance.
- Reservation rejection, settlement, explicit no-charge release, uncertain usage and reconciliation.
- Idempotent settlement, safe-integer validation, full overrun accounting and detached snapshots/events.
- A responsive React dashboard with budget metrics, request states and an ordered event timeline.
- Three deterministic scenarios: budget contention, both requests fit, and uncertain timeout with manual mock resolution.
- Cancellable simulation runs and behavior tests with Vitest.

## Run locally

Use Node.js 22.13+ within the 22.x line, or Node.js 24+ and npm. From the repository root:

```sh
npm --prefix apps/web ci
npm run dev
```

Open the local URL printed by Vite (normally `http://localhost:5173`).

```sh
npm test            # Vitest, one run
npm run test:watch  # Vitest, watch mode
npm run lint       # ESLint
npm run build      # TypeScript + production build
npm run preview    # Serve the production build locally
```

The root scripts forward to the existing application; there is no npm workspace setup or backend.

## Project structure

```text
apps/web/
  src/lib/ledger/         React/DOM-independent accounting and tests
  src/lib/simulation/     Cancellable scenario controller and tests
  src/App.tsx            Dashboard and controller subscription
  src/App.css            Dashboard styling
  src/index.css          Global styling
  package-lock.json      Application dependency lockfile
docs/                    Model, architecture, setup, limits and roadmap
```

Start with [Getting started](docs/getting-started.md), then read the [budget model](docs/budget-model.md), [architecture](docs/architecture.md), [limitations](docs/limitations.md) and [roadmap](docs/roadmap.md).
