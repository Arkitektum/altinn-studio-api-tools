import { useCallback, useState, type Dispatch, type SetStateAction } from "react";

const NAMESPACE = "altinn-api-tools";

/**
 * Which of the browser's keys belong to this tool. A profile holds keys from everything served on
 * the same origin, and another tool on localhost is not ours to clear.
 */
export function ownKeys(keys: string[]): string[] {
    return keys.filter((key) => key.startsWith(`${NAMESPACE}:`));
}

/**
 * Drops everything the tool has stored: the target, the selection and the payload elements. No
 * token goes anywhere near localStorage, so nothing here is a credential.
 */
export function clearStored(): void {
    for (const key of ownKeys(Object.keys(window.localStorage))) {
        window.localStorage.removeItem(key);
    }
}

/**
 * Stores a value under one of the tool's keys.
 *
 * @returns false when the browser refused it, which is private mode or a full quota.
 */
export function writeStored(key: string, value: unknown): boolean {
    try {
        window.localStorage.setItem(`${NAMESPACE}:${key}`, JSON.stringify(value));
        return true;
    } catch {
        return false;
    }
}

/**
 * Persist form state across reloads. Keeps the tool usable as a scratchpad: the payload you
 * were editing survives a refresh. Token ids are not stored here. They live in server memory
 * and are listed again when the page loads.
 */
export function useLocalStorage<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
    const storageKey = `${NAMESPACE}:${key}`;

    const [value, setValue] = useState<T>(() => {
        try {
            const raw = window.localStorage.getItem(storageKey);
            return raw === null ? initial : (JSON.parse(raw) as T);
        } catch {
            return initial;
        }
    });

    /*
     * Takes an updater as well as a value, the way useState does, and it matters here: two example
     * files loading into two new payload elements at the same moment both computed the next array
     * from the render they started in, so the second wrote over the first and one element stayed
     * empty. An updater sees what the other one just did.
     *
     * The write happens inside the updater, which React may run twice in development. Writing the
     * same string twice costs nothing, and doing it outside would mean holding the value again.
     */
    const update = useCallback<Dispatch<SetStateAction<T>>>(
        (next) => {
            setValue((current) => {
                const resolved = typeof next === "function" ? (next as (value: T) => T)(current) : next;
                // Refused in private mode or past the quota, and the state in memory still works.
                writeStored(key, resolved);
                return resolved;
            });
        },
        [key]
    );

    return [value, update];
}
