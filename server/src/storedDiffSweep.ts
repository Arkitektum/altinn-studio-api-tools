/**
 * Posts every example form file and reports what the app's model did to it. Run it with localtest
 * up:
 *
 *   npm run diff --workspace server
 *   npm run diff --workspace server -- 1001 dibk/et-v4
 *   npm run diff --workspace server -- 1001 dibk/et-v4 --keep
 *
 * With no app arguments it walks the whole catalogue. The first argument is the LocalTest user id,
 * defaulting to 1001. `--keep` leaves the instances behind; without it each one is hard deleted
 * once it has been compared, since a sweep that leaves a hundred instances behind is worse than
 * no sweep.
 *
 * This is the panel in Compare with stored, run over everything at once: the panel confirms a
 * problem you already suspect, and this finds the ones you do not know about. The same sweep is
 * in the tool itself, behind the button beside that panel, and both run `sweepService.ts` rather
 * than a walk each. What is here is the printing.
 */
import { config } from "./config.js";
import { createTestUserToken } from "./localtestClient.js";
import { runSweep, summariseSweep, type SweepRow } from "./sweepService.js";

const PAD = (value: string, width: number): string => value.padEnd(width).slice(0, width);

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const keep = args.includes("--keep");
    const [userIdArg, ...appArgs] = args.filter((argument) => argument !== "--keep");
    const userId = userIdArg ?? "1001";

    const targets = appArgs.map((entry) => {
        const [org, app] = entry.split("/");
        return { org: org ?? "", app: app ?? "" };
    });

    console.log(`apps: ${config.appHost}`);
    console.log(`localtest: ${config.localtestUrl}`);

    const token = await createTestUserToken(userId);
    // Every post needs an owner, and the token's own party is the one it is certainly allowed.
    const party = token.partyId;
    if (!party) {
        throw new Error(`Test user ${userId} has no urn:altinn:partyid claim, so there is no party to post as.`);
    }
    console.log(`posting as party ${party}${keep ? ", keeping the instances" : ""}\n`);

    let total = 0;
    const { rows, skipped } = await runSweep(
        { token: token.token, party, targets, keep },
        {
            onPlanned: (planned) => {
                total = planned;
                console.log(`${planned} file(s) to compare\n`);
            },
            onRow: (row, at) => {
                const counted = `${PAD(String(rows.length + 1), String(total).length)}/${total}`;
                const said = row.outcome === "differs" ? `${row.differences} difference(s)` : row.outcome;
                console.log(`  ${counted}  ${at}… ${said}`);
            }
        }
    );

    report(rows, skipped);
}

function report(rows: SweepRow[], skipped: string[]): void {
    const counts = summariseSweep(rows);
    const differing = rows.filter((row) => row.outcome === "differs");
    const failed = rows.filter((row) => row.outcome === "post failed" || row.outcome === "no stored xml");

    console.log(`\n${rows.length} file(s) compared`);
    console.log(`  identical:     ${counts.identical}`);
    console.log(`  row ids only:  ${counts.rowIds}`);
    console.log(`  differs:       ${counts.differs}`);
    console.log(`  could not:     ${counts.failed}\n`);

    if (differing.length > 0) {
        console.log("WHAT THE MODEL CHANGED:");
        for (const row of differing) {
            console.log(`\n  ${PAD(row.app, 26)} ${PAD(row.dataType, 24)} ${row.label}`);
            console.log(`    ${row.differences} difference(s)${row.rowIds > 0 ? `, plus ${row.rowIds} altinnRowId` : ""}`);
            for (const line of row.detail) console.log(`      ${line}`);
            if (row.differences > row.detail.length) console.log(`      … and ${row.differences - row.detail.length} more`);
        }
        console.log("");
    }

    if (failed.length > 0) {
        console.log("COULD NOT COMPARE:");
        for (const row of failed) {
            console.log(`  ${PAD(row.app, 26)} ${PAD(row.dataType, 24)} ${row.label}`);
            for (const line of row.detail) console.log(`      ${line}`);
        }
        console.log("");
    }

    if (skipped.length > 0) {
        console.log("could not probe:");
        for (const line of skipped) console.log(`  ${line}`);
        console.log("  (these apps are probably not deployed in your localtest)");
    }
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
