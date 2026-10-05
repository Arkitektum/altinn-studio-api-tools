import type { CatalogueApp } from "./appCatalogue.js";
import type { TestmotorApp } from "./testmotorClient.js";

/**
 * Comparing the app catalogue against the testmotor, which is the other list of the same apps.
 *
 * `appCatalogue.ts` is generated from the registry our other Altinn tooling uses, and the testmotor
 * keeps its own list of the apps it holds example data for. Neither knows about the other, so they
 * drift, and the drift is invisible: an app the catalogue does not name still works if you type it,
 * because examples are asked for by app id rather than looked up here.
 *
 * So this is a check rather than a merge. What to do about drift is a judgement each time, and for
 * an app the catalogue lacks it is usually "regenerate the catalogue" rather than anything this
 * tool should decide. See `catalogueCheck.ts` for the script that runs it.
 */

/** An app the testmotor holds data for that the catalogue does not name. */
export interface UnlistedApp {
    appId: string;
    /** The data type it files the app's main form under. */
    dataType: string;
}

/** The two lists disagreeing about what an app's main form is called. */
export interface Disagreement {
    org: string;
    app: string;
    catalogue: string;
    testmotor: string;
}

/**
 * Where one app's example data comes from, or that there is none.
 *
 * `entry` and `subform` are a real split rather than a label. The catalogue gives an entry to what
 * you can target and a bare reference to what you cannot: subform data is posted as a data element
 * of the parent instance rather than to the subform app, so a subform app has no entry of its own
 * and never appears in the picker.
 *
 * A subform is covered once per parent that carries it, because the testmotor files subform
 * examples per app and the same subform can hold files under one parent and none under another.
 */
export interface AppCoverage {
    org: string;
    app: string;
    dataType: string;
    kind: "entry" | "subform";
    /** For a subform, the app carrying it, which is the one its examples are read through. */
    parent?: string;
    source: "testmotor" | "disk" | "none" | "error";
    /** Why a subform could not be checked, when its source is "error". */
    error?: string;
}

/**
 * What the testmotor holds for each subform under each parent it was asked about, keyed by `subformKey`.
 *
 * A pair it was not asked about is absent from both, which is every pair whose parent it does not hold.
 */
export interface SubformFiles {
    counts: Map<string, number>;
    errors: Map<string, string>;
}

/** How a subform under one parent is keyed in `SubformFiles`. */
export function subformKey(parent: string, dataType: string): string {
    return `${parent}|${dataType}`;
}

export interface CatalogueDrift {
    unlisted: UnlistedApp[];
    disagreements: Disagreement[];
    coverage: AppCoverage[];
}

/**
 * `onDisk` is the data type of every example group still kept as files, and `subformFiles` what the
 * testmotor holds for each subform under each parent.
 *
 * A disagreement is the worst of the three findings and the least likely. The catalogue's data type
 * is what the payload panel offers before an app has been probed, and the testmotor's is the key
 * its examples arrive under, so if they part company the examples land where nothing looks for
 * them. `source: "none"` is the one that bites day to day: an app you cannot post anything to
 * without writing the xml by hand.
 */
export function compareCatalogue(
    catalogue: CatalogueApp[],
    testmotor: TestmotorApp[],
    onDisk: Iterable<string>,
    subformFiles: SubformFiles = { counts: new Map(), errors: new Map() }
): CatalogueDrift {
    const known = new Set(catalogue.map((entry) => entry.app));
    const held = new Map(testmotor.map((entry) => [entry.appId, entry]));
    const files = new Set(onDisk);

    const unlisted = testmotor
        .filter((entry) => !known.has(entry.appId))
        .map((entry): UnlistedApp => ({ appId: entry.appId, dataType: entry.mainFormId }))
        .sort((a, b) => a.appId.localeCompare(b.appId));

    const disagreements = catalogue
        .flatMap((entry) => {
            const there = held.get(entry.app);
            if (!there || there.mainFormId === entry.dataType) return [];
            return [{ org: entry.org, app: entry.app, catalogue: entry.dataType, testmotor: there.mainFormId }];
        })
        .sort((a, b) => a.app.localeCompare(b.app));

    const sourceOf = (app: string, dataType: string): AppCoverage["source"] => (held.has(app) ? "testmotor" : files.has(dataType) ? "disk" : "none");

    const entries = catalogue.map((entry): AppCoverage => ({
        org: entry.org,
        app: entry.app,
        dataType: entry.dataType,
        kind: "entry",
        source: sourceOf(entry.app, entry.dataType)
    }));

    // One per parent, because that is how the testmotor files them and how examples.ts reads them. A parent the
    // testmotor does not hold has no subform examples, whatever it was or was not asked.
    const subforms = catalogue.flatMap((entry) =>
        entry.subForms.map((subform): AppCoverage => {
            const key = subformKey(entry.app, subform.dataType);
            const coverage: AppCoverage = {
                org: subform.org,
                app: subform.app,
                dataType: subform.dataType,
                kind: "subform",
                parent: entry.app,
                source: "none"
            };
            const error = subformFiles.errors.get(key);
            if (error !== undefined) return { ...coverage, source: "error", error };
            return held.has(entry.app) && (subformFiles.counts.get(key) ?? 0) > 0 ? { ...coverage, source: "testmotor" } : coverage;
        })
    );

    const coverage = [...entries, ...subforms].sort((a, b) => a.app.localeCompare(b.app) || (a.parent ?? "").localeCompare(b.parent ?? ""));

    return { unlisted, disagreements, coverage };
}
