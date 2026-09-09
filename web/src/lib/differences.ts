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

export interface PartitionedDifferences {
    shown: XmlDifference[];
    /** How many were held back, so the panel can say so rather than quietly dropping them. */
    hiddenRowIds: number;
}

/**
 * Splits the differences into what to show and how many row ids were held back. Filtering here
 * rather than in the request means the toggle costs nothing and the server keeps reporting
 * everything it found.
 */
export function partitionDifferences(differences: XmlDifference[], hideRowIds: boolean): PartitionedDifferences {
    if (!hideRowIds) return { shown: differences, hiddenRowIds: 0 };
    const shown = differences.filter((difference) => !isRowIdDifference(difference));
    return { shown, hiddenRowIds: differences.length - shown.length };
}
