# Roadmap

The following items are proposed future work, **not implemented features**. No delivery dates are committed.

1. **Persistence:** durable runs, requests and append-only events; recovery of unresolved holds and migrations.
2. **Multi-process coordination:** transactional reservation operations, shared storage and coordination across workers/services, with explicit failure semantics.
3. **SDK integration:** provider adapters, estimated costs, confirmed usage extraction, retries, provider idempotency keys and reconciliation policies. Keep credentials out of the browser.
4. **Trace replay:** import/export and replay traces to inspect budgeting decisions and reconcile provider evidence.
5. **MCP diagnostics:** expose run state, unresolved usage and budgeting diagnostics through an MCP interface.
6. **Architecture checks:** enforce dependency boundaries around the accounting core and detect integration patterns that bypass reservation or lose usage confirmation.

Any provider billing guarantees or performance claims will require integration evidence and measurements first.
