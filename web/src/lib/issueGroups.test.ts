import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { groupBySeverity } from "./issueGroups";
import type { LogIssue } from "../types";

function issue(severity: number, severityLabel: string, code: string): LogIssue {
    return { severity, severityLabel, description: "…", code, field: null, dataElement: null, source: null };
}

const errors = [issue(1, "error", "required"), issue(1, "error", "tooLong")];
const warnings = [issue(2, "warning", "advice")];
const info = [issue(3, "info", "note")];

describe("groupBySeverity", () => {
    it("gathers issues of the same severity, in the order they arrive", () => {
        const groups = groupBySeverity([...errors, ...warnings, ...info]);
        assert.deepEqual(
            groups.map((group) => [group.severity, group.issues.length]),
            [
                [1, 2],
                [2, 1],
                [3, 1]
            ]
        );
    });

    it("takes the label from the issues rather than naming severities itself", () => {
        assert.deepEqual(
            groupBySeverity([...errors, ...warnings]).map((group) => group.label),
            ["error", "warning"]
        );
    });

    it("keeps issues of one severity together when they are not adjacent", () => {
        const groups = groupBySeverity([issue(2, "warning", "a"), issue(1, "error", "b"), issue(2, "warning", "c")]);
        assert.deepEqual(
            groups.map((group) => [group.severity, group.issues.length]),
            [
                [2, 2],
                [1, 1]
            ]
        );
    });

    it("has nothing to group when a result is clean", () => {
        assert.deepEqual(groupBySeverity([]), []);
    });
});
