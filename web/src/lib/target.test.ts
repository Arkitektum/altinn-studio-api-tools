import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { targetUrls } from "./target";

const host = "http://local.altinn.cloud:8000";

describe("targetUrls", () => {
    it("builds the app's root and the selected instance under it", () => {
        const urls = targetUrls(host, "dibk", "et-v4", "510001", "99d0632c");
        assert.equal(urls.base, `${host}/dibk/et-v4`);
        assert.equal(urls.instance, `${host}/dibk/et-v4/instances/510001/99d0632c`);
    });

    /*
     * A brace-wrapped name reads as the shape of the thing you are about to type. An empty string
     * would make `//instances` look like a url the tool means to call.
     */
    it("stands a placeholder in for every field not filled in yet", () => {
        const urls = targetUrls(host, "", "", "", "");
        assert.equal(urls.base, `${host}/{org}/{app}`);
        assert.equal(urls.instance, `${host}/{org}/{app}/instances/{partyId}/{instanceGuid}`);
    });

    it("fills in the ones that are there and leaves the rest as placeholders", () => {
        const urls = targetUrls(host, "dibk", "et-v4", "510001", "");
        assert.equal(urls.party, "510001");
        assert.equal(urls.guid, "{instanceGuid}");
        assert.equal(urls.instance, `${host}/dibk/et-v4/instances/510001/{instanceGuid}`);
    });
});
