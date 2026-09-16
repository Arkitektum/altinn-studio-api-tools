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

/**
 * Whether `value` has stopped changing for `delayMs`.
 *
 * This rather than the settled value is what a query wants, because the two jobs a debounce is
 * doing here pull apart. What a request is aimed at should wait for the typing to stop; what is on
 * screen should not. A query keyed on the settled value does both, and the second one is wrong: it
 * leaves the instance you have just left showing for as long as the delay, and stale is exactly
 * what the keys are here to prevent.
 *
 * So the key takes the value as it is, which empties the panels the moment the selection moves, and
 * this gates the request until the value holds still.
 */
export function useSettled<T>(value: T, delayMs: number): boolean {
    return Object.is(useDebounced(value, delayMs), value);
}
