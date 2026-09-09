import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { currentAnchor } from "./scrollSpy";

// Four panels down the page, as their tops read at the top of a scroll.
const positions = [
    { anchor: "panel-target", top: 90 },
    { anchor: "panel-instances", top: 520 },
    { anchor: "panel-fetch", top: 1400 },
    { anchor: "panel-process", top: 2100 }
];

const OFFSET = 77;

describe("currentAnchor", () => {
    it("takes the first before anything has been scrolled past", () => {
        assert.equal(currentAnchor(positions, OFFSET), "panel-target");
    });

    it("follows the last one to reach the line under the header", () => {
        const scrolled = positions.map((position) => ({ ...position, top: position.top - 600 }));
        assert.equal(currentAnchor(scrolled, OFFSET), "panel-instances");
    });

    it("stays on the last panel once it is the only one above the line", () => {
        const bottom = positions.map((position) => ({ ...position, top: position.top - 2100 }));
        assert.equal(currentAnchor(bottom, OFFSET), "panel-process");
    });

    it("counts a panel sitting exactly on the line as reached", () => {
        // Otherwise the answer flickers between two as the page moves by fractions of a pixel.
        const onTheLine = [
            { anchor: "panel-target", top: -100 },
            { anchor: "panel-instances", top: OFFSET }
        ];
        assert.equal(currentAnchor(onTheLine, OFFSET), "panel-instances");
    });

    it("says nothing when there is nothing anchored", () => {
        assert.equal(currentAnchor([], OFFSET), null);
    });
});
