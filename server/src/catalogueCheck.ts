/**
 * Compares the app catalogue against the testmotor's list of the same apps, and says where they
 * have drifted. Needs no localtest, only the testmotor:
 *
 *   npm run catalogue --workspace server
 *
 * `appCatalogue.ts` is generated, so the answer to an app the testmotor has and it does not is
 * usually to regenerate it. See catalogueDrift.ts for what is compared and why.
 */
import { appCatalogue } from "./appCatalogue.js";
import { compareCatalogue, subformKey, type SubformFiles } from "./catalogueDrift.js";
import { config } from "./config.js";
import { listExamples } from "./examples.js";
import { fetchTestmotorApps, fetchTestmotorSubformXml, testmotorConfigured, type TestmotorApp } from "./testmotorClient.js";

/**
 * Asks the testmotor how many files it holds for each subform under each parent it holds.
 *
 * The client cannot list a subform's files without downloading them, so this downloads them, which
 * is a few dozen small files and only when the check is run.
 */
async function countSubformFiles(testmotor: TestmotorApp[]): Promise<SubformFiles> {
    const held = new Set(testmotor.map((entry) => entry.appId));
    const counts = new Map<string, number>();
    const errors = new Map<string, string>();
    const pairs = appCatalogue
        .filter((entry) => held.has(entry.app))
        .flatMap((entry) => entry.subForms.map((subform) => [entry.app, subform.dataType] as const));
    await Promise.all(
        pairs.map(async ([parent, dataType]) => {
            try {
                counts.set(subformKey(parent, dataType), (await fetchTestmotorSubformXml(parent, dataType)).length);
            } catch (error) {
                errors.set(subformKey(parent, dataType), error instanceof Error ? error.message : String(error));
            }
        })
    );
    return { counts, errors };
}

async function main(): Promise<void> {
    if (!testmotorConfigured()) {
        console.log("No testmotor is configured, so there is nothing to compare against. Set TESTMOTOR_URL in server/.env.");
        return;
    }

    console.log(`testmotor: ${config.testmotorUrl}`);
    console.log(`catalogue: ${appCatalogue.length} app(s)\n`);

    const testmotor = await fetchTestmotorApps();
    // No app, so this is the example data still kept as files and nothing from the testmotor.
    const [{ groups }, subformFiles] = await Promise.all([listExamples(), countSubformFiles(testmotor)]);
    const onDisk = groups.filter((group) => group.kind !== "attachment").map((group) => group.key);

    const { unlisted, disagreements, coverage } = compareCatalogue(appCatalogue, testmotor, onDisk, subformFiles);
    const from = (source: string) => coverage.filter((entry) => entry.source === source);
    const nowhere = from("none");
    const unchecked = from("error");
    const name = (entry: (typeof coverage)[number]) =>
        entry.parent
            ? `${entry.org}/${entry.app} under ${entry.parent}  (${entry.dataType}, ${entry.kind})`
            : `${entry.org}/${entry.app}  (${entry.dataType}, ${entry.kind})`;

    console.log(`testmotor holds example data for ${testmotor.length} app(s)`);
    console.log(`covered: ${from("testmotor").length} from the testmotor, ${from("disk").length} from disk, ${nowhere.length} from nowhere`);
    console.log("(a subform counts once for each app carrying it, since the testmotor files them per app)\n");

    if (disagreements.length > 0) {
        console.log("DISAGREE about the main form data type, so examples land where nothing looks for them:");
        for (const entry of disagreements) {
            console.log(`  ${entry.org}/${entry.app}`);
            console.log(`      catalogue says: ${entry.catalogue}`);
            console.log(`      testmotor says: ${entry.testmotor}`);
        }
        console.log("");
    }

    if (nowhere.length > 0) {
        console.log("NO EXAMPLE DATA AT ALL, neither from the testmotor nor on disk:");
        for (const entry of nowhere) console.log(`  ${name(entry)}`);
        console.log("  (an app here is one you cannot post to without writing the xml by hand)\n");
    }

    if (unchecked.length > 0) {
        console.log("COULD NOT CHECK these subforms, so whether they have examples is not known:");
        for (const entry of unchecked) console.log(`  ${name(entry)}: ${entry.error}`);
        console.log("");
    }

    if (unlisted.length > 0) {
        console.log("the testmotor holds these, the catalogue does not name them:");
        for (const entry of unlisted) console.log(`  ${entry.appId}  (${entry.dataType})`);
        console.log("  (examples still work if you type the app, since they are asked for by app id)");
        console.log("  (appCatalogue.ts is generated, so regenerate it rather than editing by hand)\n");
    }

    const disk = from("disk");
    if (disk.length > 0) {
        console.log("served from disk, which is what is expected of a form the testmotor has no data for:");
        for (const entry of disk) console.log(`  ${name(entry)}`);
        console.log("");
    }

    if (disagreements.length === 0 && unlisted.length === 0 && nowhere.length === 0 && unchecked.length === 0) {
        console.log("no drift: every app the catalogue knows has example data, and the two agree on every data type.");
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
