import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { upsertValidation } from "./lib/validations";
import type { LogEntry, LogResult, ValidationView } from "./types";

/** How many runs are kept. Older ones fall off the end rather than filling the sidebar. */
const HISTORY_LIMIT = 25;

export interface RunLog {
    /** Every request made this session, newest first. */
    entries: LogEntry[];
    /**
     * The latest validation per target, so an instance result and several data element results can
     * be on screen together. Kept apart from the history: a fetch should not blank the issues.
     */
    validations: ValidationView[];
    /** Records what a request answered. Called from the `queryFn` that made it. */
    append: (result: LogResult) => void;
    /**
     * Says which instance is on screen, ahead of the render that will say the same thing.
     *
     * For the one flow that moves the selection and reads it back without a render in between: a
     * post reads and validates the instance it just made, and left to the render that validation
     * would be checked against the instance the post replaced and thrown away.
     */
    markSelected: (guid: string) => void;
    clearEntries: () => void;
    clearValidations: () => void;
}

/**
 * The record of what the tool has asked for, held where the things that ask for it can reach.
 *
 * A context rather than a callback threaded down, because every read and every write records itself
 * and there is no part of the tool that does not. It used to be passed from `App` into the `queryFn`
 * of each query, which worked only while all of them were declared in `App`: a panel that owns its
 * own read has no such thread to follow.
 *
 * The value is built by `useRunLogState` and provided by `App`, rather than by a provider component
 * wrapping it. `App`'s own queries record themselves too, and a component cannot read a context it
 * is the one rendering.
 */
export const RunLogContext = createContext<RunLog | null>(null);

/** Throws outside the provider: a request with nowhere to record itself is a wiring mistake. */
export function useRunLog(): RunLog {
    const log = useContext(RunLogContext);
    if (!log) throw new Error("useRunLog outside a RunLogContext provider");
    return log;
}

/**
 * The state behind the log, for whoever provides it.
 *
 * `selectedInstance` is the instance on screen. It is read through a ref because `append` is called
 * from requests that closed over an earlier render, and what it has to compare against is the
 * selection at the moment the answer arrives rather than at the moment the request went out.
 */
export function useRunLogState(selectedInstance: string): RunLog {
    const [entries, setEntries] = useState<LogEntry[]>([]);
    const [validations, setValidations] = useState<ValidationView[]>([]);

    const onScreen = useRef(selectedInstance);
    useEffect(() => {
        onScreen.current = selectedInstance;
    });

    const append = useCallback((result: LogResult) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const at = new Date().toLocaleTimeString("nb");
        setEntries((current) => [{ id, at, result }, ...current].slice(0, HISTORY_LIMIT));

        const validation = result.validation;
        if (!validation) return;
        // A validation view belongs to exactly one instance, so folding in one that answered after
        // another instance was selected would replace the issues on screen with the ones you just
        // left. The request itself keeps its place in the log either way.
        if (validation.instanceGuid !== onScreen.current) return;
        setValidations((current) => upsertValidation(current, validation, at, id));
    }, []);

    const markSelected = useCallback((guid: string) => {
        onScreen.current = guid;
    }, []);

    const clearEntries = useCallback(() => setEntries([]), []);
    const clearValidations = useCallback(() => setValidations([]), []);

    return useMemo(
        () => ({ entries, validations, append, markSelected, clearEntries, clearValidations }),
        [entries, validations, append, markSelected, clearEntries, clearValidations]
    );
}
