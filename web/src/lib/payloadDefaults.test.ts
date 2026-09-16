import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { withAppDefaults } from "./payloadDefaults";
import type { AppDataType, DataElementInput } from "../types";

const dataTypes: AppDataType[] = [
    { id: "ET", maxCount: 1, allowedContentTypes: ["application/xml"], appLogic: { classRef: "Et" } },
    { id: "vedlegg", maxCount: 0, allowedContentTypes: ["application/pdf"] }
];

const empty: DataElementInput[] = [{ dataType: "", content: "" }];

describe("withAppDefaults", () => {
    it("points the one empty element at the app's form data type", () => {
        const [element] = withAppDefaults(empty, dataTypes);
        assert.equal(element?.dataType, "ET");
        assert.equal(element?.contentType, "application/xml");
    });

    it("fills in the content type of a data type chosen before the app was read", () => {
        const [element] = withAppDefaults([{ dataType: "vedlegg", content: "AAAA" }], dataTypes);
        assert.equal(element?.contentType, "application/pdf");
    });

    it("leaves a content type that is already there, whatever put it there", () => {
        // A file off disk knows its own type, and it is a better answer than what the app declares.
        const picked: DataElementInput[] = [{ dataType: "vedlegg", content: "AAAA", contentType: "image/png" }];
        assert.equal(withAppDefaults(picked, dataTypes), picked);
    });

    it("does not choose a data type for a payload that already has one", () => {
        const chosen: DataElementInput[] = [{ dataType: "vedlegg", content: "", contentType: "application/pdf" }];
        assert.equal(withAppDefaults(chosen, dataTypes), chosen);
    });

    it("does not choose one when there is more than one element to choose for", () => {
        const two: DataElementInput[] = [
            { dataType: "", content: "", contentType: "application/xml" },
            { dataType: "", content: "", contentType: "application/xml" }
        ];
        assert.equal(withAppDefaults(two, dataTypes), two);
    });

    it("gives the same list back when there is nothing to add, so it settles", () => {
        const once = withAppDefaults(empty, dataTypes);
        assert.equal(withAppDefaults(once, dataTypes), once);
    });

    it("has nothing to add from an app that declares no data types", () => {
        assert.equal(withAppDefaults(empty, []), empty);
    });
});
