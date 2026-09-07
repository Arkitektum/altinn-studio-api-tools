import { useState } from "react";
import { prettyJson } from "../lib/format";
import { Panel } from "./Panel";
import type { LogResult, RunStep } from "../types";

interface RunLogProps {
    result: LogResult | null;
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
                    <span className={`badge ${result.ok ? "badge--ok" : "badge--bad"}`}>
                        {result.steps.length} {result.steps.length === 1 ? "step" : "steps"}
                    </span>
                ) : undefined
            }
        >
            {!result && !running && (
                <div className="log-empty">
                    <strong>No requests yet</strong>
                    Every request this tool makes to Altinn is recorded here: method, URL, status, timing, and both bodies.
                </div>
            )}

            {result && (
                <>
                    <Verdict result={result} />
                    <div className="tape">
                        {result.steps.map((step, position) => (
                            <Step key={`${position}-${step.name}`} step={step} />
                        ))}
                    </div>
                </>
            )}
        </Panel>
    );
}

function Verdict({ result }: { result: LogResult }) {
    const totalMs = result.steps.reduce((sum, step) => sum + step.durationMs, 0);

    return (
        <div className={`verdict ${result.ok ? "verdict--ok" : "verdict--bad"}`}>
            <div className="verdict__title">
                <span className={`led ${result.ok ? "led--ok" : "led--bad"}`} />
                {result.ok ? result.title : "Failed"}
            </div>

            {result.failedAt && (
                <div className="notice notice--bad" style={{ marginBottom: 10 }}>
                    {result.failedAt}
                </div>
            )}

            <dl className="verdict__rows">
                {result.rows.map((row) => (
                    <div key={row.label} style={{ display: "contents" }}>
                        <dt>{row.label}</dt>
                        <dd data-tone={row.tone}>{row.value}</dd>
                    </div>
                ))}
                <dt>Total</dt>
                <dd>{totalMs} ms</dd>
            </dl>

            {result.instanceUrl && (
                <div style={{ marginTop: 10 }}>
                    <a href={result.instanceUrl} target="_blank" rel="noreferrer">
                        Open instance in the app
                    </a>
                </div>
            )}
        </div>
    );
}

/** 2xx reads as fine, 3xx as informational, 4xx as the request, 5xx as the app. */
function statusTone(status: number): "ok" | "info" | "warn" | "bad" {
    if (status < 300) return "ok";
    if (status < 400) return "info";
    if (status < 500) return "warn";
    return "bad";
}

function Step({ step }: { step: RunStep }) {
    const [open, setOpen] = useState(!step.ok);
    const hasDetail = step.requestPreview !== undefined || step.response !== undefined;

    return (
        <div className="step">
            <div className="step__head">
                <span className="step__name">{step.name}</span>
                <span className="spacer" />
                {step.status !== null && <span className={`step__status step__status--${statusTone(step.status)}`}>{step.status}</span>}
                <span className="step__status">{step.durationMs} ms</span>
            </div>

            {step.url !== "-" && (
                <div className="step__url">
                    <span className={`step__method step__method--${step.method.toLowerCase()}`}>{step.method}</span> {step.url}
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
                        {open ? "Hide bodies" : "Show bodies"}
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
