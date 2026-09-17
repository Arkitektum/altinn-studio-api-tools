import { appCatalogue } from "./appCatalogue.js";
import { fetchApplicationMetadata, type AppDataType } from "./appService.js";
import { compareStored } from "./compareService.js";
import { listExamples, readExample, type ExampleKind } from "./examples.js";
import { deleteInstance } from "./readService.js";
import { postDataToApp } from "./runService.js";
import { partitionRowIds } from "./xmlDiff.js";

/**
 * Posting every example there is and reporting what each app's model did to it.
 *
 * The comparison in Data element, run over everything at once. That panel confirms a problem you
 * already suspect; this finds the ones you do not know about, which is why it is worth the hundred
 * or so posts it makes.
 *
 * Here rather than in the script that used to hold it, because two front ends now run it: the
 * script and the window in the UI. A sweep that walked the catalogue twice, once per caller, would
 * be two things to keep in step and the UI would be the copy that drifted.
 *
 * Nothing in here is recorded by `StepRecorder`. Every other write in this tool shows up in the run
 * log, on the rule that a write the operator cannot see defeats the point of the tool, and a sweep
 * is the one place that rule works against itself: a hundred posts and a hundred deletes would bury
 * the run you were actually reading. What the sweep did is the table it returns.
 */

/** What happened to one file, in one word, so a long table can be scanned for the bad ones. */
export type SweepOutcome = "identical" | "differs" | "row ids only" | "post failed" | "no stored xml";

export interface SweepRow {
    /** `dibk/et-v4`. */
    app: string;
    dataType: string;
    /** The file name, which is how the example is asked for again. */
    file: string;
    /** And how it reads, which is the file without its ordering prefix. */
    label: string;
    outcome: SweepOutcome;
    differences: number;
    /** Differences that are only Altinn's own row ids, counted apart: they mean nothing. */
    rowIds: number;
    /** The first few differences in words, enough to recognise the problem. */
    detail: string[];
}

export interface SweepTarget {
    org: string;
    app: string;
}

export interface SweepProgress {
    /** Files compared so far, which is `rows.length`, and how many there are to do. */
    done: number;
    total: number | null;
    /** What it is on right now, for a line that moves while a long sweep runs. */
    at: string | null;
}

export interface SweepState {
    running: boolean;
    /** Null until a sweep has been asked for. */
    startedAt: string | null;
    finishedAt: string | null;
    progress: SweepProgress;
    rows: SweepRow[];
    /** Apps that could not be probed, which usually means they are not deployed locally. */
    skipped: string[];
    /** Why the whole sweep stopped, rather than why one file did. */
    error: string | null;
    cancelled: boolean;
    /** The party every instance was posted for, which is the token's own. */
    party: string | null;
}

interface FileTarget extends SweepTarget {
    dataType: string;
    /** form or subform, from the group the file was listed in. */
    kind: ExampleKind;
    file: string;
    label: string;
    party: string;
}

/**
 * One file: post it to an instance of its own, compare what came back, and take the instance away
 * again. An instance per file, so nothing carries over from the last one.
 */
export async function sweepOne(token: string, target: FileTarget, keep: boolean): Promise<SweepRow> {
    const { org, app, dataType, file, label, party } = target;
    const row: SweepRow = { app: `${org}/${app}`, dataType, file, label, outcome: "identical", differences: 0, rowIds: 0, detail: [] };

    const example = await readExample(target.kind, dataType, file, app);

    const posted = await postDataToApp(token, {
        org,
        app,
        instanceOwnerPartyId: party,
        mode: "multipart",
        dataElements: [{ dataType, content: example.content, contentType: example.contentType }]
    });

    if (!posted.ok || !posted.instanceGuid || !posted.instanceOwnerPartyId) {
        return { ...row, outcome: "post failed", detail: [posted.failedAt ?? "no reason given"] };
    }

    const stored = (posted.instance as { data?: { id?: string; dataType?: string }[] } | null)?.data?.find(
        (element) => element.dataType === dataType
    );

    try {
        if (!stored?.id) return { ...row, outcome: "no stored xml", detail: ["the instance came back without that data element"] };

        const comparison = await compareStored(token, {
            org,
            app,
            dataType,
            instanceOwnerPartyId: posted.instanceOwnerPartyId,
            instanceGuid: posted.instanceGuid,
            dataGuid: stored.id,
            left: example.content
        });

        if (!comparison.ok || !comparison.diff) {
            return { ...row, outcome: "no stored xml", detail: [comparison.failedAt ?? "no reason given"] };
        }

        const { meaningful, rowIds } = partitionRowIds(comparison.diff.differences);
        return {
            ...row,
            outcome: outcomeFor(meaningful.length, rowIds),
            differences: meaningful.length,
            rowIds,
            // The first few are enough to recognise the problem; the panel has the rest.
            detail: meaningful.slice(0, 5).map(describeDifference)
        };
    } finally {
        if (!keep) {
            // Hard, since a soft delete would leave the sweep's instances in storage forever.
            await deleteInstance(token, {
                org,
                app,
                instanceOwnerPartyId: posted.instanceOwnerPartyId,
                instanceGuid: posted.instanceGuid,
                hard: true
            }).catch(() => undefined);
        }
    }
}

/**
 * What a comparison amounts to, given how many differences meant something and how many were only
 * Altinn's own row ids.
 *
 * The row ids are the reason this is three outcomes rather than two. Altinn stamps an `altinnRowId`
 * on every repeating group it stores, so a file that came back untouched still differs from what
 * was sent. Counting those as differences would make every sweep look like a disaster and bury the
 * files where the model actually changed something.
 */
export function outcomeFor(meaningful: number, rowIds: number): SweepOutcome {
    if (meaningful > 0) return "differs";
    return rowIds > 0 ? "row ids only" : "identical";
}

function describeDifference(difference: { kind: string; path: string; type?: string | null; left?: string | null; right?: string | null }): string {
    const type = difference.type ? ` (${difference.type})` : "";
    const values = difference.kind === "changed" ? `: ${difference.left} → ${difference.right}` : difference.left ? `: ${difference.left}` : "";
    return `${difference.kind} ${difference.path}${type}${values}`;
}

export interface SweepRequest {
    token: string;
    party: string;
    /** The apps to walk. Empty means the whole catalogue. */
    targets: SweepTarget[];
    /** Leave the instances behind. Off by default: a sweep that leaves a hundred behind is worse than none. */
    keep: boolean;
}

export interface SweepHandlers {
    /**
     * Once, when the walk is worked out and before anything is posted. The total is what makes
     * progress mean anything: "12 of 98" is a sweep you can decide to wait for, "12 so far" is not.
     */
    onPlanned?: (total: number, skipped: string[]) => void;
    /** As each file lands, so a caller can print a line or move a bar. */
    onRow?: (row: SweepRow, at: string) => void;
    /** Asked before each file, so a caller can stop a sweep it started. */
    cancelled?: () => boolean;
}

export interface SweepReport {
    rows: SweepRow[];
    skipped: string[];
    cancelled: boolean;
}

/**
 * Every file the targets have an example for, worked out before any of it is posted.
 *
 * Up front because the total is what makes progress mean anything: "12 of 98" is a sweep you can
 * decide to wait for, and "12 so far" is not. It costs one metadata read and one example listing
 * per app, which is what the walk would have cost anyway.
 */
export async function planSweep(token: string, request: SweepRequest): Promise<{ files: FileTarget[]; skipped: string[] }> {
    const targets = request.targets.length > 0 ? request.targets : appCatalogue.map((entry) => ({ org: entry.org, app: entry.app }));
    const files: FileTarget[] = [];
    const skipped: string[] = [];

    for (const target of targets) {
        const label = `${target.org}/${target.app}`;
        let dataTypes: AppDataType[];
        try {
            dataTypes = (await fetchApplicationMetadata(token, target.org, target.app)).dataTypes ?? [];
        } catch (error) {
            skipped.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
            continue;
        }

        // Per app rather than once for the sweep: the main form examples come from the testmotor,
        // keyed by app id, so what is on offer moves as the sweep walks the catalogue.
        const { groups, remote } = await listExamples(target.app);
        if (remote?.error) skipped.push(`${label}: main form examples unavailable, ${remote.error}`);

        // Only what the app has a model for, since only those go through a model to be mangled.
        for (const dataType of dataTypes.filter((entry) => entry.appLogic)) {
            const group = groups.find((entry) => entry.kind !== "attachment" && entry.key === dataType.id);
            for (const file of group?.files ?? []) {
                files.push({
                    org: target.org,
                    app: target.app,
                    dataType: dataType.id,
                    kind: group!.kind,
                    file: file.name,
                    label: file.label,
                    party: request.party
                });
            }
        }
    }

    return { files, skipped };
}

/**
 * The walk itself. One file at a time on purpose: a hundred concurrent posts would be a load test
 * of a localtest running on the same machine rather than a comparison of what it stored.
 */
export async function runSweep(request: SweepRequest, handlers: SweepHandlers = {}): Promise<SweepReport> {
    const { files, skipped } = await planSweep(request.token, request);
    handlers.onPlanned?.(files.length, skipped);

    const rows: SweepRow[] = [];

    for (const file of files) {
        if (handlers.cancelled?.()) return { rows, skipped, cancelled: true };
        const at = `${file.org}/${file.app} ${file.dataType} ${file.label}`;

        try {
            const row = await sweepOne(request.token, file, request.keep);
            rows.push(row);
            handlers.onRow?.(row, at);
        } catch (error) {
            // A throw here is this tool failing rather than the app refusing, but either way the
            // sweep carries on: one file that could not be posted is not a reason to stop.
            const row: SweepRow = {
                app: `${file.org}/${file.app}`,
                dataType: file.dataType,
                file: file.file,
                label: file.label,
                outcome: "post failed",
                differences: 0,
                rowIds: 0,
                detail: [error instanceof Error ? error.message : String(error)]
            };
            rows.push(row);
            handlers.onRow?.(row, at);
        }
    }

    return { rows, skipped, cancelled: false };
}

/** How a report reads at a glance, which is the same four numbers the script and the window print. */
export function summariseSweep(rows: SweepRow[]): Record<"identical" | "rowIds" | "differs" | "failed", number> {
    return {
        identical: rows.filter((row) => row.outcome === "identical").length,
        rowIds: rows.filter((row) => row.outcome === "row ids only").length,
        differs: rows.filter((row) => row.outcome === "differs").length,
        failed: rows.filter((row) => row.outcome === "post failed" || row.outcome === "no stored xml").length
    };
}
