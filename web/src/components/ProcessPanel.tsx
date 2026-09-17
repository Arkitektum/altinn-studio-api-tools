import { processLabel } from "../lib/format";
import { advanceBody, advanceInApp, advanceLabel } from "../lib/processAction";
import { useTarget } from "../session";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { ProcessSummary } from "../types";
import { Icon } from "./Icon";

interface ProcessPanelProps {
    /** Why the panel cannot be used yet, or null when it can. See lib/readiness.ts. */
    notReady: string | null;
    /** Null until the instance has been read, which the panel says it is waiting for. */
    process: ProcessSummary | null;
    onAdvance: () => void;
    busy: boolean;
    hasToken: boolean;
    error: unknown;
}

/** Timestamps come back as ISO. Local time is what you compare against your own clock. */
function describeMoment(value: string | null): string {
    if (!value) return "-";
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleString("nb");
}

export function ProcessPanel({ notReady, process, onAdvance, busy, hasToken, error }: ProcessPanelProps) {
    const { instance, org, app, partyId, instanceGuid } = useTarget();
    /*
     * Where the instance stands is the instance read's to say, so until it has there is nothing to
     * show. Returned early rather than guarded field by field: the panel is about one answer, and
     * half of it is not a state worth rendering.
     */
    if (!process) {
        return (
            <Panel id="panel-process" notReady={notReady ?? "Reading the instance…"} tone="process" title="Process">
                {null}
            </Panel>
        );
    }

    const ended = process.ended !== null;
    const inApp = advanceInApp(process.taskType);
    const canAdvance = hasToken && !ended && Boolean(org && app && partyId && instanceGuid);

    return (
        <Panel
            id="panel-process"
            notReady={notReady}
            tone="process"
            title="Process"
            icon="flow"
            aside={
                <span className="badge">
                    <span className={`led ${ended ? "led--ok" : "led--warn"}`} aria-hidden="true" />
                    {processLabel(process)}
                </span>
            }
        >
            <dl className="claims">
                <dt>Current task</dt>
                <dd>{process.currentTask ?? (ended ? "none, the process has ended" : "none")}</dd>
                {process.taskType && (
                    <>
                        <dt>Task type</dt>
                        <dd>{process.taskType}</dd>
                    </>
                )}
                <dt>Started</dt>
                <dd>{describeMoment(process.started)}</dd>
                {ended && (
                    <>
                        <dt>Ended</dt>
                        <dd>
                            {describeMoment(process.ended)}
                            {process.endEvent ? ` · ${process.endEvent}` : ""}
                        </dd>
                    </>
                )}
            </dl>

            {/* An ended process has nowhere to go, so the button would only ever 409. */}
            {ended ? (
                <p className="field__hint" style={{ marginTop: 12 }}>
                    The process has ended, so there is no next task. Post to a new instance to walk it again.
                </p>
            ) : (
                <>
                    <div className="row" style={{ marginTop: 12 }}>
                        {/*
                         * Named after what it does to the form rather than after what it does to
                         * the process: moving a data task on is how a form is signed and
                         * submitted, and "advance the process" only ever described the request.
                         */}
                        <button type="button" className="btn btn--put" onClick={onAdvance} disabled={busy || !canAdvance}>
                            {busy ? <span className="btn__spinner" /> : <Icon name="flow" />}
                            {advanceLabel(process.taskType)}
                        </button>
                    </div>
                    {/*
                     * The request is still spelled out underneath, because the button now says
                     * what it means rather than what it sends. The body is part of that: it is
                     * what Altinn authorises against, the action for the task type. A task type
                     * this does not recognise sends `{}` and leaves the choice to Altinn.
                     */}
                    <p className="field__hint" style={{ marginTop: 8 }}>
                        {inApp ? `This is the same step as ${inApp}. ` : ""}
                        Moves the instance out of {process.currentTask ? <strong>{process.currentTask}</strong> : "the current task"}, and the app
                        validates first, so it fails while validation does not pass.
                        <br />
                        <span className="method method--put">PUT</span> {instance}/process/next
                        <br />
                        {advanceBody(process.taskType)}
                    </p>
                </>
            )}

            {error ? (
                <div style={{ marginTop: 12 }}>
                    <ErrorNotice error={error} />
                </div>
            ) : null}
        </Panel>
    );
}
