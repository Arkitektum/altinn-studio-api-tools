import { partyLabel } from "../lib/format";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { AppMetadataResponse, AppParty, CatalogueApp, RunMode } from "../types";

interface TargetPanelProps {
    appHost: string;
    org: string;
    app: string;
    onOrgChange: (next: string) => void;
    onAppChange: (next: string) => void;
    instanceOwnerPartyId: string;
    onPartyChange: (next: string) => void;
    instanceGuid: string;
    onInstanceGuidChange: (next: string) => void;
    mode: RunMode;
    onModeChange: (next: RunMode) => void;
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

const MODES: { value: RunMode; label: string; note: string }[] = [
    {
        value: "sequential",
        label: "New instance, one request per data element",
        note: "POST /instances, then PUT/POST each data element. Clearest log."
    },
    {
        value: "multipart",
        label: "New instance, all data in one request",
        note: "A single multipart POST /instances carrying the instance plus every data element."
    },
    {
        value: "existing",
        label: "Existing instance, post data onto it",
        note: "Skips creation and upserts the data elements on an instance you already have."
    }
];

export function TargetPanel({
    appHost,
    org,
    app,
    onOrgChange,
    onAppChange,
    instanceOwnerPartyId,
    onPartyChange,
    instanceGuid,
    onInstanceGuidChange,
    mode,
    onModeChange,
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

    const base = `${appHost}/${org || "{org}"}/${app || "{app}"}`;
    const party = instanceOwnerPartyId || "{partyId}";
    const preview =
        mode === "existing"
            ? `${base}/instances/${party}/${instanceGuid || "{instanceGuid}"}/data?dataType=…`
            : mode === "multipart"
              ? `${base}/instances  (multipart, ${elementCount} part${elementCount === 1 ? "" : "s"} + instance)`
              : `${base}/instances?instanceOwnerPartyId=${party}`;

    const activeMode = MODES.find((entry) => entry.value === mode);

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

            <div className="row" style={{ marginTop: 12 }}>
                <button type="button" className="btn" onClick={onProbe} disabled={probing || !hasToken || !org || !app}>
                    {probing && <span className="btn__spinner" />}
                    Probe app
                </button>
                {metadata && (
                    <a href={metadata.baseUrl} target="_blank" rel="noreferrer" className="btn btn--ghost btn--tiny">
                        Open app
                    </a>
                )}
                {!hasToken && <span className="field__hint">Get a token first.</span>}
            </div>

            {probeError ? (
                <div style={{ marginTop: 12 }}>
                    <ErrorNotice error={probeError} />
                </div>
            ) : null}

            <div className="field" style={{ marginTop: 16 }}>
                <label htmlFor="mode">Destination</label>
                <select id="mode" value={mode} onChange={(event) => onModeChange(event.target.value as RunMode)}>
                    {MODES.map((entry) => (
                        <option key={entry.value} value={entry.value}>
                            {entry.label}
                        </option>
                    ))}
                </select>
                {activeMode && <p className="field__hint">{activeMode.note}</p>}
            </div>

            <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="party">Instance owner party id</label>
                {flatParties.length > 0 && (
                    <select
                        // Falls back to the empty option when the id was typed by hand rather than picked.
                        value={flatParties.some((entry) => String(entry.partyId) === instanceOwnerPartyId) ? instanceOwnerPartyId : ""}
                        onChange={(event) => onPartyChange(event.target.value)}
                        aria-label="Pick from parties this token may instantiate for"
                    >
                        <option value="">Pick one of {flatParties.length} allowed parties</option>
                        {flatParties.map((entry) => (
                            <option key={entry.partyId} value={String(entry.partyId)}>
                                {partyLabel(entry)}
                            </option>
                        ))}
                    </select>
                )}
                <input
                    id="party"
                    type="text"
                    value={instanceOwnerPartyId}
                    onChange={(event) => onPartyChange(event.target.value.trim())}
                    placeholder="510001"
                    autoComplete="off"
                />
            </div>

            {mode === "existing" && (
                <div className="field" style={{ marginTop: 12 }}>
                    <label htmlFor="instanceGuid">Instance guid</label>
                    <input
                        id="instanceGuid"
                        type="text"
                        value={instanceGuid}
                        onChange={(event) => onInstanceGuidChange(event.target.value.trim())}
                        placeholder="99d0632c-5917-448c-8ab6-a5d3b681376b"
                        autoComplete="off"
                        spellCheck={false}
                    />
                    <p className="field__hint">
                        Paste the whole <code>510001/99d0632c-…</code> pair and the party id is split out for you.
                    </p>
                </div>
            )}

            <div style={{ marginTop: 14 }}>
                <span className="legend">Will call</span>
                <pre className="dump" style={{ margin: 0 }}>
                    <span className="method method--post">POST</span> {preview}
                </pre>
            </div>
        </Panel>
    );
}
