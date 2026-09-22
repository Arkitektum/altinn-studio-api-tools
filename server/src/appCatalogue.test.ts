import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appCatalogue, findCatalogueApp } from "./appCatalogue.js";

/**
 * The catalogue is hand-maintained data, and the mistakes it invites are the ones a reviewer's eye slides over:
 * a pasted entry that kept the org it was copied from, a subform listed twice, a field left empty. None of them
 * announce themselves — a shadowed entry simply never gets picked, and an empty data type only surfaces when a
 * request built from it comes back puzzling.
 *
 * Note that a data type is *not* unique across the catalogue: several apps are filed under the same one, which is
 * exactly why the lookup takes an org and an app rather than a data type.
 */

const appKey = (entry: { org: string; app: string }) => `${entry.org}/${entry.app}`;

describe("the app catalogue", () => {
    it("names an org, an app and a data type for every entry", () => {
        const incomplete = appCatalogue.filter((entry) => !entry.org?.trim() || !entry.app?.trim() || !entry.dataType?.trim());

        assert.deepEqual(incomplete, []);
    });

    it("lets no two entries claim the same org and app", () => {
        // findCatalogueApp answers the first match, so a second entry for the same app would never be reached and
        // whichever data type it carries would silently never be used.
        const keys = appCatalogue.map(appKey);
        const duplicates = keys.filter((key, index) => keys.indexOf(key) !== index);

        assert.deepEqual(duplicates, []);
    });

    it("stays sorted by org and then app, so an added entry lands where it is looked for", () => {
        const keys = appCatalogue.map(appKey);

        assert.deepEqual(keys, [...keys].sort());
    });

    it("names an org, an app and a data type for every subform too", () => {
        const incomplete = appCatalogue.flatMap((entry) =>
            entry.subForms.filter((subForm) => !subForm.org?.trim() || !subForm.app?.trim() || !subForm.dataType?.trim()).map(() => appKey(entry))
        );

        assert.deepEqual(incomplete, []);
    });

    it("lists no subform data type twice under the same app", () => {
        const repeated = appCatalogue
            .filter((entry) => new Set(entry.subForms.map((subForm) => subForm.dataType)).size !== entry.subForms.length)
            .map(appKey);

        assert.deepEqual(repeated, []);
    });

    it("has no app listing itself as one of its own subforms", () => {
        const selfReferencing = appCatalogue.filter((entry) => entry.subForms.some((subForm) => appKey(subForm) === appKey(entry))).map(appKey);

        assert.deepEqual(selfReferencing, []);
    });
});

describe("findCatalogueApp", () => {
    it("finds an app by its org and name", () => {
        const found = findCatalogueApp("dibk", "an-v2");

        assert.equal(found?.dataType, "AN");
    });

    it("does not find an app that is not in the catalogue", () => {
        assert.equal(findCatalogueApp("dibk", "not-an-app"), undefined);
    });

    it("will not match an app name under the wrong org", () => {
        // Both halves of the key are checked: an app name alone does not identify an app.
        assert.equal(findCatalogueApp("dibk", "an-v2")?.app, "an-v2");
        assert.equal(findCatalogueApp("dat", "an-v2"), undefined);
    });
});
