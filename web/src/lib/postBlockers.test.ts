import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { postBlockers } from "./postBlockers";
import type { DataElementInput } from "../types";

const filled: DataElementInput[] = [{ dataType: "ET", content: "<ettrinn />" }];
const ready = { hasToken: true, org: "dibk", app: "et-v4", party: "510001", elements: filled };

describe("postBlockers", () => {
    it("has nothing to say when the post could go", () => {
        assert.deepEqual(postBlockers(ready), []);
    });

    /*
     * All of them at once, unlike the panels' waiting reasons. This reads as one sentence under the
     * button, and pressing twice to find out about the second thing missing is worse than a list.
     */
    it("names everything missing, not just the first", () => {
        assert.deepEqual(postBlockers({ hasToken: false, org: "", app: "", party: "", elements: [{ dataType: "", content: "" }] }), [
            "a valid token",
            "an application",
            "an instance owner party id",
            "a data type on every element",
            "content on every element"
        ]);
    });

    it("wants both halves of the target", () => {
        assert.deepEqual(postBlockers({ ...ready, app: "" }), ["an application"]);
        assert.deepEqual(postBlockers({ ...ready, org: "" }), ["an application"]);
    });

    it("counts whitespace as no content, since Altinn would store it as an empty element", () => {
        assert.deepEqual(postBlockers({ ...ready, elements: [{ dataType: "ET", content: "   \n" }] }), ["content on every element"]);
    });

    it("complains once however many elements are unfinished", () => {
        const two: DataElementInput[] = [
            { dataType: "", content: "" },
            { dataType: "", content: "" }
        ];
        assert.deepEqual(postBlockers({ ...ready, elements: two }), ["a data type on every element", "content on every element"]);
    });
});
