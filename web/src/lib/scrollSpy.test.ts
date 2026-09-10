import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { currentAnchor } from "./scrollSpy";

/** The strip's own edge, and where a panel's scroll margin puts it, which is 16px clear of it. */
const STRIP = 77;
const REACHED = STRIP + 16;

// Four panels down the page, as their tops read at the top of a scroll.
const positions = [
    { anchor: "panel-target", top: 90, reachedAt: REACHED },
    { anchor: "panel-instances", top: 520, reachedAt: REACHED },
    { anchor: "panel-fetch", top: 1400, reachedAt: REACHED },
    { anchor: "panel-process", top: 2100, reachedAt: REACHED }
];

describe("currentAnchor", () => {
    it("takes the first before anything has been scrolled past", () => {
        assert.equal(currentAnchor(positions), "panel-target");
    });

    it("follows the last one to arrive", () => {
        const scrolled = positions.map((position) => ({ ...position, top: position.top - 600 }));
        assert.equal(currentAnchor(scrolled), "panel-instances");
    });

    it("stays on the last panel once it is the only one above the line", () => {
        const bottom = positions.map((position) => ({ ...position, top: position.top - 2100 }));
        assert.equal(currentAnchor(bottom), "panel-process");
    });

    it("marks the panel a click scrolled to, not the one above it", () => {
        /*
         * Clicking a link scrolls the panel to its own scroll margin, which is below the strip.
         * Measured against the strip alone, the panel had not arrived and the strip marked its
         * predecessor, which is what a click looked like: the wrong link lighting up.
         */
        const clicked = [
            { anchor: "panel-target", top: -400, reachedAt: REACHED },
            { anchor: "panel-instances", top: REACHED, reachedAt: REACHED },
            { anchor: "panel-fetch", top: 900, reachedAt: REACHED }
        ];
        assert.equal(currentAnchor(clicked), "panel-instances");
    });

    it("counts a panel sitting a fraction above its line as arrived", () => {
        // Otherwise the answer flickers between two as the page moves by fractions of a pixel.
        const onTheLine = [
            { anchor: "panel-target", top: -100, reachedAt: REACHED },
            { anchor: "panel-instances", top: REACHED + 3, reachedAt: REACHED }
        ];
        assert.equal(currentAnchor(onTheLine), "panel-instances");
    });

    it("takes a panel's own line, since not every panel has the same one", () => {
        const mixed = [
            { anchor: "panel-target", top: -100, reachedAt: REACHED },
            // No scroll margin of its own, so the strip's edge is what it has to reach.
            { anchor: "panel-plain", top: STRIP + 2, reachedAt: STRIP }
        ];
        assert.equal(currentAnchor(mixed), "panel-plain");
        assert.equal(
            currentAnchor([
                { ...mixed[0]!, top: -100 },
                { anchor: "panel-plain", top: STRIP + 40, reachedAt: STRIP }
            ]),
            "panel-target"
        );
    });

    it("marks the last one at the end of the page, where nothing below can arrive", () => {
        // A short last panel cannot reach the line however far the page is scrolled.
        assert.equal(currentAnchor(positions, true), "panel-process");
    });

    it("says nothing when there is nothing anchored", () => {
        assert.equal(currentAnchor([]), null);
        assert.equal(currentAnchor([], true), null);
    });
});
