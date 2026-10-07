import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAllowedHost } from "./hostCheck.js";

describe("isAllowedHost", () => {
    it("accepts localhost, with or without a port, in any case", () => {
        assert.equal(isAllowedHost("localhost"), true);
        assert.equal(isAllowedHost("localhost:4000"), true);
        assert.equal(isAllowedHost("LocalHost:4000"), true);
        assert.equal(isAllowedHost("api.localhost:4000"), true);
    });

    it("accepts any IP address, since no page can make a browser send one in place of its own name", () => {
        assert.equal(isAllowedHost("127.0.0.1:4000"), true);
        assert.equal(isAllowedHost("192.168.1.20:4000"), true);
        assert.equal(isAllowedHost("[::1]:4000"), true);
        assert.equal(isAllowedHost("[::1]"), true);
    });

    it("refuses any other name, which is what a rebound domain arrives as", () => {
        assert.equal(isAllowedHost("attacker.example"), false);
        assert.equal(isAllowedHost("attacker.example:4000"), false);
        // A name that only starts like ours is not ours.
        assert.equal(isAllowedHost("localhost.attacker.example:4000"), false);
        assert.equal(isAllowedHost("127.0.0.1.nip.io:4000"), false);
    });

    it("accepts a name it is told to, and only that name", () => {
        assert.equal(isAllowedHost("api:4000", ["api"]), true);
        assert.equal(isAllowedHost("API:4000", ["api"]), true);
        assert.equal(isAllowedHost("apis:4000", ["api"]), false);
    });

    it("refuses a request with no usable Host", () => {
        assert.equal(isAllowedHost(undefined), false);
        assert.equal(isAllowedHost(""), false);
        assert.equal(isAllowedHost("[::1"), false);
        assert.equal(isAllowedHost(":4000"), false);
    });
});
