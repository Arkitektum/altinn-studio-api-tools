import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shortUrl, targetUrls } from "./target";

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

describe("shortUrl", () => {
    const guid = "99d0632c-5917-448c-8ab6-a5d3b681376b";
    const data = "4f2a91c0-1111-4222-8333-944455556666";
    const localtest = "http://localhost:5101";

    it("drops the app host and cuts every guid to eight characters", () => {
        assert.equal(
            shortUrl(`${host}/dibk/et-v4/instances/510001/${guid}/data/${data}`, host, localtest),
            "/dibk/et-v4/instances/510001/99d0632c…/data/4f2a91c0…"
        );
    });

    it("names LocalTest rather than printing its host", () => {
        assert.equal(shortUrl(`${localtest}/storage/api/v1/instances`, host, localtest), "{localtest}/storage/api/v1/instances");
    });

    it("leaves another host, a placeholder and the query alone", () => {
        assert.equal(shortUrl("https://validering.example/api/report?spraak=nb", host, localtest), "https://validering.example/api/report?spraak=nb");
        assert.equal(
            shortUrl(`${host}/dibk/et-v4/instances/510001/{instanceGuid}?lang=nb`, host, localtest),
            "/dibk/et-v4/instances/510001/{instanceGuid}?lang=nb"
        );
    });
});
