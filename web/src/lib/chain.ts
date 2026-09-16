/**
 * The chain the whole tool hangs off: a user, an application, a party, an instance, a data element.
 *
 * Each link needs the ones before it. That is the tool's actual shape, and the rail down the left
 * is it drawn out: what is filled in, what you are on, and what is still out of reach.
 *
 * The state came out once and is back. It went when every panel started saying what it was waiting
 * for, because the strip was then explaining an absence that no longer happened. It returns for a
 * different job: a rail is a progress readout, and progress is exactly the thing the panels cannot
 * show, each of them knowing only about itself.
 */

/** done: it holds a value. next: nothing yet, and everything before it is done. waiting: blocked. */
export type ChainState = "done" | "next" | "waiting";

export interface ChainStep {
    label: string;
    /** What it holds, or null when it holds nothing yet. */
    value: string | null;
    state: ChainState;
    /** The id of the panel that sets it, so the rail can take you there. */
    anchor: string;
}

export interface ChainInputs {
    /** The active token's label, which is the person it was minted for. */
    user: string | null;
    /** "dibk/et-v4". */
    application: string | null;
    party: string | null;
    /**
     * The selected instance, or null when the new instance row is what is selected. Null is a
     * choice rather than a gap: a post creates one. It is the reading side that needs a real one.
     */
    instance: string | null;
    /** The data type of the selected data element. */
    dataElement: string | null;
}

export function requestChain(inputs: ChainInputs): ChainStep[] {
    const links: { label: string; value: string | null; anchor: string; needsRealInstance?: boolean }[] = [
        { label: "Test user", value: inputs.user, anchor: "panel-test-user" },
        { label: "Application", value: inputs.application, anchor: "panel-target" },
        { label: "Party", value: inputs.party, anchor: "panel-target" },
        // Once there is a party the instance list is showing and something in it is always
        // selected, so this holds a value either way: a guid, or the new instance row.
        { label: "Instance", value: inputs.instance ?? "new", anchor: "panel-instances" },
        // A new instance has no data elements yet, so this waits rather than inviting a click.
        { label: "Data element", value: inputs.dataElement, anchor: "panel-data-element", needsRealInstance: true }
    ];

    /*
     * Walked in order, because a link is only reachable when everything before it is filled in. A
     * value restored from a previous session is still shown, and still reads as out of reach until
     * the links it depends on are there: a party with no token is a party you cannot act as.
     */
    let blocked = false;
    return links.map((link) => {
        if (blocked || (link.needsRealInstance === true && !inputs.instance)) return { ...link, state: "waiting" as const };
        if (link.value) return { ...link, state: "done" as const };
        blocked = true;
        return { ...link, state: "next" as const };
    });
}
