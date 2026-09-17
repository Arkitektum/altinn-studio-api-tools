import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "../queries";
import { useRunLog } from "../runLog";
import { logFromDelete, logFromInstances } from "../lib/logResults";
import { SELECTION_DELAY_MS, useSettled } from "../lib/useDebounced";
import { instanceLabel } from "../lib/format";
import { useTarget } from "../session";
import { Modal } from "./Modal";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { InstanceSummary, ListInstancesResult } from "../types";
import { Icon } from "./Icon";

interface InstancesPanelProps {
    /** Why the panel cannot be used yet, or null when it can. See lib/readiness.ts. */
    notReady: string | null;
    /** Anchor for the chain strip to scroll to. */
    id: string;
    /** How many data elements the payload holds, for the multipart part count in Will call. */
    elementCount: number;
    /** Null selects the new instance row, which is what "post creates one" means. */
    onSelect: (instance: InstanceSummary | null) => void;
    /** A guid typed or pasted, for an instance the active list does not hold. */
    onSelectTyped: (value: string) => void;
}

/**
 * What a post goes to: the instance selected, and a window to change it in.
 *
 * The list is behind an Open button rather than in the panel, the way saved payloads are. Both are
 * the same shape of thing, a list you visit to make one choice and then stop looking at, and the
 * choice is what the panel is for. What the choice decides is directly under it: an instance means
 * the data is added to that one, and no instance means the post creates one.
 */
export function InstancesPanel({ notReady, id, elementCount, onSelect, onSelectTyped }: InstancesPanelProps) {
    const { base, party, tokenId, tokenUsable, org, app, partyId, instanceGuid, localtestUrl } = useTarget();
    const { append } = useRunLog();
    const queryClient = useQueryClient();

    /** Which row has been armed for deletion, by guid. One at a time. */
    const [confirming, setConfirming] = useState<string | null>(null);
    /** Whether the guid field is showing, for an instance the list does not hold. */
    const [typing, setTyping] = useState(false);
    const [picking, setPicking] = useState(false);
    /**
     * Whether the listing also asks storage for the ones the app's active list leaves out. A view
     * of the moment rather than something you chose, so it is not persisted: the cheaper listing is
     * the right thing to come back to.
     */
    const [includeCompleted, setIncludeCompleted] = useState(false);

    /*
     * The listing, asked for here rather than handed down. Nothing outside this panel reads it, so
     * nothing outside it had any business fetching it.
     *
     * The target settles first: org, app and the party are all typed, and a listing per character
     * is a listing per character whoever asks for it.
     */
    const aimed = `${org}/${app}/${partyId}`;
    const settled = useSettled(aimed, SELECTION_DELAY_MS);
    const key = queryKeys.instances(tokenId ?? "", org, app, partyId, includeCompleted);

    const listQuery = useQuery({
        queryKey: key,
        queryFn: async () => {
            const result = await api.listInstances({
                tokenId: tokenId ?? "",
                org,
                app,
                instanceOwnerPartyId: partyId,
                includeCompleted: includeCompleted ? "true" : "false"
            });
            append(logFromInstances(result));
            return result;
        },
        enabled: tokenUsable && settled && Boolean(tokenId && org && app && partyId)
    });

    /**
     * Removes an instance outright. Soft deletion is still on the api, which the docs cover, but not
     * offered here: everything this tool can reach is local test data, and a soft delete left the
     * instance in storage where the completed listing would keep finding it.
     */
    const remove = useMutation({
        mutationFn: async (instance: InstanceSummary) => {
            const result = await api.deleteInstance({
                tokenId: tokenId ?? "",
                org,
                app,
                instanceOwnerPartyId: instance.instanceOwnerPartyId,
                instanceGuid: instance.instanceGuid,
                hard: "true"
            });
            append(logFromDelete(result));
            return result;
        },
        onSuccess: (result) => {
            if (!result.ok) return;
            // Taken out of the listing rather than asking for it again: a delete that succeeded is
            // the whole of what changed, and a deleted instance is not one to offer next.
            queryClient.setQueryData<ListInstancesResult>(key, (current) =>
                current ? { ...current, instances: current.instances.filter((held) => held.instanceGuid !== result.instanceGuid) } : current
            );
            // Only when it was the one selected. Clearing otherwise would point the tool away from
            // an instance that is still there.
            if (instanceGuid === result.instanceGuid) onSelect(null);
        }
    });

    /**
     * A failed listing stays null rather than empty, since "none" would be a claim we cannot make
     * when the request never answered. So does one the app refused, for the same reason.
     */
    const instances = listQuery.data?.ok ? listQuery.data.instances : null;
    /** False when the completed ones were asked for and storage would not answer. */
    const completedListed = listQuery.data?.completedListed ?? null;
    const busy = listQuery.isFetching || remove.isPending;
    const error = listQuery.error ?? remove.error;

    // A list that changed under a pending confirmation is not the list it was armed against.
    useEffect(() => {
        setConfirming(null);
    }, [instances]);

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
                          id: `${partyId}/${instanceGuid}`,
                          instanceOwnerPartyId: partyId,
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
            notReady={notReady}
            tone="instances"
            id={id}
            title="Instances"
            icon="layers"
            aside={
                <button type="button" className="btn btn--ghost" onClick={() => setPicking(true)}>
                    {busy ? <span className="btn__spinner" /> : <Icon name="layers" />}
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
                            <button type="button" className="btn btn--get" onClick={() => void listQuery.refetch()} disabled={busy}>
                                {busy ? <span className="btn__spinner" /> : <Icon name="refresh" />}
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
                            onChange={(event) => setIncludeCompleted(event.target.checked)}
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
                            <span>New instance</span>
                            {instanceGuid === "" && <span className="picklist__now">current</span>}
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
                                        <span>
                                            {instanceLabel(instance)}
                                            {absent ? " · not in the active list" : ""}
                                        </span>
                                        {current && <span className="picklist__now">current</span>}
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
                                                onClick={() => remove.mutate(instance)}
                                                disabled={busy}
                                            >
                                                <Icon name="trash" />
                                                Confirm delete
                                            </button>
                                            <button type="button" className="btn btn--ghost" onClick={() => setConfirming(null)}>
                                                <Icon name="cross" />
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
                                            <Icon name="trash" />
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
