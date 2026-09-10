import { useEffect, useState } from "react";
import { groupBySeverity } from "../lib/issueGroups";
import { Panel } from "./Panel";
import type { LogIssue, ValidationView } from "../types";

interface ValidationPanelProps {
    /** Latest result per target, instance first. Empty before anything has validated. */
    validations: ValidationView[];
    onClear: () => void;
}

/** Errors read as bad, warnings as warn, anything else as neutral information. */
function severityTone(severity: number): "bad" | "warn" | "info" {
    if (severity === 1) return "bad";
    if (severity === 2) return "warn";
    return "info";
}

/** Worst severity present, so a folded block still says whether it is blocking. */
function summarise(issues: LogIssue[]): { text: string; tone: "ok" | "warn" | "bad" } {
    if (issues.length === 0) return { text: "clean", tone: "ok" };
    const errors = issues.filter((issue) => issue.severity === 1).length;
    const warnings = issues.filter((issue) => issue.severity === 2).length;
    const other = issues.length - errors - warnings;

    const parts: string[] = [];
    if (errors > 0) parts.push(`${errors} error${errors === 1 ? "" : "s"}`);
    if (warnings > 0) parts.push(`${warnings} warning${warnings === 1 ? "" : "s"}`);
    if (other > 0) parts.push(`${other} other`);
    return { text: parts.join(", "), tone: errors > 0 ? "bad" : warnings > 0 ? "warn" : "ok" };
}

export function ValidationPanel({ validations, onClear }: ValidationPanelProps) {
    // Every result starts folded. Expanded issue lists run long enough to push the run log off
    // screen, so the counts in the headers are the default view and you open what you want.
    const [openKeys, setOpenKeys] = useState<Record<string, boolean>>({});
    const isOpen = (key: string) => openKeys[key] ?? false;

    // Forget which blocks were open once the results they belonged to are gone, otherwise the next
    // validation of the same target would come back already expanded.
    const empty = validations.length === 0;
    useEffect(() => {
        if (empty) setOpenKeys({});
    }, [empty]);

    return (
        <Panel
            title="Validation"
            aside={
                validations.length > 0 ? (
                    <span className="row" style={{ gap: 6 }}>
                        {/* Named apart from the run log's Clear history, which does something else. */}
                        <button type="button" className="btn btn--ghost" onClick={onClear}>
                            Clear results
                        </button>
                        <span className="badge">
                            {validations.length} result{validations.length === 1 ? "" : "s"}
                        </span>
                    </span>
                ) : undefined
            }
        >
            {validations.length === 0 && (
                <div className="log-empty">
                    <strong>Nothing validated yet</strong>
                    Posting validates the instance automatically, and the two validate buttons below do it on demand. The latest result for the
                    instance and for each data element is kept here.
                </div>
            )}

            {validations.length > 0 && (
                <div className="results">
                    {validations.map((validation) => {
                        const open = isOpen(validation.key);
                        const summary = summarise(validation.issues);

                        return (
                            <div key={validation.key} className={`result result--${summary.tone}`}>
                                <button
                                    type="button"
                                    className="result__head"
                                    aria-expanded={open}
                                    onClick={() => setOpenKeys((current) => ({ ...current, [validation.key]: !open }))}
                                >
                                    <span className="element__chevron" aria-hidden="true">
                                        {open ? "▼" : "▶"}
                                    </span>
                                    <span className="result__label" title={validation.scope === "data element" ? validation.label : undefined}>
                                        {validation.label}
                                    </span>
                                    <span className={`badge badge--${summary.tone}`}>{summary.text}</span>
                                    <span className="spacer" />
                                    <span className="result__meta">{validation.at}</span>
                                </button>

                                {open && (
                                    <div className="result__body">
                                        {validation.issues.length === 0 ? (
                                            <div className="notice notice--ok">No issues. The {validation.scope} validates cleanly.</div>
                                        ) : (
                                            /* Keyed on the run, so the severity folds reset when this target validates again. */
                                            <Groups key={validation.runId} issues={validation.issues} />
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </Panel>
    );
}

/**
 * The issues of one result, worst first, under a line naming each severity.
 *
 * They were folded by severity before, one collapsible block per group. That put a block inside a
 * block: a result already coloured by its worst severity, holding a red group and an amber group,
 * and holding nothing but two badges whenever both were shut. A run of cards under a plain line
 * says the same thing without the boxes, and one fold, the result's own, is enough.
 */
function Groups({ issues }: { issues: LogIssue[] }) {
    return (
        <div className="issues">
            {groupBySeverity(issues).map((group) => (
                <div key={group.severity} className="issues__group">
                    {/*
                     * Named rather than only coloured. The cards carry the severity as a coloured
                     * edge, which says nothing to anyone the colour does not reach.
                     */}
                    <span className="issues__legend">
                        {group.issues.length} {group.label}
                        {group.issues.length === 1 ? "" : "s"}
                    </span>

                    {group.issues.map((issue, position) => (
                        <div key={`${issue.code}-${issue.field}-${position}`} className={`issue issue--${severityTone(group.severity)}`}>
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
            ))}
        </div>
    );
}
