# Architecture

A local web tool for posting test data into Altinn 3 apps running under Altinn Studio localtest, and for reading it back. Two npm workspaces, `server` and `web`, with a shared root that runs both.

## Why there is a server at all

The UI could talk to a local Altinn app directly from the browser. It does not, for four reasons, and each one shapes the rest of the design:

- **Token custody.** A test token is a bearer credential. Keeping it in server memory means the browser only ever holds an opaque id, so nothing leaks through devtools, a stray `console.log` or a `localStorage` dump. See [SECURITY.md](SECURITY.md).
- **Multipart.** `FormData` in the browser and in Node both insist on a `filename` for every part, and Altinn stores that as the data element's filename. A prefilled form data element would end up named "blob". `multipart.ts` writes the body by hand instead.
- **Example files.** They live on disk, optionally outside the repo, so something with filesystem access has to read them.
- **CORS.** Local Altinn apps do not send permissive CORS headers, and a proxy is less trouble than persuading them to.

## The shape of a request

```
browser                     server                        local Altinn
-------                     ------                        ------------
api.ts        ──/api/…──▶   routes.ts     zod parse
                            tokenStore    id ─▶ bearer
                            runService    ──▶  altinnClient  ──▶  POST /{org}/{app}/instances
                            readService                            POST …/data?dataType=ET
                                          ◀── stepRecorder ◀──     GET  …/instances/{party}/{guid}
              ◀─json───     one result with a step log
```

Everything the tool does to Altinn goes through `altinnClient.altinnFetch`, which attaches the bearer token, applies a timeout, never throws on a non-2xx, and reports back the request headers it sent with the token replaced by a `$TOKEN` placeholder. Not throwing is what lets a failing call be a recorded step rather than an exception, and reporting the headers is what makes the run log's copy-as-curl faithful.

`stepRecorder.StepRecorder` wraps each call as a step: name, method, url, status, duration, request body and response body. Both the posting and the reading flows return `{ ok, steps, failedAt, … }` with the same shape, so the UI renders them with one component and does not need to know which request produced what.

Two paths are not step-recorded, and both are answers to a question rather than actions on an instance: `appService`, which probes an app for its metadata and parties, and `localtestClient`, which mints a token and reads the user list. They report what they found or throw an `HttpError`, and nothing about them appears in the run log. It would be more consistent if a probe left a step behind, and it is not much work if the panels ever need it.

## Failures are results, not exceptions

Any request that reached Altinn and came back unhappy returns HTTP 200 with `ok: false`, a `failedAt` reason, and the steps up to the failure. This applies to `/api/runs`, every read endpoint, and `/api/instances/process/next`.

The reason is that the step log is the product. Collapsing a refused process advance into a 409 would throw away the app's own explanation of which validation failed, which is the thing you opened the tool to see. Malformed requests, an unknown `tokenId`, or an expired token are different: those are 400, 404 and 410, because there is no log to preserve.

## Module map

```
examples/             form and subform xml by data type, and dummy attachments
server/src
  index.ts            express app, CORS, body limit, error middleware
  routes.ts           endpoints and zod schemas
  runService.ts       orchestrates create, upload, validate, advance
  readService.ts      instance operations: list, get, validate, process, delete
  compareService.ts   the stored blob from LocalTest's storage api, and the diff
  xmlDiff.ts          comparing two xml documents, ignoring what carries no meaning
  schemaTypes.ts      a field's declared type, from the app's json schema
  stepRecorder.ts     shared request logging for both flows
  altinnClient.ts     fetch wrapper: bearer, timeout, never throws, redacts the token
  appService.ts       applicationmetadata, parties, content type resolution
  localtestClient.ts  GetTestUserToken, and the test user list
  tokenStore.ts       in-memory token store
  multipart.ts        hand-written multipart body
  examples.ts         reads examples/, with a path traversal guard
  appCatalogue.ts     generated list of known apps and their data types
  contentTypeGaps.ts  reports content types with no dummy attachment
  storedDiffSweep.ts  posts every example and diffs it against what was stored
  jwt.ts              claim decoding, never verification
  urls.ts             app url building
  config.ts           env with defaults
web/src
  App.tsx             state and wiring only
  api.ts              typed calls to /api, one function per endpoint
  types.ts            the wire shapes, mirroring the server's
  components/         one file per panel, plus CopyButton and Notice
  lib/                every pure decision, each with a test
  styles.css          all the styling
```

## Where state lives

- **Tokens: server memory.** A `Map` in `tokenStore.ts`, pruned when expired. Never written to disk, never sent to the browser.
- **Everything you typed: `localStorage`.** Org, app, party, the selected instance guid and the payload elements, under the `altinn-api-tools:` prefix by `useLocalStorage`. Not the destination, which is derived from whether an instance is selected rather than stored. A refresh does not lose your work.
- **Everything read back: React state.** The run log, validation results, the instance listing, the process state, the fetched data element and the pdf blob. Reloading drops them, which is correct: they describe a moment.

## Conventions the UI follows

**Panels appear when they become usable.** `lib/sections.ts` decides, from whether there is a token, an app, and any results. A panel you cannot act on is left out rather than shown dead. Results stand on their own, so an expired token does not hide what you already read.

**Pure decisions live in `lib/`, and `App.tsx` only wires.** Anything that can be decided from its arguments alone goes into a `lib/` module with a test: which panels show, where a loaded element goes in the payload list, what a step looks like as curl, how a content type maps to a file extension, what each api result looks like as a log entry. `App.tsx` holds state, effects and the calls.

**State that describes one instance is dropped together.** Changing the instance guid clears the validation issues, the data element list, the process state and the pdf preview in one place, `changeInstanceGuid`, because all of them described the instance you just left. Stale is more misleading than absent.

**Colour encodes rather than decorates.** HTTP methods, status classes, payload element groups, severities. Everything else is grey. All colours are CSS variables in one `:root` block.

## Decisions worth knowing

**Content types are resolved, not guessed.** For a data element the order is: what you chose in the picker, then what the app declares in `allowedContentTypes` preferring a JSON or XML spelling, then a sniff of the payload's first character. A file picked off disk goes through `lib/fileUpload.ts`, which prefers the browser's own type, falls back to the extension, and then prefers whichever equivalent spelling the app declared, so an app asking for `text/xml` gets `text/xml`.

**A `maxCount: 1` form data type is replaced, not added.** Altinn creates that element itself when the instance is created, so a second POST fails on max count. `runService` notices the existing element and sends `PUT …/data/{id}` instead. The log says "Replace" rather than "Add".

**Binary content travels as base64 and is decoded once.** The browser encodes what it read, the api carries base64 because the api is json, and `runService.bodyOf` is the only place that decodes. What Altinn stores is byte identical to the file on disk. The editor shows a placeholder rather than a textarea for base64, since editing it as text would corrupt the file.

**A body that was only summarised says so.** Base64 uploads log a byte count and multipart logs a part summary, because neither is readable. Those steps are marked `requestVerbatim: false`, and `lib/curl.ts` emits a comment and a `--data-binary @body` placeholder rather than posting the summary as if it were the payload.

**LocalTest is read defensively.** It has no documented endpoint for its user list, so the server tries a json one and otherwise reads the `UserSelect` dropdown off the front page it already renders. Every part of that can fail without costing anything, because a user id can always be typed instead.

## Deliberate limits

- Everything is addressed relative to `ALTINN_APP_HOST`, so the tool only talks to a local Altinn. It has no knowledge of tt02 or production.
- Token claims are decoded for display, never verified. The app does that, and it holds the key.
- Request bodies are parsed up to 25 MB, and the file picker refuses anything over 15 MB, since base64 inflates by a third on the way there.
- Altinn calls time out after 30 seconds, configurable with `REQUEST_TIMEOUT_MS`.
- The run log keeps the last 25 runs.
