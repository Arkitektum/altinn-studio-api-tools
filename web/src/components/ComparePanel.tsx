import { useState } from "react";
import { partitionDifferences } from "../lib/differences";
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
    /** On by default: an altinnRowId per repeating row would otherwise bury everything else. */
    const [hideRowIds, setHideRowIds] = useState(true);
    const chosen = sources.some((entry) => entry.value === source) ? source : (sources[0]?.value ?? "");
    const { shown: differences, hiddenRowIds } = partitionDifferences(result?.diff?.differences ?? [], hideRowIds);

    return (
        <Panel
            title="Compare with stored"
            aside={
                result?.diff ? (
                    <span className={`badge ${differences.length === 0 ? "badge--ok" : ""}`}>
                        {differences.length === 0 ? "identical" : `${differences.length} difference${differences.length === 1 ? "" : "s"}`}
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

                    <label className="check" style={{ marginTop: 12 }}>
                        <input type="checkbox" checked={hideRowIds} onChange={(event) => setHideRowIds(event.target.checked)} />
                        <span className="check__body">
                            <span className="check__title">Hide altinnRowId</span>
                            <span className="check__note">
                                Altinn stamps one on every row of a repeating group, so the stored xml has them and a file written by hand never does.
                                Left in, they bury everything else.
                            </span>
                        </span>
                    </label>

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

            {result?.diff && differences.length === 0 && (
                <p className="field__hint" style={{ marginTop: 12 }}>
                    {result.diff.same
                        ? "The two say the same thing. The model kept everything and changed nothing."
                        : `Nothing but row ids: ${hiddenRowIds} altinnRowId difference${hiddenRowIds === 1 ? "" : "s"} hidden, and nothing else.`}
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

            {differences.length > 0 && hiddenRowIds > 0 && (
                <p className="field__hint" style={{ marginTop: 8 }}>
                    {hiddenRowIds} altinnRowId difference{hiddenRowIds === 1 ? "" : "s"} hidden.
                </p>
            )}

            {error ? (
                <div style={{ marginTop: 12 }}>
                    <ErrorNotice error={error} />
                </div>
            ) : null}
        </Panel>
    );
}
