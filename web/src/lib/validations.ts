import type { ValidationResult, ValidationView } from "../types";

/** Instance first, then data elements by name, so the results do not jump around. */
export function byTarget(a: ValidationView, b: ValidationView): number {
    if (a.scope !== b.scope) return a.scope === "instance" ? -1 : 1;
    return a.label.localeCompare(b.label, "nb");
}

/**
 * Folds a validation into the results already on screen. One result per target, so validating the
 * same thing again replaces it, and only for the instance being validated: issues describe one
 * instance, and a post creates a new one.
 */
export function upsertValidation(current: ValidationView[], validation: ValidationResult, at: string, runId: string): ValidationView[] {
    const kept = current.filter((held) => held.instanceGuid === validation.instanceGuid && held.key !== validation.key);
    return [...kept, { ...validation, at, runId }].sort(byTarget);
}
