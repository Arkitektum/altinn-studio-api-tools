/**
 * The instance template fields worth setting by hand when creating an instance. Altinn takes
 * more, but these two are the ones a test run cares about: a deadline the app can show, and a
 * date before which the instance is not visible.
 */
export interface TemplateFields {
    /** From a datetime-local input, so local wall clock and no zone. */
    dueBefore: string;
    visibleAfter: string;
}

/**
 * A datetime-local value as an instant Altinn accepts. The input gives wall clock with no zone,
 * so it is read as local time and written as UTC, which is what the api expects.
 *
 * Returns null for empty or unparseable input, which means "do not send this field".
 */
export function toIsoInstant(local: string): string | null {
    const trimmed = local.trim();
    if (!trimmed) return null;
    const parsed = Date.parse(trimmed);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/**
 * The instance template to send, or undefined when neither field is set. Undefined matters: with
 * no template the server creates the instance with the party in the query string, which is the
 * simpler request and the one the log has always shown.
 */
export function buildInstanceTemplate(fields: TemplateFields): Record<string, string> | undefined {
    const dueBefore = toIsoInstant(fields.dueBefore);
    const visibleAfter = toIsoInstant(fields.visibleAfter);
    if (!dueBefore && !visibleAfter) return undefined;
    return {
        ...(dueBefore ? { dueBefore } : {}),
        ...(visibleAfter ? { visibleAfter } : {})
    };
}

/** Whether a visibleAfter would hide the instance from the listings it just went into. */
export function hidesInstance(visibleAfter: string, now: number): boolean {
    const parsed = Date.parse(visibleAfter.trim());
    return !Number.isNaN(parsed) && parsed > now;
}
