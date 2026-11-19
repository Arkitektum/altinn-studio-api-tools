import type { DataElementSummary } from "../types";

/**
 * What a process move did to the instance, as the Process panel reports it and the rail follows up on.
 *
 * Moving a task on is where the app does its own work on the data: it can add elements, a generated
 * pdf among them, and write into the ones already there. That makes the Data element panel worth
 * reading again after a move, and it sits above the Process panel, so without this the step back
 * up is one you have to already know to take.
 */
export interface AdvanceOutcome {
    /** The instance that was moved. An outcome only describes that one, so selecting another hides it. */
    instanceGuid: string;
    /** Where it was and where it went, in the words the Process panel uses. */
    from: string;
    to: string;
    /** Elements the move left on the instance that were not there before it. */
    added: DataElementSummary[];
    /** Elements that were there before and have been written to since. */
    changed: DataElementSummary[];
    /** How many the instance holds now. */
    total: number;
    /** You have been back to the Data element panel since, by the button or by picking an element. */
    checked: boolean;
}

/**
 * The elements a move added and the ones it wrote to, in the order the instance lists them.
 *
 * Changed is a different `lastChanged` rather than a different size: an app can rewrite a form to the
 * same length, and the timestamp is what storage moves whenever it stores anything.
 */
export function elementChanges(
    before: DataElementSummary[],
    after: DataElementSummary[]
): { added: DataElementSummary[]; changed: DataElementSummary[] } {
    const was = new Map(before.map((element) => [element.id, element]));
    return {
        added: after.filter((element) => !was.has(element.id)),
        changed: after.filter((element) => {
            const earlier = was.get(element.id);
            return earlier !== undefined && earlier.lastChanged !== element.lastChanged;
        })
    };
}

/** "1 new, 2 changed", or null when the move touched no data element. */
export function describeChanges(changes: { added: unknown[]; changed: unknown[] }): string | null {
    const parts: string[] = [];
    if (changes.added.length > 0) parts.push(`${changes.added.length} new`);
    if (changes.changed.length > 0) parts.push(`${changes.changed.length} changed`);
    return parts.length > 0 ? parts.join(", ") : null;
}

/** Which element the Check button should land on: the first new one, else the first changed one. */
export function firstToCheck(outcome: AdvanceOutcome): string | null {
    return outcome.added[0]?.id ?? outcome.changed[0]?.id ?? null;
}

/** How the Data element select marks each element the move touched. Untouched ones are absent. */
export function changeMarks(outcome: AdvanceOutcome | null): Map<string, "new" | "changed"> {
    const marks = new Map<string, "new" | "changed">();
    if (!outcome) return marks;
    for (const element of outcome.added) marks.set(element.id, "new");
    for (const element of outcome.changed) marks.set(element.id, "changed");
    return marks;
}
