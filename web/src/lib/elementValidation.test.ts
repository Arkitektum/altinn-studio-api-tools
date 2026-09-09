import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validationBlockedBy } from "./elementValidation.js";
import type { ProcessSummary } from "../types.js";

const inTask = (currentTask: string, taskType = "data"): ProcessSummary => ({
    currentTask,
    taskType,
    started: "2026-09-09T10:00:00Z",
    ended: null,
    endEvent: null
});

const ended: ProcessSummary = {
    currentTask: null,
    taskType: null,
    started: "2026-09-09T10:00:00Z",
    ended: "2026-09-09T10:05:00Z",
    endEvent: "EndEvent_1"
};

describe("validationBlockedBy", () => {
    it("allows it while the instance is in the task the data type belongs to", () => {
        assert.equal(validationBlockedBy(inTask("Task_1"), { id: "ET", taskId: "Task_1" }), null);
    });

    it("blocks it once the process has ended", () => {
        assert.match(validationBlockedBy(ended, { id: "ET", taskId: "Task_1" }) ?? "", /has ended/);
        // Even for a data type with no task of its own: there is no task at all to validate against.
        assert.match(validationBlockedBy(ended, { id: "vedlegg" }) ?? "", /has ended/);
    });

    it("blocks it once the instance has moved to another task", () => {
        const reason = validationBlockedBy(inTask("Task_2", "signing"), { id: "ET", taskId: "Task_1" });
        assert.match(reason ?? "", /Task_1/);
        assert.match(reason ?? "", /Task_2/);
    });

    it("allows it for a data type that belongs to no task, since there is nothing to compare", () => {
        assert.equal(validationBlockedBy(inTask("Task_2"), { id: "ref-data-as-pdf" }), null);
        assert.equal(validationBlockedBy(inTask("Task_2"), { id: "vedlegg", taskId: null }), null);
        // An unknown data type is the same case: the app never said which task it is for.
        assert.equal(validationBlockedBy(inTask("Task_2"), undefined), null);
    });

    it("allows it when no process has been read, rather than blocking on a guess", () => {
        assert.equal(validationBlockedBy(null, { id: "ET", taskId: "Task_1" }), null);
    });
});
