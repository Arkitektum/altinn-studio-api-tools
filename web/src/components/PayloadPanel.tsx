import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useAppRead } from "../reads";
import { useSession } from "../session";
import { preferredContentType } from "../lib/contentType";
import { groupDataTypes, groupedDataTypeIds } from "../lib/dataTypeGroups";
import { PayloadElement } from "./PayloadElement";
import { Panel } from "./Panel";
import { SavedPayloads } from "./SavedPayloads";
import { documentsToAdd, outstandingOf } from "../lib/validationReport";
import { loadingOverwrites } from "../lib/savedPayloads";
import type { DataElementInput, SavedPayload } from "../types";
import type { Prevalidation } from "../lib/validationReport";

interface PayloadPanelProps {
    /** Why the panel cannot be used yet, or null when it can. See lib/readiness.ts. */
    notReady: string | null;
    dataElements: DataElementInput[];
    /** Takes an updater as well as a list, since two elements can be filled in at once. */
    onChange: Dispatch<SetStateAction<DataElementInput[]>>;
    /** Data types worth offering before the app has been probed. */
    suggestedDataTypes: string[];
    advanceProcess: boolean;
    onAdvanceProcessChange: (next: boolean) => void;
    /** Payloads kept for later, newest first. */
    savedPayloads: SavedPayload[];
    onSavePayload: (name: string) => void;
    onLoadPayload: (payload: SavedPayload) => void;
    onDeletePayload: (id: string) => void;
    /** What a load had to say for itself, an example that has gone missing being the one case. */
    loadNotice: string | null;
    /** Where the validation service lives, for the line under its button. Empty when switched off. */
    validationUrl: string;
    /** Why the payload cannot be sent to it yet, or null when it can. */
    validationBlockedBy: string | null;
    onValidationReport: () => void;
    validating: boolean;
    /** What the service last said about this payload. Null until it has been asked. */
    prevalidation: Prevalidation | null;
    /**
     * The post itself, which acts on everything above it. A section of this panel rather than one
     * of its own, so that what is about to be sent is the thing you were just looking at.
     */
    children?: ReactNode;
}

/** Names in a sentence: "a", "a and b", "a, b and c". */
function list(names: string[]): string {
    return names.join(", ").replace(/, ([^,]*)$/, " and $1");
}

export function PayloadPanel({
    notReady,
    dataElements,
    onChange,
    suggestedDataTypes,
    advanceProcess,
    onAdvanceProcessChange,
    savedPayloads,
    onSavePayload,
    onLoadPayload,
    onDeletePayload,
    loadNotice,
    validationUrl,
    validationBlockedBy,
    onValidationReport,
    validating,
    prevalidation,
    children
}: PayloadPanelProps) {
    /* The target, so a saved payload written for another app can say which, and what the app
       declares, which is authoritative but only there once it has been read. */
    const { org, app } = useSession();
    const { metadata: appMetadata } = useAppRead();
    const metadata = appMetadata?.metadata ?? null;
    const dataTypes = metadata?.dataTypes ?? [];

    function update(index: number, patch: Partial<DataElementInput>) {
        onChange((current) => current.map((element, i) => (i === index ? { ...element, ...patch } : element)));
    }

    function setAllCollapsed(collapsed: boolean) {
        onChange((current) => current.map((element) => ({ ...element, collapsed })));
    }

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

    function add() {
        // Offer a data type that is not already in the list, so adding is one click. Follows the
        // picker order, which keeps it off the app-produced types.
        const used = new Set(dataElements.map((element) => element.dataType));
        const candidates = dataTypes.length > 0 ? groupedDataTypeIds(groupDataTypes(dataTypes, metadata)) : suggestedDataTypes;
        const next = candidates.find((id) => !used.has(id));
        // Collapse what is already there, so the list stays short and the new element is the one
        // in front of you.
        onChange((current) => [...current.map((element) => ({ ...element, collapsed: true })), { dataType: next ?? "", content: "" }]);
    }

    function remove(index: number) {
        onChange((current) => current.filter((_, i) => i !== index));
    }

    const allCollapsed = dataElements.length > 0 && dataElements.every((element) => element.collapsed);

    return (
        <Panel
            notReady={notReady}
            tone="payload"
            title="Payload"
            aside={
                <span className="row" style={{ gap: 6 }}>
                    {/* The payload as a whole, which is what these two act on. */}
                    <SavedPayloads
                        payloads={savedPayloads}
                        org={org}
                        app={app}
                        overwrites={loadingOverwrites(dataElements)}
                        canSave={dataElements.length > 0}
                        onSave={onSavePayload}
                        onLoad={onLoadPayload}
                        onDelete={onDeletePayload}
                    />
                    {dataElements.length > 1 && (
                        <button type="button" className="btn btn--ghost" onClick={() => setAllCollapsed(!allCollapsed)}>
                            {allCollapsed ? "Expand all" : "Collapse all"}
                        </button>
                    )}
                    <span className="badge">{dataElements.length} element(s)</span>
                </span>
            }
        >
            {/* What the last load had to say, above the list it loaded. */}
            {loadNotice && (
                <div className="notice notice--warn" style={{ marginBottom: 14 }}>
                    {loadNotice}
                </div>
            )}

            {dataElements.map((element, index) => (
                <PayloadElement
                    key={index}
                    index={index}
                    element={element}
                    onPatch={(patch) => update(index, patch)}
                    onRemove={() => remove(index)}
                    canRemove={dataElements.length > 1}
                    suggestedDataTypes={suggestedDataTypes}
                />
            ))}

            {/* Ghost, since it is secondary to posting, but full height: it is an action of its
                own rather than one of the inline ones on an element's bar. */}
            <button type="button" className="btn btn--ghost" onClick={add}>
                + Add data element
            </button>

            {/*
             * The one call this tool makes that leaves the machine, so it says where it goes and
             * waits to be pressed. Under its own heading, because the point of it is when you do
             * it: what it answers is cheaper to read here than out of a refused submission.
             */}
            {validationUrl && (
                <div style={{ marginTop: 18 }}>
                    <span className="legend">Before you post</span>
                    {/* The width of the post button below it, because it is the step before it. */}
                    <button
                        type="button"
                        className="btn btn--post btn--fire"
                        onClick={onValidationReport}
                        disabled={validating || Boolean(validationBlockedBy)}
                        title={validationBlockedBy ?? undefined}
                    >
                        {validating && <span className="btn__spinner" />}
                        Prevalidate
                    </button>
                    <p className="field__hint" style={{ marginBottom: 0 }}>
                        {validationBlockedBy ? (
                            <span style={{ color: "var(--warn)" }}>{validationBlockedBy}</span>
                        ) : (
                            <>
                                Asks the DIBK validation service what this submission is missing, which it knows and the app's own{" "}
                                <code>minCount</code> does not. It leaves your machine, and no token goes with it.
                            </>
                        )}
                        <br />
                        <span className="method method--post">POST</span> {validationUrl}
                    </p>
                </div>
            )}

            {/*
             * The answer, under the button that asked for it. Only the part about documents: a rule
             * about what is inside the form names no payload element, so it is counted and left to
             * the run log, where the whole report is.
             */}
            {requirements && (
                <div className={`notice notice--${outstanding.length > 0 ? "warn" : "ok"}`} style={{ marginTop: 12 }}>
                    {prevalidation?.stale && (
                        <p style={{ margin: "0 0 6px" }}>
                            <strong>The payload has changed since it was prevalidated.</strong> The service reads the form to decide which documents
                            its rules ask for, so run it again to be sure.
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

            <div style={{ marginTop: 18 }}>
                <span className="legend">After upload</span>

                <p className="field__hint" style={{ marginBottom: 10 }}>
                    The instance is read back and validated automatically after every post.
                </p>

                <label className="check">
                    <input type="checkbox" checked={advanceProcess} onChange={(event) => onAdvanceProcessChange(event.target.checked)} />
                    <span className="check__body">
                        <span className="check__title">Sign and submit once it is posted</span>
                        {/*
                         * Which task the instance lands in is the app's business, so this says
                         * what the step is rather than naming an action it cannot know yet.
                         */}
                        <span className="check__note">
                            PUT /process/next straight after the upload, the same step as pressing send in the app. The app validates first, so it
                            fails while validation does not pass, and the data stays posted either way.
                        </span>
                    </span>
                </label>
            </div>

            {children}
        </Panel>
    );
}
