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
 * problem you already suspect, and this finds the ones you do not know about.
 */
import { appCatalogue } from "./appCatalogue.js";
import { fetchApplicationMetadata, type AppDataType } from "./appService.js";
import { compareStored } from "./compareService.js";
import { config } from "./config.js";
import { listExamples, readExample, type ExampleKind } from "./examples.js";
import { createTestUserToken } from "./localtestClient.js";
import { deleteInstance } from "./readService.js";
import { postDataToApp } from "./runService.js";
import { partitionRowIds } from "./xmlDiff.js";

interface Row {
    app: string;
    dataType: string;
    file: string;
    /** What happened, in one word, so the table can be scanned for the bad ones. */
    outcome: "identical" | "differs" | "row ids only" | "post failed" | "no stored xml";
    differences: number;
    rowIds: number;
    detail: string[];
}

const PAD = (value: string, width: number): string => value.padEnd(width).slice(0, width);

interface Target {
    org: string;
    app: string;
    dataType: string;
    /** form or subform, from the group the file was listed in. */
    kind: ExampleKind;
    file: string;
    party: string;
}

async function sweepOne(token: string, target: Target, keep: boolean): Promise<Row> {
    const { org, app, dataType, file, party } = target;
    const label = `${org}/${app}`;
    const row: Row = { app: label, dataType, file, outcome: "identical", differences: 0, rowIds: 0, detail: [] };

    const example = await readExample(target.kind, dataType, file);

    // One instance per file, so nothing carries over from the last one.
    const posted = await postDataToApp(token, {
        org,
        app,
        instanceOwnerPartyId: party,
        mode: "multipart",
        dataElements: [{ dataType, content: example.content, contentType: example.contentType }]
    });

    if (!posted.ok || !posted.instanceGuid || !posted.instanceOwnerPartyId) {
        return { ...row, outcome: "post failed", detail: [posted.failedAt ?? "no reason given"] };
    }

    const stored = (posted.instance as { data?: { id?: string; dataType?: string }[] } | null)?.data?.find(
        (element) => element.dataType === dataType
    );

    try {
        if (!stored?.id) return { ...row, outcome: "no stored xml", detail: ["the instance came back without that data element"] };

        const comparison = await compareStored(token, {
            org,
            app,
            dataType,
            instanceOwnerPartyId: posted.instanceOwnerPartyId,
            instanceGuid: posted.instanceGuid,
            dataGuid: stored.id,
            left: example.content
        });

        if (!comparison.ok || !comparison.diff) {
            return { ...row, outcome: "no stored xml", detail: [comparison.failedAt ?? "no reason given"] };
        }

        const { meaningful, rowIds } = partitionRowIds(comparison.diff.differences);
        return {
            ...row,
            outcome: meaningful.length > 0 ? "differs" : rowIds > 0 ? "row ids only" : "identical",
            differences: meaningful.length,
            rowIds,
            // The first few are enough to recognise the problem; the panel has the rest.
            detail: meaningful.slice(0, 5).map((difference) => {
                const type = difference.type ? ` (${difference.type})` : "";
                const values =
                    difference.kind === "changed" ? `: ${difference.left} → ${difference.right}` : difference.left ? `: ${difference.left}` : "";
                return `${difference.kind} ${difference.path}${type}${values}`;
            })
        };
    } finally {
        if (!keep) {
            // Hard, since a soft delete would leave the sweep's instances in storage forever.
            await deleteInstance(token, {
                org,
                app,
                instanceOwnerPartyId: posted.instanceOwnerPartyId,
                instanceGuid: posted.instanceGuid,
                hard: true
            }).catch(() => undefined);
        }
    }
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const keep = args.includes("--keep");
    const [userIdArg, ...appArgs] = args.filter((argument) => argument !== "--keep");
    const userId = userIdArg ?? "1001";

    const targets = appArgs.length
        ? appArgs.map((entry) => {
              const [org, app] = entry.split("/");
              return { org: org ?? "", app: app ?? "" };
          })
        : appCatalogue.map((entry) => ({ org: entry.org, app: entry.app }));

    console.log(`apps: ${config.appHost}`);
    console.log(`localtest: ${config.localtestUrl}`);
    console.log(`sweeping ${targets.length} app(s) as test user ${userId}${keep ? ", keeping the instances" : ""}\n`);

    const token = await createTestUserToken(userId);
    // Every post needs an owner, and the token's own party is the one it is certainly allowed.
    const party = token.partyId;
    if (!party) {
        throw new Error(`Test user ${userId} has no urn:altinn:partyid claim, so there is no party to post as.`);
    }
    console.log(`posting as party ${party}\n`);

    const groups = await listExamples();
    const rows: Row[] = [];
    const skipped: string[] = [];

    for (const target of targets) {
        const label = `${target.org}/${target.app}`;
        let dataTypes: AppDataType[];
        try {
            dataTypes = (await fetchApplicationMetadata(token.token, target.org, target.app)).dataTypes ?? [];
        } catch (error) {
            skipped.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
            continue;
        }

        // Only what the app has a model for, since only those go through a model to be mangled.
        for (const dataType of dataTypes.filter((entry) => entry.appLogic)) {
            const group = groups.find((entry) => entry.kind !== "attachment" && entry.key === dataType.id);
            const files = group?.files ?? [];
            if (!group || files.length === 0) continue;

            for (const file of files) {
                process.stdout.write(`  ${label} ${dataType.id} ${file.label}… `);
                try {
                    const row = await sweepOne(
                        token.token,
                        { org: target.org, app: target.app, dataType: dataType.id, kind: group.kind, file: file.name, party },
                        keep
                    );
                    rows.push(row);
                    console.log(row.outcome === "differs" ? `${row.differences} difference(s)` : row.outcome);
                } catch (error) {
                    rows.push({
                        app: label,
                        dataType: dataType.id,
                        file: file.label,
                        outcome: "post failed",
                        differences: 0,
                        rowIds: 0,
                        detail: [error instanceof Error ? error.message : String(error)]
                    });
                    console.log("post failed");
                }
            }
        }
    }

    const differing = rows.filter((row) => row.outcome === "differs");
    const failed = rows.filter((row) => row.outcome === "post failed" || row.outcome === "no stored xml");

    console.log(`\n${rows.length} file(s) compared`);
    console.log(`  identical:     ${rows.filter((row) => row.outcome === "identical").length}`);
    console.log(`  row ids only:  ${rows.filter((row) => row.outcome === "row ids only").length}`);
    console.log(`  differs:       ${differing.length}`);
    console.log(`  could not:     ${failed.length}\n`);

    if (differing.length > 0) {
        console.log("WHAT THE MODEL CHANGED:");
        for (const row of differing) {
            console.log(`\n  ${PAD(row.app, 26)} ${PAD(row.dataType, 24)} ${row.file}`);
            console.log(`    ${row.differences} difference(s)${row.rowIds > 0 ? `, plus ${row.rowIds} altinnRowId` : ""}`);
            for (const line of row.detail) console.log(`      ${line}`);
            if (row.differences > row.detail.length) console.log(`      … and ${row.differences - row.detail.length} more`);
        }
        console.log("");
    }

    if (failed.length > 0) {
        console.log("COULD NOT COMPARE:");
        for (const row of failed) {
            console.log(`  ${PAD(row.app, 26)} ${PAD(row.dataType, 24)} ${row.file}`);
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
