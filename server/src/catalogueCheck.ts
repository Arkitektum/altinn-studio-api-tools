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
import { compareCatalogue } from "./catalogueDrift.js";
import { config } from "./config.js";
import { listExamples } from "./examples.js";
import { fetchTestmotorApps, testmotorConfigured } from "./testmotorClient.js";

async function main(): Promise<void> {
    if (!testmotorConfigured()) {
        console.log("No testmotor is configured, so there is nothing to compare against. Set TESTMOTOR_URL in server/.env.");
        return;
    }

    console.log(`testmotor: ${config.testmotorUrl}`);
    console.log(`catalogue: ${appCatalogue.length} app(s)\n`);

    const testmotor = await fetchTestmotorApps();
    // No app, so this is the example data still kept as files and nothing from the testmotor.
    const { groups } = await listExamples();
    const onDisk = groups.filter((group) => group.kind !== "attachment").map((group) => group.key);

    const { unlisted, disagreements, coverage } = compareCatalogue(appCatalogue, testmotor, onDisk);
    const from = (source: string) => coverage.filter((entry) => entry.source === source);
    const nowhere = from("none");

    console.log(`testmotor holds example data for ${testmotor.length} app(s)`);
    console.log(`covered: ${from("testmotor").length} from the testmotor, ${from("disk").length} from disk, ${nowhere.length} from nowhere\n`);

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
        for (const entry of nowhere) console.log(`  ${entry.org}/${entry.app}  (${entry.dataType}, ${entry.kind})`);
        console.log("  (an app here is one you cannot post to without writing the xml by hand)\n");
    }

    if (unlisted.length > 0) {
        console.log("the testmotor holds these, the catalogue does not name them:");
        for (const entry of unlisted) console.log(`  ${entry.appId}  (${entry.dataType})`);
        console.log("  (examples still work if you type the app, since they are asked for by app id)");
        console.log("  (appCatalogue.ts is generated, so regenerate it rather than editing by hand)\n");
    }

    const disk = from("disk");
    if (disk.length > 0) {
        console.log("served from disk, which is what is expected of a subform and of a form the testmotor has no data for:");
        for (const entry of disk) console.log(`  ${entry.org}/${entry.app}  (${entry.dataType}, ${entry.kind})`);
        console.log("");
    }

    if (disagreements.length === 0 && unlisted.length === 0 && nowhere.length === 0) {
        console.log("no drift: every app the catalogue knows has example data, and the two agree on every data type.");
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
