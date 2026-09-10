import type { LogIssue } from "../types";

export interface IssueGroup {
    severity: number;
    /** "error", "warning", "info", taken from the issues themselves. */
    label: string;
    issues: LogIssue[];
}

/**
 * The issues of one result, gathered by severity so each run can be named.
 *
 * Encounter order is kept rather than sorted, because the issues arrive worst first already and
 * sorting them twice would put the rule in two places.
 */
export function groupBySeverity(issues: LogIssue[]): IssueGroup[] {
    const groups: IssueGroup[] = [];
    for (const issue of issues) {
        const held = groups.find((group) => group.severity === issue.severity);
        if (held) held.issues.push(issue);
        else groups.push({ severity: issue.severity, label: issue.severityLabel, issues: [issue] });
    }
    return groups;
}
