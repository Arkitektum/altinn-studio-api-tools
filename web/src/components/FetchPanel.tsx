import { useEffect, useState } from "react";
import { instanceLabel } from "../lib/format";
import { CopyButton } from "./CopyButton";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { DataElementSummary, FetchedDataElement, InstanceSummary } from "../types";

interface FetchPanelProps {
    appHost: string;
    org: string;
    app: string;
    instanceOwnerPartyId: string;
    onPartyChange: (next: string) => void;
    instanceGuid: string;
    onInstanceGuidChange: (next: string) => void;
    /**
     * The party's instances from the last listing. Null means nothing has been listed yet, which
     * reads differently from a party that genuinely has none.
     */
    instances: InstanceSummary[] | null;
    onListInstances: () => void;
    /** Data elements from the last successful instance read, for the data guid select. */
    dataElements: DataElementSummary[];
    dataGuid: string;
    onDataGuidChange: (next: string) => void;
    /** The data element last read back, for the download and copy buttons. */
    fetched: FetchedDataElement | null;
    onDownloadDataElement: () => void;
    onLoadIntoPayload: () => void;
    onGetInstance: () => void;
    onGetDataElement: () => void;
    onValidateInstance: () => void;
    onValidateDataElement: () => void;
    onPreviewPdf: () => void;
    onDeleteInstance: (hard: boolean) => void;
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
    appHost,
    org,
    app,
    instanceOwnerPartyId,
    onPartyChange,
    instanceGuid,
    onInstanceGuidChange,
    instances,
    onListInstances,
    dataElements,
    dataGuid,
    onDataGuidChange,
    fetched,
    onDownloadDataElement,
    onLoadIntoPayload,
    onGetInstance,
    onGetDataElement,
    onValidateInstance,
    onValidateDataElement,
    onPreviewPdf,
    onDeleteInstance,
    busy,
    hasToken,
    error
}: FetchPanelProps) {
    /** Delete asks twice. Hard delete cannot be undone, and soft takes the instance out of use. */
    const [confirming, setConfirming] = useState(false);
    const [hard, setHard] = useState(false);

    // Aiming at another instance drops a pending confirmation, so a second click never lands on
    // an instance you did not mean.
    useEffect(() => {
        setConfirming(false);
    }, [instanceGuid, instanceOwnerPartyId]);

    const base = `${appHost}/${org || "{org}"}/${app || "{app}"}`;
    const party = instanceOwnerPartyId || "{partyId}";
    const guid = instanceGuid || "{instanceGuid}";

    const canGetInstance = hasToken && Boolean(org && app && instanceOwnerPartyId && instanceGuid);
    // Listing needs a party but no guid, since finding the guid is the point of it.
    const canListInstances = hasToken && Boolean(org && app && instanceOwnerPartyId);
    const selected = dataElements.find((element) => element.id === dataGuid);

    return (
        <Panel title="Fetch">
            <p className="field__hint" style={{ marginBottom: 12 }}>
                Posting reads the instance back and validates it automatically. Use this to inspect an instance you did not just create, by pasting
                its party id and guid.
            </p>

            <div className="grid grid--2">
                <div className="field">
                    <label htmlFor="fetchParty">Instance owner party id</label>
                    <input
                        id="fetchParty"
                        type="text"
                        value={instanceOwnerPartyId}
                        onChange={(event) => onPartyChange(event.target.value.trim())}
                        placeholder="510001"
                        autoComplete="off"
                    />
                </div>
                <div className="field">
                    <label htmlFor="fetchGuid">Instance guid</label>
                    <input
                        id="fetchGuid"
                        type="text"
                        value={instanceGuid}
                        onChange={(event) => onInstanceGuidChange(event.target.value.trim())}
                        placeholder="99d0632c-5917-448c-8ab6-a5d3b681376b"
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>
            </div>

            <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn" onClick={onListInstances} disabled={busy || !canListInstances}>
                    {busy && <span className="btn__spinner" />}
                    List instances
                </button>
                {instances !== null && instances.length === 0 && <span className="field__hint">No active instances for party {party}.</span>}
            </div>

            <p className="field__hint" style={{ marginTop: 8 }}>
                <span className="method method--get">GET</span> {base}/instances/{party}/active
                <br />
                Altinn lists the instances whose process has not ended, so an archived one is not in here.
            </p>

            {/* Nothing to pick from until a listing has found something. */}
            {instances !== null && instances.length > 0 && (
                <div className="field" style={{ marginTop: 12 }}>
                    <label htmlFor="instancePick">Instance</label>
                    <select
                        id="instancePick"
                        value={instances.some((instance) => instance.instanceGuid === instanceGuid) ? instanceGuid : ""}
                        // The full "party/guid" goes through, so the party follows the instance.
                        onChange={(event) => {
                            const picked = instances.find((instance) => instance.instanceGuid === event.target.value);
                            if (picked) onInstanceGuidChange(picked.id);
                        }}
                    >
                        <option value="">Pick one of {instances.length}</option>
                        {instances.map((instance) => (
                            <option key={instance.instanceGuid} value={instance.instanceGuid}>
                                {instanceLabel(instance)}
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn" onClick={onGetInstance} disabled={busy || !canGetInstance}>
                    {busy && <span className="btn__spinner" />}
                    Get instance
                </button>
                <button type="button" className="btn" onClick={onValidateInstance} disabled={busy || !canGetInstance}>
                    Validate instance
                </button>
                <button type="button" className="btn" onClick={onPreviewPdf} disabled={busy || !canGetInstance}>
                    Preview pdf
                </button>
            </div>

            <p className="field__hint" style={{ marginTop: 8 }}>
                <span className="method method--get">GET</span> {base}/instances/{party}/{guid}
                <br />
                <span className="method method--get">GET</span> {base}/instances/{party}/{guid}/validate
                <br />
                <span className="method method--get">GET</span> {base}/instances/{party}/{guid}/pdf/preview
            </p>

            {/* There is nothing to pick from until an instance read has listed its data elements. */}
            {dataElements.length > 0 && (
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
            )}

            {/* Clearing up after a test run. Kept to the bottom, away from the read buttons. */}
            <div className="danger">
                <span className="legend">Delete instance</span>
                <label className="check">
                    <input type="checkbox" checked={hard} onChange={(event) => setHard(event.target.checked)} disabled={busy} />
                    <span className="check__body">
                        <span className="check__title">Hard delete</span>
                        <span className="check__note">
                            Off marks the instance deleted and takes it out of the active list, leaving it in storage. On removes it outright, which
                            cannot be undone.
                        </span>
                    </span>
                </label>

                <div className="row" style={{ marginTop: 10 }}>
                    {confirming ? (
                        <>
                            <button
                                type="button"
                                className="btn btn--danger btn--armed"
                                onClick={() => {
                                    setConfirming(false);
                                    onDeleteInstance(hard);
                                }}
                                disabled={busy || !canGetInstance}
                            >
                                {busy && <span className="btn__spinner" />}
                                Confirm {hard ? "hard" : "soft"} delete of {instanceGuid.slice(0, 8)}
                            </button>
                            <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>
                                Cancel
                            </button>
                        </>
                    ) : (
                        <button type="button" className="btn" onClick={() => setConfirming(true)} disabled={busy || !canGetInstance}>
                            Delete instance
                        </button>
                    )}
                </div>

                <p className="field__hint" style={{ marginTop: 8 }}>
                    <span className="method method--delete">DELETE</span> {base}/instances/{party}/{guid}?hard={String(hard)}
                </p>
            </div>

            {error ? (
                <div style={{ marginTop: 12 }}>
                    <ErrorNotice error={error} />
                </div>
            ) : null}
        </Panel>
    );
}
