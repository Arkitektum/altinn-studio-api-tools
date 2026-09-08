import type { RunMode } from "../types";

/** Normalising what was typed, picked or restored, before anything acts on it. */

/**
 * The destination to act on, given what a previous session stored. The UI offers a new or an
 * existing instance, while the api also takes `sequential`, which posted each data element in its
 * own request and was dropped from the UI. A session that stored it lands on a new instance.
 */
export function offeredMode(stored: RunMode): RunMode {
    return stored === "existing" ? "existing" : "multipart";
}
