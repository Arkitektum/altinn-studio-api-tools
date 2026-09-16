import { useEffect, useState } from "react";

/**
 * A value as it was once it stopped changing for `delayMs`.
 *
 * For the fields a request is aimed at rather than for the request. Org and app are typed a
 * character at a time, and a query keyed on them directly would ask the app five times on the way
 * to "et-v4", four of which are about an app that does not exist. Keying it on this instead means
 * the cache never hears about the intermediate values at all, so there is nothing to cancel, log or
 * throw away afterwards.
 *
 * Only the query key waits. Everything else on screen reads the field as typed, because a form that
 * lags behind the keyboard is a worse problem than the one this solves.
 */
export function useDebounced<T>(value: T, delayMs: number): T {
    const [settled, setSettled] = useState(value);

    useEffect(() => {
        if (Object.is(settled, value)) return;
        const timer = window.setTimeout(() => setSettled(value), delayMs);
        return () => window.clearTimeout(timer);
    }, [value, delayMs, settled]);

    return settled;
}
