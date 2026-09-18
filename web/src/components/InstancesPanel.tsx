import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "../queries";
import { useRunLog } from "../runLog";
import { softDeletedOf } from "../lib/instanceCleanup";
import { logFromCleanup, logFromDelete, logFromInstances } from "../lib/logResults";
import { SELECTION_DELAY_MS, useSettled } from "../lib/useDebounced";
import { instanceLabel } from "../lib/format";
import { useTarget } from "../session";
import { Modal } from "./Modal";
import { ErrorNotice } from "./Notice";
import { Panel } from "./Panel";
import type { DeleteInstanceResult, InstanceState, InstanceSummary, ListInstancesResult } from "../types";
import { Icon } from "./Icon";

/**
 * What a row says it is, where that is not the same as what Altinn calls it.
 *
 * `deleted` was the flag's own word, and it read as a contradiction: the row is on screen, it is
 * still selectable, and it still has a Delete beside it. Altinn has only marked it, which is
 * exactly why storage keeps handing it back, so the badge says marked and the button stays one
 * button doing one thing.
 */
const STATE_LABEL: Record<Exclude<InstanceState, "active">, string> = {
    completed: "completed",
    deleted: "soft deleted"
};

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
 * What a post goes to: creating an instance or adding to one that is there, and which one.
 *
 * Those are two questions and they were one control. The panel showed the choice as a lone row
 * styled like the list rows in the window behind it, which read as a list of one rather than as a
 * decision already made, and the difference between the two answers was carried by nothing but the
 * words in it: "New instance" against a guid. So the first question is a two-way control where both
 * answers are readable at rest, and the second is the window, which only the second answer has.
 *
 * The mode is derived from whether a guid is set rather than held, so there is no state where you
 * have chosen existing and there is no existing instance: choosing it opens the window, and closing
 * the window without picking leaves you where you were.
 */
export function InstancesPanel({ notReady, id, elementCount, onSelect, onSelectTyped }: InstancesPanelProps) {
    const { base, party, tokenId, tokenUsable, org, app, partyId, instanceGuid, localtestUrl } = useTarget();
    const { append } = useRunLog();
    const queryClient = useQueryClient();

    /** Which row has been armed for deletion, by guid. One at a time. */
    const [confirming, setConfirming] = useState<string | null>(null);
    /** The bulk clear, armed. Its own flag rather than a sentinel in `confirming`, which holds a guid. */
    const [clearing, setClearing] = useState(false);
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
     * Clears every soft deleted instance this party has, which is what storage fills up with: a
     * soft delete only marks one, so they come back on every listing forever and each is two
     * clicks to be rid of.
     *
     * Only the soft deleted ones. A completed instance is a test run someone finished and may want
     * to look at, and sweeping those away with the rest would be destroying the thing you were
     * keeping rather than the litter around it.
     *
     * One at a time rather than all at once. These are deletes against a localtest on the same
     * machine, and forty concurrent ones would be a load test rather than a tidy up.
     */
    const cleanup = useMutation({
        mutationFn: async (targets: InstanceSummary[]) => {
            const results: DeleteInstanceResult[] = [];
            for (const instance of targets) {
                results.push(
                    await api.deleteInstance({
                        tokenId: tokenId ?? "",
                        org,
                        app,
                        instanceOwnerPartyId: instance.instanceOwnerPartyId,
                        instanceGuid: instance.instanceGuid,
                        hard: "true"
                    })
                );
            }
            // One entry for the lot. See logFromCleanup for why.
            if (results.length > 0) append(logFromCleanup(results));
            return results;
        },
        // Disarmed either way. A run that fell over has to be armed again rather than sitting there
        // ready to fire at a count nothing has re-checked.
        onSettled: () => setClearing(false),
        onSuccess: (results) => {
            const cleared = new Set(results.filter((result) => result.ok).map((result) => result.instanceGuid));
            if (cleared.size === 0) return;
            // The ones that refused stay listed, since they are still there to try again on.
            queryClient.setQueryData<ListInstancesResult>(key, (current) =>
                current ? { ...current, instances: current.instances.filter((held) => !cleared.has(held.instanceGuid)) } : current
            );
            if (cleared.has(instanceGuid)) onSelect(null);
        }
    });

    /**
     * A failed listing stays null rather than empty, since "none" would be a claim we cannot make
     * when the request never answered. So does one the app refused, for the same reason.
     */
    const instances = listQuery.data?.ok ? listQuery.data.instances : null;
    /** False when the completed ones were asked for and storage would not answer. */
    const completedListed = listQuery.data?.completedListed ?? null;
    /** And what it answered, so the notice below names the refusal rather than guessing at it. */
    const completedStatus = listQuery.data?.completedStatus ?? null;
    const busy = listQuery.isFetching || remove.isPending || cleanup.isPending;
    const error = listQuery.error ?? remove.error ?? cleanup.error;

    // A list that changed under a pending confirmation is not the list it was armed against, and
    // the bulk clear is armed against a count from that same list.
    useEffect(() => {
        setConfirming(null);
        setClearing(false);
    }, [instances]);

    /**
     * The rows to show. An instance whose process has ended leaves Altinn's active list, so the
     * one being worked on can be absent from it: after a post that advanced the process, for
     * instance. It gets a row of its own rather than leaving the list with nothing selected while
     * the post button says otherwise, and it stays deletable and readable.
     */
    const listed = instances ?? [];
    const selectedIsListed = instanceGuid === "" || listed.some((instance) => instance.instanceGuid === instanceGuid);
    /** What the bulk clear is about, and only that. See lib/instanceCleanup.ts for why. */
    const softDeleted = softDeletedOf(listed);
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
    /** Which of the two questions the panel is answering. A guid is the whole of the difference. */
    const creating = instanceGuid === "";

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
        <Panel notReady={notReady} tone="instances" id={id} title="Instances" icon="layers">
            <span className="legend">What you post to</span>
            <div className="modes" role="group" aria-label="What you post to">
                <button type="button" className="modes__choice" aria-pressed={creating} onClick={() => onSelect(null)}>
                    <span className="modes__title">New instance</span>
                    <span className="modes__note">Posting creates one</span>
                </button>
                {/*
                 * Opens the window whether or not an instance is already chosen, since switching to
                 * this answer and changing which instance it is are the same act: picking one.
                 */}
                <button type="button" className="modes__choice" aria-pressed={!creating} aria-haspopup="dialog" onClick={() => setPicking(true)}>
                    <span className="modes__title">
                        Existing instance
                        {/* How many there are, so the window is worth opening or plainly is not. */}
                        {busy ? <span className="btn__spinner" /> : instances && <span className="modes__count">{instances.length}</span>}
                    </span>
                    <span className="modes__note">Posting adds data to it</span>
                </button>
            </div>

            {/* Which one, under the answer that has a which. Shown rather than offered: Change is the control. */}
            {selected && (
                <div className="picked">
                    <span className="picked__what">
                        <span className="picked__name" title={selected.id}>
                            {instanceLabel(selected)}
                            {!selectedIsListed ? " · not in the active list" : ""}
                        </span>
                        {selected.state !== "active" && (
                            <span className={`badge badge--${selected.state === "completed" ? "ok" : "bad"}`}>{STATE_LABEL[selected.state]}</span>
                        )}
                    </span>
                    <button type="button" className="btn btn--ghost" aria-haspopup="dialog" onClick={() => setPicking(true)}>
                        Change
                    </button>
                </div>
            )}

            <div style={{ marginTop: 14 }}>
                <span className="legend">Will call</span>
                <pre className="dump" style={{ margin: 0 }}>
                    <span className="method method--post">POST</span> {preview}
                </pre>
            </div>

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
                                ones come with it, marked as such, since Altinn keeps them: this is where you clear those out for good. Off by
                                default, since it is a request that often has nothing to add.
                            </span>
                        </span>
                    </label>

                    {/*
                     * Under the checkbox that caused it rather than in the panel. The checkbox is
                     * in here, and a dialog is in the browser's top layer, so a notice left behind
                     * in the panel was covered by the very window you would have ticked it from.
                     */}
                    {completedListed === false && (
                        <div className="notice notice--warn">
                            LocalTest&rsquo;s storage api {completedStatus === null ? "could not be reached" : `answered ${completedStatus}`}, so only
                            the active ones are below and the list is short by however many had finished.
                            <span className="notice__why">
                                {completedStatus === 403
                                    ? "A 403 is this token not being allowed to act for that party. Get one for a user who may, or clear the checkbox."
                                    : completedStatus === 404
                                      ? "A 404 usually means this LocalTest does not serve the storage api at all, in which case the finished ones cannot be listed here."
                                      : "That is LocalTest rather than the request, so it is worth trying again. The step in the run log has what it said."}
                            </span>
                        </div>
                    )}

                    {/*
                     * Only when there are some, and only about those: a completed instance is a
                     * test run someone finished, and this is for the litter around it.
                     */}
                    {softDeleted.length > 0 && (
                        <div className="apart">
                            <div className="row">
                                {clearing ? (
                                    <>
                                        <button
                                            type="button"
                                            className="btn btn--delete btn--armed"
                                            onClick={() => cleanup.mutate(softDeleted)}
                                            disabled={busy}
                                        >
                                            {cleanup.isPending ? <span className="btn__spinner" /> : <Icon name="trash" />}
                                            Confirm, clears {softDeleted.length}
                                        </button>
                                        <button type="button" className="btn btn--ghost" onClick={() => setClearing(false)} disabled={busy}>
                                            <Icon name="cross" />
                                            Cancel
                                        </button>
                                    </>
                                ) : (
                                    <button type="button" className="btn btn--delete" onClick={() => setClearing(true)} disabled={busy}>
                                        <Icon name="trash" />
                                        Clear {softDeleted.length} soft deleted
                                    </button>
                                )}
                            </div>
                            <p className="field__hint" style={{ margin: 0 }}>
                                {clearing
                                    ? `One DELETE each, one after another, and the completed ones are left alone. ${softDeleted.length} of them.`
                                    : "Storage keeps a soft deleted instance forever, so they come back on every listing. This takes them out for good."}
                            </p>
                        </div>
                    )}

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
                                            <span className={`badge badge--${instance.state === "completed" ? "ok" : "bad"}`}>
                                                {STATE_LABEL[instance.state]}
                                            </span>
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
