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
    /** Read the selected data element back, and validate it where that says anything. */
    element: AutoRun | null;
    /** Compare it with what the payload holds for its data type. */
    compare: AutoRun | null;
}

export interface AutoRunInputs {
    /** A token that exists and has not expired. Nothing can be asked without one. */
    hasToken: boolean;
    selection: Selection;
    /**
     * When Altinn last changed the selected element. A post rewrites an element in place, so the
     * guid stays where it was while what is stored under it does not: without this the tool would
     * still be showing what it read before the post.
     */
    elementChangedAt: string | null;
    /**
     * The xml the comparison would run against, or null when there is none to compare, or when
     * what is there will not parse. Half-typed xml is not a comparison waiting to happen, and
     * asking anyway would put a failed compare in the log for every pause in typing.
     */
    comparable: string | null;
    /** The key each scope has already been attempted for, so a refusal is not retried forever. */
    attempted: { probe: string | null; list: string | null; read: string | null; element: string | null; compare: string | null };
}

/** Org and app are typed a character at a time, and "et-v4" should not be five probes. */
const PROBE_DELAY_MS = 400;

/** So is a party id, and so is a guid pasted into "Other instance". */
const SELECTION_DELAY_MS = 500;

/**
 * The comparison waits longer, because what it depends on is a document being edited rather than
 * a field being filled in, and a pause in typing is not the same as being finished.
 */
const EDIT_DELAY_MS = 800;

/**
 * Which reads should run without being asked, and how long each waits first.
 *
 * None of them create anything, and the panels exist to show what they return, so a button for any
 * of them was busywork. They are held to two rules. Each waits for what it depends on to settle,
 * because these are typed rather than chosen. And each runs once per key, because an app that is
 * not running, or a party the token may not act for, would otherwise be asked again on every
 * render for as long as it stays on screen. Refresh asks again by hand, which is also how anything
 * that changed outside the tool is picked up.
 */
export function pendingAutoRuns(inputs: AutoRunInputs): AutoRuns {
    const { tokenId, org, app, party, instanceGuid, dataGuid } = inputs.selection;
    const keys = selectionKeys(inputs.selection);

    // A token and somewhere to point it. Everything below narrows this further.
    const ready = inputs.hasToken && Boolean(tokenId) && Boolean(org) && Boolean(app);
    const onInstance = ready && Boolean(party) && Boolean(instanceGuid);

    /*
     * What is stored under the element, rather than only which element it is. The timestamp moves
     * whenever Altinn rewrites it, which is what makes a post something to read again.
     */
    const elementKey = `${keys.dataElement}@${inputs.elementChangedAt ?? ""}`;

    /*
     * And the text it is compared against, in full. A comparison is only stale when one of its two
     * sides has moved, and the left-hand side is whatever the payload holds at this moment: a
     * length or a timestamp would miss an edit that swapped one character for another.
     */
    const compareKey = `${elementKey}::${inputs.comparable ?? ""}`;

    const onElement = onInstance && Boolean(dataGuid);

    return {
        probe: ready && inputs.attempted.probe !== keys.target ? { key: keys.target, delayMs: PROBE_DELAY_MS } : null,
        list: ready && Boolean(party) && inputs.attempted.list !== keys.party ? { key: keys.party, delayMs: SELECTION_DELAY_MS } : null,
        read: onInstance && inputs.attempted.read !== keys.instance ? { key: keys.instance, delayMs: SELECTION_DELAY_MS } : null,
        element: onElement && inputs.attempted.element !== elementKey ? { key: elementKey, delayMs: SELECTION_DELAY_MS } : null,
        compare:
            onElement && inputs.comparable !== null && inputs.attempted.compare !== compareKey ? { key: compareKey, delayMs: EDIT_DELAY_MS } : null
    };
}
