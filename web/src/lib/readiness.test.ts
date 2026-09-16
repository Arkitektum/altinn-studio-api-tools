import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readiness } from "./readiness";

const ready = {
    hasToken: true,
    org: "dibk",
    app: "et-v4",
    party: "510001",
    instance: "99d0632c",
    dataElement: "0f1e2d3c"
};

describe("readiness", () => {
    it("has nothing to say when everything is filled in", () => {
        assert.deepEqual(readiness(ready), { target: null, instances: null, requests: null, compare: null, process: null });
    });

    /*
     * The first missing thing, not the nearest one. A panel that needs a party when there is no
     * token yet would be asking for the second step before the first, and every panel below would
     * be asking for something different at the same time.
     */
    it("names the first thing missing, not the last", () => {
        const none = readiness({ ...ready, hasToken: false, org: "", app: "", party: "", instance: "", dataElement: "" });
        assert.equal(none.target, "Needs a test user.");
        assert.equal(none.instances, "Needs a test user.");
        assert.equal(none.compare, "Needs a test user.");
    });

    it("asks for an application once there is a token", () => {
        const noApp = readiness({ ...ready, org: "", app: "" });
        assert.equal(noApp.target, null, "the panel you pick it in is ready");
        assert.equal(noApp.requests, "Needs an application.");
        assert.equal(noApp.instances, "Needs an application.");
    });

    it("asks for a party for the listing, and lets the payload be written without one", () => {
        const noParty = readiness({ ...ready, party: "" });
        assert.equal(noParty.instances, "Needs an instance owner party id.");
        assert.equal(noParty.requests, null, "a payload can be written before there is anywhere to send it");
    });

    it("asks for an instance for everything that describes one", () => {
        const noInstance = readiness({ ...ready, instance: "" });
        assert.equal(noInstance.process, "Needs an instance.");
        assert.equal(noInstance.compare, "Needs an instance.");
        assert.equal(noInstance.instances, null, "the panel you choose one in is ready");
    });

    it("asks for a data element only for the comparison", () => {
        const noElement = readiness({ ...ready, dataElement: "" });
        assert.equal(noElement.compare, "Needs a data element.");
        assert.equal(noElement.process, null);
    });
});
