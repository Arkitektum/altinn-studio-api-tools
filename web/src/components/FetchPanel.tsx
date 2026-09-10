import { useState, type ReactNode } from "react";
import { Dump } from "./Dump";
import { Modal } from "./Modal";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { DataElementSummary, FetchedDataElement } from "../types";

interface FetchPanelProps {
    /** Anchor for the chain strip to scroll to. */
    id: string;
    appHost: string;
    org: string;
    app: string;
    instanceOwnerPartyId: string;
    instanceGuid: string;
    /** Data elements from the last successful instance read, for the data guid select. */
    dataElements: DataElementSummary[];
    dataGuid: string;
    onDataGuidChange: (next: string) => void;
    /** The data element last read back, for the download and copy buttons. */
    fetched: FetchedDataElement | null;
    /** Saves what came back as a file. Offered in the window, where the content is. */
    onDownloadDataElement: () => void;
    /** Reads and compares again for the selection as it stands, since neither waits for a press. */
    onRefresh: () => void;
    /**
     * Why validating the selected element would say nothing useful, or null when it would. The
     * validation is skipped with the reason in place of its url, rather than sent at a task the
     * instance has already left.
     */
    validateBlockedBy: string | null;
    busy: boolean;
    hasToken: boolean;
    error: unknown;
    /**
     * The comparison, which acts on the element selected here. It is a section of this panel
     * rather than a panel of its own, so that what it compares is not left to be inferred.
     */
    children?: ReactNode;
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

export function FetchPanel({
    id,
    appHost,
    org,
    app,
    instanceOwnerPartyId,
    instanceGuid,
    dataElements,
    dataGuid,
    onDataGuidChange,
    fetched,
    onDownloadDataElement,
    onRefresh,
    validateBlockedBy,
    busy,
    hasToken,
    error,
    children
}: FetchPanelProps) {
    /** Whether the content that came back is open in a window of its own. */
    const [showing, setShowing] = useState(false);

    const base = `${appHost}/${org || "{org}"}/${app || "{app}"}`;
    const party = instanceOwnerPartyId || "{partyId}";
    const guid = instanceGuid || "{instanceGuid}";

    const canGetInstance = hasToken && Boolean(org && app && instanceOwnerPartyId && instanceGuid);
    const selected = dataElements.find((element) => element.id === dataGuid);

    return (
        <Panel
            id={id}
            title="Data element"
            aside={
                instanceGuid ? (
                    <span className="row" style={{ gap: 6 }}>
                        <span className="badge" title={`${instanceOwnerPartyId}/${instanceGuid}`}>
                            {instanceGuid.slice(0, 8)}
                        </span>
                        {/* Nothing here waits for a press, so the only button left is the one
                            that asks again: for an element the app has changed underneath us. */}
                        <button type="button" className="btn btn--get" onClick={onRefresh} disabled={busy || !canGetInstance || !dataGuid}>
                            {busy && <span className="btn__spinner" />}
                            Refresh
                        </button>
                    </span>
                ) : undefined
            }
        >
            <p className="field__hint" style={{ marginBottom: 12 }}>
                The data elements on the instance selected in Instances, listed by the read that happens when you select it. Picking one here reads
                it, validates it, and compares it at the foot of this panel, all on their own.
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
                            <span className="method method--get">GET</span> {base}/instances/{party}/{guid}/data/{dataGuid}
                            <br />
                            {/* The second line is not a call to make while the first is, so it says so. */}
                            {validateBlockedBy ? (
                                <span style={{ color: "var(--warn)" }}>{validateBlockedBy}</span>
                            ) : (
                                <>
                                    <span className="method method--get">GET</span> {base}/instances/{party}/{guid}/data/{dataGuid}/validate
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
                                        <button type="button" className="btn btn--ghost" onClick={onDownloadDataElement}>
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

            {children}
        </Panel>
    );
}
