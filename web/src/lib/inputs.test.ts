import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { offeredMode } from "./inputs";

describe("offeredMode", () => {
    it("keeps the two destinations the switch offers", () => {
        assert.equal(offeredMode("multipart"), "multipart");
        assert.equal(offeredMode("existing"), "existing");
    });

    it("lands a stored sequential on a new instance", () => {
        // It was dropped from the UI, so a session that saved it has nothing to select.
        assert.equal(offeredMode("sequential"), "multipart");
    });
});
