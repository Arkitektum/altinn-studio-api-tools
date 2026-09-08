/** Altinn claims worth surfacing, in the order an operator cares about them. */
const CLAIM_LABELS: [claim: string, label: string][] = [
    ["urn:altinn:userid", "User id"],
    ["urn:altinn:partyid", "Party id"],
    ["urn:altinn:username", "Username"],
    ["pid", "Person no."],
    ["urn:altinn:org", "Org"],
    ["urn:altinn:orgNumber", "Org no."],
    ["urn:altinn:authenticatelevel", "Auth level"],
    ["iss", "Issuer"]
];

export interface ClaimRow {
    label: string;
    value: string;
}

export function summariseClaims(claims: Record<string, unknown>): ClaimRow[] {
    const rows: ClaimRow[] = [];
    for (const [claim, label] of CLAIM_LABELS) {
        const value = claims[claim];
        if (value === undefined || value === null || value === "") continue;
        rows.push({
            label,
            value: typeof value === "object" ? JSON.stringify(value) : String(value)
        });
    }
    return rows;
}

/** Renders an expiry claim as "expires in 42 min" or "expired 3 min ago". */
export function describeExpiry(expiresAt: string | null, now: number): string {
    if (!expiresAt) return "no expiry claim";
    const deltaMs = Date.parse(expiresAt) - now;
    if (Number.isNaN(deltaMs)) return "unknown expiry";
    const seconds = Math.round(Math.abs(deltaMs) / 1000);
    const rendered =
        seconds < 60
            ? `${seconds}s`
            : seconds < 3600
              ? `${Math.floor(seconds / 60)}m ${seconds % 60}s`
              : `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    return deltaMs > 0 ? `expires in ${rendered}` : `expired ${rendered} ago`;
}

export function isExpired(expiresAt: string | null, now: number): boolean {
    return expiresAt !== null && Date.parse(expiresAt) <= now;
}

export function prettyJson(value: unknown): string {
    if (typeof value === "string") {
        try {
            return JSON.stringify(JSON.parse(value), null, 2);
        } catch {
            return value;
        }
    }
    return JSON.stringify(value, null, 2) ?? String(value);
}

export function partyLabel(party: { partyId: number; name?: string; orgNumber?: string | null; ssn?: string | null }): string {
    const identifier = party.orgNumber || party.ssn;
    return `${party.partyId} · ${party.name ?? "unnamed"}${identifier ? ` (${identifier})` : ""}`;
}

/** Where a process stands, in one line: the task it sits in, or that it has ended. */
export function processLabel(process: { currentTask: string | null; ended: string | null; endEvent: string | null } | null): string {
    if (!process) return "unknown";
    if (process.ended) return process.endEvent ? `ended · ${process.endEvent}` : "ended";
    return process.currentTask ?? "no task";
}

/** Labels an instance in the picker: enough to tell two apart without reading a whole guid. */
export function instanceLabel(instance: { instanceGuid: string; lastChanged: string | null; lastChangedBy: string | null }): string {
    const bits = [instance.instanceGuid.slice(0, 8)];
    if (instance.lastChanged) {
        const parsed = Date.parse(instance.lastChanged);
        bits.push(Number.isNaN(parsed) ? instance.lastChanged : new Date(parsed).toLocaleString("nb"));
    }
    if (instance.lastChangedBy) bits.push(instance.lastChangedBy);
    return bits.join(" · ");
}

/** Altinn's ValidationIssueSeverity. Mirrors severityLabel on the server. */
const SEVERITY_LABELS: Record<number, string> = {
    1: "error",
    2: "warning",
    3: "info",
    4: "fixed",
    5: "success"
};

export function severityLabel(severity: number): string {
    return SEVERITY_LABELS[severity] ?? `severity ${severity}`;
}
