import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { queryKeys } from "../queries";
import { useSession } from "../session";
import { Icon } from "./Icon";
import { Modal } from "./Modal";
import { ErrorNotice } from "./Notice";
import type { SweepOutcome, SweepRow, SweepState } from "../types";

/** How often the running sweep is asked how it is going. Each file takes a second or two. */
const POLL_MS = 700;

/** Which of the tones the outcome wears, and the shape that goes with it. */
const OUTCOME: Record<SweepOutcome, { tone: "ok" | "bad" | "warn" | "info"; icon: "check" | "cross" | "warning" | "info" }> = {
    identical: { tone: "ok", icon: "check" },
    "row ids only": { tone: "info", icon: "info" },
    differs: { tone: "warn", icon: "warning" },
    "post failed": { tone: "bad", icon: "cross" },
    "no stored xml": { tone: "bad", icon: "cross" }
};

/** Findings first, then the rest in the order they were swept. A long table is read from the top. */
const RANK: Record<SweepOutcome, number> = {
    differs: 0,
    "post failed": 1,
    "no stored xml": 2,
    "row ids only": 3,
    identical: 4
};

function summarise(rows: SweepRow[]): { differs: number; failed: number; rowIds: number; identical: number } {
    return {
        differs: rows.filter((row) => row.outcome === "differs").length,
        failed: rows.filter((row) => row.outcome === "post failed" || row.outcome === "no stored xml").length,
        rowIds: rows.filter((row) => row.outcome === "row ids only").length,
        identical: rows.filter((row) => row.outcome === "identical").length
    };
}

/** What the sweep is doing, in a line. */
function said(state: SweepState): string {
    if (state.running) {
        const { done, total } = state.progress;
        return total === null ? `working out what to sweep, ${done} done` : `${done} of ${total}`;
    }
    if (state.error) return "stopped";
    if (state.cancelled) return `cancelled after ${state.rows.length}`;
    if (state.finishedAt) return `${state.rows.length} compared`;
    return "not run";
}

interface SweepWindowProps {
    onClose: () => void;
}

/**
 * Every example posted and compared against what the app stored, in a window over the tool.
 *
 * The comparison in the panel behind this confirms a problem you already suspect. This finds the
 * ones you do not know about, which is why it is worth the hundred or so posts it makes. It is the
 * same sweep as `npm run diff --workspace server`, running on the same service.
 *
 * A job on the server rather than a request held open here, so this is a poll rather than a stream:
 * it starts one, then asks how it is going until it stops. Closing the window does not stop the
 * sweep, and reopening it finds the one already running, which is the point of it being a job.
 */
export function SweepWindow({ onClose }: SweepWindowProps) {
    const { tokenId, tokenUsable, partyId } = useSession();
    const queryClient = useQueryClient();
    /** Off by default: a sweep that leaves a hundred instances behind is worse than no sweep. */
    const [keep, setKeep] = useState(false);

    const sweep = useQuery({
        queryKey: queryKeys.sweep(),
        queryFn: api.getSweep,
        // Only while one is running. A finished sweep is a table to read, not something to re-ask.
        refetchInterval: (query) => (query.state.data?.running ? POLL_MS : false)
    });

    const state = sweep.data ?? null;
    const settle = (next: SweepState) => queryClient.setQueryData(queryKeys.sweep(), next);

    const start = useMutation({
        mutationFn: () => api.startSweep({ tokenId: tokenId ?? "", instanceOwnerPartyId: partyId, keep }),
        onSuccess: settle
    });
    const cancel = useMutation({ mutationFn: api.cancelSweep, onSuccess: settle });

    const ready = tokenUsable && Boolean(tokenId && partyId);
    const running = state?.running ?? false;
    const rows = state?.rows ?? [];
    const counts = summarise(rows);
    // Findings first, and stable within a rank, so a row does not jump as the table grows.
    const ordered = [...rows.entries()].sort(([a, left], [b, right]) => RANK[left.outcome] - RANK[right.outcome] || a - b).map(([, row]) => row);

    return (
        <Modal
            title="Sweep every example"
            aside={
                <span className="row" style={{ gap: 6 }}>
                    <span className="badge">{state ? said(state) : "…"}</span>
                    {running ? (
                        <button type="button" className="btn btn--delete" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
                            <Icon name="cross" />
                            Cancel
                        </button>
                    ) : (
                        <button type="button" className="btn btn--post" onClick={() => start.mutate()} disabled={!ready || start.isPending}>
                            {start.isPending ? <span className="btn__spinner" /> : <Icon name="flow" />}
                            {state?.finishedAt ? "Sweep again" : "Start"}
                        </button>
                    )}
                </span>
            }
            onClose={onClose}
            bodyClassName="modal__stack"
        >
            <p className="field__hint" style={{ margin: 0 }}>
                Posts every example this tool has, one instance per file, and reports what each app's model did to it. A field the model has no place
                for is dropped on the way in, and a value it formats its own way is rewritten. Neither is reported by anything else.
            </p>

            {!ready && (
                <div className="notice notice--warn">Needs a usable token and a party. Both are set at the top of the column behind this window.</div>
            )}

            {!running && !state?.finishedAt && ready && (
                <label className="check">
                    <input type="checkbox" checked={keep} onChange={(event) => setKeep(event.target.checked)} />
                    <span className="check__body">
                        <span className="check__title">Keep the instances</span>
                        <span className="check__note">
                            Off by default: each instance is hard deleted once it has been compared, since a sweep that leaves a hundred behind is
                            worse than no sweep. On, they stay, which is what you want when you are about to go and look at one.
                        </span>
                    </span>
                </label>
            )}

            {start.error ? <ErrorNotice error={start.error} /> : null}
            {cancel.error ? <ErrorNotice error={cancel.error} /> : null}
            {sweep.error ? <ErrorNotice error={sweep.error} /> : null}

            {state?.error && (
                <div className="notice notice--bad">
                    The sweep stopped: {state.error}
                    {rows.length > 0 && <span className="notice__why">What it had got through is below.</span>}
                </div>
            )}

            {running && (
                <p className="field__hint" style={{ margin: 0 }}>
                    <span className="btn__spinner" /> {state?.progress.at ?? "working out what to sweep"}
                </p>
            )}

            {rows.length > 0 && (
                <>
                    <div className="row" style={{ gap: 6 }}>
                        <span className="badge badge--warn">
                            <Icon name="warning" />
                            {counts.differs} differ
                        </span>
                        <span className="badge badge--bad">
                            <Icon name="cross" />
                            {counts.failed} could not
                        </span>
                        <span className="badge">
                            <Icon name="info" />
                            {counts.rowIds} row ids only
                        </span>
                        <span className="badge badge--ok">
                            <Icon name="check" />
                            {counts.identical} identical
                        </span>
                    </div>

                    <div className="sweep">
                        {ordered.map((row) => (
                            <div key={`${row.app}-${row.dataType}-${row.file}`} className={`sweep__row sweep__row--${OUTCOME[row.outcome].tone}`}>
                                <span className={`sweep__mark sweep__mark--${OUTCOME[row.outcome].tone}`}>
                                    <Icon name={OUTCOME[row.outcome].icon} label={row.outcome} />
                                </span>
                                <span className="sweep__what">
                                    <span className="sweep__app">{row.app}</span>
                                    <span className="sweep__file">
                                        {row.dataType} · {row.label}
                                    </span>
                                </span>
                                <span className="spacer" />
                                <span className="sweep__outcome">
                                    {row.outcome === "differs" ? `${row.differences} difference${row.differences === 1 ? "" : "s"}` : row.outcome}
                                    {row.rowIds > 0 && row.outcome === "differs" ? `, ${row.rowIds} altinnRowId` : ""}
                                </span>
                                {row.detail.length > 0 && (
                                    <ul className="sweep__detail">
                                        {row.detail.map((line, position) => (
                                            <li key={`${line}-${position}`}>{line}</li>
                                        ))}
                                        {row.differences > row.detail.length && <li>… and {row.differences - row.detail.length} more</li>}
                                    </ul>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}

            {(state?.skipped.length ?? 0) > 0 && (
                <div className="notice">
                    <strong>Could not probe</strong>
                    <ul>
                        {state?.skipped.map((line) => (
                            <li key={line}>{line}</li>
                        ))}
                    </ul>
                    <span className="notice__why">These apps are probably not deployed in your localtest.</span>
                </div>
            )}

            {!running && rows.length === 0 && !state?.error && (
                <p className="field__hint" style={{ margin: 0 }}>
                    {state?.finishedAt
                        ? "Nothing to compare. None of the apps in the catalogue answered with a data type that has both a model and an example."
                        : "Nothing swept yet."}
                </p>
            )}
        </Modal>
    );
}
