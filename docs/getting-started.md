# Getting started

## Install and run

Prerequisites: Node.js 22.13+ within the 22.x line, or Node.js 24+ and npm.

From the repository root:

```sh
npm --prefix apps/web ci
npm run dev
```

Open the local URL printed by Vite. No API keys, environment variables, AWS setup or backend are needed. Refreshing the page discards the in-memory run.

Alternatively, use `cd apps/web`, `npm ci`, then `npm run dev`. The application lockfile is `apps/web/package-lock.json`. The root package only forwards scripts and has no runtime dependencies.

## Explore the scenarios

1. **Budget contention:** select scenario 1 and click **Run simulation**. Two asynchronous tasks request $0.60 each from a $1.00 session. One is rejected before any settlement. The accepted request settles at $0.40. Final spent: $0.40; reserved: $0.00; available: $0.60. The rejected request does not retry.
2. **Both requests fit:** select scenario 2 and run. Both $0.40 holds are accepted. Actual costs are $0.25 and $0.30. Final spent: $0.55; reserved: $0.00; available: $0.45.
3. **Uncertain timeout:** select scenario 3 and run. A $0.60 hold remains after timeout. Another $0.60 request is rejected. Click **Resolve mock usage** after the simulation finishes to confirm $0.35 actual cost. Final spent: $0.35; reserved: $0.00; available: $0.65.

**Reset** cancels pending work and creates a fresh $1.00 run. Changing scenarios also resets. Starting another simulation creates a fresh run; running simulations cannot overlap. The timeline contains only the current run. Demo delays have no role in accounting.

## Validate

From the root:

```sh
npm test
npm run lint
npm run build
npm run preview
```

Tests use an injected clock and fake timers. No network requests to providers are needed. `npm run test:watch` starts interactive Vitest watch mode.
