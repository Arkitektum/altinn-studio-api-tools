import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appBaseUrl, appUiUrl, instanceUiUrl, storageDataUrl } from "./urls.js";

const HOST = "http://local.altinn.cloud:8000";

describe("urls", () => {
    it("leaves the api base without a trailing slash, so paths append cleanly", () => {
        assert.equal(appBaseUrl("dibk", "et-v4"), `${HOST}/dibk/et-v4`);
        assert.equal(`${appBaseUrl("dibk", "et-v4")}/instances`, `${HOST}/dibk/et-v4/instances`);
    });

    it("gives the app frontend link a trailing slash", () => {
        // Without it the app is not served, which is the whole reason this is separate from the
        // api base.
        assert.equal(appUiUrl("dibk", "et-v4"), `${HOST}/dibk/et-v4/`);
        assert.notEqual(appUiUrl("dibk", "et-v4"), appBaseUrl("dibk", "et-v4"));
    });

    it("deep links an instance through the app frontend's hash router", () => {
        assert.equal(
            instanceUiUrl("dibk", "et-v4", "510001", "99d0632c-5917-448c-8ab6-a5d3b681376b"),
            `${HOST}/dibk/et-v4/#/instance/510001/99d0632c-5917-448c-8ab6-a5d3b681376b`
        );
    });

    it("points storage at LocalTest, not at the app", () => {
        // The app would answer with the model as JSON. Storage has the bytes it stored.
        assert.equal(
            storageDataUrl("510001", "99d0632c-5917-448c-8ab6-a5d3b681376b", "fdeb5550-f4e8-4f23-87d0-111234ac4771"),
            "http://localhost:5101/storage/api/v1/instances/510001/99d0632c-5917-448c-8ab6-a5d3b681376b/data/fdeb5550-f4e8-4f23-87d0-111234ac4771"
        );
    });
});
