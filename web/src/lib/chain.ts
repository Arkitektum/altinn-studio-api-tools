/**
 * The chain the whole tool hangs off: a user, an application, a party, an instance, a data element.
 *
 * A readout and a way to get about, which is all it is now. It used to say which link to fill in
 * next and where, because a panel you had not earned yet was simply absent and an absent panel says
 * nothing about what would bring it back. Every panel is on screen from the start and says what it
 * is waiting for, so that job is done where it belongs and saying it twice would be worse than not
 * saying it at all. See `lib/readiness.ts`.
 *
 * What is left is worth more than before rather than less: with nothing hidden the column is longer,
 * and a line that says what is selected and takes you to the panel that sets it is a way down it.
 */
export interface ChainStep {
    label: string;
    /** What it holds, or null when it holds nothing yet. */
    value: string | null;
    /** The id of the panel that sets it, so the strip can take you there. */
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
    return [
        { label: "Test user", value: inputs.user, anchor: "panel-test-user" },
        { label: "Application", value: inputs.application, anchor: "panel-target" },
        { label: "Party", value: inputs.party, anchor: "panel-target" },
        // Once there is a party the instance list is showing and something in it is always
        // selected, so this holds a value either way: a guid, or the new instance row.
        { label: "Instance", value: inputs.instance ?? "new", anchor: "panel-instances" },
        { label: "Data element", value: inputs.dataElement, anchor: "panel-data-element" }
    ];
}
