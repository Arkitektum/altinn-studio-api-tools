import { processLabel } from "../lib/format";
import { advanceBody } from "../lib/processAction";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { ProcessSummary } from "../types";

interface ProcessPanelProps {
    appHost: string;
    org: string;
    app: string;
    instanceOwnerPartyId: string;
    instanceGuid: string;
    process: ProcessSummary;
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

export function ProcessPanel({
    appHost,
    org,
    app,
    instanceOwnerPartyId,
    instanceGuid,
    process,
    onAdvance,
    busy,
    hasToken,
    error
}: ProcessPanelProps) {
    const ended = process.ended !== null;
    const base = `${appHost}/${org || "{org}"}/${app || "{app}"}`;
    const canAdvance = hasToken && !ended && Boolean(org && app && instanceOwnerPartyId && instanceGuid);

    return (
        <Panel
            title="Process"
            aside={
                <span className="badge">
                    <span className={`led ${ended ? "led--ok" : "led--warn"}`} />
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
                        <button type="button" className="btn btn--put" onClick={onAdvance} disabled={busy || !canAdvance}>
                            {busy && <span className="btn__spinner" />}
                            Advance process
                        </button>
                    </div>
                    {/*
                     * The body is shown as well as the URL, because it is the body that decides
                     * what Altinn authorises: the action for the task type, `sign` on a signing
                     * task. A task type this does not recognise sends `{}` and leaves the choice
                     * to Altinn, which the preview then says plainly.
                     */}
                    <p className="field__hint" style={{ marginTop: 8 }}>
                        <span className="method method--put">PUT</span> {base}/instances/{instanceOwnerPartyId || "{partyId}"}/
                        {instanceGuid || "{instanceGuid}"}/process/next
                        <br />
                        {advanceBody(process.taskType)}
                        <br />
                        Submits the current task. The app validates first, so this fails while validation does not pass.
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
