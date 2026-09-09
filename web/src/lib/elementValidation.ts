import type { AppDataType, ProcessSummary } from "../types";

/**
 * Why validating this data element would say nothing useful, or null when it would.
 *
 * Altinn validates a data element against the task its data type belongs to. Once the process has
 * moved on, that task is behind the instance: an ended process has no task at all, and a process
 * sitting in another task validates against rules this element is not covered by. Either way the
 * answer is about a task the element is no longer in, which is worse than no answer, so the button
 * says why instead of asking.
 *
 * A data type with no `taskId` is not blocked. It is not declared as belonging to one task, so
 * there is nothing to compare against, and guessing would take away a request that does work.
 */
export function validationBlockedBy(process: ProcessSummary | null, dataType: AppDataType | undefined): string | null {
    // Nothing read yet, so nothing is known to be wrong with asking.
    if (!process) return null;

    if (process.ended) return "The process has ended, so there is no task left to validate against.";

    const taskId = dataType?.taskId ?? null;
    if (taskId && process.currentTask && taskId !== process.currentTask) {
        return `This data type belongs to ${taskId} and the instance has moved on to ${process.currentTask}.`;
    }

    return null;
}
