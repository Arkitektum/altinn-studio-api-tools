import { CopyButton } from "./CopyButton";
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
    onDownloadDataElement: () => void;
    onLoadIntoPayload: () => void;
    onGetDataElement: () => void;
    onValidateDataElement: () => void;
    busy: boolean;
    hasToken: boolean;
    error: unknown;
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
    onLoadIntoPayload,
    onGetDataElement,
    onValidateDataElement,
    busy,
    hasToken,
    error
}: FetchPanelProps) {
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
                    <span className="badge" title={`${instanceOwnerPartyId}/${instanceGuid}`}>
                        {instanceGuid.slice(0, 8)}
                    </span>
                ) : undefined
            }
        >
            <p className="field__hint" style={{ marginBottom: 12 }}>
                The data elements on the instance selected in Instances, listed by the read that happens when you select it. Comparing what one holds
                with what was written is the panel below.
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

                    <div className="row" style={{ marginTop: 12 }}>
                        <button type="button" className="btn" onClick={onGetDataElement} disabled={busy || !canGetInstance || !dataGuid}>
                            {busy && <span className="btn__spinner" />}
                            Get data element
                        </button>
                        <button type="button" className="btn" onClick={onValidateDataElement} disabled={busy || !canGetInstance || !dataGuid}>
                            Validate data element
                        </button>
                    </div>

                    {dataGuid && (
                        <p className="field__hint" style={{ marginTop: 8 }}>
                            <span className="method method--get">GET</span> {base}/instances/{party}/{guid}/data/{dataGuid}
                            <br />
                            <span className="method method--get">GET</span> {base}/instances/{party}/{guid}/data/{dataGuid}/validate
                        </p>
                    )}

                    {/* What came back, as a file rather than as text in the log. */}
                    {fetched && (
                        <>
                            <div className="row" style={{ marginTop: 12 }}>
                                <button type="button" className="btn" onClick={onDownloadDataElement}>
                                    Download {fetched.filename}
                                </button>
                                <button type="button" className="btn" onClick={onLoadIntoPayload}>
                                    Load into payload
                                </button>
                                {/* Copying base64 as text would hand over the encoding, not the file. */}
                                {fetched.encoding === "utf8" && <CopyButton label="Copy content" text={fetched.content} />}
                            </div>
                            <p className="field__hint" style={{ marginTop: 8 }}>
                                {fetched.contentType ?? "unknown type"} · {fetched.size} B · Loading puts it in the Payload panel for editing, and
                                leaves the destination alone, so you choose whether it goes back to this instance or into a new one.
                            </p>
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
        </Panel>
    );
}
