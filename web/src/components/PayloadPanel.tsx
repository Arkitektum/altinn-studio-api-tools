import { useState } from "react";
import { contentTypeOptions, preferredContentType } from "../lib/contentType";
import { dataTypeKindOf, groupDataTypes, groupedDataTypeIds } from "../lib/dataTypeGroups";
import { exampleOptionsFor } from "../lib/exampleOptions";
import { readPickedFile } from "../lib/fileUpload";
import { CodeEditor } from "./CodeEditor";
import { ExamplePicker } from "./ExamplePicker";
import { Panel } from "./Panel";
import type { AppDataType, ApplicationMetadata, DataElementInput, ExampleGroup } from "../types";

interface PayloadPanelProps {
    dataElements: DataElementInput[];
    onChange: (next: DataElementInput[]) => void;
    /** From applicationmetadata. Authoritative, but only available after probing. */
    dataTypes: AppDataType[];
    /** Drives the main form, sub form and attachment grouping. Null until the app is probed. */
    metadata: ApplicationMetadata | null;
    /** Data types worth offering before the app has been probed. */
    suggestedDataTypes: string[];
    exampleGroups: ExampleGroup[];
    advanceProcess: boolean;
    onAdvanceProcessChange: (next: boolean) => void;
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
    dataTypes,
    metadata,
    suggestedDataTypes,
    exampleGroups,
    advanceProcess,
    onAdvanceProcessChange
}: PayloadPanelProps) {
    /** Per element, since one element failing to read says nothing about the others. */
    const [fileErrors, setFileErrors] = useState<Record<number, string>>({});

    function update(index: number, patch: Partial<DataElementInput>) {
        onChange(dataElements.map((element, i) => (i === index ? { ...element, ...patch } : element)));
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
                exampleName: picked.filename
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
            exampleName: undefined
        });
    }

    function setCollapsed(index: number, collapsed: boolean) {
        update(index, { collapsed });
    }

    function setAllCollapsed(collapsed: boolean) {
        onChange(dataElements.map((element) => ({ ...element, collapsed })));
    }

    function add() {
        // Offer a data type that is not already in the list, so adding is one click. Follows the
        // picker order, which keeps it off the app-produced types.
        const used = new Set(dataElements.map((element) => element.dataType));
        const candidates = dataTypes.length > 0 ? groupedDataTypeIds(groupDataTypes(dataTypes, metadata)) : suggestedDataTypes;
        const next = candidates.find((id) => !used.has(id));
        // Collapse what is already there, so the list stays short and the new element is the one
        // in front of you.
        onChange([...dataElements.map((element) => ({ ...element, collapsed: true })), { dataType: next ?? "", content: "" }]);
    }

    function remove(index: number) {
        onChange(dataElements.filter((_, i) => i !== index));
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
                    {dataElements.length > 1 && (
                        <button type="button" className="btn btn--ghost" onClick={() => setAllCollapsed(!allCollapsed)}>
                            {allCollapsed ? "Expand all" : "Collapse all"}
                        </button>
                    )}
                    <span className="badge">{dataElements.length} element(s)</span>
                </span>
            }
        >
            {dataElements.map((element, index) => {
                const known = dataTypes.find((type) => type.id === element.dataType);
                // Main form, subform and attachment each get their own badge colour.
                const kind = dataTypeKindOf(dataTypes, metadata, element.dataType);
                const badgeClass = kind === "main" ? "badge badge--main" : kind === "sub" ? "badge badge--sub" : "badge";
                const summary = describeContent(element);
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
                                            exampleName: undefined
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
                                    options={exampleOptionsFor(exampleGroups, element.dataType, known?.allowedContentTypes ?? [])}
                                    onLoad={(file, option) =>
                                        update(index, {
                                            content: file.content,
                                            encoding: file.encoding,
                                            // The file knows what it is, so take its content type rather than guessing.
                                            contentType: file.contentType,
                                            // Altinn stores this as the data element filename for attachments.
                                            ...(option.kind === "attachment" ? { filename: file.name } : {}),
                                            exampleName: file.name
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
                                        onChange={(content) => update(index, { content, exampleName: undefined })}
                                        placeholder={'<ettrinn xmlns="…">\n  …\n</ettrinn>'}
                                        contentType={element.contentType}
                                    />
                                )}
                                <p className="field__hint">
                                    {element.content ? (
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
                                    )}
                                </p>
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
