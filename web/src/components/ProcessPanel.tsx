import { processLabel } from "../lib/format";
import { advanceBody, advanceInApp, advanceLabel } from "../lib/processAction";
import { useTarget } from "../session";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { ProcessSummary } from "../types";
import { Icon } from "./Icon";
import { CallUrl } from "./CallUrl";
import { LanguagePicker } from "./LanguagePicker";
import { withLanguage, type RequestLanguage } from "../lib/requestLanguage";
import { describeChanges, type AdvanceOutcome } from "../lib/advanceOutcome";

interface ProcessPanelProps {
    /** Why the panel cannot be used yet, or null when it can. See lib/readiness.ts. */
    notReady: string | null;
    /** Null until the instance has been read, which the panel says it is waiting for. */
    process: ProcessSummary | null;
    onAdvance: () => void;
    /** Sent as `lang`, so the pdf the task may end in is in it rather than the profile's language. */
    language: RequestLanguage;
    onLanguageChange: (language: RequestLanguage) => void;
    busy: boolean;
    hasToken: boolean;
    error: unknown;
    /** What the last move on this instance did to its data elements, or null when there has been none. */
    outcome: AdvanceOutcome | null;
    /** Takes you back up to the Data element panel, on the first element the move touched. */
    onCheck: () => void;
}

/** "ref-data-as-pdf (Skjema.pdf)", which is how the select below names it too, short of the size. */
function nameOf(element: { dataType: string; filename: string | null }): string {
    return element.filename ? `${element.dataType} (${element.filename})` : element.dataType;
}

/**
 * What the move did, and the way back up to look at it.
 *
 * Here rather than in the run log alone because it is the next thing to do: the Data element panel
 * is above this one, so after a move the work goes back up the page, and nothing said so. The button
 * is the step itself rather than a link to it, so it also picks the element worth reading.
 */
function AdvanceFollowUp({ outcome, onCheck }: { outcome: AdvanceOutcome; onCheck: () => void }) {
    const changes = describeChanges(outcome);
    const touched = [...outcome.added, ...outcome.changed];
    return (
        <div className="notice notice--ok above-m" role="status">
            <div>
                Moved from <strong>{outcome.from}</strong> to <strong>{outcome.to}</strong>.{" "}
                {changes ? (
                    <>
                        The instance holds {outcome.total} data element{outcome.total === 1 ? "" : "s"}, {changes}:{" "}
                        {touched.map((element, index) => (
                            <span key={element.id}>
                                {index > 0 ? ", " : ""}
                                <strong>{nameOf(element)}</strong>
                            </span>
                        ))}
                        .
                    </>
                ) : (
                    "No data element was added or changed."
                )}
                <div className="row above-s">
                    <button type="button" className={`btn ${outcome.checked ? "btn--ghost" : "btn--get"}`} onClick={onCheck}>
                        <Icon name="download" />
                        Check data elements
                    </button>
                </div>
            </div>
        </div>
    );
}

/** Timestamps come back as ISO. Local time is what you compare against your own clock. */
function describeMoment(value: string | null): string {
    if (!value) return "-";
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? value : new Date(parsed).toLocaleString("nb");
}

export function ProcessPanel({
    notReady,
    process,
    onAdvance,
    language,
    onLanguageChange,
    busy,
    hasToken,
    error,
    outcome,
    onCheck
}: ProcessPanelProps) {
    const { instance, org, app, partyId, instanceGuid } = useTarget();
    /*
     * Where the instance stands is the instance read's to say, so until it has there is nothing to
     * show. Returned early rather than guarded field by field: the panel is about one answer, and
     * half of it is not a state worth rendering.
     */
    if (!process) {
        return (
            <Panel icon="flow" id="panel-process" notReady={notReady ?? "Reading the instance…"} tone="process" title="Process">
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

            {/* First under where it stands, since it is about the move that put it there. */}
            {outcome && <AdvanceFollowUp outcome={outcome} onCheck={onCheck} />}

            {/* An ended process has nowhere to go, so the button would only ever 409. */}
            {ended ? (
                <p className="field__hint above-m">The process has ended, so there is no next task. Post to a new instance to walk it again.</p>
            ) : (
                <>
                    <LanguagePicker id="processLanguage" className="above-m" value={language} onChange={onLanguageChange} />
                    <div className="row above-m">
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
                     * The request is spelled out underneath, because the button says
                     * what it means rather than what it sends. The body is part of that: it is
                     * what Altinn authorises against, the action for the task type. A task type
                     * this does not recognise sends `{}` and leaves the choice to Altinn.
                     */}
                    <p className="field__hint above-s">
                        {inApp ? `This is the same step as ${inApp}. ` : ""}
                        Moves the instance out of {process.currentTask ? <strong>{process.currentTask}</strong> : "the current task"}, and the app
                        validates first, so it fails while validation does not pass.
                        <br />
                        <CallUrl method="PUT" url={withLanguage(`${instance}/process/next`, "lang", language)} />
                        <br />
                        {advanceBody(process.taskType)}
                    </p>
                </>
            )}

            {error ? (
                <div className="above-m">
                    <ErrorNotice error={error} />
                </div>
            ) : null}
        </Panel>
    );
}
