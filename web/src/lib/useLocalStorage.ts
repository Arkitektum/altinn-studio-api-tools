import { useCallback, useState } from "react";

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
 * Persist form state across reloads. Keeps the tool usable as a scratchpad: the payload you
 * were editing survives a refresh. Token ids are not stored here. They live in server memory
 * and are listed again when the page loads.
 */
export function useLocalStorage<T>(key: string, initial: T): [T, (next: T) => void] {
    const storageKey = `${NAMESPACE}:${key}`;

    const [value, setValue] = useState<T>(() => {
        try {
            const raw = window.localStorage.getItem(storageKey);
            return raw === null ? initial : (JSON.parse(raw) as T);
        } catch {
            return initial;
        }
    });

    const update = useCallback(
        (next: T) => {
            setValue(next);
            try {
                window.localStorage.setItem(storageKey, JSON.stringify(next));
            } catch {
                /* private mode or quota exceeded, in-memory state still works */
            }
        },
        [storageKey]
    );

    return [value, update];
}
