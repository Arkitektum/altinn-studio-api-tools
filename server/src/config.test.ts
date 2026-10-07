import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readWholeNumber } from "./config.js";

describe("readWholeNumber", () => {
    it("uses the default when the variable is unset or empty, rather than reading empty as 0", () => {
        assert.equal(readWholeNumber({}, "REQUEST_TIMEOUT_MS", 30_000, 1, 86_400_000), 30_000);
        assert.equal(readWholeNumber({ REQUEST_TIMEOUT_MS: "" }, "REQUEST_TIMEOUT_MS", 30_000, 1, 86_400_000), 30_000);
        assert.equal(readWholeNumber({ REQUEST_TIMEOUT_MS: "  " }, "REQUEST_TIMEOUT_MS", 30_000, 1, 86_400_000), 30_000);
    });

    it("reads a whole number in range, spaces around it allowed", () => {
        assert.equal(readWholeNumber({ PORT: "4001" }, "PORT", 4000, 1, 65_535), 4001);
        assert.equal(readWholeNumber({ PORT: " 4001 " }, "PORT", 4000, 1, 65_535), 4001);
        assert.equal(readWholeNumber({ PORT: "1" }, "PORT", 4000, 1, 65_535), 1);
        assert.equal(readWholeNumber({ PORT: "65535" }, "PORT", 4000, 1, 65_535), 65_535);
    });

    it("refuses anything else, naming the variable and the value it was given", () => {
        for (const value of ["30s", "abc", "1.5", "-1", "1e3", "0x10", "0", "65536"]) {
            assert.throws(
                () => readWholeNumber({ PORT: value }, "PORT", 4000, 1, 65_535),
                (error: Error) => error.message === `PORT must be a whole number from 1 to 65535, but is "${value}".`,
                value
            );
        }
    });
});
