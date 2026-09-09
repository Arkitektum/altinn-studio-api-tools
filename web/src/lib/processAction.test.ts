import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { actionForTaskType, advanceBody } from "./processAction.js";

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
