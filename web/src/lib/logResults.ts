import { partitionDifferences } from "./differences";
import { processLabel, severityLabel } from "./format";
import type {
    AdvanceProcessResult,
    DataElementSummary,
    DeleteInstanceResult,
    CompareResult,
    ListInstancesResult,
    LogResult,
    PdfPreviewResult,
    ReadDataElementResult,
    ReadInstanceResult,
    RunResult,
    RunStep,
    ValidateResult
} from "../types";

/**
 * Turns each kind of api result into the shape the run log renders, so the log does not need to
 * know which request produced it. All of it is pure, and `logResults.test.ts` covers it.
 */

/**
 * Each request numbers its own steps from 1, so concatenating them needs a renumber to keep the
 * indexes unique across the whole log entry.
 */
export function renumber(steps: RunStep[]): RunStep[] {
    return steps.map((step, position) => ({ ...step, index: position + 1 }));
}

/** Summarises a validation response by severity, following Altinn's ValidationIssueSeverity. */
export function issueRow(result: ValidateResult): { label: string; value: string; tone: "ok" | "warn" | "bad" } {
    const { errors, warnings, other } = result.counts;
    return {
        label: "Issues",
        tone: errors > 0 ? "bad" : warnings > 0 ? "warn" : "ok",
        value:
            result.issues.length === 0
                ? "none"
                : [
                      `${errors} error${errors === 1 ? "" : "s"}`,
                      `${warnings} warning${warnings === 1 ? "" : "s"}`,
                      ...(other > 0 ? [`${other} other`] : [])
                  ].join(", ")
    };
}

/**
 * Prepares a validation result for display: issues sorted by severity, with data element ids
 * resolved to data type names where the instance read told us what they are.
 */
export function toValidation(result: ValidateResult | null, dataElements: DataElementSummary[]): LogResult["validation"] {
    if (!result?.ok) return undefined;
    const names = new Map(dataElements.map((element) => [element.id, element.dataType]));
    const issues = [...result.issues]
        .sort((a, b) => a.severity - b.severity)
        .map((issue) => ({
            severity: issue.severity,
            severityLabel: severityLabel(issue.severity),
            description: issue.description ?? "",
            code: issue.code,
            field: issue.field,
            dataElement: issue.dataElementId ? (names.get(issue.dataElementId) ?? issue.dataElementId) : null,
            source: issue.source
        }));
    const instanceGuid = result.instanceGuid;
    if (!result.dataGuid) return { key: "instance", instanceGuid, scope: "instance", label: "Instance", issues };
    return {
        key: `data:${result.dataGuid}`,
        instanceGuid,
        scope: "data element",
        label: names.get(result.dataGuid) ?? result.dataGuid,
        issues
    };
}

/**
 * Builds the log for a post, folding in the instance read and validation that run automatically
 * afterwards. They are separate requests but one story, so they share a single log entry.
 */
export function logFromRun(result: RunResult, followUp: { instance: ReadInstanceResult | null; validation: ValidateResult | null }): LogResult {
    const rows: LogResult["rows"] = [{ label: "Mode", value: result.mode }];
    if (result.instanceOwnerPartyId) {
        rows.push({ label: "Party", value: result.instanceOwnerPartyId });
    }
    if (result.instanceGuid) rows.push({ label: "Instance", value: result.instanceGuid });
    if (followUp.instance?.ok) {
        rows.push({
            label: "Data elements",
            value: String(followUp.instance.dataElements.length)
        });
    }
    if (followUp.instance?.ok && followUp.instance.process) {
        rows.push({ label: "Task", value: processLabel(followUp.instance.process) });
    }
    if (followUp.validation?.ok) rows.push(issueRow(followUp.validation));

    return {
        ok: result.ok,
        steps: renumber([...result.steps, ...(followUp.instance?.steps ?? []), ...(followUp.validation?.steps ?? [])]),
        failedAt: result.failedAt,
        title: "Posted",
        rows,
        instanceUrl: result.instanceUrl,
        validation: toValidation(followUp.validation, followUp.instance?.dataElements ?? [])
    };
}

/**
 * The log for reading an instance and validating it, which happen together whenever the selected
 * instance changes. Two requests, one story, so one entry with the steps renumbered across both,
 * the same way a post folds in its follow-ups.
 */
export function logFromRead(instance: ReadInstanceResult, validation: ValidateResult | null): LogResult {
    const rows: LogResult["rows"] = [
        { label: "Party", value: instance.instanceOwnerPartyId },
        { label: "Instance", value: instance.instanceGuid }
    ];
    if (instance.ok) {
        rows.push({ label: "Data elements", value: String(instance.dataElements.length) });
        if (instance.process) rows.push({ label: "Task", value: processLabel(instance.process) });
    }
    if (validation?.ok) rows.push(issueRow(validation));

    return {
        ok: instance.ok,
        steps: renumber([...instance.steps, ...(validation?.steps ?? [])]),
        failedAt: instance.failedAt,
        title: "Read instance",
        rows,
        // Offering to open an instance that could not be read would just 404 again.
        instanceUrl: instance.ok ? instance.instanceUrl : null,
        validation: toValidation(validation, instance.dataElements)
    };
}

/**
 * The log for a comparison against the stored xml.
 *
 * The row-id count is named rather than folded in, so the log does not read as twelve problems
 * when the panel, which hides them by default, is showing two.
 */
export function logFromCompare(result: CompareResult): LogResult {
    const all = result.diff?.differences ?? [];
    const { shown, hiddenRowIds } = partitionDifferences(all, true);
    return {
        ok: result.ok,
        steps: result.steps,
        failedAt: result.failedAt,
        title: "Compared with the stored xml",
        rows: [
            { label: "Data guid", value: result.dataGuid },
            ...(result.storedContentType ? [{ label: "Stored as", value: result.storedContentType }] : []),
            ...(result.diff
                ? [
                      {
                          label: "Differences",
                          value: all.length === 0 ? "none" : `${shown.length}${hiddenRowIds > 0 ? `, plus ${hiddenRowIds} altinnRowId` : ""}`,
                          tone: (shown.length === 0 ? "ok" : "warn") as "ok" | "warn"
                      }
                  ]
                : [])
        ]
    };
}

export function logFromInstances(result: ListInstancesResult): LogResult {
    return {
        ok: result.ok,
        steps: result.steps,
        failedAt: result.failedAt,
        title: "Listed instances",
        rows: [
            { label: "Party", value: result.instanceOwnerPartyId },
            ...(result.ok ? [{ label: "Instances", value: String(result.instances.length) }] : [])
        ]
    };
}

export function logFromDataElement(result: ReadDataElementResult): LogResult {
    return {
        ok: result.ok,
        steps: result.steps,
        failedAt: result.failedAt,
        title: "Fetched data element",
        rows: [
            { label: "Data guid", value: result.dataGuid },
            ...(result.contentType ? [{ label: "Content type", value: result.contentType }] : []),
            // Binary content comes back base64 encoded, which is worth saying out loud.
            ...(result.ok && result.encoding === "base64"
                ? [
                      {
                          label: "Bytes",
                          value: String(Math.ceil(((result.content?.length ?? 0) * 3) / 4))
                      }
                  ]
                : [])
        ]
    };
}

/**
 * The log for advancing the process and reading the instance that came of it.
 *
 * Two requests, one story, the same as a read and its validation. Advancing changes more than the
 * task: the app can add data elements on the way out of a task, a generated pdf among them, so the
 * read is what tells you what the instance holds now. The task is taken from the read where there
 * is one, since it is the later of the two answers.
 */
export function logFromAdvance(result: AdvanceProcessResult, read: ReadInstanceResult | null): LogResult {
    const rows: LogResult["rows"] = [{ label: "Instance", value: result.instanceGuid }];
    if (result.ok) rows.push({ label: "Task", value: processLabel(read?.ok ? read.process : result.process) });
    if (read?.ok) rows.push({ label: "Data elements", value: String(read.dataElements.length) });

    return {
        ok: result.ok,
        steps: renumber([...result.steps, ...(read?.steps ?? [])]),
        failedAt: result.failedAt,
        title: "Advanced process",
        rows,
        instanceUrl: read?.ok ? read.instanceUrl : null
    };
}

export function logFromDelete(result: DeleteInstanceResult): LogResult {
    return {
        ok: result.ok,
        steps: result.steps,
        failedAt: result.failedAt,
        title: result.hard ? "Deleted instance" : "Marked instance deleted",
        rows: [
            { label: "Party", value: result.instanceOwnerPartyId },
            { label: "Instance", value: result.instanceGuid },
            { label: "Delete", value: result.hard ? "hard" : "soft" }
        ]
    };
}

export function logFromPdf(result: PdfPreviewResult, bytes: number): LogResult {
    return {
        ok: result.ok,
        steps: result.steps,
        failedAt: result.failedAt,
        title: "Rendered pdf",
        rows: [...(result.contentType ? [{ label: "Content type", value: result.contentType }] : []), { label: "Bytes", value: String(bytes) }]
    };
}

export function logFromValidation(result: ValidateResult, dataElements: DataElementSummary[]): LogResult {
    const rows: LogResult["rows"] = [];
    if (result.dataGuid) rows.push({ label: "Data guid", value: result.dataGuid });
    // On a failed request there is no issue list, and "none" would read as "validated clean".
    if (result.ok) rows.push(issueRow(result));
    return {
        ok: result.ok,
        steps: result.steps,
        failedAt: result.failedAt,
        title: result.dataGuid ? "Validated data element" : "Validated instance",
        rows,
        validation: toValidation(result, dataElements)
    };
}
