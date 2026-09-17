import { HttpError } from "./httpError.js";
import { runSweep, type SweepState, type SweepTarget } from "./sweepService.js";

/**
 * The one sweep the server will run at a time, held in memory.
 *
 * A job rather than a request, because a sweep is a hundred posts and a hundred deletes and no
 * browser should be holding a connection open for it. The UI starts one, then asks how it is going,
 * which also means closing the tab does not stop it and reopening finds it still running.
 *
 * One at a time and not a queue. Two sweeps against the same localtest would be posting over each
 * other's instances, and the honest answer to "start another" is that one is already going.
 *
 * In memory and lost on restart, like the token store and for the same reason: this is a local dev
 * tool, and a sweep is a thing you run and read rather than a record to keep.
 */

interface Job {
    state: SweepState;
    /** Read before each file, so cancelling stops the sweep rather than only hiding it. */
    cancelling: boolean;
}

function empty(): SweepState {
    return {
        running: false,
        startedAt: null,
        finishedAt: null,
        progress: { done: 0, total: null, at: null },
        rows: [],
        skipped: [],
        error: null,
        cancelled: false,
        party: null
    };
}

let job: Job = { state: empty(), cancelling: false };

/** What the sweep is doing, or has done. Never null: not having run is a state of its own. */
export function sweepState(): SweepState {
    return job.state;
}

export interface StartSweep {
    token: string;
    party: string;
    targets: SweepTarget[];
    keep: boolean;
}

/**
 * What actually does the walking. A parameter so the state machine can be tested without a
 * localtest: what is worth testing here is the transitions, not the posting, and the posting is
 * `sweepService`'s to be tested on.
 */
export type SweepRunner = typeof runSweep;

/**
 * Starts one and answers at once, leaving it running. What it returns is the state at the moment of
 * starting, not the finished sweep: a caller that awaited the sweep would be holding open exactly
 * the connection this exists to avoid.
 */
export function startSweep(request: StartSweep, run: SweepRunner = runSweep): SweepState {
    if (job.state.running) {
        throw new HttpError(409, "A sweep is already running. Wait for it, or cancel it first.");
    }

    job = {
        cancelling: false,
        state: {
            ...empty(),
            running: true,
            startedAt: new Date().toISOString(),
            party: request.party
        }
    };
    const mine = job;

    /*
     * Every handler writes to `mine` rather than to `job`, which is the whole of what keeps one
     * sweep out of another's state. A cancelled sweep goes on running until it notices, so its
     * handlers fire after the next one has started, and they land in the object nobody is reading
     * any more. Reaching for `job` in here instead would be the bug.
     */
    void run(request, {
        onPlanned: (total, skipped) => {
            mine.state.progress = { ...mine.state.progress, total };
            mine.state.skipped = skipped;
        },
        onRow: (row, at) => {
            mine.state.rows = [...mine.state.rows, row];
            mine.state.progress = { ...mine.state.progress, done: mine.state.rows.length, at };
        },
        cancelled: () => mine.cancelling
    })
        .then((report) => {
            mine.state = {
                ...mine.state,
                running: false,
                finishedAt: new Date().toISOString(),
                rows: report.rows,
                skipped: report.skipped,
                cancelled: report.cancelled,
                progress: { ...mine.state.progress, done: report.rows.length, at: null }
            };
        })
        .catch((error: unknown) => {
            mine.state = {
                ...mine.state,
                running: false,
                finishedAt: new Date().toISOString(),
                // The whole sweep stopping, which is a different thing from one file failing.
                error: error instanceof Error ? error.message : String(error),
                progress: { ...mine.state.progress, at: null }
            };
        });

    return mine.state;
}

/**
 * Asks it to stop. It finishes the file it is on rather than abandoning an instance half posted,
 * so this is a request and the state says when it was honoured.
 */
export function cancelSweep(): SweepState {
    if (!job.state.running) {
        throw new HttpError(409, "No sweep is running.");
    }
    job.cancelling = true;
    return job.state;
}

/** Forgets the last sweep. Only the tests need this. */
export function resetSweep(): void {
    job = { state: empty(), cancelling: false };
}
