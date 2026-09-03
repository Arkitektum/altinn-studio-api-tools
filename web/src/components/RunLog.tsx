import { useState } from 'react';
import { prettyJson } from '../lib/format';
import { Panel } from './Panel';
import type { RunResult, RunStep } from '../types';

interface RunLogProps {
  result: RunResult | null;
  running: boolean;
}

export function RunLog({ result, running }: RunLogProps) {
  return (
    <Panel
      title="Run log"
      aside={
        running ? (
          <span className="badge">
            <span className="led led--warn led--live" />
            running
          </span>
        ) : result ? (
          <span className={`badge ${result.ok ? 'badge--ok' : 'badge--bad'}`}>
            {result.steps.length} steps
          </span>
        ) : undefined
      }
    >
      {!result && !running && (
        <div className="log-empty">
          <strong>No run yet</strong>
          Every request this tool makes to Altinn is recorded here: method, URL, status, timing, and
          both bodies.
        </div>
      )}

      {result && (
        <>
          <Verdict result={result} />
          <div className="tape">
            {result.steps.map((step) => (
              <Step key={step.index} step={step} />
            ))}
          </div>
        </>
      )}
    </Panel>
  );
}

function Verdict({ result }: { result: RunResult }) {
  return (
    <div className={`verdict ${result.ok ? 'verdict--ok' : 'verdict--bad'}`}>
      <div className="verdict__title">
        <span className={`led ${result.ok ? 'led--ok' : 'led--bad'}`} />
        {result.ok ? 'Posted' : 'Failed'}
      </div>

      {result.failedAt && (
        <div className="notice notice--bad" style={{ marginBottom: 10 }}>
          {result.failedAt}
        </div>
      )}

      <dl className="verdict__rows">
        <dt>Mode</dt>
        <dd>{result.mode}</dd>
        {result.instanceOwnerPartyId && (
          <>
            <dt>Party</dt>
            <dd>{result.instanceOwnerPartyId}</dd>
          </>
        )}
        {result.instanceGuid && (
          <>
            <dt>Instance</dt>
            <dd>{result.instanceGuid}</dd>
          </>
        )}
        <dt>Total</dt>
        <dd>{result.steps.reduce((sum, step) => sum + step.durationMs, 0)} ms</dd>
      </dl>

      {result.instanceUrl && (
        <div style={{ marginTop: 10 }}>
          <a href={result.instanceUrl} target="_blank" rel="noreferrer">
            Open instance in the app →
          </a>
        </div>
      )}
    </div>
  );
}

function Step({ step }: { step: RunStep }) {
  const [open, setOpen] = useState(!step.ok);
  const hasDetail = step.requestPreview !== undefined || step.response !== undefined;

  return (
    <div className="step">
      <div className="step__head">
        <span className="step__name">{step.name}</span>
        <span className="spacer" />
        {step.status !== null && (
          <span className={`step__status ${step.ok ? 'step__status--ok' : 'step__status--bad'}`}>
            {step.status}
          </span>
        )}
        <span className="step__status">{step.durationMs} ms</span>
      </div>

      {step.url !== '-' && (
        <div className="step__url">
          {step.method} {step.url}
        </div>
      )}

      {step.error && (
        <div className="notice notice--bad" style={{ marginTop: 7 }}>
          {step.error}
        </div>
      )}

      {hasDetail && (
        <>
          <button type="button" className="step__toggle" onClick={() => setOpen(!open)}>
            {open ? 'Hide bodies' : 'Show bodies'}
          </button>
          {open && (
            <>
              {step.requestPreview !== undefined && (
                <>
                  <div className="dump__label">Request</div>
                  <pre className="dump">{step.requestPreview}</pre>
                </>
              )}
              {step.response !== undefined && step.response !== null && (
                <>
                  <div className="dump__label">Response</div>
                  <pre className="dump">{prettyJson(step.response)}</pre>
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
