export interface ReadinessInputs {
    /** A token that exists and has not expired. Nothing can be asked without one. */
    hasToken: boolean;
    org: string;
    app: string;
    /** A party is set, so the instance list has something to ask about. */
    party: string;
    /** An instance is selected, which everything in the Inspect column is about. */
    instance: string;
    /** A data element is selected, which is the thing a comparison is about. */
    dataElement: string;
}

/**
 * Why each panel cannot be used yet, or null when it can.
 *
 * Every panel is on screen from the start, and one you cannot act on yet says what it is waiting
 * for. It used to be left out instead, which read as a cleaner first screen and cost more than it
 * saved: the order the tool wants things done in was invisible, so a strip above the panels had to
 * name it, and a panel appearing as you typed moved everything under it.
 *
 * The reason is written as the thing that is missing rather than as an instruction. "Needs a test
 * user" sits under the heading of the panel that is waiting, and the panel above it is where you
 * get one, so an instruction would be repeating what the layout already says.
 */
export interface Readiness {
    /** Where to point the tool. It needs a token to read the app with. */
    target: string | null;
    /** The party's instances, to open or delete one. */
    instances: string | null;
    /** Payload, the post button and the data element reads. */
    requests: string | null;
    /** The stored xml against the xml as written. */
    compare: string | null;
    /** Where the instance stands, and the button that moves it on. */
    process: string | null;
}

export function readiness(inputs: ReadinessInputs): Readiness {
    const noToken = inputs.hasToken ? null : "Needs a test user.";
    const noApp = noToken ?? (inputs.org && inputs.app ? null : "Needs an application.");
    const noParty = noApp ?? (inputs.party ? null : "Needs an instance owner party id.");
    const noInstance = noParty ?? (inputs.instance ? null : "Needs an instance.");

    return {
        target: noToken,
        instances: noParty,
        requests: noApp,
        compare: noInstance ?? (inputs.dataElement ? null : "Needs a data element."),
        process: noInstance
    };
}
