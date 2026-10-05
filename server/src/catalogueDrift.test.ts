import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appCatalogue, type CatalogueApp } from "./appCatalogue.js";
import { compareCatalogue, subformKey, type SubformFiles } from "./catalogueDrift.js";
import type { TestmotorApp } from "./testmotorClient.js";

const app = (name: string, dataType: string, subForms: CatalogueApp["subForms"] = []): CatalogueApp => ({
    org: "dibk",
    app: name,
    dataType,
    subForms
});

const sub = (name: string, dataType: string) => ({ org: "dibk", app: name, dataType });
const held = (appId: string, mainFormId: string): TestmotorApp => ({ appId, mainFormId });

/** What the testmotor holds per parent and subform, as `[parent, dataType, count]`. */
const files = (counts: [string, string, number][], errors: [string, string, string][] = []): SubformFiles => ({
    counts: new Map(counts.map(([parent, dataType, count]) => [subformKey(parent, dataType), count])),
    errors: new Map(errors.map(([parent, dataType, error]) => [subformKey(parent, dataType), error]))
});

describe("compareCatalogue", () => {
    it("finds no drift when the two lists agree", () => {
        const drift = compareCatalogue([app("an-v2", "AN"), app("fa-v5", "FA")], [held("an-v2", "AN"), held("fa-v5", "FA")], []);

        assert.deepEqual(drift.unlisted, []);
        assert.deepEqual(drift.disagreements, []);
        assert.ok(drift.coverage.every((entry) => entry.source === "testmotor"));
    });

    /* The catalogue is generated, so this is the drift that actually happens. */
    it("names an app the testmotor holds and the catalogue does not", () => {
        const drift = compareCatalogue(
            [app("varselplanoppstart-v3", "Planvarsel")],
            [held("varselplanoppstart-v3", "Planvarsel"), held("varselplanoppstart-v4", "Planvarsel")],
            []
        );

        assert.deepEqual(drift.unlisted, [{ appId: "varselplanoppstart-v4", dataType: "Planvarsel" }]);
    });

    /*
     * The worst of the three findings. The catalogue's data type is what the payload panel offers
     * before an app is probed, and the testmotor's is the key its examples arrive under, so parting
     * company means the examples land where nothing looks for them.
     */
    it("reports the two disagreeing about a main form data type", () => {
        const drift = compareCatalogue([app("fa-v5", "FA"), app("an-v2", "AN")], [held("fa-v5", "Ferdigattest"), held("an-v2", "AN")], []);

        assert.deepEqual(drift.disagreements, [{ org: "dibk", app: "fa-v5", catalogue: "FA", testmotor: "Ferdigattest" }]);
        // A disagreement is not also a gap: both lists have the app.
        assert.deepEqual(drift.unlisted, []);
    });

    it("says where each app's examples come from", () => {
        const catalogue = [app("an-v2", "AN"), app("hoeringettersynuttalelse-v2", "Uttalelse"), app("ts-v1", "TS")];
        const drift = compareCatalogue(catalogue, [held("an-v2", "AN")], ["Uttalelse"]);

        assert.deepEqual(
            drift.coverage.map((entry) => [entry.app, entry.source]),
            [
                ["an-v2", "testmotor"],
                ["hoeringettersynuttalelse-v2", "disk"],
                ["ts-v1", "none"]
            ]
        );
    });

    /*
     * A subform is a reference rather than an entry, because its data is posted as part of the
     * parent instance and you never target the app. It still needs example data, which the
     * testmotor holds per parent.
     */
    it("covers the subforms a parent references, not only the entries", () => {
        const catalogue = [app("et-v4", "ET", [sub("gjennomfoeringsplan-v7", "GjennomfoeringsplanDataV7"), sub("ts-v1", "TS")])];
        const drift = compareCatalogue(
            catalogue,
            [held("et-v4", "ET")],
            [],
            files([
                ["et-v4", "GjennomfoeringsplanDataV7", 1],
                ["et-v4", "TS", 0]
            ])
        );

        assert.deepEqual(
            drift.coverage.map((entry) => [entry.app, entry.kind, entry.parent, entry.source]),
            [
                ["et-v4", "entry", undefined, "testmotor"],
                ["gjennomfoeringsplan-v7", "subform", "et-v4", "testmotor"],
                ["ts-v1", "subform", "et-v4", "none"]
            ]
        );
    });

    /* The testmotor files a subform's examples per parent, so one parent can have them and another not. */
    it("covers a subform once under each parent carrying it", () => {
        const carried = sub("gjennomfoeringsplan-v7", "GjennomfoeringsplanDataV7");
        const drift = compareCatalogue(
            [app("rs-v4", "RS", [carried]), app("et-v4", "ET", [carried])],
            [held("et-v4", "ET"), held("rs-v4", "RS")],
            [],
            files([
                ["et-v4", "GjennomfoeringsplanDataV7", 2],
                ["rs-v4", "GjennomfoeringsplanDataV7", 0]
            ])
        );

        assert.deepEqual(
            drift.coverage.filter((entry) => entry.kind === "subform").map((entry) => [entry.parent, entry.source]),
            [
                ["et-v4", "testmotor"],
                ["rs-v4", "none"]
            ]
        );
    });

    /* examples.ts asks nothing for a parent the testmotor does not hold, so neither may this. */
    it("does not credit a subform under a parent the testmotor does not hold", () => {
        const drift = compareCatalogue(
            [app("et-v4", "ET", [sub("gjennomfoeringsplan-v7", "GjennomfoeringsplanDataV7")])],
            [],
            [],
            files([["et-v4", "GjennomfoeringsplanDataV7", 1]])
        );

        assert.equal(drift.coverage.find((entry) => entry.kind === "subform")?.source, "none");
    });

    /* The subform folder is gone, so a data type that happens to be on disk is not a subform's examples. */
    it("never credits a subform to disk", () => {
        const drift = compareCatalogue(
            [app("et-v4", "ET", [sub("gjennomfoeringsplan-v7", "GjennomfoeringsplanDataV7")])],
            [held("et-v4", "ET")],
            ["GjennomfoeringsplanDataV7"],
            files([["et-v4", "GjennomfoeringsplanDataV7", 0]])
        );

        assert.equal(drift.coverage.find((entry) => entry.kind === "subform")?.source, "none");
    });

    it("says so when a subform could not be checked, rather than calling it missing", () => {
        const drift = compareCatalogue(
            [app("et-v4", "ET", [sub("gjennomfoeringsplan-v7", "GjennomfoeringsplanDataV7")])],
            [held("et-v4", "ET")],
            [],
            files([], [["et-v4", "GjennomfoeringsplanDataV7", "answered 500"]])
        );

        const subform = drift.coverage.find((entry) => entry.kind === "subform");
        assert.equal(subform?.source, "error");
        assert.equal(subform?.error, "answered 500");
    });

    it("sorts by app id, so two runs read the same", () => {
        const drift = compareCatalogue([app("zz", "Z"), app("aa", "A")], [held("yy", "Y"), held("bb", "B")], []);

        assert.deepEqual(
            drift.coverage.map((entry) => entry.app),
            ["aa", "zz"]
        );
        assert.deepEqual(
            drift.unlisted.map((entry) => entry.appId),
            ["bb", "yy"]
        );
    });

    it("copes with a testmotor that answered nothing", () => {
        const drift = compareCatalogue([app("an-v2", "AN")], [], []);

        assert.deepEqual(drift.unlisted, []);
        assert.deepEqual(
            drift.coverage.map((entry) => entry.source),
            ["none"]
        );
    });
});

/*
 * Against the catalogue as it actually is, so the shape of the real thing is covered rather than
 * only the fixtures. What the testmotor answers is not asserted here: that needs the network, and
 * the script is where it is asked.
 */
describe("the catalogue as shipped", () => {
    /*
     * An entry is for something you can target. Subform data is posted as a data element of the
     * parent instance rather than to the subform app, so the two sets do not overlap: every app
     * referenced as a subform has no entry of its own, and that is the catalogue being right
     * rather than short.
     */
    it("keeps entries and subform references apart", () => {
        const entries = new Set(appCatalogue.map((entry) => entry.app));
        const referenced = new Set(appCatalogue.flatMap((entry) => entry.subForms.map((subform) => subform.app)));

        assert.ok(referenced.size > 0, "expected the catalogue to reference some subforms");
        for (const subform of referenced) {
            assert.ok(!entries.has(subform), `${subform} is both an entry and a subform reference`);
        }
    });

    it("agrees with itself about a subform's data type wherever it is referenced twice", () => {
        const seen = new Map<string, string>();
        for (const entry of appCatalogue) {
            for (const subform of entry.subForms) {
                const before = seen.get(subform.app);
                if (before) assert.equal(subform.dataType, before, `${subform.app} is referenced under two data types`);
                else seen.set(subform.app, subform.dataType);
            }
        }
    });

    it("names each app once", () => {
        const apps = appCatalogue.map((entry) => `${entry.org}/${entry.app}`);
        assert.equal(new Set(apps).size, apps.length);
    });
});
