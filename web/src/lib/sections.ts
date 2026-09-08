export interface SectionInputs {
    hasToken: boolean;
    org: string;
    app: string;
    /** Validation results currently held. */
    validationCount: number;
    /** Runs in the history. */
    runCount: number;
    /** A rendered pdf is being held. */
    hasPdf: boolean;
    /** An instance read has told us where the instance stands in its process. */
    hasProcess: boolean;
    /** A request is in flight, so the log is about to have something in it. */
    busy: boolean;
}

export interface VisibleSections {
    /** Payload, the post button and Fetch. All of them need a token and an app to aim at. */
    requests: boolean;
    /** Where the instance stands, and the button that moves it on. */
    process: boolean;
    validation: boolean;
    pdf: boolean;
    log: boolean;
}

/**
 * Which panels to show. A panel is hidden when there is nothing you could do with it yet: the
 * request panels need a token and an app, and the two result panels need results. Test user and
 * Target stay put, since they are how you get the rest.
 */
export function visibleSections(inputs: SectionInputs): VisibleSections {
    return {
        requests: inputs.hasToken && Boolean(inputs.org && inputs.app),
        // Reading an instance is what fills this in, so it arrives with its first content like the
        // result panels do.
        process: inputs.hasProcess,
        // Results stand on their own. An expired token does not make what you already read useless.
        validation: inputs.validationCount > 0,
        pdf: inputs.hasPdf,
        log: inputs.runCount > 0 || inputs.busy
    };
}
