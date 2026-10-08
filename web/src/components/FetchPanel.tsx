import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../queries";
import { useAppRead, useDataElementRead, useInstanceRead } from "../reads";
import { useSession } from "../session";
import { downloadContent } from "../lib/download";
import { pairComparisons } from "../lib/comparisons";
import { dataTypeKindOf } from "../lib/dataTypeGroups";
import { validationBlockedBy } from "../lib/elementValidation";
import { heldElement } from "../lib/heldElement";
import { CompareSection } from "./CompareSection";
import { Dump } from "./Dump";
import { Modal } from "./Modal";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { DataElementInput, DataElementSummary } from "../types";
import { Icon } from "./Icon";

interface FetchPanelProps {
    /** Why the panel cannot be used yet, or null when it can. See lib/readiness.ts. */
    notReady: string | null;
    /** Anchor for the chain strip to scroll to. */
    id: string;
    dataGuid: string;
    onDataGuidChange: (next: string) => void;
    /**
     * The payload, which is the other half of the comparison: the xml each form was written from.
     * Passed in because it belongs to the payload panel, which is where it is edited.
     */
    payload: DataElementInput[];
}

function describeElement(element: DataElementSummary): string {
    const bits = [element.dataType];
    if (element.filename) bits.push(element.filename);
    if (element.contentType) bits.push(element.contentType);
    if (element.size !== null) {
        bits.push(element.size < 1024 ? `${element.size} B` : `${Math.round(element.size / 1024)} kB`);
    }
    return bits.join(" · ");
}

export function FetchPanel({ notReady, id, dataGuid, onDataGuidChange, payload }: FetchPanelProps) {
    /** Whether the content that came back is open in a window of its own. */
    const [showing, setShowing] = useState(false);

    const queryClient = useQueryClient();
    const { instance, tokenId, tokenUsable, org, app, partyId, instanceGuid } = useSession();
    const { metadata } = useAppRead();
    const { dataElements, process, fetching: readingInstance } = useInstanceRead();

    const canGetInstance = tokenUsable && Boolean(org && app && partyId && instanceGuid);
    const selected = dataElements.find((element) => element.id === dataGuid);

    /**
     * Why validating the selected element would say nothing useful, or null when it would. The
     * validation is skipped with the reason in place of its url, rather than sent at a task the
     * instance has already left.
     */
    const validateBlockedBy = validationBlockedBy(
        process,
        metadata?.metadata.dataTypes?.find((type) => type.id === selected?.dataType)
    );

    const element = useDataElementRead(dataGuid, selected?.lastChanged ?? null, validateBlockedBy);

    /** Every form on the instance beside the payload element it was written from, whatever is selected. */
    const comparisons = useMemo(() => {
        const appMetadata = metadata?.metadata ?? null;
        const dataTypes = appMetadata?.dataTypes ?? [];
        const kindOf = (dataType: string) => {
            const kind = dataTypeKindOf(dataTypes, appMetadata, dataType);
            return kind === "main" || kind === "sub" ? kind : null;
        };
        return pairComparisons(dataElements, payload, kindOf);
    }, [metadata, dataElements, payload]);

    /** Held so it can be saved as a file rather than read again. */
    const fetched = useMemo(() => (element.read ? heldElement(dataGuid, element.read, selected ?? null) : null), [element.read, dataGuid, selected]);

    const busy = element.fetching || readingInstance;
    const error = element.error;

    /**
     * Reads the selection and compares every form again as they stand, since neither waits for a
     * press. A refetch rather than an invalidation: the keys are already the right ones, and the
     * question is not whether the answers have gone stale but that they are being asked for again.
     * Active only, so the copies behind superseded edits are left alone, and a comparison with
     * nothing to compare against is disabled and so skipped.
     */
    function refresh() {
        element.refetch();
        for (const { stored } of comparisons) {
            void queryClient.refetchQueries({
                queryKey: [...queryKeys.dataElement(tokenId ?? "", org, app, partyId, instanceGuid, stored.id, stored.lastChanged), "compare"],
                type: "active"
            });
        }
    }

    return (
        <Panel
            notReady={notReady}
            tone="element"
            id={id}
            title="Data element"
            icon="download"
            aside={
                instanceGuid ? (
                    <span className="row" style={{ gap: 6 }}>
                        <span className="badge" title={`${partyId}/${instanceGuid}`}>
                            {instanceGuid.slice(0, 8)}
                        </span>
                        {/* Nothing here waits for a press, so the only button left is the one
                            that asks again: for an element the app has changed underneath us. */}
                        <button type="button" className="btn btn--get" onClick={refresh} disabled={busy || !canGetInstance || !dataGuid}>
                            {busy ? <span className="btn__spinner" /> : <Icon name="refresh" />}
                            Refresh
                        </button>
                    </span>
                ) : undefined
            }
        >
            <p className="field__hint" style={{ marginBottom: 12 }}>
                The data elements on the instance selected in Instances, listed by the read that happens when you select it. Picking one here reads it
                and validates it on its own. Every form on the instance is compared at the foot of this panel, whichever is picked.
            </p>

            {/* There is nothing to pick from until an instance read has listed its data elements. */}
            {dataElements.length > 0 ? (
                <>
                    <div className="field" style={{ marginTop: 16 }}>
                        <label htmlFor="dataGuid">Data element</label>
                        <select id="dataGuid" value={dataGuid} onChange={(event) => onDataGuidChange(event.target.value)}>
                            <option value="">Pick one of {dataElements.length}</option>
                            {dataElements.map((element) => (
                                <option key={element.id} value={element.id}>
                                    {describeElement(element)}
                                </option>
                            ))}
                        </select>
                        {selected && <p className="field__hint">{selected.id}</p>}
                    </div>

                    {dataGuid && (
                        <p className="field__hint" style={{ marginTop: 8 }}>
                            Read and validated on its own when you pick one, the way selecting an instance reads that:
                            <br />
                            <span className="method method--get">GET</span> {instance}/data/{dataGuid}
                            <br />
                            {/* The second line is not a call to make while the first is, so it says so. */}
                            {validateBlockedBy ? (
                                <span style={{ color: "var(--warn)" }}>{validateBlockedBy}</span>
                            ) : (
                                <>
                                    <span className="method method--get">GET</span> {instance}/data/{dataGuid}/validate
                                </>
                            )}
                        </p>
                    )}

                    {/*
                     * What came back. One button, since a body is worth reading at full size and
                     * not in a column this wide: the window it opens holds the copy and the
                     * download, the way a run log step holds its own.
                     */}
                    {fetched && (
                        <>
                            <div className="row" style={{ marginTop: 12 }}>
                                <button type="button" className="btn btn--ghost" onClick={() => setShowing(true)} aria-haspopup="dialog">
                                    <Icon name="eye" />
                                    Show content
                                </button>
                                <span className="field__hint" style={{ margin: 0 }}>
                                    {fetched.filename} · {fetched.contentType ?? "unknown type"} · {fetched.size} B
                                </span>
                            </div>

                            {showing && (
                                <Modal
                                    title={fetched.filename}
                                    aside={
                                        <button
                                            type="button"
                                            className="btn btn--ghost"
                                            onClick={() =>
                                                fetched && downloadContent(fetched.filename, fetched.content, fetched.encoding, fetched.contentType)
                                            }
                                        >
                                            <Icon name="download" />
                                            Download
                                        </button>
                                    }
                                    bodyClassName="modal__stack"
                                    onClose={() => setShowing(false)}
                                >
                                    {fetched.encoding === "utf8" ? (
                                        // The label carries what it is, since the title carries what it is called.
                                        <Dump
                                            label={`${fetched.contentType ?? "unknown type"} · ${fetched.size} B`}
                                            text={fetched.content}
                                            contentType={fetched.contentType}
                                        />
                                    ) : (
                                        // Base64 on screen is the encoding rather than the file, and copying it
                                        // would hand over the encoding too. Downloading is the only useful thing.
                                        <p className="field__hint">
                                            {fetched.size} bytes of {fetched.contentType ?? "an unknown type"}, which is a file rather than text.
                                            Download it to see what it is.
                                        </p>
                                    )}
                                </Modal>
                            )}
                        </>
                    )}
                </>
            ) : (
                <p className="field__hint">No data elements on it yet. A new instance gets its form data element when it is created.</p>
            )}

            {error ? (
                <div style={{ marginTop: 12 }}>
                    <ErrorNotice error={error} />
                </div>
            ) : null}

            {/* Inside the panel, because it compares the elements the select above lists. */}
            {dataElements.length > 0 && <CompareSection pairs={comparisons} />}
        </Panel>
    );
}
