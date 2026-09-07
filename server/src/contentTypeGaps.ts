/**
 * Reports which content types the locally running apps declare, and which of them have no dummy
 * attachment on disk. Run it with localtest up:
 *
 *   npm run gaps --workspace server
 *   npm run gaps --workspace server -- 1001 dibk/et-v4 dibk/nabovarsel-v5
 *
 * With no app arguments it walks the whole catalogue. The first argument is the LocalTest user
 * id, defaulting to 1001.
 */
import { appCatalogue } from './appCatalogue.js';
import { fetchApplicationMetadata } from './appService.js';
import { config } from './config.js';
import { listExamples } from './examples.js';
import { createTestUserToken } from './localtestClient.js';

interface Usage {
  apps: Set<string>;
  dataTypes: Set<string>;
}

async function main(): Promise<void> {
  const [userIdArg, ...appArgs] = process.argv.slice(2);
  const userId = userIdArg ?? '1001';

  const targets = appArgs.length
    ? appArgs.map((entry) => {
        const [org, app] = entry.split('/');
        return { org: org ?? '', app: app ?? '' };
      })
    : appCatalogue.map((entry) => ({ org: entry.org, app: entry.app }));

  console.log(`apps: ${config.appHost}`);
  console.log(`localtest: ${config.localtestUrl}`);
  console.log(`probing ${targets.length} app(s) as test user ${userId}\n`);

  const token = await createTestUserToken(userId);

  const usage = new Map<string, Usage>();
  const unreachable: string[] = [];

  for (const target of targets) {
    const label = `${target.org}/${target.app}`;
    try {
      const metadata = await fetchApplicationMetadata(token.token, target.org, target.app);
      for (const dataType of metadata.dataTypes ?? []) {
        for (const contentType of dataType.allowedContentTypes ?? []) {
          const entry = usage.get(contentType) ?? { apps: new Set(), dataTypes: new Set() };
          entry.apps.add(label);
          entry.dataTypes.add(dataType.id);
          usage.set(contentType, entry);
        }
      }
    } catch (error) {
      unreachable.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const covered = new Set(
    (await listExamples()).filter((group) => group.kind === 'attachment').map((group) => group.key),
  );

  const declared = [...usage.keys()].sort();
  const missing = declared.filter((contentType) => !covered.has(contentType));
  const used = declared.filter((contentType) => covered.has(contentType));

  console.log(`declared by the probed apps: ${declared.length} content type(s)`);
  console.log(`  with a dummy:    ${used.length}`);
  console.log(`  without a dummy: ${missing.length}\n`);

  if (missing.length > 0) {
    console.log('MISSING, no dummy on disk:');
    for (const contentType of missing) {
      const entry = usage.get(contentType);
      console.log(`  ${contentType}`);
      console.log(`      data types: ${[...(entry?.dataTypes ?? [])].sort().join(', ')}`);
      console.log(`      apps:       ${[...(entry?.apps ?? [])].sort().join(', ')}`);
    }
    console.log('');
  }

  console.log('covered:');
  for (const contentType of used) {
    console.log(`  ${contentType}`);
  }

  // Dummies that no probed app asks for. Not a problem, just unused here.
  const unused = [...covered].filter((contentType) => !usage.has(contentType)).sort();
  if (unused.length > 0) {
    console.log('\ndummies no probed app declares:');
    for (const contentType of unused) console.log(`  ${contentType}`);
  }

  if (unreachable.length > 0) {
    console.log('\ncould not probe:');
    for (const line of unreachable) console.log(`  ${line}`);
    console.log('  (these apps are probably not deployed in your localtest)');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
