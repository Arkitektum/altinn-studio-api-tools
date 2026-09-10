import { useState } from "react";
import { partitionDifferences } from "../lib/differences";
import { ErrorNotice } from "./Notice";
import type { CompareResult, XmlDifferenceKind } from "../types";

interface CompareSectionProps {
    /** The data type of the selected data element, which is what there is to compare. */
    dataType: string;
    /**
     * What the payload element of that data type holds, or null when there is none to compare
     * against. The xml as written is always that element: there was a picker offering the example
     * files too, and it was never used for anything else, since the payload is where the file you
     * are working on already is.
     */
    payload: string | null;
    /**
     * Whether that payload parses as xml. The comparison runs as the payload is edited, and a
     * half-typed document is not a comparison waiting to happen, so it says it is waiting rather
     * than asking the server to fail on it.
     */
    parses: boolean;
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
 *
 * A section of the Data element panel rather than a panel of its own. It compares whatever that
 * panel's select is pointing at, and as two cards side by side that was left to be inferred from
 * the order they happened to be in. Inside the same card, under the select it depends on, the
 * relationship is the layout rather than something the prose has to keep claiming.
 */
export function CompareSection({ dataType, payload, parses, result, busy, error }: CompareSectionProps) {
    /** On by default: an altinnRowId per repeating row would otherwise bury everything else. */
    const [hideRowIds, setHideRowIds] = useState(true);
    const { shown: differences, hiddenRowIds } = partitionDifferences(result?.diff?.differences ?? [], hideRowIds);

    return (
        <div className="apart">
            <div className="row">
                <span className="legend" style={{ marginBottom: 0 }}>
                    Compare with stored
                </span>
                <span className="spacer" />
                {result?.diff && (
                    <span className={`badge ${differences.length === 0 ? "badge--ok" : ""}`}>
                        {differences.length === 0 ? "identical" : `${differences.length} difference${differences.length === 1 ? "" : "s"}`}
                    </span>
                )}
            </div>

            <p className="field__hint" style={{ margin: "8px 0 12px" }}>
                The <strong>{dataType}</strong> selected above, as Altinn stored it, against the xml as written. Each difference carries the field's
                declared type from the app's schema where there is one, and nothing where there is not, which for a dropped field is the reason it was
                dropped. Reading the element gives you the model as JSON, so this is the only view of what the model did to the file: a field it has
                no place for is dropped without complaint, and a value it formats its own way is rewritten. Formatting, namespace prefixes and
                attribute order are ignored.
            </p>

            {payload === null ? (
                <p className="field__hint">
                    Nothing to compare against: the payload has no {dataType} element with content. Load an example file, or one from disk, into a{" "}
                    {dataType} element in the <strong>Payload</strong> panel.
                </p>
            ) : !parses ? (
                <p className="field__hint">
                    Waiting: the {dataType} element in the payload is not well formed xml yet. The comparison runs on its own once it parses, so this
                    is what it looks like half way through an edit.
                </p>
            ) : (
                <>
                    <p className="field__hint">
                        Against the payload element: <span style={{ color: "var(--accent)" }}>{payload}</span>
                    </p>

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

                    <p className="field__hint" style={{ marginTop: 12 }}>
                        {busy ? <span className="btn__spinner" /> : null}
                        Compared again whenever the element or the xml above changes:
                        <br />
                        <span className="method method--get">GET</span> {"{localtest}"}/storage/api/v1/…/data/{"{dataGuid}"}
                    </p>
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
                                {/* The field's declared type, where the schema had one. A blank
                                    is informative for a dropped field: the model has no such field. */}
                                {difference.type && <span className="diff__type">{difference.type}</span>}
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
        </div>
    );
}
