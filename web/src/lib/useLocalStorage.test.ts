import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ownKeys } from "./useLocalStorage";

describe("ownKeys", () => {
    it("takes the tool's own keys and leaves the rest of the origin alone", () => {
        const stored = ["altinn-api-tools:org", "altinn-api-tools:dataElements", "vite:something", "theme"];
        assert.deepEqual(ownKeys(stored), ["altinn-api-tools:org", "altinn-api-tools:dataElements"]);
    });

    it("does not take a key that only begins the same way", () => {
        assert.deepEqual(ownKeys(["altinn-api-tools-other:org"]), []);
    });

    it("has nothing to take from an empty profile", () => {
        assert.deepEqual(ownKeys([]), []);
    });
});
