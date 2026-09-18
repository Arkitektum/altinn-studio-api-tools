import type { Dispatch, SetStateAction } from "react";
import { useAppRead } from "../reads";
import { usePrevalidation } from "../writes";
import { preferredContentType } from "../lib/contentType";
import { prevalidationCounts, verdictOf } from "../lib/chain";
import { documentsToAdd, outstandingOf, summarisePrevalidation } from "../lib/validationReport";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { DataElementInput } from "../types";
import { Icon } from "./Icon";

interface PrevalidationPanelProps {
    /** Why the panel cannot be used yet, or null when it can. See lib/readiness.ts. */
    notReady: string | null;
    dataElements: DataElementInput[];
    /** For Add them, which appends one element per document the service still wants. */
    onChange: Dispatch<SetStateAction<DataElementInput[]>>;
}

/** Names in a sentence: "a", "a and b", "a, b and c". */
function list(names: string[]): string {
    return names.join(", ").replace(/, ([^,]*)$/, " and $1");
}

/**
 * What a submission of this payload would be missing, asked before it is sent.
 *
 * The one call this tool makes that leaves the machine, which is why it waits to be pressed and
 * says where it goes. What it answers is what a refused submit would have told you, read before the
 * submit rather than after, and the app's own `minCount` cannot answer it: what an app declares is
 * not what the validation insists on.
 *
 * A panel of its own rather than a section of Payload, because it is a step you take between
 * writing the payload and posting it, and the rail says so.
 *
 * Rendered only where a service is configured. Switched off is not a step you skipped, so there is
 * nothing to show rather than a panel permanently waiting. See App.tsx.
 */
export function PrevalidationPanel({ notReady, dataElements, onChange }: PrevalidationPanelProps) {
    const { metadata: appMetadata } = useAppRead();
    const dataTypes = appMetadata?.metadata.dataTypes ?? [];

    const { prevalidation, blockedBy, url, asking, error, ask: onValidationReport } = usePrevalidation(dataElements);

    /**
     * Which documents this submission needs, as the validation service answered it. Nothing here
     * counts a `minCount`: what an app declares is not what the validation insists on, which is
     * why the question is asked of the service at all. See lib/validationReport.ts.
     */
    const requirements = prevalidation?.requirements;
    const outstanding = requirements ? outstandingOf(requirements) : [];
    /** Recommended and not here, by the name the message leads with where it offers a choice. */
    const advised = (requirements?.recommended ?? [])
        .filter((requirement) => !requirement.satisfied)
        .map((requirement) => requirement.dataTypes[0] as string);
    const other = (requirements?.otherErrors ?? 0) + (requirements?.otherWarnings ?? 0);

    /**
     * The whole report, which is what the notice below is coloured by and what it leads with.
     *
     * The same summary the rail is built from, through the same two functions. This used to ask
     * `outstanding.length > 0`, so the notice answered "is a required document missing" while
     * looking like it answered "what did the service make of this submission": a report with an
     * error inside the form and four documents it recommends came out green here and red on the
     * rail. Reading it twice costs nothing, since the report is in the cache.
     */
    const summary = summarisePrevalidation(prevalidation);
    const verdict = verdictOf(summary);
    const tone = verdict === "error" ? "notice--bad" : verdict === "warning" ? "notice--warn" : verdict === "clean" ? "notice--ok" : "";

    /**
     * Appends one element per document still wanted, which the example picker fills in on mount:
     * the body of a folded element is hidden rather than left unrendered, so the picker is there
     * to do it.
     */
    function addMissing() {
        const added = documentsToAdd(requirements?.required ?? []).map((dataType) => ({
            dataType,
            content: "",
            contentType: preferredContentType(dataTypes.find((type) => type.id === dataType)?.allowedContentTypes ?? []),
            // Folded, and so is everything already in the list. Four documents arriving at once is
            // a list to look down, and four open editors is one element and a scrollbar.
            collapsed: true
        }));
        onChange((current) => [...current.map((element) => ({ ...element, collapsed: true })), ...added]);
    }

    return (
        <Panel icon="shield" id="panel-prevalidation" notReady={notReady} tone="prevalidation" title="Prevalidation">
            {/* The width of the post button below it, because it is the step before it. */}
            <button
                type="button"
                className="btn btn--post btn--fire"
                onClick={onValidationReport}
                disabled={asking || Boolean(blockedBy)}
                title={blockedBy ?? undefined}
            >
                {asking ? <span className="btn__spinner" /> : <Icon name="shield" />}
                Prevalidate
            </button>
            <p className="field__hint" style={{ marginBottom: 0 }}>
                {blockedBy ? (
                    <span style={{ color: "var(--warn)" }}>{blockedBy}</span>
                ) : (
                    <>
                        Asks the DIBK validation service what this submission is missing, which it knows and the app's own <code>minCount</code> does
                        not. It leaves your machine, and no token goes with it.
                    </>
                )}
                <br />
                <span className="method method--post">POST</span> {url}
            </p>

            {/*
             * The answer, under the button that asked for it. Only the part about documents: a rule
             * about what is inside the form names no payload element, so it is counted and left to
             * the run log, where the whole report is.
             */}
            {requirements && (
                <div className={["notice", tone].filter(Boolean).join(" ")} style={{ marginTop: 12 }}>
                    {prevalidation?.stale && (
                        <p style={{ margin: "0 0 6px" }}>
                            <strong>The payload has changed since it was prevalidated.</strong> The service reads the form to decide which documents
                            its rules ask for, so run it again to be sure.
                        </p>
                    )}

                    {/*
                     * What it found, in the rail's own words, so the two can be read against each
                     * other. Only where there is something: under a green notice saying nothing is
                     * missing, "nothing missing" is the same sentence twice.
                     */}
                    {verdict && verdict !== "clean" && (
                        <p style={{ margin: "0 0 6px" }}>
                            <strong>{prevalidationCounts(summary)}</strong>
                        </p>
                    )}

                    {outstanding.length === 0 ? (
                        <>The validation service asks for no document this {requirements.soknadtype} submission does not have.</>
                    ) : (
                        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                            <div style={{ flex: 1 }}>
                                The validation service wants {outstanding.length === 1 ? "one more document" : `${outstanding.length} more documents`}{" "}
                                in this {requirements.soknadtype} submission:
                                <ul>
                                    {outstanding.map((requirement) => (
                                        <li key={requirement.dataTypes.join("|")}>
                                            {/* Alternatives, where the rule takes any one of them. */}
                                            <strong>{requirement.dataTypes.join(" or ")}</strong>
                                            {requirement.checklistReference && <span className="badge">{requirement.checklistReference}</span>}
                                            <span className="notice__why">
                                                {requirement.message}
                                                {!requirement.known && " This app declares no data type by that name, so it cannot be added here."}
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                            {documentsToAdd(requirements.required).length > 0 && (
                                <button type="button" className="btn btn--ghost" onClick={addMissing}>
                                    Add {documentsToAdd(requirements.required).length === 1 ? "it" : "them"}
                                </button>
                            )}
                        </div>
                    )}

                    {/* Named only, since a recommendation you decide against should be one line. */}
                    {advised.length > 0 && <p style={{ margin: "6px 0 0" }}>It also recommends {list(advised)}.</p>}

                    {other > 0 && (
                        <p style={{ margin: "6px 0 0" }}>
                            And {other === 1 ? "one thing" : `${other} things`} about the form's own content rather than what is attached to it. The
                            whole report is in the run log.
                        </p>
                    )}
                </div>
            )}

            {error ? (
                <div style={{ marginTop: 12 }}>
                    <ErrorNotice error={error} />
                </div>
            ) : null}
        </Panel>
    );
}
