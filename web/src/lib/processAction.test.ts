import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actionForTaskType, advanceBody, advanceInApp, advanceLabel, advancedLabel } from "./processAction.js";

describe("actionForTaskType", () => {
    it("maps each task type to the action it is advanced with", () => {
        assert.equal(actionForTaskType("data"), "write");
        assert.equal(actionForTaskType("confirmation"), "confirm");
        assert.equal(actionForTaskType("signing"), "sign");
        assert.equal(actionForTaskType("payment"), "pay");
    });

    it("has no action for an unknown task type, so the panel shows what the server will send", () => {
        assert.equal(actionForTaskType("feedback"), null);
        assert.equal(actionForTaskType(null), null);
    });
});

describe("advanceBody", () => {
    it("is the body the request goes out with", () => {
        assert.equal(advanceBody("signing"), '{"action":"sign"}');
        assert.equal(advanceBody(null), "{}");
    });
});

describe("advanceLabel", () => {
    it("says what advancing does to the form rather than what it does to the process", () => {
        // Moving a data task on is how a form is signed and submitted, which is what the operator
        // is actually doing when they press it.
        assert.equal(advanceLabel("data"), "Sign and submit");
        assert.equal(advanceLabel("signing"), "Sign");
        assert.equal(advanceLabel("confirmation"), "Confirm");
        assert.equal(advanceLabel("payment"), "Pay");
    });

    it("promises only the move for a task type it does not know", () => {
        // No action is sent either, so claiming a signature would be claiming more than we know.
        assert.equal(advanceLabel("feedback"), "Advance to the next task");
        assert.equal(advanceLabel(null), "Advance to the next task");
    });
});

describe("advancedLabel", () => {
    it("reports the same thing in the past tense, for the log", () => {
        assert.equal(advancedLabel("data"), "Signed and submitted");
        assert.equal(advancedLabel("payment"), "Paid");
        assert.equal(advancedLabel(null), "Advanced the process");
    });
});

describe("advanceInApp", () => {
    it("says what the same step is in the app", () => {
        assert.equal(advanceInApp("data"), "pressing send in the app");
        assert.equal(advanceInApp("signing"), "signing in the app");
    });

    it("says nothing for a task nobody advances by hand", () => {
        // A feedback task is advanced by the app, so there is no button in it to compare with.
        assert.equal(advanceInApp("feedback"), null);
        assert.equal(advanceInApp(null), null);
    });
});
