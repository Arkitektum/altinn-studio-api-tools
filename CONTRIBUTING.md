# Contributing

## Getting set up

You need Node 22.12 or later. The test scripts hand `src/**/*.test.ts` to `node --test` and let node expand it, which node has only done since 22, and Vite 8 wants 22.12 as well.

```bash
npm install
npm run dev
```

That runs both workspaces with prefixed output: the api on `http://127.0.0.1:4000/api` and the UI on `http://127.0.0.1:5173`, where Vite proxies `/api` to the server.

For anything beyond the UI rendering you also need Altinn Studio localtest running, with apps served on `local.altinn.cloud:8000` and LocalTest itself on `localhost:5101`. Those are the defaults; copy `server/.env.example` to `server/.env` to point elsewhere.

## The loop

| Command                           |                                                          |
| --------------------------------- | -------------------------------------------------------- |
| `npm run dev`                     | Both servers with prefixed output                        |
| `npm test`                        | Server and web tests, stubbed Altinn, no network         |
| `npm run typecheck`               | Both workspaces                                          |
| `npm run format`                  | Apply Prettier                                           |
| `npm run format:check`            | Fail if anything is unformatted                          |
| `npm run build`                   | Compile the server and bundle the UI                     |
| `npm run gaps --workspace server` | Which content types your apps declare that have no dummy |

CI runs `format:check`, `typecheck`, `test` and `build` on every push to main and every pull request. Run at least `npm test` and `npm run format` before pushing and you will not be surprised.

## Tests

Node's own test runner through `tsx`, no framework. Tests sit next to what they cover: `readService.test.ts` beside `readService.ts`.

Nothing touches the network. Server tests replace `globalThis.fetch` with a stub that asserts the bearer header and answers with whatever the case needs, then restore it in `afterEach`. Web tests cover the `lib/` modules, which are pure by design.

To run one file:

```bash
npx tsx --test server/src/readService.test.ts
```

What is worth a test:

- Anything in `web/src/lib/`. That is what the directory is for, and everything in it is already covered.
- Every branch of a service that talks to Altinn: the happy path, the refusal, and the malformed response. The stub makes all three cheap, and the refusal paths are where the behaviour is subtle, since a failure has to come back as a result with a step log rather than as an exception.
- Anything you had to reason about twice. If a comment explains why the code is not the obvious thing, a test should hold it there.

Assert on the request too, not only the answer. Several tests exist because a URL or an `Accept` header was wrong in a way the response did not reveal, `readDataElement` asking for `*/*` being the clearest case.

## Formatting

Prettier owns it, configured in `.prettierrc`: four space indent, double quotes, semicolons, no trailing commas, 150 column print width.

`.prettierignore` keeps Prettier away from `examples/`. Those files are fixtures posted byte for byte, and reformatting the JSON and GeoJSON dummies would change the very bytes the tests assert on.

`server/src/appCatalogue.ts` is generated from the `altinnStudioApps` registry. If you regenerate it, run `npm run format` afterwards, or CI will tell you.

## House style

**Comments say why, not what.** The code says what. A comment earns its place by explaining a decision that is not obvious from reading it: why the token is redacted before it reaches a log, why a party typed by hand survives a token switch, why multipart is written out by hand. If nothing surprising happened, no comment.

**Prose is plain.** No em-dashes, no emojis, no exclamation marks, no marketing. That applies to the README, to comments, and to UI text alike. Say what a thing does and why, in the order someone would need it.

**UI text is honest about uncertainty.** "LocalTest offered no list, so these are the two we work with" is better than a silent fallback. If the tool is guessing, the panel says so.

## Where things go

Read [ARCHITECTURE.md](ARCHITECTURE.md) first. The two conventions that decide most questions:

- A pure decision goes in `web/src/lib/` with a test, not inline in a component. `App.tsx` is state and wiring.
- A call to Altinn goes through `altinnFetch`, always. Anything acting on an instance is also recorded by `StepRecorder` so it shows up in the run log, since a write the operator cannot see defeats the point of the tool. The two exceptions are `appService` and `localtestClient`, which answer a question rather than change anything, and report their findings instead of a step log.

## Adding things

**An example form or subform.** Drop the file in `examples/forms/{dataType}/` or `examples/subforms/{dataType}/`. The directory name is the data type and the numeric prefix orders the list while being stripped from the label, so `01_Maksimumsversjon.xml` reads as "Maksimumsversjon". No restart: the directory is read per request.

**A dummy attachment.** Drop it in `examples/attachments/` and list its extension in `FORMATS` in `server/src/examples.ts`, with the content types it can be posted as. The first is canonical and the rest are alternative spellings, which matters because apps declare whichever they prefer. `npm run gaps --workspace server` tells you which content types your apps declare that no dummy covers.

**A known app.** `server/src/appCatalogue.ts` is generated, so regenerate it rather than editing by hand. The catalogue is only a convenience: once an app is probed, its own `applicationmetadata` takes over.

**An endpoint.** Add a zod schema next to the others in `routes.ts`, do the work in `runService` or `readService` through `StepRecorder`, return the `{ ok, steps, failedAt, … }` shape, and add the matching function to `web/src/api.ts` and its type to `web/src/types.ts`. Then decide what the run log entry looks like, in `web/src/lib/logResults.ts`.

**A panel.** One file in `web/src/components/`, and a flag in `lib/sections.ts` if it should stay hidden until it has something to show.

## Reporting something broken

There is an issue form for it, and one for a feature, under `.github/ISSUE_TEMPLATE/`. Blank issues are still on: the forms are for the common cases, not a gate.

The one thing worth attaching either way is the run log entry. **Copy curl** on the failing step gives the exact request with the token left as `$TOKEN`, which is usually enough to see what happened without a screenshot.

## Opening a pull request

`.github/pull_request_template.md` asks for what changed, why, and a handful of checks. Three of them are what CI runs anyway; the rest are the ones a green build cannot tell you about, such as whether a pure decision ended up in `web/src/lib/` with a test and whether the behaviour that changed is documented.
