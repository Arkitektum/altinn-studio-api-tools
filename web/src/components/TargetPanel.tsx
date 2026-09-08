import { partyLabel } from "../lib/format";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { AppMetadataResponse, AppParty, CatalogueApp } from "../types";

interface TargetPanelProps {
    appHost: string;
    org: string;
    app: string;
    onOrgChange: (next: string) => void;
    onAppChange: (next: string) => void;
    instanceOwnerPartyId: string;
    onPartyChange: (next: string) => void;
    instanceGuid: string;
    metadata: AppMetadataResponse | null;
    parties: AppParty[];
    onProbe: () => void;
    probing: boolean;
    probeError: unknown;
    hasToken: boolean;
    elementCount: number;
    catalogue: CatalogueApp[];
    onPickCatalogueApp: (entry: CatalogueApp) => void;
}

export function TargetPanel({
    appHost,
    org,
    app,
    onOrgChange,
    onAppChange,
    instanceOwnerPartyId,
    onPartyChange,
    instanceGuid,
    metadata,
    parties,
    onProbe,
    probing,
    probeError,
    hasToken,
    elementCount,
    catalogue,
    onPickCatalogueApp
}: TargetPanelProps) {
    // Altinn nests subunits under their parent org, so flatten for the picker.
    const flatParties: AppParty[] = parties.flatMap((party) => [party, ...(party.childParties ?? [])]);

    /**
     * What the party select offers. The parties the app says this token may instantiate for,
     * plus the current value when it is not among them, which happens with a party prefilled
     * from the token claim before the app has been read, or one the app does not list. Without
     * that the select would show no selection and there is no longer a field to type in.
     */
    const partyOptions: { value: string; label: string }[] = flatParties.map((entry) => ({
        value: String(entry.partyId),
        label: partyLabel(entry)
    }));
    if (instanceOwnerPartyId && !partyOptions.some((option) => option.value === instanceOwnerPartyId)) {
        partyOptions.unshift({ value: instanceOwnerPartyId, label: `${instanceOwnerPartyId} · from the token` });
    }

    const base = `${appHost}/${org || "{org}"}/${app || "{app}"}`;
    const party = instanceOwnerPartyId || "{partyId}";
    // An instance selected in Instances means the data goes onto it, and none means the post
    // creates one. There is no separate destination to read.
    const preview = instanceGuid
        ? `${base}/instances/${party}/${instanceGuid}/data?dataType=…`
        : `${base}/instances  (multipart, ${elementCount} part${elementCount === 1 ? "" : "s"} + instance)`;

    return (
        <Panel
            title="Target"
            aside={metadata ? <span className="badge badge--ok">{metadata.metadata.dataTypes?.length ?? 0} data types</span> : undefined}
        >
            <div className="field" style={{ marginBottom: 12 }}>
                <label htmlFor="knownApp">Known app</label>
                <select
                    id="knownApp"
                    value={catalogue.some((e) => e.org === org && e.app === app) ? `${org}/${app}` : ""}
                    onChange={(event) => {
                        const entry = catalogue.find((e) => `${e.org}/${e.app}` === event.target.value);
                        if (entry) onPickCatalogueApp(entry);
                    }}
                >
                    <option value="">Pick a known app, or type below</option>
                    {catalogue.map((entry) => (
                        <option key={`${entry.org}/${entry.app}`} value={`${entry.org}/${entry.app}`}>
                            {entry.org}/{entry.app} → {entry.dataType}
                            {entry.subForms.length > 0 ? ` (+${entry.subForms.length} subform)` : ""}
                        </option>
                    ))}
                </select>
            </div>

            <div className="grid grid--2">
                <div className="field">
                    <label htmlFor="org">Org</label>
                    <input
                        id="org"
                        type="text"
                        value={org}
                        onChange={(event) => onOrgChange(event.target.value.trim())}
                        placeholder="dibk"
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>
                <div className="field">
                    <label htmlFor="app">App</label>
                    <input
                        id="app"
                        type="text"
                        value={app}
                        onChange={(event) => onAppChange(event.target.value.trim())}
                        placeholder="et-v4"
                        autoComplete="off"
                        spellCheck={false}
                    />
                </div>
            </div>

            {/*
             * Two buttons deliberately absent. Reading the app is two requests that create
             * nothing, so it happens on its own and the header badge reports it; the only
             * affordance left is a retry, and only when one failed. A link to the app root is
             * gone because Altinn instantiates from it, so it left an empty instance behind
             * every time, and both the run log entry and the instance listing open a real one.
             */}
            {!hasToken && <p className="field__hint">Get a token first, and the app is read automatically.</p>}

            {probing && (
                <p className="field__hint">
                    <span className="btn__spinner" /> Reading the app's data types and parties…
                </p>
            )}

            {probeError ? (
                <div style={{ marginTop: 12 }}>
                    <ErrorNotice error={probeError} />
                    <button type="button" className="btn btn--ghost btn--tiny" style={{ marginTop: 8 }} onClick={onProbe} disabled={probing}>
                        Try again
                    </button>
                </div>
            ) : null}

            <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="party">Instance owner party</label>
                <select
                    id="party"
                    value={instanceOwnerPartyId}
                    onChange={(event) => onPartyChange(event.target.value)}
                    disabled={partyOptions.length === 0}
                >
                    {partyOptions.length === 0 ? (
                        <option value="">No parties yet</option>
                    ) : (
                        <>
                            <option value="">Pick one of {partyOptions.length}</option>
                            {partyOptions.map((entry) => (
                                <option key={entry.value} value={entry.value}>
                                    {entry.label}
                                </option>
                            ))}
                        </>
                    )}
                </select>
                <p className="field__hint">
                    {partyOptions.length === 0
                        ? "Read from the app, which needs a token and an app above."
                        : "The parties this token may instantiate for, read from the app."}
                </p>
            </div>

            <div style={{ marginTop: 14 }}>
                <span className="legend">Will call</span>
                <pre className="dump" style={{ margin: 0 }}>
                    <span className="method method--post">POST</span> {preview}
                </pre>
                <p className="field__hint">{instanceGuid ? "Onto the instance selected in Instances." : "Creating a new instance."}</p>
            </div>
        </Panel>
    );
}
