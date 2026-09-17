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
examples/             subform xml by data type, dummy attachments, and the forms the testmotor has none of
server/src
  index.ts            express app, CORS, body limit, error middleware
  routes.ts           endpoints and zod schemas
  runService.ts       orchestrates create, upload, validate, advance
  readService.ts      instance operations: list, get, validate, process, delete
  compareService.ts   the stored blob from LocalTest's storage api, and the diff
  validationService.ts the DIBK validation service, the one call that leaves the machine
  xmlDiff.ts          comparing two xml documents, ignoring what carries no meaning
  schemaTypes.ts      a field's declared type, from the app's json schema
  stepRecorder.ts     shared request logging for both flows
  altinnClient.ts     fetch wrapper: bearer, timeout, never throws, redacts the token
  appService.ts       applicationmetadata, parties, content type resolution
  localtestClient.ts  GetTestUserToken, and the test user list
  tokenStore.ts       in-memory token store
  multipart.ts        hand-written multipart body
  examples.ts         main forms from the testmotor, the rest from examples/ behind a traversal guard
  testmotorClient.ts  the FtPB testmotor, which holds the main form examples and re-dates them
  appCatalogue.ts     generated list of known apps and their data types
  contentTypeGaps.ts  reports content types with no dummy attachment
  storedDiffSweep.ts  posts every example and diffs it against what was stored
  jwt.ts              claim decoding, never verification
  urls.ts             app url building
  config.ts           env with defaults
web/src
  main.tsx            the providers, in the order they depend on each other
  App.tsx             the layout, and the state that is nobody's answer
  session.tsx         who you are, where you are pointed, what the server says
  runLog.tsx          the record of every request made
  queries.ts          the cache's settings and every query key
  reads.ts            the reads with more than one consumer, as hooks
  writes.ts           posting the payload and prevalidating it, as hooks
  api.ts              typed calls to /api, one function per endpoint
  types.ts            the wire shapes, mirroring the server's
  components/         one file per panel, plus CopyButton, Notice and Icon
  lib/                every pure decision, each with a test
  testDom.ts          a jsdom browser, for the tests that have to render
  styles.css          the imports, in the order the cascade needs
  styles/             one file per thing styled
```

## Where state lives

- **Tokens: server memory.** A `Map` in `tokenStore.ts`, pruned when expired. Never written to disk, never sent to the browser.
- **Everything you typed: `localStorage`.** Org, app, party, the selected instance guid, the payload elements, the payloads saved by name and the two markers that go with them, under the `altinn-api-tools:` prefix by `useLocalStorage`. [SECURITY.md](SECURITY.md) lists all eight. Not the destination, which is derived from whether an instance is selected rather than stored. A refresh does not lose your work.
- **Everything read back: the query cache.** The instance listing, the instance and its validation, the fetched data element, the comparison with the stored xml and the last prevalidation report are answers in a TanStack Query cache, keyed on what they are about. Reloading drops them, which is correct: they describe a moment.
- **What is nobody's answer: React state.** The run log, the validation results gathered across several reads, and the pdf blob. None of them is the answer to one request: the log is a history, the results are one per target, and the blob is a rendered document rather than a response.

### Why a query cache

The hand-written version of this was the tool's main source of bugs. A read answers after the selection it was aimed at has moved, and the answer has to be dropped rather than written over the newer one. That was `selectionKeys.ts`, an `aim` ref, a `movedOn` check and five `*Attempted` markers, and it is now a key: an answer whose key has moved on is not the answer anyone is looking at.

The library's defaults are inverted in `queries.ts`, because they are written for an application showing a user their own data and none of that holds here. Nothing is retried, since a refusal is the answer and asking twice puts the same refusal in the log twice. Nothing refetches on its own, since a request nobody asked for appearing in the log would make the log a worse record of what you did. Nothing goes stale, since the key already names everything the answer depends on.

The run log entry is written inside the `queryFn` rather than in an effect on the answer. The `queryFn` is the request: it runs once per fetch and not at all when an answer comes from the cache, which is exactly the distinction the log draws.

Two rules go with keying on a value you are typing. The key is the **settled** value, debounced, so the intermediate app names you type through are never asked about at all; and the flags that say which values have settled live in the session rather than in each component, because a panel mounting mid-typing would otherwise treat a half-typed name as settled and ask about it.

## Conventions the UI follows

**Every panel is on screen, and one you cannot use yet says what it is waiting for.** `lib/readiness.ts` decides the reason, written as the thing that is missing rather than as an instruction: "Needs an application." sits under the heading of the panel that is waiting, and the panel above it is where you get one.

They used to be left out until they became usable, which read as a cleaner first screen and cost more than it saved. The order the tool wants things done in was invisible, so a strip above the panels had to name it, and a panel appearing as you typed moved everything under it. `Panel` renders the reason in place of the controls rather than beside them, so a panel that is waiting cannot be half operated.

**The dependencies are stated, not left to be inferred.** `lib/chain.ts` turns the current state into the chain the tool hangs off and marks each step done, next or waiting. Ten steps, one per panel in the column you work down: test user, application, party, instance, payload, prevalidation, post, data element, pdf, process. The rail down the left renders it, and each row says what its step holds as well as where it stands.

Reachability is stated per step rather than walked down the list, because the steps are not a single line. A payload can be written before a party is chosen, and reading a data element needs an instance that posting one does not. More than one step can be open at once, and the rail says both rather than picking one to call next.

`lib/scrollSpy.ts` decides which step to mark as the one on screen, and `lib/useScrollSpy.ts` feeds it positions read from the DOM on each scroll. Reading them fresh rather than subscribing with an observer is what keeps it right while panels change size underneath it.

What it compares against is each panel's own `scroll-margin-top`, measured, because that is where the browser puts a panel when a row scrolls to it. Comparing against the rail's edge instead left the two disagreeing by exactly that margin, so clicking a row marked the panel above the one it scrolled to.

The work column carries a screen's worth of room below the last panel, and that is load-bearing rather than spacing. Without it the panels in the final screenful all bottom out at the same instant: there is no scroll position where Pdf has reached the line and Process has not, so the rail went straight from Data element to Process and Pdf could never be marked at all.

**Pure decisions live in `lib/`, and `App.tsx` only wires.** Anything that can be decided from its arguments alone goes into a `lib/` module with a test: which panels show, where a loaded element goes in the payload list, what a step looks like as curl, how a content type maps to a file extension, what each api result looks like as a log entry. `App.tsx` holds state, effects and the calls.

What is left there is still worth asserting, and it is asserted by rendering: `App.test.tsx` runs the whole tool in the jsdom browser `testDom.ts` sets up, against a table of `/api` routes it can hold open at will. The guards are what it is for. A debounced probe answering into a payload that has been typed in since, an instance read arriving after another instance was picked, the state that has to be dropped together with the instance it described: each of those is a rule nothing enforces, and none of them announce themselves when they stop holding.

**State that describes one instance is dropped together.** The data element list, the process and the comparison are all read under one key, the instance's, so pointing the tool somewhere else drops them by moving the key rather than by clearing five things in the right order. What is left to clear by hand is the state that is nobody's answer: the validation results and the pdf. Stale is more misleading than absent.

**Colour encodes rather than decorates.** HTTP methods, status classes, payload element groups, severities. Everything else is grey. All colours are CSS variables in one `:root` block.

Syntax colouring is the one place the palette does double duty, and it earns it by never appearing outside a code block. Its tokenizer is hand written, in `web/src/lib/highlight.ts`, for the same reason the server's xml diff is: two formats, read-only, and a highlighter library is a large dependency for that. It must return the text it was given, exactly, and a test asserts it, because what it colours is often broken on purpose: a preview truncated at 4000 characters, or half-typed XML.

That extends to buttons, which are all one height: a filled one is the primary action, an outlined one in a method colour sends that kind of request, and an outlined grey one only rearranges what is already here. There is no size variant, because height was encoding nothing and made the same action look different in two places.

## Decisions worth knowing

**Content types are resolved, not guessed.** For a data element the order is: what you chose in the picker, then what the app declares in `allowedContentTypes` preferring a JSON or XML spelling, then a sniff of the payload's first character. A file picked off disk goes through `lib/fileUpload.ts`, which prefers the browser's own type, falls back to the extension, and then prefers whichever equivalent spelling the app declared, so an app asking for `text/xml` gets `text/xml`.

**The test user is written into the example data.** A DIBK submission is refused when the identity it was sent with is not the identity written in it, so an example file with someone else's company in it fails for everyone but that company. `lib/formIdentity.ts` writes the party being acted for into the one party element that is the sender, chosen from a priority list that differs by whether you are acting as yourself or for a company. `lib/identity.ts` is the one place that decides who that is, and the validation request reads it too, so the submitter and the form agree by construction.

It is an edit in the text rather than a parse and a serialize. A round trip would reformat the whole document, and the whole document is what the editor shows and what the comparison with the stored xml is about; this way everything except the five values comes out byte for byte as it went in. What it costs is a small xml scanner, which is the same trade the run log's highlighter and the server's xml diff already make.

Only an element still holding an unedited example is written into, and it is written again whenever the identity changes rather than only at load: the app is read for its parties while the first example is already loading. Writing the same identity into a form it is already in changes nothing, so the effect settles after one pass.

**What a submission requires is asked, not counted.** The prevalidation panel names the documents a submission is missing, and it gets them from the DIBK validation service rather than from `applicationmetadata`, because the `minCount` an app declares is not what the validation insists on. `lib/validationReport.ts` reads the report for the rules about documents, which are the ones with `Vedlegg` in their reference, and matches the names they use against the data types the app declares. Everything else in the report is about what is inside the form, so it is counted and left to the run log, where the whole report is.

The report is a fixed answer about the payload as it was sent, and the list is counted against the payload as it stands, so the two can drift apart. Rather than clearing the report on the first keystroke, which would throw away the list you are working through, the panel keeps it and says it is stale.

**The rendered pdf is kept, and only rendered again when it would differ.** A render is the most expensive read the tool makes: the app lays the whole form out and what comes back is the pdf as base64. It is held with a fingerprint of the instance it came from, the data elements and where the process stands, which between them are everything a render reads. `lib/pdfCache.ts` compares that against the instance now and answers `none`, `current` or `stale`, and both the button and the rail read the same answer.

Closing the window puts the pdf away rather than throwing it out, which is what used to make a second render necessary to look at the same document twice. The buttons say which case they are in rather than quietly skipping a request: a tool whose point is the run log should not have an action that sometimes logs nothing without explaining itself. Not being able to tell counts as stale, because showing someone a pdf of something they have since changed is the worse mistake.

**A `maxCount: 1` form data type is replaced, not added.** Altinn creates that element itself when the instance is created, so a second POST fails on max count. `runService` notices the existing element and sends `PUT …/data/{id}` instead. The log says "Replace" rather than "Add".

**Binary content travels as base64 and is decoded once.** The browser encodes what it read, the api carries base64 because the api is json, and `runService.bodyOf` is the only place that decodes. What Altinn stores is byte identical to the file on disk. The editor shows a placeholder rather than a textarea for base64, since editing it as text would corrupt the file.

**A body that was only summarised says so.** Base64 uploads log a byte count and multipart logs a part summary, because neither is readable. Those steps are marked `requestVerbatim: false`, and `lib/curl.ts` emits a comment and a `--data-binary @body` placeholder rather than posting the summary as if it were the payload.

**LocalTest is read defensively.** It has no documented endpoint for its user list, so the server tries a json one and otherwise reads the `UserSelect` dropdown off the front page it already renders. Every part of that can fail without costing anything, because a user id can always be typed instead.

The same holds for the instance listing. The app's `/instances/{party}/active` is the one that answers, and storage is asked separately, only when the completed ones were asked for. A refusal there costs the extra rows and nothing else, and `completedListed` says which of "none finished" and "storage would not say" the short list means.

## Deliberate limits

- Every Altinn call is addressed relative to `ALTINN_APP_HOST`, so the tool only talks to a local Altinn. It has no knowledge of tt02 or production. There are two exceptions, neither carrying a token. `validationService.ts` posts a payload to the DIBK validation service, because that service knows what a submission requires and `applicationmetadata` does not; `VALIDATION_URL` switches it off. `testmotorClient.ts` reads the main form examples from the FtPB testmotor, because it stamps their date fields afresh on every request and a file committed here would be right only on the day it was committed; `TESTMOTOR_URL` switches it off, leaving the examples still on disk.
- Token claims are decoded for display, never verified. The app does that, and it holds the key.
- Request bodies are parsed up to 25 MB, and the file picker refuses anything over 15 MB, since base64 inflates by a third on the way there.
- Altinn calls time out after 30 seconds, configurable with `REQUEST_TIMEOUT_MS`.
- The run log keeps the last 25 runs.
