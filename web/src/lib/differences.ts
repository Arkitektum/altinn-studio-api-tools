import type { XmlDifference } from "../types";

/**
 * Altinn stamps every row of a repeating group with an `altinnRowId`, a guid it uses to keep
 * track of rows in the frontend. A file written by hand never has them, so every row turns up as
 * an added attribute and buries the differences that mean something.
 *
 * Matched case-insensitively on the end of the path, so `/ettrinn/part[2]/@altinnRowId` counts
 * however the model happens to spell it.
 */
export function isRowIdDifference(difference: XmlDifference): boolean {
    return difference.path.toLowerCase().endsWith("@altinnrowid");
}

/**
 * An element the model added with nothing in it. The model writes out fields it has no value for
 * as empty elements, so a file that leaves optional fields out gets one of these for each of them.
 * Only added ones: an empty element dropped on the way in was in the file, and so is worth seeing.
 */
export function isAddedEmptyDifference(difference: XmlDifference): boolean {
    return difference.kind === "added" && difference.empty === true;
}

export interface PartitionedDifferences {
    shown: XmlDifference[];
    /** How many were held back, so the panel can say so rather than quietly dropping them. */
    hiddenRowIds: number;
    hiddenEmpty: number;
}

/**
 * Splits the differences into what to show and how many row ids were held back. Filtering here
 * rather than in the request means the toggle costs nothing and the server keeps reporting
 * everything it found.
 */
export function partitionDifferences(differences: XmlDifference[], hideRowIds: boolean, hideEmpty = false): PartitionedDifferences {
    let hiddenRowIds = 0;
    let hiddenEmpty = 0;
    const shown = differences.filter((difference) => {
        if (hideRowIds && isRowIdDifference(difference)) {
            hiddenRowIds++;
            return false;
        }
        if (hideEmpty && isAddedEmptyDifference(difference)) {
            hiddenEmpty++;
            return false;
        }
        return true;
    });
    return { shown, hiddenRowIds, hiddenEmpty };
}

/**
 * What the filters held back, in words: "2 altinnRowId differences and 5 empty added elements".
 * Null when nothing was, so the panel has nothing to say.
 */
export function describeHidden({ hiddenRowIds, hiddenEmpty }: Pick<PartitionedDifferences, "hiddenRowIds" | "hiddenEmpty">): string | null {
    const parts = [
        hiddenRowIds > 0 ? `${hiddenRowIds} altinnRowId difference${hiddenRowIds === 1 ? "" : "s"}` : null,
        hiddenEmpty > 0 ? `${hiddenEmpty} empty added element${hiddenEmpty === 1 ? "" : "s"}` : null
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(" and ") : null;
}
