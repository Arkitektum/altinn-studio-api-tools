import { useState } from "react";
import { partyLabel } from "../lib/format";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { AppMetadataResponse, AppParty, CatalogueApp } from "../types";

interface TargetPanelProps {
    /** Anchor for the chain strip to scroll to. */
    id: string;
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

/** The value that stands for "not one of these", revealing the org and app fields. */
const OTHER = "other";

export function TargetPanel({
    id,
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
    /**
     * Which application is targeted, and whether it is being typed rather than picked.
     *
     * Derived rather than stored, so that a catalogue arriving after the first render does not
     * leave a catalogued app looking hand-typed. The one thing worth remembering is an explicit
     * choice: picking "Other application" with the fields still empty has nothing to derive from.
     */
    const [chose, setChose] = useState<"catalogue" | "other" | null>(null);
    const pair = org && app ? `${org}/${app}` : "";
    const inCatalogue = catalogue.some((entry) => entry.org === org && entry.app === app);
    const typing = chose === "other" || (chose === null && Boolean(pair) && !inCatalogue);

    function pick(value: string) {
        if (value === OTHER) {
            setChose("other");
            return;
        }
        setChose("catalogue");
        const entry = catalogue.find((candidate) => `${candidate.org}/${candidate.app}` === value);
        if (entry) onPickCatalogueApp(entry);
    }

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
            id={id}
            title="Target"
            aside={metadata ? <span className="badge badge--ok">{metadata.metadata.dataTypes?.length ?? 0} data types</span> : undefined}
        >
            <div className="field">
                <label htmlFor="application">Application</label>
                <select id="application" value={typing ? OTHER : inCatalogue ? pair : ""} onChange={(event) => pick(event.target.value)}>
                    <option value="">{catalogue.length === 0 ? "Nothing in the catalogue" : `Pick one of ${catalogue.length}`}</option>
                    {catalogue.map((entry) => (
                        <option key={`${entry.org}/${entry.app}`} value={`${entry.org}/${entry.app}`}>
                            {entry.org}/{entry.app} → {entry.dataType}
                            {entry.subForms.length > 0 ? ` (+${entry.subForms.length} subform)` : ""}
                        </option>
                    ))}
                    {/* The catalogue is generated, so an app it has never heard of needs typing. */}
                    <option value={OTHER}>Other application…</option>
                </select>

                {typing ? (
                    <div className="grid grid--2" style={{ marginTop: 6 }}>
                        <input
                            type="text"
                            value={org}
                            onChange={(event) => onOrgChange(event.target.value.trim())}
                            placeholder="dibk"
                            autoComplete="off"
                            spellCheck={false}
                            aria-label="Org"
                        />
                        <input
                            type="text"
                            value={app}
                            onChange={(event) => onAppChange(event.target.value.trim())}
                            placeholder="et-v4"
                            autoComplete="off"
                            spellCheck={false}
                            aria-label="App"
                        />
                    </div>
                ) : null}

                <p className="field__hint">
                    {typing
                        ? "Org and app, read once both are filled in. The catalogue's data type suggestions are not available for an app it does not list."
                        : "The apps the catalogue knows, with the data type each uses for its form data."}
                </p>
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
