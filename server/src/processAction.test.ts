import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actionForTaskType, advanceBody, taskTypeOf } from "./processAction.js";

describe("actionForTaskType", () => {
    it("maps Altinn's task types to the action each is advanced with", () => {
        assert.equal(actionForTaskType("data"), "write");
        assert.equal(actionForTaskType("confirmation"), "confirm");
        assert.equal(actionForTaskType("signing"), "sign");
        assert.equal(actionForTaskType("payment"), "pay");
    });

    it("does not care about casing or padding, since this comes off the wire", () => {
        assert.equal(actionForTaskType("Signing"), "sign");
        assert.equal(actionForTaskType(" DATA "), "write");
    });

    it("has no action for a task type it does not know, or for none at all", () => {
        // Feedback is advanced by the app rather than by a caller, so it is deliberately absent.
        assert.equal(actionForTaskType("feedback"), null);
        assert.equal(actionForTaskType(null), null);
        assert.equal(actionForTaskType(undefined), null);
        assert.equal(actionForTaskType(""), null);
    });
});

describe("advanceBody", () => {
    it("names the action for the task", () => {
        assert.equal(advanceBody("signing"), '{"action":"sign"}');
        assert.equal(advanceBody("data"), '{"action":"write"}');
    });

    it("sends an empty object where the action is unknown, rather than guessing", () => {
        assert.equal(advanceBody(null), "{}");
        assert.equal(advanceBody("something-new"), "{}");
    });
});

describe("taskTypeOf", () => {
    it("reads the current task's type out of an instance", () => {
        const instance = { id: "510001/abc", process: { currentTask: { elementId: "Task_2", altinnTaskType: "signing" } } };
        assert.equal(taskTypeOf(instance), "signing");
    });

    it("reads it out of a bare process state, which process/next answers with", () => {
        assert.equal(taskTypeOf({ currentTask: { elementId: "Task_1", altinnTaskType: "data" } }), "data");
    });

    it("gives nothing for an ended process, or for anything that is not one", () => {
        assert.equal(taskTypeOf({ process: { currentTask: null, ended: "2026-09-09T10:00:00Z" } }), null);
        assert.equal(taskTypeOf({ process: { currentTask: { elementId: "Task_1" } } }), null);
        assert.equal(taskTypeOf(null), null);
        assert.equal(taskTypeOf("nope"), null);
    });
});
