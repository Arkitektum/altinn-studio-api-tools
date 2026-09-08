import { useEffect, useState } from "react";
import { instanceLabel } from "../lib/format";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { InstanceSummary } from "../types";

interface InstancesPanelProps {
    appHost: string;
    org: string;
    app: string;
    instanceOwnerPartyId: string;
    /**
     * The party's instances. Null means the listing has not answered yet, which reads differently
     * from a party that genuinely has none.
     */
    instances: InstanceSummary[] | null;
    /** The instance the rest of the tool is pointed at, so the row can say which one that is. */
    instanceGuid: string;
    onSelect: (instance: InstanceSummary) => void;
    onDelete: (instance: InstanceSummary, hard: boolean) => void;
    onRefresh: () => void;
    busy: boolean;
    error: unknown;
}

export function InstancesPanel({
    appHost,
    org,
    app,
    instanceOwnerPartyId,
    instances,
    instanceGuid,
    onSelect,
    onDelete,
    onRefresh,
    busy,
    error
}: InstancesPanelProps) {
    /** Which row has been armed for deletion, by guid. One at a time. */
    const [confirming, setConfirming] = useState<string | null>(null);
    const [hard, setHard] = useState(false);

    // A list that changed under a pending confirmation is not the list it was armed against.
    useEffect(() => {
        setConfirming(null);
    }, [instances]);

    const base = `${appHost}/${org || "{org}"}/${app || "{app}"}`;

    return (
        <Panel
            title="Instances"
            aside={
                <span className="row" style={{ gap: 6 }}>
                    <button type="button" className="btn btn--ghost btn--tiny" onClick={onRefresh} disabled={busy}>
                        {busy && <span className="btn__spinner" />}
                        Refresh
                    </button>
                    {instances !== null && <span className="badge">{instances.length}</span>}
                </span>
            }
        >
            <p className="field__hint" style={{ marginBottom: 12 }}>
                <span className="method method--get">GET</span> {base}/instances/{instanceOwnerPartyId || "{partyId}"}/active
                <br />
                Listed on its own for the party in Target. Altinn returns the instances whose process has not ended, so an archived one is not here
                and its guid has to be pasted into Fetch.
            </p>

            {instances === null && !busy && <p className="field__hint">Nothing listed yet.</p>}
            {instances !== null && instances.length === 0 && <p className="field__hint">This party has no active instances.</p>}

            {instances !== null && instances.length > 0 && (
                <div className="picklist">
                    {instances.map((instance) => {
                        const armed = confirming === instance.instanceGuid;
                        const current = instance.instanceGuid === instanceGuid;
                        return (
                            <div key={instance.instanceGuid} style={{ display: "flex", gap: 6 }}>
                                {/* Selecting points the whole tool at it: Fetch, Process and the existing destination. */}
                                <button
                                    type="button"
                                    className="picklist__item"
                                    style={{ flex: 1 }}
                                    aria-current={current}
                                    onClick={() => onSelect(instance)}
                                    title={instance.id}
                                >
                                    <span className={`led ${current ? "led--ok" : "led--warn"}`} />
                                    <span>{instanceLabel(instance)}</span>
                                </button>

                                <a
                                    href={`${base}/#/instance/${instance.instanceOwnerPartyId}/${instance.instanceGuid}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="btn btn--ghost btn--tiny"
                                    title="Open it in the app, which needs a LocalTest session in the browser"
                                >
                                    Open
                                </a>

                                {armed ? (
                                    <>
                                        <button
                                            type="button"
                                            className="btn btn--danger btn--armed btn--tiny"
                                            onClick={() => onDelete(instance, hard)}
                                            disabled={busy}
                                        >
                                            Confirm {hard ? "hard" : "soft"} delete
                                        </button>
                                        <button type="button" className="btn btn--ghost btn--tiny" onClick={() => setConfirming(null)}>
                                            Cancel
                                        </button>
                                    </>
                                ) : (
                                    <button
                                        type="button"
                                        className="btn btn--ghost btn--tiny btn--danger"
                                        onClick={() => setConfirming(instance.instanceGuid)}
                                        disabled={busy}
                                        aria-label={`Delete instance ${instance.instanceGuid}`}
                                    >
                                        Delete
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {instances !== null && instances.length > 0 && (
                <label className="check" style={{ marginTop: 12 }}>
                    <input type="checkbox" checked={hard} onChange={(event) => setHard(event.target.checked)} disabled={busy} />
                    <span className="check__body">
                        <span className="check__title">Hard delete</span>
                        <span className="check__note">
                            Off marks the instance deleted and takes it out of this list, leaving it in storage. On removes it outright, which cannot
                            be undone. Either way delete asks twice.
                        </span>
                    </span>
                </label>
            )}

            {error ? (
                <div style={{ marginTop: 12 }}>
                    <ErrorNotice error={error} />
                </div>
            ) : null}
        </Panel>
    );
}
