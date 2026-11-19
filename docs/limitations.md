# Limitations

- **Prototype:** all providers, execution outcomes and costs are deterministic mocks. No real model API is integrated.
- **In-memory:** refresh, Reset or closing the page discards state. There is no storage, recovery or durable audit trail.
- **Single instance, single process:** synchronous reservations coordinate only users of one Ledger in one JavaScript process. Separate tabs, workers, instances or processes can independently overcommit the same conceptual budget.
- **No provider billing guarantee:** reserved amounts are estimates. Actual usage can exceed them and the full charge is recorded. Unknown usage stays reserved until the caller confirms the result. A future provider adapter must establish reliable usage reconciliation.
- **Finite integer capacity:** all money and combined exposure must fit JavaScript safe integers. Overflow throws without changing accounting; it requires caller intervention, not silent truncation.
- **Presentation precision:** the demo formats dollars to cents. The core supports micro-USD; future arbitrary inputs may need higher display precision.
- **No production controls:** authentication, access controls, multi-currency accounting, provider cancellation and provider idempotency are outside this MVP. Controller cancellation stops local callbacks, not remote execution.
- **No historical run browser:** starting or resetting replaces the displayed run. Event ordering is local sequence ordering, not distributed causal ordering.

There are no measured performance benchmarks or verified cost-saving claims for this prototype.
