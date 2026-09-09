/**
 * The chain the whole tool hangs off: a user, an application, a party, an instance, a data
 * element. Each link needs the ones before it, which is why panels come and go, and that was
 * only ever implicit before: a panel you have not earned yet is simply absent, which says
 * nothing about what would earn it.
 *
 * So this says it outright, and names the link to fill in next.
 */

/** done: it has a value. next: nothing yet, and everything before it is done. waiting: blocked. */
export type ChainState = "done" | "next" | "waiting";

export interface ChainStep {
    label: string;
    /** What it holds, or null when it holds nothing yet. */
    value: string | null;
    state: ChainState;
    /** What sets it, so the strip can say where to go. */
    where: string;
    /** The id of that panel, so the strip can take you there. */
    anchor: string;
    /**
     * Whether it is worth marking as the panel on screen. The test user sits in the sticky rail,
     * so its panel is always on screen and saying so would say nothing.
     */
    spy: boolean;
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
    /*
     * Walked in order, because a link is only settled when everything before it is. A value
     * restored from a previous session, a party say, is still shown once it is there, but it
     * reads as blocked until the links it depends on are filled in: without a token nothing
     * downstream of it can be used, and the panels are absent to match.
     */
    const links: { label: string; value: string | null; where: string; anchor: string; spy: boolean; needsRealInstance?: boolean }[] = [
        { label: "Test user", value: inputs.user, where: "Test user", anchor: "panel-test-user", spy: false },
        { label: "Application", value: inputs.application, where: "Target", anchor: "panel-target", spy: true },
        { label: "Party", value: inputs.party, where: "Target", anchor: "panel-target", spy: true },
        // Once there is a party the instance list is showing and something in it is always
        // selected, so this link is settled either way: a guid, or the new instance row.
        { label: "Instance", value: inputs.instance ?? "new", where: "Instances", anchor: "panel-instances", spy: true },
        // A new instance has no data elements yet, so this waits rather than inviting a click.
        { label: "Data element", value: inputs.dataElement, where: "Data element", anchor: "panel-data-element", spy: true, needsRealInstance: true }
    ];

    let blocked = false;
    return links.map((link) => {
        const unreachable = blocked || (link.needsRealInstance === true && !inputs.instance);
        if (unreachable) return { ...link, state: "waiting" as const };
        if (link.value) return { ...link, state: "done" as const };
        blocked = true;
        return { ...link, state: "next" as const };
    });
}
