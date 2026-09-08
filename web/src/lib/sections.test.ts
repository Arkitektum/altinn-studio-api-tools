import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleSections } from "./sections";
import type { SectionInputs } from "./sections";

const ready: SectionInputs = {
    hasToken: true,
    org: "dibk",
    app: "et-v4",
    validationCount: 0,
    runCount: 0,
    hasPdf: false,
    hasProcess: false,
    busy: false
};

describe("visibleSections", () => {
    it("hides the request panels until there is a token and an app", () => {
        assert.equal(visibleSections({ ...ready, hasToken: false }).requests, false);
        assert.equal(visibleSections({ ...ready, org: "" }).requests, false);
        assert.equal(visibleSections({ ...ready, app: "" }).requests, false);
        assert.equal(visibleSections(ready).requests, true);
    });

    it("shows the result panels only once they hold something", () => {
        const nothing = visibleSections(ready);
        assert.equal(nothing.validation, false);
        assert.equal(nothing.log, false);

        assert.equal(visibleSections({ ...ready, validationCount: 1 }).validation, true);
        assert.equal(visibleSections({ ...ready, runCount: 1 }).log, true);
    });

    it("shows the pdf panel only while a rendered pdf is held", () => {
        assert.equal(visibleSections(ready).pdf, false);
        assert.equal(visibleSections({ ...ready, hasPdf: true }).pdf, true);
    });

    it("shows the process panel only once an instance read has said where it stands", () => {
        assert.equal(visibleSections(ready).process, false);
        assert.equal(visibleSections({ ...ready, hasProcess: true }).process, true);
    });

    it("shows the log while a request is in flight, before it has any runs", () => {
        assert.equal(visibleSections({ ...ready, busy: true }).log, true);
    });

    it("keeps results on screen when the token expires", () => {
        const expired = visibleSections({ ...ready, hasToken: false, validationCount: 2, runCount: 3 });
        assert.equal(expired.requests, false);
        assert.equal(expired.validation, true);
        assert.equal(expired.log, true);
    });
});
