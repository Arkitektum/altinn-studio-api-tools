import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { DataElementSummary } from "../types";

interface FetchPanelProps {
    appHost: string;
    org: string;
    app: string;
    instanceOwnerPartyId: string;
    onPartyChange: (next: string) => void;
    instanceGuid: string;
    onInstanceGuidChange: (next: string) => void;
    /** Data elements from the last successful instance read, for the data guid select. */
    dataElements: DataElementSummary[];
    dataGuid: string;
    onDataGuidChange: (next: string) => void;
    onGetInstance: () => void;
    onGetDataElement: () => void;
    onValidateInstance: () => void;
    onValidateDataElement: () => void;
    onPreviewPdf: () => void;
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
    dataElements,
    dataGuid,
    onDataGuidChange,
    onGetInstance,
    onGetDataElement,
    onValidateInstance,
    onValidateDataElement,
    onPreviewPdf,
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
                </>
            )}

            {error ? (
                <div style={{ marginTop: 12 }}>
                    <ErrorNotice error={error} />
                </div>
            ) : null}
        </Panel>
    );
}
