import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
    loadingOverwrites,
    neededExamples,
    payloadNamed,
    refKey,
    removePayload,
    restoreElements,
    toSavedPayload,
    upsertPayload
} from "./savedPayloads";
import type { DataElementInput, ExampleContent, SavedPayload } from "../types";

const exampleRef = { kind: "form" as const, group: "ET", name: "01_Maksimumsversjon.xml" };
const attachmentRef = { kind: "attachment" as const, group: "application/pdf", name: "dummy.pdf" };

const fromExample: DataElementInput = {
    dataType: "ET",
    content: "<ettrinn>as shipped</ettrinn>",
    encoding: "utf8",
    contentType: "application/xml",
    exampleName: "01_Maksimumsversjon.xml",
    example: exampleRef
};

const edited: DataElementInput = {
    dataType: "GjennomfoeringsplanDataV7",
    content: "<gjennomfoeringsplan>typed by hand</gjennomfoeringsplan>",
    contentType: "application/xml"
};

function saved(elements: DataElementInput[]): SavedPayload {
    return toSavedPayload({ id: "p1", name: " Full ET run ", savedAt: "2026-09-10T12:00:00Z", org: "dibk", app: "et-v4", elements });
}

function file(overrides: Partial<ExampleContent> = {}): ExampleContent {
    return {
        name: "01_Maksimumsversjon.xml",
        content: "<ettrinn>as shipped, corrected since</ettrinn>",
        encoding: "utf8",
        contentType: "application/xml",
        sizeBytes: 44,
        ...overrides
    };
}

describe("toSavedPayload", () => {
    it("keeps a reference for an unedited example, and the text for anything else", () => {
        const payload = saved([fromExample, edited]);
        assert.deepEqual(payload.elements[0], {
            dataType: "ET",
            contentType: "application/xml",
            encoding: "utf8",
            example: exampleRef
        });
        assert.equal(payload.elements[0]?.content, undefined);
        assert.equal(payload.elements[1]?.content, edited.content);
        assert.equal(payload.elements[1]?.example, undefined);
    });

    it("trims the name and keeps the app it was written for", () => {
        const payload = saved([fromExample]);
        assert.equal(payload.name, "Full ET run");
        assert.equal(payload.org, "dibk");
        assert.equal(payload.app, "et-v4");
    });

    it("saves no ui state, since a fold is not part of a payload", () => {
        const payload = saved([{ ...fromExample, collapsed: true, exampleName: "01_Maksimumsversjon.xml" }]);
        assert.deepEqual(Object.keys(payload.elements[0] ?? {}).sort(), ["contentType", "dataType", "encoding", "example"]);
    });
});

describe("neededExamples", () => {
    it("asks for each referenced file once", () => {
        const payload = saved([fromExample, { ...fromExample, dataType: "ET2" }, edited]);
        assert.deepEqual(neededExamples(payload), [exampleRef]);
    });

    it("asks for nothing when everything was edited", () => {
        assert.deepEqual(neededExamples(saved([edited])), []);
    });
});

describe("restoreElements", () => {
    it("takes the file as it is now, which is the point of the reference", () => {
        const payload = saved([fromExample]);
        const fresh = file({ content: "<ettrinn>corrected</ettrinn>", contentType: "text/xml" });
        const { elements, missing } = restoreElements(payload, new Map([[refKey(exampleRef), fresh]]));

        assert.deepEqual(missing, []);
        assert.equal(elements[0]?.content, "<ettrinn>corrected</ettrinn>");
        // Including what the file says it is: an example retyped since is that type now.
        assert.equal(elements[0]?.contentType, "text/xml");
        assert.deepEqual(elements[0]?.example, exampleRef);
        assert.equal(elements[0]?.exampleName, "01_Maksimumsversjon.xml");
    });

    it("gives an attachment its filename, and a form none", () => {
        const payload = saved([{ ...fromExample, example: attachmentRef, dataType: "vedlegg" }, fromExample]);
        const examples = new Map([
            [refKey(attachmentRef), file({ name: "dummy.pdf", contentType: "application/pdf", encoding: "base64" })],
            [refKey(exampleRef), file()]
        ]);
        const { elements } = restoreElements(payload, examples);

        assert.equal(elements[0]?.filename, "dummy.pdf");
        assert.equal(elements[0]?.encoding, "base64");
        assert.equal(elements[1]?.filename, undefined);
    });

    it("keeps the text of an edited element exactly", () => {
        const { elements } = restoreElements(saved([edited]), new Map());
        assert.equal(elements[0]?.content, edited.content);
        assert.equal(elements[0]?.contentType, "application/xml");
    });

    it("marks what it restored, so the example picker leaves the gaps alone", () => {
        const { elements } = restoreElements(saved([fromExample, edited]), new Map());
        assert.deepEqual(
            elements.map((element) => element.restored),
            [true, true]
        );
    });

    it("leaves an element behind when its example has gone, rather than dropping it", () => {
        // A payload one element short would post silently, which is worse than an empty card.
        const { elements, missing } = restoreElements(saved([fromExample, edited]), new Map());
        assert.equal(elements.length, 2);
        assert.equal(elements[0]?.dataType, "ET");
        assert.equal(elements[0]?.content, "");
        assert.equal(elements[0]?.example, undefined);
        assert.deepEqual(missing, ["01_Maksimumsversjon.xml (ET)"]);
    });
});

describe("upsertPayload", () => {
    const one = saved([edited]);

    it("puts the newest first", () => {
        const two = { ...one, id: "p2", name: "Another" };
        assert.deepEqual(
            upsertPayload([one], two).map((payload) => payload.name),
            ["Another", "Full ET run"]
        );
    });

    it("replaces the one with the same name rather than keeping both", () => {
        const again = { ...one, id: "p2", savedAt: "2026-09-11T12:00:00Z" };
        const list = upsertPayload([one], again);
        assert.equal(list.length, 1);
        assert.equal(list[0]?.savedAt, "2026-09-11T12:00:00Z");
    });
});

describe("removePayload", () => {
    it("takes out the one asked for and leaves the rest", () => {
        const one = saved([edited]);
        const two = { ...one, id: "p2", name: "Another" };
        assert.deepEqual(
            removePayload([one, two], "p1").map((payload) => payload.id),
            ["p2"]
        );
    });
});

describe("payloadNamed", () => {
    const one = saved([edited]);

    it("finds what a name would replace, ignoring the spaces around it", () => {
        assert.equal(payloadNamed([one], "  Full ET run ")?.id, "p1");
        assert.equal(payloadNamed([one], "Something else"), null);
    });

    it("replaces nothing for an empty name", () => {
        assert.equal(payloadNamed([one], "   "), null);
    });
});

describe("loadingOverwrites", () => {
    it("is true only when there is work to lose", () => {
        assert.equal(loadingOverwrites([{ dataType: "", content: "" }]), false);
        assert.equal(loadingOverwrites([{ dataType: "ET", content: "   " }]), false);
        assert.equal(loadingOverwrites([{ dataType: "ET", content: "<ET/>" }]), true);
    });
});
