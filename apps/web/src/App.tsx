import { useEffect, useState, useSyncExternalStore } from 'react'
import type { LedgerEvent, LedgerRequest } from './lib/ledger'
import { scenarios, SimulationController } from './lib/simulation/controller'
import type { ScenarioId } from './lib/simulation/controller'
import './App.css'

// Formatting only: accounting always uses integer micro-USD.
const usd = (amount: number) =>
  `${amount < 0 ? '−' : ''}$${(Math.abs(amount) / 1_000_000).toFixed(2)}`

const eventLabels = {
  run_started: 'Run started',
  reserved: 'Budget reserved',
  rejected: 'Request rejected',
  settled: 'Usage settled',
  released: 'Budget released',
  uncertain: 'Usage uncertain',
}

function RequestCard({ request, index }: { request: LedgerRequest; index: number }) {
  return (
    <article className="request-card">
      <div className="request-identity">
        <span className="agent-avatar" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <div>
          <h3>{request.agentId}</h3>
          <code>{request.requestId}</code>
        </div>
        <span className={`status status-${request.status}`}>{request.status}</span>
      </div>
      <dl className="request-amounts">
        <div>
          <dt>{request.status === 'rejected' ? 'Requested reservation' : 'Reservation amount'}</dt>
          <dd>{usd(request.reservedAmount)}</dd>
        </div>
        <div>
          <dt>Actual cost</dt>
          <dd>{request.actualCost === undefined ? '—' : usd(request.actualCost)}</dd>
        </div>
      </dl>
      {request.reason && <p className="request-reason">{request.reason}</p>}
    </article>
  )
}

function TimelineEntry({ event }: { event: LedgerEvent }) {
  return (
    <li>
      <span className={`event-dot event-${event.type}`} aria-hidden="true" />
      <div className="event-title">
        <strong>{eventLabels[event.type]}</strong>
        <span>{usd(event.amount)}</span>
      </div>
      <p>{event.agentId ?? 'Session budget initialized'}</p>
      {event.requestId && <code>{event.requestId}</code>}
      {event.reason && <p className="event-reason">{event.reason}</p>}
      <div className="event-meta">
        <span>#{String(event.sequence).padStart(2, '0')}</span>
        <time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleTimeString('en-GB')}</time>
      </div>
    </li>
  )
}

function App() {
  const [controller] = useState(() => new SimulationController())
  const [selected, setSelected] = useState<ScenarioId>('contention')
  const { ledger, events, running, error } = useSyncExternalStore(
    controller.subscribe, controller.getSnapshot,
  )
  useEffect(() => () => controller.cancel(), [controller])

  const scenario = scenarios.find((item) => item.id === selected)!
  const uncertain = ledger.requests.some((request) => request.status === 'uncertain')
  const spentPercent = Math.min(100, ledger.spent / ledger.limit * 100)
  const reservedPercent = Math.min(100 - spentPercent, ledger.reserved / ledger.limit * 100)
  const metrics = [
    { label: 'Budget limit', amount: ledger.limit, caption: 'Session allocation' },
    { label: 'Spent', amount: ledger.spent, caption: 'Confirmed usage' },
    { label: 'Reserved', amount: ledger.reserved, caption: 'Held for pending usage' },
    { label: 'Available', amount: ledger.available, caption: 'Ready for new requests' },
  ]
  const runStatus = running ? 'Simulation running'
    : uncertain ? 'Awaiting reconciliation'
    : ledger.requests.length ? 'Run finished' : 'Ready to run'

  return (
    <div className="app-shell">
      <header className="masthead">
        <a className="brand" href="./" aria-label="AgentLedger home">
          <span className="brand-mark" aria-hidden="true">≋</span>
          AgentLedger <span className="prototype">PROTOTYPE</span>
        </a>
        <span className="simulation-label">
          <span aria-hidden="true">◉</span> Simulation — no real API charges
        </span>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">LOCAL WORKSPACE / OVERVIEW</p>
            <h1>One budget. Every agent.</h1>
            <p className="intro">Shared budgets and execution traces, with every dollar accounted for.</p>
          </div>
          <span className="session-label">{ledger.runId} <span>· In memory</span></span>
        </div>

        <section className="panel budget-panel" aria-labelledby="budget-title">
          <div className="section-heading">
            <h2 id="budget-title">Budget overview</h2>
            <span className="subtle">USD · integer micro-USD accounting</span>
          </div>
          <div className="metrics">
            {metrics.map(({ label, amount, caption }) => (
              <div className={`metric ${label === 'Available' ? 'available' : ''}`} key={label}>
                <span>{label}</span><strong>{usd(amount)}</strong><small>{caption}</small>
              </div>
            ))}
          </div>
          <div
            className="budget-track"
            role="img"
            aria-label={`Spent ${usd(ledger.spent)}, reserved ${usd(ledger.reserved)}, available ${usd(ledger.available)}`}
          >
            <span className="spent-segment" style={{ width: `${spentPercent}%` }} />
            <span className="reserved-segment" style={{ width: `${reservedPercent}%` }} />
          </div>
          <div className="budget-legend">
            <span><i className="spent-key" />Spent</span>
            <span><i className="reserved-key" />Reserved</span>
            <span><i className="available-key" />Available</span>
            <span className="limit-note">Shared across all agents</span>
          </div>
          {ledger.overrun > 0 && (
            <p role="alert" className="error">
              Overrun: {usd(ledger.overrun)}. Actual usage is fully recorded; new requests need sufficient available budget.
            </p>
          )}
        </section>

        <section className="panel scenario-panel" aria-labelledby="scenario-title">
          <div className="scenario-copy">
            <p className="eyebrow">TRY THE LEDGER</p>
            <h2 id="scenario-title">A small simulation. A real budget check.</h2>
            <p>Watch agents reserve, execute, and settle against the same ledger.</p>
          </div>
          <div className="scenario-controls">
            <label htmlFor="scenario">Scenario</label>
            <select
              id="scenario"
              value={selected}
              disabled={running}
              onChange={(event) => {
                controller.reset()
                setSelected(event.target.value as ScenarioId)
              }}
            >
              {scenarios.map((item, index) => (
                <option key={item.id} value={item.id}>{index + 1}. {item.name}</option>
              ))}
            </select>
            <p className="scenario-description">{scenario.description}</p>
            <div className="button-row">
              <button className="primary" disabled={running} onClick={() => { void controller.run(selected) }}>
                {running ? 'Running simulation…' : 'Run simulation'} <span aria-hidden="true">↗</span>
              </button>
              <button onClick={controller.reset}>Reset</button>
            </div>
          </div>
        </section>
        {error && <p role="alert" className="error">{error}</p>}
        {uncertain && (
          <div className="notice">
            <div>
              <strong>Timeout does not mean free.</strong>
              <p>The reservation stays held until usage is confirmed.</p>
            </div>
            <button disabled={running} onClick={controller.resolve}>Resolve mock usage</button>
          </div>
        )}
        <div className="activity-layout">
          <section className="panel requests-panel" aria-labelledby="requests-title">
            <div className="section-heading">
              <h2 id="requests-title">Agent requests <span className="count">{ledger.requests.length}</span></h2>
              <span className="subtle" role="status">{runStatus}</span>
            </div>
            {ledger.requests.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon" aria-hidden="true">⇄</span>
                <h3>Your agents start here</h3>
                <p>Run a scenario to see reservations and actual costs.</p>
                <span className="tiny-label">DETERMINISTIC PROVIDERS · NO API KEYS</span>
              </div>
            ) : (
              <div className="request-list">
                {ledger.requests.map((request, index) => (
                  <RequestCard key={request.requestId} request={request} index={index} />
                ))}
              </div>
            )}
          </section>
          <section className="panel timeline-panel" aria-labelledby="timeline-title">
            <div className="section-heading">
              <h2 id="timeline-title">Event timeline</h2><span className="count">{events.length}</span>
            </div>
            <ol className="timeline">
              {events.map((event) => (
                <TimelineEntry key={`${event.runId}-${event.sequence}`} event={event} />
              ))}
            </ol>
          </section>
        </div>
        <footer>
          <span><span aria-hidden="true">◇</span> Local by design. Transparent by default.</span>
          <span>Single instance · Simulated usage · No persistence</span>
        </footer>
      </main>
    </div>
  )
}
export default App
