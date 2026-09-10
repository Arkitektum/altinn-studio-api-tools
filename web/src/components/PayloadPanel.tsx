import { useState, type Dispatch, type SetStateAction } from "react";
import { contentTypeOptions, preferredContentType } from "../lib/contentType";
import { dataTypeKindOf, groupDataTypes, groupedDataTypeIds } from "../lib/dataTypeGroups";
import { exampleOptionsFor } from "../lib/exampleOptions";
import { readPickedFile } from "../lib/fileUpload";
import { CodeEditor } from "./CodeEditor";
import { ExamplePicker } from "./ExamplePicker";
import { Panel } from "./Panel";
import { SavedPayloads } from "./SavedPayloads";
import { elementsToAdd, requiredSummary } from "../lib/requiredData";
import { loadingOverwrites } from "../lib/savedPayloads";
import type { AppDataType, ApplicationMetadata, DataElementInput, ExampleGroup, SavedPayload } from "../types";

interface PayloadPanelProps {
    dataElements: DataElementInput[];
    /** Takes an updater as well as a list, since two elements can be filled in at once. */
    onChange: Dispatch<SetStateAction<DataElementInput[]>>;
    /** The target, so a saved payload written for another app can say which. */
    org: string;
    app: string;
    /** The task the selected instance sits in, for what that task requires. Null for a new one. */
    currentTask: string | null;
    /** Data types the selected instance already holds, which count towards those requirements. */
    onInstance: string[];
    /** From applicationmetadata. Authoritative, but only available after probing. */
    dataTypes: AppDataType[];
    /** Drives the main form, sub form and attachment grouping. Null until the app is probed. */
    metadata: ApplicationMetadata | null;
    /** Data types worth offering before the app has been probed. */
    suggestedDataTypes: string[];
    exampleGroups: ExampleGroup[];
    advanceProcess: boolean;
    onAdvanceProcessChange: (next: boolean) => void;
    /** Payloads kept for later, newest first. */
    savedPayloads: SavedPayload[];
    onSavePayload: (name: string) => void;
    onLoadPayload: (payload: SavedPayload) => void;
    onDeletePayload: (id: string) => void;
    /** What a load had to say for itself, an example that has gone missing being the one case. */
    loadNotice: string | null;
}

/**
 * What a collapsed element shows about itself, so nothing is hidden that you need. The source is
 * returned separately so it can be accented, matching the hint under the expanded editor.
 */
function describeContent(element: DataElementInput): { size: string; source?: string } {
    if (!element.content) return { size: "no content" };
    if (element.encoding === "base64") {
        const bytes = Math.ceil((element.content.length * 3) / 4);
        return { size: `${bytes.toLocaleString("nb")} bytes`, source: element.filename };
    }
    return {
        size: `${element.content.length.toLocaleString("nb")} characters`,
        source: element.exampleName
    };
}

function describeDataType(dataType: AppDataType): string {
    const bits: string[] = [];
    if (dataType.appLogic) bits.push("form data");
    if (dataType.taskId) bits.push(dataType.taskId);
    if (dataType.maxCount === 1) bits.push("max 1");
    else if (dataType.maxCount && dataType.maxCount > 1) bits.push(`max ${dataType.maxCount}`);
    else bits.push("unlimited");
    return bits.join(" · ");
}

export function PayloadPanel({
    dataElements,
    onChange,
    org,
    app,
    currentTask,
    onInstance,
    dataTypes,
    metadata,
    suggestedDataTypes,
    exampleGroups,
    advanceProcess,
    onAdvanceProcessChange,
    savedPayloads,
    onSavePayload,
    onLoadPayload,
    onDeletePayload,
    loadNotice
}: PayloadPanelProps) {
    /** Per element, since one element failing to read says nothing about the others. */
    const [fileErrors, setFileErrors] = useState<Record<number, string>>({});

    function update(index: number, patch: Partial<DataElementInput>) {
        onChange((current) => current.map((element, i) => (i === index ? { ...element, ...patch } : element)));
    }

    function noteFileError(index: number, message: string | null) {
        setFileErrors((current) => {
            const next = { ...current };
            if (message === null) delete next[index];
            else next[index] = message;
            return next;
        });
    }

    /** Reads a file off disk into the element, the way the example picker loads a shipped one. */
    async function pickFile(index: number, file: File, target: { allowed: string[]; isAttachment: boolean }) {
        noteFileError(index, null);
        try {
            const picked = await readPickedFile(file, target.allowed);
            update(index, {
                content: picked.content,
                encoding: picked.encoding,
                contentType: picked.contentType,
                // Altinn stores this as the data element filename, which an attachment wants and
                // form data does not, the same rule the example picker follows.
                ...(target.isAttachment ? { filename: picked.filename } : { filename: undefined }),
                exampleName: picked.filename,
                // A file off disk is nothing the examples know about.
                example: undefined
            });
        } catch (error) {
            noteFileError(index, error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Content and content type both belong to the data type that was selected, so a change drops
     * them. The example picker remounts on the new data type and loads its first example, so an
     * element with examples ends up populated rather than empty.
     */
    function changeDataType(index: number, dataType: string) {
        if (!dataElements[index]) return;

        const declared = dataTypes.find((type) => type.id === dataType)?.allowedContentTypes ?? [];
        update(index, {
            dataType,
            contentType: preferredContentType(declared),
            content: "",
            encoding: undefined,
            filename: undefined,
            exampleName: undefined,
            example: undefined,
            // A new data type is a new offer, so the picker may fill this one in again.
            restored: undefined
        });
    }

    function setCollapsed(index: number, collapsed: boolean) {
        update(index, { collapsed });
    }

    function setAllCollapsed(collapsed: boolean) {
        onChange((current) => current.map((element) => ({ ...element, collapsed })));
    }

    /**
     * What the app says this task cannot be completed without, and what of it is not here yet.
     * Counted from applicationmetadata rather than guessed. See lib/requiredData.ts.
     */
    const { task, required, missing } = requiredSummary({
        dataTypes,
        metadata,
        currentTask,
        payload: dataElements.map((element) => element.dataType).filter(Boolean),
        onInstance
    });

    /** Appends one element per element short, which the example picker then fills in on mount. */
    function addMissing() {
        const added = elementsToAdd(missing).map((dataType) => ({
            dataType,
            content: "",
            contentType: preferredContentType(dataTypes.find((type) => type.id === dataType)?.allowedContentTypes ?? [])
        }));
        // The list can be long by the time this is pressed, and what was just added is the part
        // worth looking at, so what was already there folds.
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

    function formatJson(index: number) {
        const element = dataElements[index];
        if (!element) return;
        try {
            update(index, { content: JSON.stringify(JSON.parse(element.content), null, 2) });
        } catch {
            /* leave invalid JSON alone, since the user may be mid-edit or posting XML */
        }
    }

    const allCollapsed = dataElements.length > 0 && dataElements.every((element) => element.collapsed);

    return (
        <Panel
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

            {dataElements.map((element, index) => {
                const known = dataTypes.find((type) => type.id === element.dataType);
                // Main form, subform and attachment each get their own badge colour.
                const kind = dataTypeKindOf(dataTypes, metadata, element.dataType);
                const badgeClass = kind === "main" ? "badge badge--main" : kind === "sub" ? "badge badge--sub" : "badge";
                const summary = describeContent(element);
                /** How much content there is and where it came from, under the editor and in it. */
                const note = element.content ? (
                    <>
                        {element.encoding === "base64"
                            ? `${Math.ceil((element.content.length * 3) / 4).toLocaleString("nb")} bytes`
                            : `${element.content.length.toLocaleString("nb")} characters`}
                        {element.exampleName ? (
                            <>
                                {" · from "}
                                <span style={{ color: "var(--accent)" }}>{element.exampleName}</span>
                            </>
                        ) : (
                            " · edited"
                        )}
                    </>
                ) : (
                    "Load an example above, or paste XML/JSON."
                );
                return (
                    <div className="element" key={index}>
                        <div className="element__bar">
                            <button
                                type="button"
                                className="element__toggle"
                                onClick={() => setCollapsed(index, !element.collapsed)}
                                aria-expanded={!element.collapsed}
                                title={element.collapsed ? "Expand" : "Collapse"}
                            >
                                <span className="element__chevron" aria-hidden="true">
                                    {element.collapsed ? "\u25b6" : "\u25bc"}
                                </span>
                                <span className="element__ord">{index + 1}</span>
                                {element.dataType && <span className={badgeClass}>{element.dataType}</span>}
                                <span className={`element__summary${element.content ? "" : " element__summary--empty"}`}>
                                    {summary.size}
                                    {summary.source && (
                                        <>
                                            {" \u00b7 "}
                                            <span className="element__source">{summary.source}</span>
                                        </>
                                    )}
                                </span>
                            </button>
                            <span className="spacer" />
                            {/* Only useful for JSON payloads, since the shipped examples are all XML. */}
                            {!element.collapsed && /^\s*[[{]/.test(element.content) && (
                                <button type="button" className="btn btn--ghost" onClick={() => formatJson(index)}>
                                    Format JSON
                                </button>
                            )}
                            {!element.collapsed && (
                                <button
                                    type="button"
                                    className="btn btn--ghost"
                                    onClick={() =>
                                        update(index, {
                                            content: "",
                                            encoding: undefined,
                                            filename: undefined,
                                            exampleName: undefined,
                                            example: undefined
                                        })
                                    }
                                    disabled={!element.content}
                                >
                                    Clear
                                </button>
                            )}
                            <button type="button" className="btn btn--ghost" onClick={() => remove(index)} disabled={dataElements.length === 1}>
                                Remove
                            </button>
                        </div>

                        <div className="element__body" hidden={element.collapsed}>
                            <div className="element__type">
                                <div className="field">
                                    <label htmlFor={`dataType-${index}`}>Data type</label>
                                    {dataTypes.length > 0 ? (
                                        <select
                                            id={`dataType-${index}`}
                                            value={element.dataType}
                                            onChange={(event) => changeDataType(index, event.target.value)}
                                        >
                                            <option value="">Select data type</option>
                                            {groupDataTypes(dataTypes, metadata, element.dataType).map((group) => (
                                                <optgroup key={group.label} label={group.label}>
                                                    {group.dataTypes.map((type) => (
                                                        <option key={type.id} value={type.id}>
                                                            {type.id} ({describeDataType(type)})
                                                        </option>
                                                    ))}
                                                </optgroup>
                                            ))}
                                        </select>
                                    ) : (
                                        <>
                                            <input
                                                id={`dataType-${index}`}
                                                type="text"
                                                list={`dataTypeOptions-${index}`}
                                                value={element.dataType}
                                                onChange={(event) => update(index, { dataType: event.target.value.trim() })}
                                                // Typed input settles on blur. Reacting per keystroke would clear the
                                                // content while the name is still half typed.
                                                onBlur={(event) => changeDataType(index, event.target.value.trim())}
                                                placeholder="ET"
                                                autoComplete="off"
                                            />
                                            {/* Suggestions before probing. The app's metadata wins once available. */}
                                            <datalist id={`dataTypeOptions-${index}`}>
                                                {suggestedDataTypes.map((id) => (
                                                    <option key={id} value={id} />
                                                ))}
                                            </datalist>
                                        </>
                                    )}
                                </div>
                                <div className="field">
                                    <label htmlFor={`contentType-${index}`}>Content type</label>
                                    <select
                                        id={`contentType-${index}`}
                                        value={element.contentType ?? ""}
                                        onChange={(event) => update(index, { contentType: event.target.value || undefined })}
                                    >
                                        <option value="">Auto</option>
                                        {contentTypeOptions(known?.allowedContentTypes ?? [], element.contentType).map((type) => (
                                            <option key={type} value={type}>
                                                {type}
                                            </option>
                                        ))}
                                    </select>
                                    {!element.contentType && (
                                        <p className="field__hint">The server picks from the types the app allows, or detects it from the payload.</p>
                                    )}
                                </div>
                            </div>

                            <div className="field">
                                <label>Example data</label>
                                <ExamplePicker
                                    // Remount on a data type change, both to clear the previous type's selection
                                    // and to trigger the automatic load of the new type's first example.
                                    key={element.dataType}
                                    dataType={element.dataType}
                                    hasContent={Boolean(element.content)}
                                    autoLoad={!element.restored}
                                    options={exampleOptionsFor(exampleGroups, element.dataType, known?.allowedContentTypes ?? [])}
                                    onLoad={(file, option) =>
                                        update(index, {
                                            content: file.content,
                                            encoding: file.encoding,
                                            // The file knows what it is, so take its content type rather than guessing.
                                            contentType: file.contentType,
                                            // Altinn stores this as the data element filename for attachments.
                                            ...(option.kind === "attachment" ? { filename: file.name } : {}),
                                            exampleName: file.name,
                                            // What it is, not only what it is called, so a payload
                                            // saved with it can point at the file rather than copy it.
                                            example: { kind: option.kind, group: option.group, name: option.name }
                                        })
                                    }
                                />
                            </div>

                            {/* For the file that is not among the shipped dummies. */}
                            <div className="field">
                                <label htmlFor={`file-${index}`}>File from disk</label>
                                <input
                                    id={`file-${index}`}
                                    type="file"
                                    // Offer what the app declares, so the dialog filters to it.
                                    accept={known?.allowedContentTypes?.join(",") || undefined}
                                    onChange={(event) => {
                                        const file = event.target.files?.[0];
                                        // Clear the input so picking the same file again re-reads it.
                                        event.target.value = "";
                                        if (file) {
                                            void pickFile(index, file, {
                                                allowed: known?.allowedContentTypes ?? [],
                                                isAttachment: kind !== "main" && kind !== "sub"
                                            });
                                        }
                                    }}
                                />
                                {fileErrors[index] ? (
                                    <div className="notice notice--bad" style={{ marginTop: 7 }}>
                                        {fileErrors[index]}
                                    </div>
                                ) : (
                                    <p className="field__hint">
                                        Read in the browser. Text formats stay editable below, and anything else travels as base64 and is decoded
                                        before the request goes out.
                                    </p>
                                )}
                            </div>

                            <div className="field">
                                {element.encoding === "base64" ? (
                                    // Base64 bytes are not worth showing, and editing them as text would corrupt
                                    // the file. The picker and Clear are the only ways to change it.
                                    <>
                                        <label htmlFor={`content-${index}`}>Content</label>
                                        <div className="binary">
                                            <span className="badge">{element.contentType ?? "binary"}</span>
                                            <span>{element.filename ?? "binary file"}</span>
                                        </div>
                                    </>
                                ) : (
                                    <CodeEditor
                                        id={`content-${index}`}
                                        label="Content"
                                        value={element.content}
                                        onChange={(content) =>
                                            // An edit is no longer the example, so the name under
                                            // the editor goes and so does the reference a saved
                                            // payload would have kept.
                                            update(index, { content, exampleName: undefined, example: undefined })
                                        }
                                        placeholder={'<ettrinn xmlns="…">\n  …\n</ettrinn>'}
                                        contentType={element.contentType}
                                        // Under the editor, and in the window it opens, since it
                                        // says what is in there and where it came from.
                                        note={note}
                                    />
                                )}
                                {/* The placeholder above has no editor to carry it. */}
                                {element.encoding === "base64" && <p className="field__hint">{note}</p>}
                            </div>

                            {known && (
                                <div className="element__meta">
                                    {known.appLogic?.classRef && (
                                        <span className="badge" title={known.appLogic.classRef}>
                                            {known.appLogic.classRef.split(".").pop()}
                                        </span>
                                    )}
                                    {/* The allowed content types are the options in the select above. */}
                                    <span>{describeDataType(known)}</span>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}

            {/*
             * What the app requires, from its own metadata: a data type bound to this task with a
             * minCount, which `process/next` refuses while it is short. It says nothing about
             * whether the xml inside a form is complete, which only the app's validation knows,
             * so it never promises the instance will pass.
             */}
            {required.length > 0 && (
                <div className={`notice notice--${missing.length > 0 ? "warn" : "ok"}`} style={{ marginBottom: 12 }}>
                    {missing.length === 0 ? (
                        <>
                            Every data element {task ? <strong>{task}</strong> : "this app"} requires is here. Whether what is in them passes the
                            app's own validation is another question, and one only a post can answer.
                        </>
                    ) : (
                        <div className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                            <span style={{ flex: 1 }}>
                                {task ? <strong>{task}</strong> : "This app"} also needs{" "}
                                {missing
                                    .map((type) => `${type.missing} ${type.dataType}${type.missing > 1 ? " elements" : ""}`)
                                    .join(", ")
                                    .replace(/, ([^,]*)$/, " and $1")}
                                . The app declares them with a minCount, so advancing the process fails while they are short.
                            </span>
                            <button type="button" className="btn btn--ghost" onClick={addMissing}>
                                Add {elementsToAdd(missing).length === 1 ? "it" : "them"}
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Ghost, since it is secondary to posting, but full height: it is an action of its
                own rather than one of the inline ones on an element's bar. */}
            <button type="button" className="btn btn--ghost" onClick={add}>
                + Add data element
            </button>

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
        </Panel>
    );
}
