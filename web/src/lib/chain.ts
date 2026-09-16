/**
 * The chain the whole tool hangs off, as the rail down the left draws it.
 *
 * Ten steps: who you are, where you are pointed, what you are about to send, and what came back.
 * Each says what it holds and whether you can act on it yet.
 *
 * The order is the page's order, because every row scrolls to a panel and a rail that disagreed
 * with the column beside it would be worse than no rail.
 */

import type { PdfStand } from "./pdfCache";

/** done: it is settled. next: you can act on it now. waiting: something before it is missing. */
export type ChainState = "done" | "next" | "waiting";

export interface ChainStep {
    label: string;
    /** What it holds, or null when it holds nothing yet. */
    value: string | null;
    state: ChainState;
    /** The id of the panel that sets it, so the rail can take you there. */
    anchor: string;
}

/** The payload as it stands, which is the one step that is a list rather than a value. */
export interface PayloadSummary {
    elements: number;
    /** Every element has a data type and something in it, so the post is not held up by this. */
    ready: boolean;
}

/**
 * What the validation service last said, or null when it is switched off.
 *
 * Off is not a step you failed to do, so the rail leaves it out entirely rather than showing it as
 * permanently waiting.
 */
export interface PrevalidationSummary {
    run: boolean;
    /** The payload has been edited since, so the answer describes something else now. */
    stale: boolean;
    /** Documents the service asks for that the submission does not have. */
    outstanding: number;
}

/** What the send has actually put there, which is the only thing that says a post landed. */
export interface PostSummary {
    /** Data elements the selected instance holds. Zero for a new instance, which has none yet. */
    stored: number;
}

/**
 * Where the instance sits in the app's process, or null before a read has said.
 *
 * Null rather than a word for "not read yet", because the step is reachable either way: the panel
 * is there and it is the read it is waiting on, not you.
 */
export interface ProcessStanding {
    /** The task it is in, or how it ended. The words the process panel uses. */
    at: string;
    ended: boolean;
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
    payload: PayloadSummary;
    prevalidation: PrevalidationSummary | null;
    post: PostSummary;
    /** Where the pdf in hand stands against the instance. See lib/pdfCache.ts. */
    pdf: PdfStand;
    process: ProcessStanding | null;
}

/** "2 elements", and what is wrong with them when something is. */
function describePayload(payload: PayloadSummary): string | null {
    if (payload.elements === 0) return null;
    const count = `${payload.elements} element${payload.elements === 1 ? "" : "s"}`;
    return payload.ready ? count : `${count}, incomplete`;
}

function describePrevalidation(prevalidation: PrevalidationSummary): string {
    if (!prevalidation.run) return "not run";
    if (prevalidation.stale) return "payload has changed";
    if (prevalidation.outstanding > 0) {
        return `${prevalidation.outstanding} document${prevalidation.outstanding === 1 ? "" : "s"} missing`;
    }
    return "nothing missing";
}

/** Whether there is a pdf, and whether it still describes the instance. */
function describePdf(stand: PdfStand): string {
    if (stand === "none") return "not rendered";
    return stand === "current" ? "rendered" : "out of date";
}

/** What is on the instance, which is what a post leaves behind. */
function describePost(post: PostSummary): string {
    if (post.stored === 0) return "nothing stored";
    return `${post.stored} stored`;
}

export function requestChain(inputs: ChainInputs): ChainStep[] {
    const hasUser = Boolean(inputs.user);
    const hasApp = hasUser && Boolean(inputs.application);
    const hasParty = hasApp && Boolean(inputs.party);

    /*
     * Reachability is stated per step rather than walked down the list, because the steps are not a
     * single line: a payload can be written before a party is chosen, and reading a data element
     * needs an instance that posting one does not. A walk made Payload wait on Instance, which is
     * not true of the tool.
     *
     * More than one step can be open at once, and that is the honest answer: after an application
     * is set you can pick a party or start writing the payload, and the rail says both.
     */
    const steps: { label: string; value: string | null; anchor: string; reachable: boolean; done: boolean }[] = [
        { label: "Test user", value: inputs.user, anchor: "panel-test-user", reachable: true, done: hasUser },
        { label: "Application", value: inputs.application, anchor: "panel-target", reachable: hasUser, done: hasApp },
        { label: "Party", value: inputs.party, anchor: "panel-target", reachable: hasApp, done: hasParty },
        // Once there is a party something is always selected, a guid or the new instance row, so
        // this is settled either way rather than waiting to be filled in.
        { label: "Instance", value: inputs.instance ?? "new", anchor: "panel-instances", reachable: hasParty, done: hasParty },
        {
            label: "Payload",
            value: describePayload(inputs.payload),
            anchor: "panel-payload",
            reachable: hasApp,
            done: hasApp && inputs.payload.ready
        },
        ...(inputs.prevalidation
            ? [
                  {
                      label: "Prevalidation",
                      value: describePrevalidation(inputs.prevalidation),
                      anchor: "panel-prevalidation",
                      reachable: hasApp && inputs.payload.ready,
                      done: inputs.prevalidation.run && !inputs.prevalidation.stale && inputs.prevalidation.outstanding === 0
                  }
              ]
            : []),
        /*
         * The send, which needs somewhere to send to as well as something to send: a post is made
         * for a party, so this waits on one where the payload only waits on an application.
         *
         * Done is what is stored rather than whether a post was made. An instance you picked from
         * the list was posted to by someone, and one you posted to yourself is the same instance
         * from here on. What matters either way is whether there is anything on it.
         */
        {
            label: "Post",
            value: describePost(inputs.post),
            anchor: "panel-post",
            reachable: hasParty && inputs.payload.ready,
            done: inputs.post.stored > 0
        },
        // A new instance has no data elements yet, so this waits on a real one rather than on the
        // row that stands for making one.
        {
            label: "Data element",
            value: inputs.dataElement,
            anchor: "panel-data-element",
            reachable: Boolean(inputs.instance),
            done: Boolean(inputs.dataElement)
        },
        /*
         * A render describes an instance, so it needs one. Done means the pdf in hand still
         * describes it: a stale one is back to next, which is the button offering to render again.
         */
        {
            label: "Pdf",
            value: describePdf(inputs.pdf),
            anchor: "panel-pdf",
            reachable: Boolean(inputs.instance),
            done: inputs.pdf === "current"
        },
        /*
         * Last, and the only step whose done is the end of the whole chain rather than the start of
         * the next one: an ended process is a submission that has been signed and sent.
         */
        {
            label: "Process",
            value: inputs.process?.at ?? null,
            anchor: "panel-process",
            reachable: Boolean(inputs.instance),
            done: inputs.process?.ended ?? false
        }
    ];

    return steps.map(({ label, value, anchor, reachable, done }) => ({
        label,
        value,
        anchor,
        state: !reachable ? ("waiting" as const) : done ? ("done" as const) : ("next" as const)
    }));
}
