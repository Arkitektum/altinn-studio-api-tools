import { useEffect, useState } from "react";
import { instanceLabel } from "../lib/format";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { InstanceSummary } from "../types";

interface InstancesPanelProps {
    /** Anchor for the chain strip to scroll to. */
    id: string;
    appHost: string;
    org: string;
    app: string;
    instanceOwnerPartyId: string;
    /** For the login link, since opening an instance in the app is a session of its own. */
    localtestUrl: string;
    /**
     * The party's instances. Null means the listing has not answered yet, which reads differently
     * from a party that genuinely has none.
     */
    instances: InstanceSummary[] | null;
    /** The instance the rest of the tool is pointed at, so the row can say which one that is. */
    instanceGuid: string;
    /** Null selects the new instance row, which is what "post creates one" means. */
    onSelect: (instance: InstanceSummary | null) => void;
    /** A guid typed or pasted, for an instance the active list does not hold. */
    onSelectTyped: (value: string) => void;
    onDelete: (instance: InstanceSummary, hard: boolean) => void;
    onRefresh: () => void;
    busy: boolean;
    error: unknown;
}

export function InstancesPanel({
    id,
    appHost,
    org,
    app,
    instanceOwnerPartyId,
    localtestUrl,
    instances,
    instanceGuid,
    onSelect,
    onSelectTyped,
    onDelete,
    onRefresh,
    busy,
    error
}: InstancesPanelProps) {
    /** Which row has been armed for deletion, by guid. One at a time. */
    const [confirming, setConfirming] = useState<string | null>(null);
    /** Whether the guid field is showing, for an instance the list does not hold. */
    const [typing, setTyping] = useState(false);
    const [hard, setHard] = useState(false);

    // A list that changed under a pending confirmation is not the list it was armed against.
    useEffect(() => {
        setConfirming(null);
    }, [instances]);

    const base = `${appHost}/${org || "{org}"}/${app || "{app}"}`;

    /**
     * The rows to show. An instance whose process has ended leaves Altinn's active list, so the
     * one being worked on can be absent from it: after a post that advanced the process, for
     * instance. It gets a row of its own rather than leaving the list with nothing selected while
     * the post button says otherwise, and it stays deletable and readable.
     */
    const listed = instances ?? [];
    const selectedIsListed = instanceGuid === "" || listed.some((instance) => instance.instanceGuid === instanceGuid);
    const rows: { instance: InstanceSummary; absent: boolean }[] = [
        ...(selectedIsListed
            ? []
            : [
                  {
                      instance: {
                          id: `${instanceOwnerPartyId}/${instanceGuid}`,
                          instanceOwnerPartyId,
                          instanceGuid,
                          lastChanged: null,
                          lastChangedBy: null
                      },
                      absent: true
                  }
              ]),
        ...listed.map((instance) => ({ instance, absent: false }))
    ];

    return (
        <Panel
            id={id}
            title="Instances"
            aside={
                <span className="row" style={{ gap: 6 }}>
                    <a href={`${localtestUrl}/`} target="_blank" rel="noreferrer" className="btn btn--ghost btn--tiny">
                        Log in
                    </a>
                    <button type="button" className="btn btn--ghost btn--tiny" onClick={onRefresh} disabled={busy}>
                        {busy && <span className="btn__spinner" />}
                        Refresh
                    </button>
                    {instances !== null && <span className="badge">{instances.length}</span>}
                </span>
            }
        >
            <p className="field__hint" style={{ marginBottom: 10 }}>
                What you post to. Pick <strong>New instance</strong> and posting creates one, or pick an instance and posting adds data to that one.
            </p>

            <div className="picklist">
                {/* The instance that does not exist yet. Selected means the post will create it. */}
                <button
                    type="button"
                    className="picklist__item"
                    aria-current={instanceGuid === ""}
                    onClick={() => onSelect(null)}
                    title="Posting creates a new instance for this party"
                >
                    <span className={`led ${instanceGuid === "" ? "led--ok" : "led--bad"}`} />
                    <span>New instance</span>
                </button>

                {rows.map(({ instance, absent }) => {
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
                                <span>
                                    {instanceLabel(instance)}
                                    {absent ? " · not in the active list" : ""}
                                </span>
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

                {/* Altinn's active list leaves out an instance whose process has ended, and this
                    is the way back to one: its guid, or the whole "510001/guid" pair. */}
                <button
                    type="button"
                    className="picklist__item"
                    aria-current={typing}
                    onClick={() => setTyping(!typing)}
                    title="Reach an instance the list does not hold, by its guid"
                >
                    <span className="led led--warn" />
                    <span>Other instance…</span>
                </button>
            </div>

            {typing && (
                <input
                    type="text"
                    value={instanceGuid}
                    onChange={(event) => onSelectTyped(event.target.value)}
                    placeholder="99d0632c-5917-448c-8ab6-a5d3b681376b"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Instance guid"
                    style={{ marginTop: 6 }}
                />
            )}

            {instances === null && !busy && <p className="field__hint">Nothing listed yet.</p>}
            {instances !== null && instances.length === 0 && (
                <p className="field__hint">Nothing else here: this party has no active instances to add data to.</p>
            )}

            <p className="field__hint" style={{ marginTop: 10 }}>
                Selecting one reads it and validates it, and fills the data element panel below:
                <br />
                <span className="method method--get">GET</span> {base}/instances/{instanceOwnerPartyId || "{partyId}"}/{"{instanceGuid}"}
                <br />
                <span className="method method--get">GET</span> {base}/instances/{instanceOwnerPartyId || "{partyId}"}/{"{instanceGuid}"}/validate
            </p>

            <p className="field__hint" style={{ marginTop: 10 }}>
                <strong>Open</strong> is a link into the app, which is a session of its own: the token here lives in server memory, so the browser
                never gets one. If it bounces to a user picker, <strong>Log in</strong> above is that same picker, and opening the instance again then
                works.
            </p>

            <p className="field__hint" style={{ marginTop: 10 }}>
                <span className="method method--get">GET</span> {base}/instances/{instanceOwnerPartyId || "{partyId}"}/active
                <br />
                Listed on its own for the party in Target. Altinn returns the instances whose process has not ended, so an archived one is not here.
            </p>

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
