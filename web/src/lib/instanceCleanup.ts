import type { InstanceSummary } from "../types";

/**
 * Which instances the bulk clear is allowed to take.
 *
 * Only the soft deleted ones, and this is the line that says so, which is why it is here with a
 * test rather than inline in the panel. A soft delete only marks an instance, so storage hands it
 * back on every listing forever and a party accumulates dozens. A completed one is a test run
 * somebody finished and may want to look at, and widening this by one character, `!== "active"`,
 * would sweep those away with the litter. Nothing else in the tool would notice.
 *
 * Taken from the listing rather than from the rows the panel draws. The panel adds a row for a
 * selected instance that storage did not list, and that one is on screen because it is selected:
 * nothing has said it is deleted, so it is not this function's to take.
 */
export function softDeletedOf(instances: InstanceSummary[]): InstanceSummary[] {
    return instances.filter((instance) => instance.state === "deleted");
}
