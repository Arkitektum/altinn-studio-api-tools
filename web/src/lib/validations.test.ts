import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { upsertValidation } from "./validations";
import type { ValidationResult, ValidationView } from "../types";

const INSTANCE = "6d849d80-93aa-47d2-b739-4fee2177f884";

function instanceResult(instanceGuid = INSTANCE): ValidationResult {
    return { key: "instance", instanceGuid, scope: "instance", label: "Instance", issues: [] };
}

function elementResult(label: string, guid: string, instanceGuid = INSTANCE): ValidationResult {
    return { key: `data:${guid}`, instanceGuid, scope: "data element", label, issues: [] };
}

const labels = (views: ValidationView[]) => views.map((view) => view.label);

describe("upsertValidation", () => {
    it("keeps one result per target", () => {
        let held = upsertValidation([], instanceResult(), "10:00:00", "run-1");
        held = upsertValidation(held, elementResult("ET", "a"), "10:00:01", "run-2");
        assert.deepEqual(labels(held), ["Instance", "ET"]);

        // Validating the same data element again replaces its result rather than adding another.
        held = upsertValidation(held, elementResult("ET", "a"), "10:00:02", "run-3");
        assert.deepEqual(labels(held), ["Instance", "ET"]);
        assert.equal(held[1]?.at, "10:00:02");
        assert.equal(held[1]?.runId, "run-3");

        // Same for the instance.
        held = upsertValidation(held, instanceResult(), "10:00:03", "run-4");
        assert.deepEqual(labels(held), ["Instance", "ET"]);
        assert.equal(held[0]?.at, "10:00:03");
    });

    it("orders the instance first, then data elements by name", () => {
        let held = upsertValidation([], elementResult("vedlegg", "c"), "10:00:00", "run-1");
        held = upsertValidation(held, elementResult("Situasjonsplan", "b"), "10:00:01", "run-2");
        held = upsertValidation(held, instanceResult(), "10:00:02", "run-3");
        held = upsertValidation(held, elementResult("ET", "a"), "10:00:03", "run-4");
        assert.deepEqual(labels(held), ["Instance", "ET", "Situasjonsplan", "vedlegg"]);
    });

    it("drops results belonging to another instance", () => {
        let held = upsertValidation([], instanceResult(), "10:00:00", "run-1");
        held = upsertValidation(held, elementResult("ET", "a"), "10:00:01", "run-2");
        held = upsertValidation(held, elementResult("vedlegg", "c"), "10:00:02", "run-3");
        assert.equal(held.length, 3);

        // A post creates a new instance. Its results replace the previous instance's.
        const other = "11111111-2222-3333-4444-555555555555";
        held = upsertValidation(held, instanceResult(other), "10:00:03", "run-4");
        assert.deepEqual(labels(held), ["Instance"]);
        assert.equal(held[0]?.instanceGuid, other);
    });

    it("carries the issues through untouched", () => {
        const issue = {
            severity: 1,
            severityLabel: "error",
            description: "Vedlegg mangler",
            code: "Ettrinn.Vedlegg.Situasjonsplan",
            field: "/ettrinn[1]",
            dataElement: "ET",
            source: "ETDataElementValidator"
        };
        const held = upsertValidation([], { ...instanceResult(), issues: [issue] }, "10:00:00", "run-1");
        assert.deepEqual(held[0]?.issues, [issue]);
    });
});
