import { useState } from "react";
import { useAppRead } from "../reads";
import { useSession } from "../session";
import { contentTypeOptions, preferredContentType } from "../lib/contentType";
import { dataTypeKindOf, groupDataTypes } from "../lib/dataTypeGroups";
import { exampleOptionsFor } from "../lib/exampleOptions";
import { readPickedFile } from "../lib/fileUpload";
import { CodeEditor } from "./CodeEditor";
import { ExamplePicker } from "./ExamplePicker";
import type { AppDataType, DataElementInput } from "../types";
import { Icon } from "./Icon";

interface PayloadElementProps {
    /** Its place in the payload, which is only used to make the field ids unique. */
    index: number;
    element: DataElementInput;
    /** Changes this element. The list it belongs to is the panel's to hold. */
    onPatch: (patch: Partial<DataElementInput>) => void;
    onRemove: () => void;
    /** False for the last one: a payload with no elements has nothing to post. */
    canRemove: boolean;
    /** Data types worth offering before the app has been probed. */
    suggestedDataTypes: string[];
}

/** What the app says about a data type, for the line under the select. */
function describeDataType(dataType: AppDataType): string {
    const bits: string[] = [];
    if (dataType.appLogic) bits.push("form data");
    if (dataType.taskId) bits.push(dataType.taskId);
    if (dataType.maxCount === 1) bits.push("max 1");
    else if (dataType.maxCount && dataType.maxCount > 1) bits.push(`max ${dataType.maxCount}`);
    else bits.push("unlimited");
    return bits.join(" · ");
}

/** How much content there is and where it came from, for the collapsed bar. */
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

/**
 * One thing to post: its data type, where its content came from, and the content itself.
 *
 * Its own component because the payload is a list of these and the list was the smaller half of the
 * file that held both. What it needs to describe itself, the app's declared data types and the
 * example files, it reads rather than being handed.
 */
export function PayloadElement({ index, element, onPatch, onRemove, canRemove, suggestedDataTypes }: PayloadElementProps) {
    /** Its own, since one element failing to read off disk says nothing about the others. */
    const [fileError, setFileError] = useState<string | null>(null);

    const { exampleGroups } = useSession();
    const { metadata: appMetadata } = useAppRead();
    const metadata = appMetadata?.metadata ?? null;
    const dataTypes = metadata?.dataTypes ?? [];

    /** Reads a file off disk into the element, the way the example picker loads a shipped one. */
    async function pickFile(file: File, target: { allowed: string[]; isAttachment: boolean }) {
        setFileError(null);
        try {
            const picked = await readPickedFile(file, target.allowed);
            onPatch({
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
            setFileError(error instanceof Error ? error.message : String(error));
        }
    }

    /**
     * Content and content type both belong to the data type that was selected, so a change drops
     * them. The example picker remounts on the new data type and loads its first example, so an
     * element with examples ends up populated rather than empty.
     */
    function changeDataType(dataType: string) {
        const declared = dataTypes.find((type) => type.id === dataType)?.allowedContentTypes ?? [];
        onPatch({
            dataType,
            contentType: preferredContentType(declared),
            content: "",
            encoding: undefined,
            filename: undefined,
            exampleName: undefined,
            example: undefined,
            identityIn: undefined,
            identityKey: undefined,
            // A new data type is a new offer, so the picker may fill this one in again.
            restored: undefined
        });
    }

    function formatJson() {
        try {
            onPatch({ content: JSON.stringify(JSON.parse(element.content), null, 2) });
        } catch {
            /* leave invalid JSON alone, since the user may be mid-edit or posting XML */
        }
    }

    const known = dataTypes.find((type) => type.id === element.dataType);
    // Main form, subform and attachment each get their own badge colour.
    const kind = dataTypeKindOf(dataTypes, metadata, element.dataType);
    // Null is a data type the app has not been read for, which is grey because it is unknown
    // rather than because it is an attachment.
    const badgeClass = kind ? `badge badge--${kind}` : "badge";
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
            {/* The one party in the form the test user was written into. */}
            {element.example && element.identityIn && (
                <>
                    {" · you are "}
                    <span style={{ color: "var(--accent)" }}>{element.identityIn}</span>
                </>
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
                    onClick={() => onPatch({ collapsed: !element.collapsed })}
                    aria-expanded={!element.collapsed}
                    title={element.collapsed ? "Expand" : "Collapse"}
                >
                    <span className="element__chevron">
                        <Icon name="chevron" className={element.collapsed ? "icon--turn" : undefined} />
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
                    <button type="button" className="btn btn--ghost" onClick={() => formatJson()}>
                        <Icon name="braces" />
                        Format JSON
                    </button>
                )}
                {!element.collapsed && (
                    <button
                        type="button"
                        className="btn btn--ghost"
                        onClick={() =>
                            onPatch({
                                content: "",
                                encoding: undefined,
                                filename: undefined,
                                exampleName: undefined,
                                example: undefined
                            })
                        }
                        disabled={!element.content}
                    >
                        <Icon name="cross" />
                        Clear
                    </button>
                )}
                <button type="button" className="btn btn--ghost" onClick={() => onRemove()} disabled={!canRemove}>
                    <Icon name="cross" />
                    Remove
                </button>
            </div>

            <div className="element__body" hidden={element.collapsed}>
                <div className="element__type">
                    <div className="field">
                        <label htmlFor={`dataType-${index}`}>Data type</label>
                        {dataTypes.length > 0 ? (
                            <select id={`dataType-${index}`} value={element.dataType} onChange={(event) => changeDataType(event.target.value)}>
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
                                    onChange={(event) => onPatch({ dataType: event.target.value.trim() })}
                                    // Typed input settles on blur. Reacting per keystroke would clear the
                                    // content while the name is still half typed.
                                    onBlur={(event) => changeDataType(event.target.value.trim())}
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
                            onChange={(event) => onPatch({ contentType: event.target.value || undefined })}
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
                            onPatch({
                                content: file.content,
                                encoding: file.encoding,
                                // The file knows what it is, so take its content type rather than guessing.
                                contentType: file.contentType,
                                // Altinn stores this as the data element filename for attachments.
                                ...(option.kind === "attachment" ? { filename: file.name } : {}),
                                exampleName: file.name,
                                // What it is, not only what it is called, so a payload
                                // saved with it can point at the file rather than copy it.
                                example: { kind: option.kind, group: option.group, name: option.name },
                                // Another file, so whatever the last one had written into
                                // it says nothing about this one. Leaving the key behind
                                // would have the new example counted as already done.
                                identityIn: undefined,
                                identityKey: undefined
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
                                void pickFile(file, {
                                    allowed: known?.allowedContentTypes ?? [],
                                    isAttachment: kind !== "main" && kind !== "sub"
                                });
                            }
                        }}
                    />
                    {fileError ? (
                        <div className="notice notice--bad" style={{ marginTop: 7 }}>
                            {fileError}
                        </div>
                    ) : (
                        <p className="field__hint">
                            Read in the browser. Text formats stay editable below, and anything else travels as base64 and is decoded before the
                            request goes out.
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
                                // the editor goes, and so do the reference a saved
                                // payload would have kept and the identity the tool
                                // stops writing in once the text is yours.
                                onPatch({
                                    content,
                                    exampleName: undefined,
                                    example: undefined,
                                    identityIn: undefined,
                                    identityKey: undefined
                                })
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
}
