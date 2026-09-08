import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { placeLoaded } from "./payload";
import type { DataElementInput } from "../types";

const loaded: DataElementInput = { dataType: "ET", content: "<ET/>", exampleName: "instance 99d0632c" };

describe("placeLoaded", () => {
    it("fills the blank element a fresh payload starts with", () => {
        const held = placeLoaded([{ dataType: "", content: "" }], loaded);
        assert.deepEqual(held, [loaded]);
    });

    it("fills an empty element of the same data type rather than adding a second one", () => {
        const held = placeLoaded([{ dataType: "ET", content: "   " }], loaded);
        assert.deepEqual(held, [loaded]);
    });

    it("appends when everything already holds content, collapsing the rest", () => {
        const held = placeLoaded(
            [
                { dataType: "ET", content: "<ET>typed by hand</ET>" },
                { dataType: "GjennomfoeringsplanDataV7", content: "<gjp/>" }
            ],
            loaded
        );

        assert.equal(held.length, 3);
        // What was there is kept, not overwritten, since it may be work in progress.
        assert.equal(held[0]?.content, "<ET>typed by hand</ET>");
        assert.equal(held[0]?.collapsed, true);
        assert.equal(held[1]?.collapsed, true);
        assert.deepEqual(held[2], loaded);
    });

    it("leaves an empty element of another data type alone", () => {
        const held = placeLoaded([{ dataType: "vedlegg", content: "" }], loaded);
        // That data type was chosen deliberately, so it is not a slot to take over. The empty
        // element stays, says so in the warning colour, and can be removed.
        assert.equal(held.length, 2);
        assert.equal(held[0]?.dataType, "vedlegg");
        assert.deepEqual(held[1], loaded);
    });
});
