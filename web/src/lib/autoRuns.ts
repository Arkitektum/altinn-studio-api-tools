import { selectionKeys, type Selection } from "./selectionKeys";

/**
 * A read the tool makes on its own, waiting for the field it depends on to settle first.
 *
 * The key is both what the run is aimed at and the marker that stops it happening twice: once a
 * scope has been attempted for a key, it is not pending again until the key moves.
 */
export interface AutoRun {
    key: string;
    delayMs: number;
}

export interface AutoRuns {
    /** Read the app for its data types and its parties. */
    probe: AutoRun | null;
    /** List the party's instances, so a guid never has to be pasted. */
    list: AutoRun | null;
    /** Read the selected instance and validate it. */
    read: AutoRun | null;
}

export interface AutoRunInputs {
    /** A token that exists and has not expired. Nothing can be asked without one. */
    hasToken: boolean;
    selection: Selection;
    /** The key each scope has already been attempted for, so a refusal is not retried forever. */
    attempted: { probe: string | null; list: string | null; read: string | null };
}

/** Org and app are typed a character at a time, and "et-v4" should not be five probes. */
const PROBE_DELAY_MS = 400;

/** So is a party id, and so is a guid pasted into "Other instance". */
const SELECTION_DELAY_MS = 500;

/**
 * Which reads should run without being asked, and how long each waits first.
 *
 * All three create nothing and the panels below exist to show what they return, so a button for
 * them was busywork. They are held to two rules. Each waits for what it depends on to settle,
 * because these fields are typed rather than chosen. And each runs once per selection, because an
 * app that is not running, or a party the token may not act for, would otherwise be asked again on
 * every render for as long as it stays on screen. Refresh and the probe button ask again by hand,
 * which is also how metadata that changed while the tool was open is picked up.
 */
export function pendingAutoRuns(inputs: AutoRunInputs): AutoRuns {
    const { tokenId, org, app, party, instanceGuid } = inputs.selection;
    const keys = selectionKeys(inputs.selection);

    // A token and somewhere to point it. Everything below narrows this further.
    const ready = inputs.hasToken && Boolean(tokenId) && Boolean(org) && Boolean(app);

    return {
        probe: ready && inputs.attempted.probe !== keys.target ? { key: keys.target, delayMs: PROBE_DELAY_MS } : null,
        list: ready && Boolean(party) && inputs.attempted.list !== keys.party ? { key: keys.party, delayMs: SELECTION_DELAY_MS } : null,
        read:
            ready && Boolean(party) && Boolean(instanceGuid) && inputs.attempted.read !== keys.instance
                ? { key: keys.instance, delayMs: SELECTION_DELAY_MS }
                : null
    };
}
