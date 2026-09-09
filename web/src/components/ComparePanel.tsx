import { useState } from "react";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { CompareResult, XmlDifferenceKind } from "../types";

/** Where the xml as written comes from: the payload editor, or a file that ships with the tool. */
export interface CompareSource {
    value: string;
    label: string;
}

interface ComparePanelProps {
    /** The data type of the selected data element, which is what there is to compare. */
    dataType: string;
    sources: CompareSource[];
    onCompare: (source: string) => void;
    result: CompareResult | null;
    busy: boolean;
    error: unknown;
}

const KIND_LABELS: Record<XmlDifferenceKind, string> = {
    missing: "dropped",
    added: "added",
    changed: "changed"
};

/**
 * The xml as written against the xml Altinn stored.
 *
 * Reading a form data element gives the model as JSON, so this is the only way to see what the
 * model did to the file: a field it has no place for is dropped on the way in, and a value it
 * formats its own way is rewritten. Neither is reported by anything else.
 */
export function ComparePanel({ dataType, sources, onCompare, result, busy, error }: ComparePanelProps) {
    const [source, setSource] = useState(sources[0]?.value ?? "");
    const chosen = sources.some((entry) => entry.value === source) ? source : (sources[0]?.value ?? "");
    const differences = result?.diff?.differences ?? [];

    return (
        <Panel
            title="Compare with stored"
            aside={
                result?.diff ? (
                    <span className={`badge ${result.diff.same ? "badge--ok" : ""}`}>
                        {result.diff.same ? "identical" : `${differences.length} difference${differences.length === 1 ? "" : "s"}`}
                    </span>
                ) : undefined
            }
        >
            <p className="field__hint" style={{ marginBottom: 12 }}>
                What Altinn stored for <strong>{dataType}</strong> against the xml as written. Reading the element gives you the model as JSON, so
                this is the only view of what the model did to the file: a field it has no place for is dropped without complaint, and a value it
                formats its own way is rewritten. Formatting, namespace prefixes and attribute order are ignored.
            </p>

            {sources.length === 0 ? (
                <p className="field__hint">Nothing to compare against: no payload element and no example file for {dataType}.</p>
            ) : (
                <>
                    <div className="field">
                        <label htmlFor="compareSource">The xml as written</label>
                        <select id="compareSource" value={chosen} onChange={(event) => setSource(event.target.value)}>
                            {sources.map((entry) => (
                                <option key={entry.value} value={entry.value}>
                                    {entry.label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="row" style={{ marginTop: 12 }}>
                        <button type="button" className="btn" onClick={() => onCompare(chosen)} disabled={busy || !chosen}>
                            {busy && <span className="btn__spinner" />}
                            Compare
                        </button>
                        <span className="field__hint">
                            <span className="method method--get">GET</span> {"{localtest}"}/storage/api/v1/…/data/{"{dataGuid}"}
                        </span>
                    </div>
                </>
            )}

            {result?.diff?.same && (
                <p className="field__hint" style={{ marginTop: 12 }}>
                    The two say the same thing. The model kept everything and changed nothing.
                </p>
            )}

            {differences.length > 0 && (
                <div className="diff">
                    {differences.map((difference) => (
                        <div key={`${difference.kind}-${difference.path}`} className={`diff__row diff__row--${difference.kind}`}>
                            <div className="diff__head">
                                <span className={`diff__kind diff__kind--${difference.kind}`}>{KIND_LABELS[difference.kind]}</span>
                                <span className="diff__path">{difference.path}</span>
                            </div>
                            {/* A dropped field has no right-hand value, and an added one no left. */}
                            {difference.left !== null && (
                                <div className="diff__value">
                                    <span className="diff__side">written</span> {difference.left}
                                </div>
                            )}
                            {difference.right !== null && (
                                <div className="diff__value">
                                    <span className="diff__side">stored</span> {difference.right}
                                </div>
                            )}
                        </div>
                    ))}
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
