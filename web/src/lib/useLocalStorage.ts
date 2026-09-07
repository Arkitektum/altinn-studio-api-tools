import { useCallback, useState } from "react";

const NAMESPACE = "altinn-api-tools";

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
