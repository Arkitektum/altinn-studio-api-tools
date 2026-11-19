import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { changeMarks, describeChanges, elementChanges, firstToCheck, type AdvanceOutcome } from "./advanceOutcome";
import type { DataElementSummary } from "../types";

function element(id: string, lastChanged: string | null): DataElementSummary {
    return { id, dataType: "ET", contentType: "application/xml", filename: null, size: 10, lastChanged };
}

const outcome = (added: DataElementSummary[], changed: DataElementSummary[]): AdvanceOutcome => ({
    instanceGuid: "g",
    from: "Task_1",
    to: "Task_2",
    added,
    changed,
    total: added.length + changed.length,
    checked: false
});

describe("elementChanges", () => {
    it("finds the elements a move added, in the order the instance lists them", () => {
        const before = [element("form", "t1")];
        const after = [element("pdf-b", "t2"), element("form", "t1"), element("pdf-a", "t2")];
        assert.deepEqual(
            elementChanges(before, after).added.map((each) => each.id),
            ["pdf-b", "pdf-a"]
        );
    });

    it("counts an element written to as changed, and one left alone as neither", () => {
        const before = [element("form", "t1"), element("attachment", "t1")];
        const after = [element("form", "t2"), element("attachment", "t1")];
        const changes = elementChanges(before, after);
        assert.deepEqual(
            changes.changed.map((each) => each.id),
            ["form"]
        );
        assert.deepEqual(changes.added, []);
    });

    it("does not count a new element as changed as well", () => {
        const changes = elementChanges([], [element("pdf", "t2")]);
        assert.deepEqual(changes.changed, []);
        assert.equal(changes.added.length, 1);
    });
});

describe("describeChanges", () => {
    it("says new before changed, and nothing when the move touched nothing", () => {
        assert.equal(describeChanges({ added: [1], changed: [1, 2] }), "1 new, 2 changed");
        assert.equal(describeChanges({ added: [], changed: [1] }), "1 changed");
        assert.equal(describeChanges({ added: [1, 2], changed: [] }), "2 new");
        assert.equal(describeChanges({ added: [], changed: [] }), null);
    });
});

describe("firstToCheck", () => {
    it("lands on the first new element, then on the first changed one", () => {
        assert.equal(firstToCheck(outcome([element("pdf", "t2")], [element("form", "t2")])), "pdf");
        assert.equal(firstToCheck(outcome([], [element("form", "t2"), element("other", "t2")])), "form");
        assert.equal(firstToCheck(outcome([], [])), null);
    });
});

describe("changeMarks", () => {
    it("marks each touched element by what happened to it, and nothing else", () => {
        const marks = changeMarks(outcome([element("pdf", "t2")], [element("form", "t2")]));
        assert.deepEqual(
            [...marks],
            [
                ["pdf", "new"],
                ["form", "changed"]
            ]
        );
        assert.equal(changeMarks(null).size, 0);
    });
});
