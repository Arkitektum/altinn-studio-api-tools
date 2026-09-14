import { useEffect, useState } from "react";
import { instanceLabel } from "../lib/format";
import { Modal } from "./Modal";
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
    /** How many data elements the payload holds, for the multipart part count in Will call. */
    elementCount: number;
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
    /** Always a hard delete: this is local test data, and a soft one left the row in storage. */
    onDelete: (instance: InstanceSummary) => void;
    onRefresh: () => void;
    /** Whether the listing also asks storage for the ones the app's active list leaves out. */
    includeCompleted: boolean;
    onIncludeCompletedChange: (next: boolean) => void;
    /** False when they were asked for and storage would not answer, so the list is short. */
    completedListed: boolean | null;
    busy: boolean;
    error: unknown;
}

/**
 * What a post goes to: the instance selected, and a window to change it in.
 *
 * The list is behind an Open button rather than in the panel, the way saved payloads are. Both are
 * the same shape of thing, a list you visit to make one choice and then stop looking at, and the
 * choice is what the panel is for. What the choice decides is directly under it: an instance means
 * the data is added to that one, and no instance means the post creates one.
 */
export function InstancesPanel({
    id,
    appHost,
    org,
    app,
    instanceOwnerPartyId,
    localtestUrl,
    elementCount,
    instances,
    instanceGuid,
    onSelect,
    onSelectTyped,
    onDelete,
    onRefresh,
    includeCompleted,
    onIncludeCompletedChange,
    completedListed,
    busy,
    error
}: InstancesPanelProps) {
    /** Which row has been armed for deletion, by guid. One at a time. */
    const [confirming, setConfirming] = useState<string | null>(null);
    /** Whether the guid field is showing, for an instance the list does not hold. */
    const [typing, setTyping] = useState(false);
    const [picking, setPicking] = useState(false);

    // A list that changed under a pending confirmation is not the list it was armed against.
    useEffect(() => {
        setConfirming(null);
    }, [instances]);

    const base = `${appHost}/${org || "{org}"}/${app || "{app}"}`;
    const party = instanceOwnerPartyId || "{partyId}";

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
                          lastChangedBy: null,
                          // Reached by its guid, so nothing has said where it stands.
                          state: "active" as const
                      },
                      absent: true
                  }
              ]),
        ...listed.map((instance) => ({ instance, absent: false }))
    ];

    const selected = rows.find((row) => row.instance.instanceGuid === instanceGuid)?.instance ?? null;

    // An instance selected means the data goes onto it, and none means the post creates one. There
    // is no separate destination to read, which is why this sits under the selection that decides it.
    const preview = instanceGuid
        ? `${base}/instances/${party}/${instanceGuid}/data?dataType=…`
        : `${base}/instances  (multipart, ${elementCount} part${elementCount === 1 ? "" : "s"} + instance)`;

    function close() {
        setPicking(false);
        setConfirming(null);
    }

    function pick(instance: InstanceSummary | null) {
        onSelect(instance);
        close();
    }

    return (
        <Panel
            tone="instances"
            id={id}
            title="Instances"
            aside={
                <button type="button" className="btn btn--ghost" onClick={() => setPicking(true)}>
                    {busy && <span className="btn__spinner" />}
                    Open{instances === null ? "" : ` (${instances.length})`}
                </button>
            }
        >
            <p className="field__hint" style={{ marginBottom: 10 }}>
                What you post to. <strong>New instance</strong> means posting creates one, and an instance means posting adds data to that one.
            </p>

            {/* The one choice this panel is for, and the way back into the list to change it. */}
            <div className="picklist">
                <button type="button" className="picklist__item" aria-haspopup="dialog" onClick={() => setPicking(true)}>
                    <span className="led led--ok" aria-hidden="true" />
                    <span>
                        {selected ? instanceLabel(selected) : "New instance"}
                        {selected && !selectedIsListed ? " · not in the active list" : ""}
                    </span>
                    {selected && selected.state !== "active" && (
                        <span className={`badge badge--${selected.state === "completed" ? "ok" : "bad"}`}>{selected.state}</span>
                    )}
                </button>
            </div>

            <div style={{ marginTop: 14 }}>
                <span className="legend">Will call</span>
                <pre className="dump" style={{ margin: 0 }}>
                    <span className="method method--post">POST</span> {preview}
                </pre>
                <p className="field__hint">{instanceGuid ? "Onto the instance selected above." : "Creating a new instance."}</p>
            </div>

            {/* Asked for and refused, so the list is short by however many there were. */}
            {completedListed === false && (
                <div className="notice notice--warn" style={{ marginTop: 10 }}>
                    LocalTest&rsquo;s storage api would not list this party&rsquo;s instances, so only the active ones are here. The step in the run
                    log says what it answered. A 403 usually means this token may not act for that party.
                </div>
            )}

            {error ? (
                <div style={{ marginTop: 12 }}>
                    <ErrorNotice error={error} />
                </div>
            ) : null}

            {picking && (
                <Modal
                    title="Pick an instance"
                    className="modal--form"
                    bodyClassName="modal__form"
                    onClose={close}
                    aside={
                        <>
                            <a href={`${localtestUrl}/`} target="_blank" rel="noreferrer" className="btn btn--ghost">
                                Log in
                            </a>
                            <button type="button" className="btn btn--get" onClick={onRefresh} disabled={busy}>
                                {busy && <span className="btn__spinner" />}
                                Refresh
                            </button>
                        </>
                    }
                >
                    {/* Above the list, since what it decides is what the list holds. */}
                    <label className="check">
                        <input
                            type="checkbox"
                            checked={includeCompleted}
                            onChange={(event) => onIncludeCompletedChange(event.target.checked)}
                            disabled={busy}
                        />
                        <span className="check__body">
                            <span className="check__title">Include completed</span>
                            <span className="check__note">
                                A second read, of <span className="method method--get">GET</span> {localtestUrl}
                                /storage/api/v1/instances, which is the only place an instance whose process has ended is still listed. Soft deleted
                                ones come with it, marked as such. Off by default, since it is a request that often has nothing to add.
                            </span>
                        </span>
                    </label>

                    <div className="picklist">
                        {/* The instance that does not exist yet. Selected means the post will create it. */}
                        <button
                            type="button"
                            className="picklist__item"
                            aria-current={instanceGuid === ""}
                            onClick={() => pick(null)}
                            title="Posting creates a new instance for this party"
                        >
                            {/* Which row is selected is on the button as aria-current, so this is decoration. */}
                            <span className={`led ${instanceGuid === "" ? "led--ok" : "led--bad"}`} aria-hidden="true" />
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
                                        onClick={() => pick(instance)}
                                        title={instance.id}
                                    >
                                        <span className={`led ${current ? "led--ok" : "led--warn"}`} aria-hidden="true" />
                                        <span>
                                            {instanceLabel(instance)}
                                            {absent ? " · not in the active list" : ""}
                                        </span>
                                        {/* Only storage lists these two, and which it is decides what is
                                            left to do with the instance, so it is a badge and not a word. */}
                                        {instance.state !== "active" && (
                                            <span className={`badge badge--${instance.state === "completed" ? "ok" : "bad"}`}>{instance.state}</span>
                                        )}
                                    </button>

                                    <a
                                        href={`${base}/#/instance/${instance.instanceOwnerPartyId}/${instance.instanceGuid}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="btn btn--ghost"
                                        title="Open it in the app, which needs a LocalTest session in the browser"
                                    >
                                        Open
                                    </a>

                                    {armed ? (
                                        <>
                                            <button
                                                type="button"
                                                className="btn btn--delete btn--armed"
                                                onClick={() => onDelete(instance)}
                                                disabled={busy}
                                            >
                                                Confirm delete
                                            </button>
                                            <button type="button" className="btn btn--ghost" onClick={() => setConfirming(null)}>
                                                Cancel
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            className="btn btn--delete"
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
                            // Expanded rather than current: this reveals the field below rather than
                            // being one of the things you can select.
                            aria-expanded={typing}
                            aria-controls="typedInstanceGuid"
                            onClick={() => setTyping(!typing)}
                            title="Reach an instance the list does not hold, by its guid"
                        >
                            <span className="led led--warn" aria-hidden="true" />
                            <span>Other instance…</span>
                        </button>
                    </div>

                    {typing && (
                        <input
                            id="typedInstanceGuid"
                            type="text"
                            value={instanceGuid}
                            onChange={(event) => onSelectTyped(event.target.value)}
                            placeholder="99d0632c-5917-448c-8ab6-a5d3b681376b"
                            autoComplete="off"
                            spellCheck={false}
                            aria-label="Instance guid"
                        />
                    )}

                    {instances === null && !busy && <p className="field__hint">Nothing listed yet.</p>}
                    {instances !== null && instances.length === 0 && (
                        <p className="field__hint">
                            Nothing else here: this party has no {includeCompleted ? "instances at all" : "active instances to add data to"}.
                        </p>
                    )}

                    <p className="field__hint">
                        Picking one closes this window, reads it and validates it, and fills the data element panel:
                        <br />
                        <span className="method method--get">GET</span> {base}/instances/{party}/{"{instanceGuid}"}
                        <br />
                        <span className="method method--get">GET</span> {base}/instances/{party}/{"{instanceGuid}"}/validate
                    </p>

                    <p className="field__hint">
                        <strong>Open</strong> is a link into the app, which is a session of its own: the token here lives in server memory, so the
                        browser never gets one. If it bounces to a user picker, <strong>Log in</strong> above is that same picker, and opening the
                        instance again then works. <strong>Delete</strong> removes an instance outright, and asks twice first.
                    </p>

                    <p className="field__hint">
                        <span className="method method--get">GET</span> {base}/instances/{party}/active
                        <br />
                        Listed on its own for the party in Target. Altinn returns the instances whose process has not ended, so an archived one is not
                        here.
                    </p>
                </Modal>
            )}
        </Panel>
    );
}
