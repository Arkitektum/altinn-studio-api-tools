import { QueryClient } from "@tanstack/react-query";

/**
 * How every read in this tool behaves, stated once.
 *
 * The defaults a query library ships are written for an application showing a user their own data,
 * where asking again is free and usually right. None of that holds here. Each read is a request
 * someone is watching in the run log, aimed at a local Altinn that may not be running, made with a
 * token that may not be allowed to make it. So the defaults are inverted:
 *
 * - **Never retried.** A refusal is the answer. Asking twice puts the same refusal in the log twice
 *   and tells you nothing the first one did not.
 * - **Never refetched on its own.** Not on focus, not on reconnect, not on mount. The tool asks when
 *   what it is asking about changes, and otherwise when you press Refresh. A request nobody asked
 *   for appearing in the log would make the log a worse record of what you did.
 * - **Never stale.** An answer stands until its key moves or something invalidates it, because the
 *   key already names everything the answer depends on.
 *
 * What the library is here for is the one thing that was hand-written and kept going wrong: an
 * answer whose key has moved on is dropped rather than written over the newer one. That was
 * `selectionKeys`, the `aim` ref, `movedOn` and five `*Attempted` markers, and it is now the cache.
 *
 * A function rather than one client, because a test wants its own: a client shared between tests
 * carries the answers of the last one into the next, which is a test passing for the wrong reason.
 *
 * ## Where the run log gets its entry
 *
 * Inside the `queryFn`, not in an effect on the answer and not in a cache-wide hook. The log is a
 * record of requests that were made, and the `queryFn` is the request: it runs once per fetch and
 * not at all when an answer comes from the cache, which is exactly the distinction the log draws.
 * It also leaves room for the reads that are two requests and one entry, an instance read and its
 * validation being the pair the log has always shown together.
 */
export function makeQueryClient(): QueryClient {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
                refetchOnWindowFocus: false,
                refetchOnReconnect: false,
                refetchOnMount: false,
                staleTime: Infinity,
                gcTime: Infinity
            },
            mutations: {
                retry: false,
                /*
                 * Dropped as soon as nothing is looking at it. A mutation here is a post, and what
                 * came back from one is folded into the run log the moment it lands, so the cache's
                 * copy is never read again. The default of five minutes would hold every run result
                 * for that long, and a run result carries the request body: posting a file means
                 * megabytes of base64 kept for nothing.
                 */
                gcTime: 0
            }
        }
    });
}

/**
 * Every query key the tool uses, built here rather than spelled out at each call.
 *
 * A key names what an answer is about, and the scopes nest: everything below an app is invalid when
 * the app moves, everything below an instance when the instance moves. Building them from one place
 * is what makes `queryClient.invalidateQueries({ queryKey: keys.app(...) })` mean "and everything
 * under it" without anyone having to list what that covers.
 */
export const queryKeys = {
    /** Read once at startup and not keyed on anything: the server's own settings and fixtures. */
    config: () => ["config"] as const,
    catalogue: () => ["catalogue"] as const,
    /** Keyed on the app, since its main form examples come from the testmotor rather than disk. */
    examples: (app: string) => ["examples", app] as const,
    /** The one sweep the server runs at a time, so it is keyed on nothing. */
    sweep: () => ["sweep"] as const,
    localtestStatus: () => ["localtest", "status"] as const,
    localtestUsers: () => ["localtest", "users"] as const,
    tokens: () => ["tokens"] as const,

    /**
     * What the validation service last said, and the submission it said it about.
     *
     * In the cache rather than in the hook's own state, because two things read it now: the payload
     * panel lists the documents it asks for, and the rail says whether it has been run at all. A
     * `useState` gives each caller its own empty copy, so the rail would say "not prevalidated"
     * however many times you had pressed the button.
     *
     * Not keyed on the submission. It is one answer at a time, and which submission it was about is
     * the thing the answer is compared against rather than part of its name.
     */
    validationReport: () => ["validation-report"] as const,

    /**
     * Everything read about one app, as one token. The scope rather than a read, so invalidating it
     * covers the two below without naming them.
     *
     * The token is in the key because the answers are that token's: what an app will tell you, and
     * which parties you may act for, both depend on who is asking. Switching user has to ask again.
     */
    app: (tokenId: string, org: string, app: string) => ["app", tokenId, org, app] as const,
    appMetadata: (tokenId: string, org: string, app: string) => ["app", tokenId, org, app, "metadata"] as const,
    appParties: (tokenId: string, org: string, app: string) => ["app", tokenId, org, app, "parties"] as const,

    /** Every listing of this app, for invalidating them all after something changed one. */
    allInstances: (tokenId: string, org: string, app: string) => ["app", tokenId, org, app, "instances"] as const,

    /**
     * One party's instances. `completed` is in the key rather than a parameter to the same read,
     * because asking storage for the finished ones is a different question with a different answer,
     * and turning it on should not look like the short list being wrong.
     */
    instances: (tokenId: string, org: string, app: string, party: string, completed: boolean) =>
        ["app", tokenId, org, app, "instances", party, completed] as const,

    /**
     * One instance, as read back with its validation. Everything the panels below the instance show
     * comes from here, so it is one key rather than one per panel: they describe the same moment and
     * would otherwise be able to disagree about which instance they are describing.
     */
    instance: (tokenId: string, org: string, app: string, party: string, guid: string) =>
        ["app", tokenId, org, app, "instance", party, guid] as const,

    /**
     * One data element, read back and validated.
     *
     * `changedAt` is in the key because a post rewrites an element in place: the guid stays where it
     * was while what is stored under it does not, and without this the tool would go on showing what
     * it read before the post.
     */
    dataElement: (tokenId: string, org: string, app: string, party: string, guid: string, dataGuid: string, changedAt: string | null) =>
        ["app", tokenId, org, app, "instance", party, guid, "data", dataGuid, changedAt] as const,

    /**
     * The stored element against the xml as written, which is the payload text itself.
     *
     * The text is in the key because it is half of what is being compared, and a length or a
     * timestamp would miss an edit that swapped one character for another. It is the text as typed,
     * so the key moves with every keystroke and the entries behind it hold a copy of the document
     * each: this is the one query with a finite `gcTime`, and the one that keeps its previous answer
     * on screen while the next key loads.
     */
    compare: (tokenId: string, org: string, app: string, party: string, guid: string, dataGuid: string, changedAt: string | null, written: string) =>
        ["app", tokenId, org, app, "instance", party, guid, "data", dataGuid, changedAt, "compare", written] as const
};
