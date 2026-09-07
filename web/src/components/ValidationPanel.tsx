import { useState } from "react";
import { Panel } from "./Panel";
import type { LogEntry, LogIssue } from "../types";

interface ValidationPanelProps {
    /** The newest run that included a validation, or null before anything has validated. */
    entry: LogEntry | null;
}

/** Errors read as bad, warnings as warn, anything else as neutral information. */
function severityTone(severity: number): "bad" | "warn" | "info" {
    if (severity === 1) return "bad";
    if (severity === 2) return "warn";
    return "info";
}

function badgeClass(severity: number): string {
    return `badge badge--${severityTone(severity)}`;
}

export function ValidationPanel({ entry }: ValidationPanelProps) {
    const validation = entry?.result.validation;

    return (
        <Panel
            title="Validation"
            aside={
                validation ? (
                    <span className="badge">
                        {validation.scope} · {entry?.at}
                    </span>
                ) : undefined
            }
        >
            {!validation && (
                <div className="log-empty">
                    <strong>Nothing validated yet</strong>
                    Posting validates the instance automatically, and the two validate buttons below do it on demand.
                </div>
            )}

            {validation && validation.issues.length === 0 && (
                <div className="notice notice--ok">No issues. The {validation.scope} validates cleanly.</div>
            )}

            {/* Keyed on the run, so expanding a group does not carry over to the next validation. */}
            {validation && validation.issues.length > 0 && <Groups key={entry?.id} issues={validation.issues} />}
        </Panel>
    );
}

function Groups({ issues }: { issues: LogIssue[] }) {
    // Errors start open because they are what blocks a submission. The rest start folded, with
    // their counts still visible, so a long list does not bury them.
    const [overrides, setOverrides] = useState<Record<number, boolean>>({});
    const isOpen = (severity: number) => overrides[severity] ?? severity === 1;

    const bySeverity = new Map<number, LogIssue[]>();
    for (const issue of issues) {
        const bucket = bySeverity.get(issue.severity);
        if (bucket) bucket.push(issue);
        else bySeverity.set(issue.severity, [issue]);
    }

    return (
        <div className="issues">
            {[...bySeverity.entries()].map(([severity, group]) => {
                const open = isOpen(severity);
                return (
                    <div key={severity}>
                        <button
                            type="button"
                            className="issues__toggle"
                            aria-expanded={open}
                            onClick={() => setOverrides((current) => ({ ...current, [severity]: !open }))}
                        >
                            <span className="element__chevron" aria-hidden="true">
                                {open ? "▼" : "▶"}
                            </span>
                            <span className={badgeClass(severity)}>
                                {group.length} {group[0]?.severityLabel}
                                {group.length === 1 ? "" : "s"}
                            </span>
                        </button>

                        {open &&
                            group.map((issue, position) => (
                                <div key={`${issue.code}-${issue.field}-${position}`} className={`issue issue--${severityTone(severity)}`}>
                                    <div className="issue__top">
                                        {issue.code && (
                                            <span className="issue__code" title={issue.source ?? undefined}>
                                                {issue.code}
                                            </span>
                                        )}
                                        {issue.dataElement && <span className="badge">{issue.dataElement}</span>}
                                    </div>
                                    {issue.description && <p className="issue__description">{issue.description}</p>}
                                    {issue.field && <div className="issue__field">{issue.field}</div>}
                                </div>
                            ))}
                    </div>
                );
            })}
        </div>
    );
}
