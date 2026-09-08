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

/**
 * Two destinations. The api also takes `sequential`, which posts each data element in its own
 * request, but it did the same thing as multipart with a longer log, so it is not offered here.
 */
const MODES: { value: RunMode; label: string; note: string }[] = [
    {
        value: "multipart",
        label: "New instance",
        note: "One multipart POST /instances carrying the instance plus every data element."
    },
    {
        value: "existing",
        label: "Existing instance",
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

            <div style={{ marginTop: 16 }}>
                <span className="legend">Destination</span>
                <div className="tabs" role="tablist" aria-label="Destination">
                    {MODES.map((entry) => (
                        <button
                            key={entry.value}
                            type="button"
                            role="tab"
                            aria-selected={mode === entry.value}
                            onClick={() => onModeChange(entry.value)}
                        >
                            {entry.label}
                        </button>
                    ))}
                </div>
                {activeMode && (
                    <p className="field__hint" style={{ marginTop: 0 }}>
                        {activeMode.note}
                    </p>
                )}
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
