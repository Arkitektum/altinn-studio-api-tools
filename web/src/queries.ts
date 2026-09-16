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
    examples: () => ["examples"] as const,
    localtestStatus: () => ["localtest", "status"] as const,
    localtestUsers: () => ["localtest", "users"] as const,
    tokens: () => ["tokens"] as const
};
