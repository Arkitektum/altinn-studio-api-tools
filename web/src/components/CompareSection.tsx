import { useState } from "react";
import { useCompare } from "../reads";
import { describeHidden, partitionDifferences } from "../lib/differences";
import { Icon } from "./Icon";
import { ErrorNotice } from "./Notice";
import { Explained } from "./Explained";
import { SweepWindow } from "./SweepWindow";
import type { ComparisonPair } from "../lib/comparisons";
import type { DataElementInput, XmlDifferenceKind } from "../types";

interface CompareSectionProps {
    /** Every form data element on the instance, each beside the payload element it was written from. */
    pairs: ComparisonPair[];
}

const KIND_LABELS: Record<XmlDifferenceKind, string> = {
    missing: "dropped",
    added: "added",
    changed: "changed"
};

/** How much the payload holds for an element and where it came from, for the line above its diff. */
function describeWritten(written: DataElementInput): string {
    return `${written.content.length.toLocaleString("nb")} characters${written.exampleName ? ` · from ${written.exampleName}` : ""}`;
}

/**
 * The xml as written against the xml Altinn stored.
 *
 * Reading a form data element gives the model as JSON, so this is the only way to see what the
 * model did to the file: a field it has no place for is dropped on the way in, and a value it
 * formats its own way is rewritten. Neither is reported by anything else.
 *
 * Every form data element on the instance at once, the main form and each sub form, rather than
 * whichever one the select above is pointing at. Following the select meant that picking an
 * attachment, which has nothing to compare, left the last form's diff on screen as if it were the
 * attachment's. The forms are the only elements a model can have done anything to, and there are
 * few enough of them to show together.
 */
export function CompareSection({ pairs }: CompareSectionProps) {
    /** On by default: an altinnRowId per repeating row would otherwise bury everything else. */
    const [hideRowIds, setHideRowIds] = useState(true);
    /** Off by default: an element the model added is still something it did, even with nothing in it. */
    const [hideEmpty, setHideEmpty] = useState(false);
    /** The same comparison over every example there is, in a window. See SweepWindow.tsx. */
    const [sweeping, setSweeping] = useState(false);

    return (
        <div className="apart">
            <div className="row">
                <span className="legend below-0">Compare with stored</span>
                <span className="spacer" />
                {/*
                 * This panel confirms a problem you already suspect. The sweep finds the ones you do
                 * not, which is why it sits beside it rather than anywhere else in the tool.
                 */}
                <button
                    type="button"
                    className="btn btn--ghost"
                    onClick={() => setSweeping(true)}
                    aria-haspopup="dialog"
                    title="Post every example there is and compare each one, not only this instance"
                >
                    <Icon name="flow" />
                    Sweep every example
                </button>
            </div>

            {sweeping && <SweepWindow onClose={() => setSweeping(false)} />}

            <Explained className="above-s below-m" lead="What Altinn did to the XML of each form on the instance, the main form and every sub form.">
                Each difference carries the field's declared type from the app's schema where there is one, and nothing where there is not, which for
                a dropped field is the reason it was dropped. Reading an element gives you the model as JSON, so this is the only view of what the
                model did to the file: a field it has no place for is dropped without complaint, and a value it formats its own way is rewritten.
                Formatting, namespace prefixes and attribute order are ignored. Attachments are left out, since a file comes back as the file it went
                in as.
            </Explained>

            {pairs.length === 0 ? (
                <p className="field__hint">No form data on this instance, so nothing to compare.</p>
            ) : (
                <>
                    <label className="check">
                        <input type="checkbox" checked={hideRowIds} onChange={(event) => setHideRowIds(event.target.checked)} />
                        <span className="check__body">
                            <span className="check__title">Hide altinnRowId</span>
                            <span className="check__note">
                                Altinn stamps one on every row of a repeating group, so the stored xml has them and a file written by hand never does.
                                Left in, they bury everything else.
                            </span>
                        </span>
                    </label>

                    <label className="check">
                        <input type="checkbox" checked={hideEmpty} onChange={(event) => setHideEmpty(event.target.checked)} />
                        <span className="check__body">
                            <span className="check__title">Hide empty elements Altinn added</span>
                            <span className="check__note">
                                Altinn writes out fields the file left out as empty elements, so each one shows as added with nothing in it.
                            </span>
                        </span>
                    </label>

                    <p className="field__hint above-m">
                        Compared again whenever an element or the xml it was written from changes:
                        <br />
                        <span className="method method--get">GET</span> {"{localtest}"}/storage/api/v1/…/data/{"{dataGuid}"}
                    </p>

                    {pairs.map((pair) => (
                        <ComparedElement key={pair.stored.id} pair={pair} hideRowIds={hideRowIds} hideEmpty={hideEmpty} />
                    ))}
                </>
            )}
        </div>
    );
}

interface ComparedElementProps {
    pair: ComparisonPair;
    hideRowIds: boolean;
    hideEmpty: boolean;
}

/** One stored form against the payload element it was written from. Its own component for its own read. */
function ComparedElement({ pair: { stored, kind, written }, hideRowIds, hideEmpty }: ComparedElementProps) {
    const { dataType } = stored;
    const comparison = useCompare(stored.id, stored.lastChanged, dataType, written?.content ?? null);
    const { result, error } = comparison;
    const partitioned = partitionDifferences(result?.diff?.differences ?? [], hideRowIds, hideEmpty);
    const differences = partitioned.shown;
    const hidden = describeHidden(partitioned);

    return (
        // A card of its own, in the shape a payload element has, so each form reads as one thing
        // and the stored form looks like the element it is compared against.
        <div className="compared">
            <div className="compared__bar">
                <span className={`badge badge--${kind}`}>{kind === "main" ? "main form" : "sub form"}</span>
                <strong className="compared__type">{dataType}</strong>
                <span className="compared__id">{stored.id}</span>
                <span className="spacer" />
                {comparison.fetching ? <span className="btn__spinner" /> : null}
                {written && result?.diff && (
                    <span className={`badge ${differences.length === 0 ? "badge--ok" : ""}`}>
                        {differences.length === 0 ? "identical" : `${differences.length} difference${differences.length === 1 ? "" : "s"}`}
                    </span>
                )}
            </div>

            <div className="compared__body">
                {written === null ? (
                    <p className="field__hint">
                        Nothing to compare against: the payload has no {dataType} element with content to pair with this one. Load an example file, or
                        one from disk, into a {dataType} element in the <strong>Payload</strong> panel.
                    </p>
                ) : !comparison.wellFormed ? (
                    <p className="field__hint">
                        Waiting: the {dataType} element in the payload is not well formed xml yet. The comparison runs on its own once it parses, so
                        this is what it looks like half way through an edit.
                    </p>
                ) : (
                    <>
                        <p className="field__hint">
                            Against the payload element: <span style={{ color: "var(--accent)" }}>{describeWritten(written)}</span>
                        </p>

                        {result?.diff && differences.length === 0 && (
                            <p className="field__hint above-s">
                                {result.diff.same
                                    ? "The two say the same thing. The model kept everything and changed nothing."
                                    : `Nothing left once filtered: ${hidden} hidden, and nothing else.`}
                            </p>
                        )}

                        {differences.length > 0 && (
                            <div className="diff">
                                {/* Named once over the columns rather than on every row. Hidden from
                                    assistive tech, which reads the label inside each value instead. */}
                                <div className="diff__columns" aria-hidden="true">
                                    <span>before Altinn</span>
                                    <span>after Altinn</span>
                                </div>
                                {differences.map((difference) => (
                                    <div key={`${difference.kind}-${difference.path}`} className={`diff__row diff__row--${difference.kind}`}>
                                        <div className="diff__head">
                                            <span className={`diff__kind diff__kind--${difference.kind}`}>{KIND_LABELS[difference.kind]}</span>
                                            <span className="diff__path">{difference.path}</span>
                                            {/* The field's declared type, where the schema had one. A blank
                                            is informative for a dropped field: the model has no such field. */}
                                            {difference.type && <span className="diff__type">{difference.type}</span>}
                                        </div>
                                        {/* Both sides on every row, so each column lines up down the list. A
                                            dropped field has nothing after, and an added one nothing before. */}
                                        <div className="diff__values">
                                            <div className="diff__value">
                                                <span className="diff__side">before Altinn</span>
                                                {difference.left === null ? (
                                                    <span className="diff__none">none</span>
                                                ) : (
                                                    <span className={difference.kind === "missing" ? "diff__gone" : undefined}>
                                                        {difference.left}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="diff__value">
                                                <span className="diff__side">after Altinn</span>
                                                {difference.right === null ? (
                                                    <span className="diff__none">none</span>
                                                ) : (
                                                    <span>{difference.right}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {differences.length > 0 && hidden && <p className="field__hint above-s">{hidden} hidden.</p>}
                    </>
                )}

                {error ? (
                    <div className="above-m">
                        <ErrorNotice error={error} />
                    </div>
                ) : null}
            </div>
        </div>
    );
}
