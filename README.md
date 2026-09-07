# altinn-studio-api-tools

A local web tool for posting test data into Altinn 3 apps running under Altinn Studio localtest. It fetches a test user token from LocalTest, targets an org and app, posts one or more data elements, and shows the full request and response log for every call it made.

The interface has three columns: the test user on the left, the target app, payload and fetch controls in the middle, and the run log on the right. It both posts data and reads it back, see [Reading data back](#reading-data-back).

## Quick start

Have localtest running, with apps on `local.altinn.cloud:8000` and LocalTest on `localhost:5101`, then:

```bash
npm install
npm run dev
```

- UI: http://127.0.0.1:5173
- API: http://127.0.0.1:4000/api

No configuration is needed if your localtest uses the default ports. Otherwise copy `server/.env.example` to `server/.env` and adjust:

```
ALTINN_APP_HOST=http://local.altinn.cloud:8000
ALTINN_LOCALTEST_URL=http://localhost:5101
```

The header shows a status dot for the app host, for whether LocalTest is answering, and for the active token.

## What it does

### Test user

Enter a user id and the tool calls `GET {localtest}/Home/GetTestUserToken/{userId}`. The token is held in server memory only. The browser receives an opaque id and the decoded claims, never the bearer token itself. The party id is read from the `urn:altinn:partyid` claim and prefilled as the instance owner, and the remaining validity counts down live. A **Paste** tab accepts a token obtained some other way.

### Target

Enter org and app, then press **Probe app**. This reads `/api/v1/applicationmetadata` to fill the data type picker, and `/api/v1/parties?allowedToInstantiateFilter=true` to fill the party picker with subunits flattened, so you do not have to guess a party id that would return 403. Apps you have used before appear as one-click chips. A **Will call** line shows the exact URL that is about to be requested.

### Payload

One editor card per data element, holding the data type, the content type, and the body. The content type defaults to what the app declares in `allowedContentTypes`, falling back to detection from the payload itself. Each element has an example data picker that loads a shipped XML file for its data type, so the common case needs no pasting. See [Example data](#example-data).

### Run log

Every call in order with method, URL, status, duration, and both bodies, plus a link that opens the instance in the app. Posts and reads share the log, and it shows whichever request ran last.

## Destinations

| Destination | Calls |
| --- | --- |
| New instance, one request per data element (default) | `POST /{org}/{app}/instances?instanceOwnerPartyId={party}`, then one request per data element |
| New instance, all data in one request | a single multipart `POST /{org}/{app}/instances` with an `instance` part plus one part per data type |
| Existing instance | `POST /{org}/{app}/instances/{party}/{guid}/data?dataType={type}` |

After a run the instance guid is carried into the existing instance field, so creating an instance and then posting more data onto it takes two clicks. Pasting a full `510001/99d0632c-...` pair into that field splits the party id out for you.

One option applies to any run: advance process, which calls `PUT .../process/next` to submit the step.

Every post is followed automatically by `GET .../instances/{party}/{guid}` and `GET .../instances/{party}/{guid}/validate`, so the log always shows what Altinn actually stored and whether it validates. Those two requests are appended to the same log entry as the post, and the verdict gains a data element count and an issue summary. The data element select in the Fetch panel is filled in at the same time, so validating or reading a single element afterwards needs no extra click. A post that fails skips both follow-ups, since there is no instance to read.

## Example data

73 example XML files ship in `examples/`, laid out so that the directory name is the data type:

```
examples/
  forms/ET/01_Maksimumsversjon.xml
  forms/ET/02_Minimumsversjon.xml
  forms/MB/08_Tiltakstype oppretting av matrikkelenhet.xml
  subforms/GjennomfoeringsplanDataV7/GjennomfoeringsplanDataV7.xml
```

Each data element's example picker lists the files matching its data type. The numeric prefix is stripped for display, so `01_Maksimumsversjon.xml` shows as "Maksimumsversjon", but it still determines the order. Loading a file also sets the content type to `application/xml`.

These files were copied from the example data used by our other Altinn tooling. To avoid maintaining a second copy, point the tool at your canonical directory instead:

```
ALTINN_EXAMPLE_DATA_DIR=/path/to/exampleData
```

It expects `forms/{dataType}/*.xml` and `subforms/{dataType}/*.xml` under that directory. Either subdirectory may be absent. Adding a file needs no restart, because the directory is read on each request.

## Known apps

`server/src/appCatalogue.ts` lists 25 known org and app pairs together with the data type each app uses for its form data, generated from the same `altinnStudioApps` registry. Picking an app from the **Known app** dropdown fills in org, app, and the main data type at once, and the app's subform data types become suggestions on any elements you add. The catalogue is only a convenience. Once you probe an app, its own `applicationmetadata` takes over.

The quickest path to a full ET submission is therefore: pick a user, pick `dibk/et-v4`, load the ET example, add an element, load the Gjennomføringsplan example, and post as multipart. The user id is the only thing you type.

## Max count behaviour

Altinn creates the data element for a form data type automatically when the instance is created, for any type with `maxCount: 1` and an `appLogic` block. A second POST to that data type therefore fails:

```
POST /dibk/et-v4/instances?instanceOwnerPartyId=510001    instance already has an ET element
POST /dibk/et-v4/instances/510001/{guid}/data?dataType=ET  400, max count reached
```

The tool detects the existing element and sends `PUT .../data/{dataElementId}` instead. When this happens the run log says "Replace" rather than "Add". `runService.test.ts` covers the behaviour for both the create path and the existing instance path.

## Reading data back

The **Fetch** panel does four GET requests against an instance you already have, paired as get and validate for the instance and for one data element.

**Get instance** calls `GET /{org}/{app}/instances/{party}/{guid}`. Besides logging the whole response it reads the instance's `data` array and fills the data element select, so you do not have to copy a dataGuid by hand.

**Get data element** calls `GET /{org}/{app}/instances/{party}/{guid}/data/{dataGuid}` for whichever element is selected. The select labels each one by data type, filename, content type, and size. The first is preselected after reading an instance, so fetching one is a single click.

The party id and instance guid are the same fields the existing instance destination uses, so posting an instance and then reading it back needs no retyping. The request goes out with `Accept: */*`, because asking for JSON would stop Altinn returning stored XML. XML comes back verbatim and JSON comes back parsed.

**Validate instance** calls `GET /{org}/{app}/instances/{party}/{guid}/validate` and **Validate data element** calls `GET /{org}/{app}/instances/{party}/{guid}/data/{dataGuid}/validate`. Altinn answers with an array of issues, empty when everything passes. The verdict summarises them by severity, for example "1 error, 1 warning, 1 other", and the full array is in the step body. Severity 1 counts as an error and 2 as a warning, following Altinn's `ValidationIssueSeverity`.

All four requests appear in the run log alongside posts, with method, URL, status, timing, and body.

Posting already runs the instance get and validate automatically, so the buttons here are for an instance you did not just create. Paste its party id and guid to inspect it.

## API

The backend is usable on its own, which is useful for scripting a data load.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/api/health` | |
| `GET` | `/api/config` | Resolved `appHost` and `localtestUrl` |
| `GET` | `/api/localtest/status` | Whether LocalTest is reachable |
| `GET` | `/api/catalogue` | Known org and app pairs with their data types and subforms |
| `GET` | `/api/examples` | Example files grouped by data type |
| `GET` | `/api/examples/file` | `?kind=form\|subform&dataType=ET&name=01_Maksimumsversjon.xml` |
| `POST` | `/api/tokens/test-user` | Takes `{userId}` and calls `/Home/GetTestUserToken/{userId}` |
| `POST` | `/api/tokens/raw` | Takes `{token}` to store a token you already have |
| `GET` | `/api/tokens` | Claims only, never the bearer token |
| `DELETE` | `/api/tokens/:id` | |
| `GET` | `/api/app/metadata` | `?tokenId&org&app` |
| `GET` | `/api/app/parties` | `?tokenId&org&app` |
| `POST` | `/api/runs` | The orchestrator, described below |
| `GET` | `/api/instances` | Get an instance. `?tokenId&org&app&instanceOwnerPartyId&instanceGuid` |
| `GET` | `/api/instances/data-element` | Get one data element. Same query plus `&dataGuid` |
| `GET` | `/api/instances/validate` | Validate an instance. Same query as `/api/instances` |
| `GET` | `/api/instances/data-element/validate` | Validate one data element. Same query plus `&dataGuid` |
| `PUT` | `/api/instances/process/next` | Advance an existing instance |

```bash
TOKEN_ID=$(curl -s localhost:4000/api/tokens/test-user \
  -H 'content-type: application/json' -d '{"userId":"1001"}' | jq -r .id)

# create an instance for party 510001 and post ET into it
curl -s localhost:4000/api/runs -H 'content-type: application/json' -d "{
  \"tokenId\": \"$TOKEN_ID\",
  \"org\": \"dibk\",
  \"app\": \"et-v4\",
  \"instanceOwnerPartyId\": \"510001\",
  \"dataElements\": [{ \"dataType\": \"ET\", \"content\": \"<ET><a>1</a></ET>\" }],
  \"validate\": true
}" | jq '{ok, instanceGuid, steps: [.steps[] | "\(.method) \(.status) \(.name)"]}'

# post another data element onto an instance that already exists
curl -s localhost:4000/api/runs -H 'content-type: application/json' -d "{
  \"tokenId\": \"$TOKEN_ID\",
  \"org\": \"dibk\", \"app\": \"et-v4\",
  \"instanceOwnerPartyId\": \"510001\",
  \"mode\": \"existing\",
  \"instanceGuid\": \"99d0632c-5917-448c-8ab6-a5d3b681376b\",
  \"dataElements\": [{ \"dataType\": \"vedlegg\", \"content\": \"...\" }]
}" | jq
```

`mode` is `sequential` by default, and can also be `multipart` or `existing`.

A request that fails still returns `200`, with `ok` set to `false`, a `failedAt` reason, and the step log up to the point of failure. This applies to `/api/runs` and to all four read endpoints, and keeps the whole log available to the UI instead of collapsing it into one error. Malformed requests return `400`.

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Both servers with prefixed output |
| `npm test` | Orchestrator and example tests, stubbed Altinn, no network |
| `npm run typecheck` | Both workspaces |
| `npm run build` | Compile the server and bundle the UI |

## Project layout

```
examples/             form and subform xml, by data type
server/src
  index.ts            express app, CORS, error middleware
  routes.ts           endpoints and zod schemas
  runService.ts       orchestrates create, upload, validate, advance
  runService.test.ts
  readService.ts      get and validate, for instances and data elements
  readService.test.ts
  stepRecorder.ts     shared request logging for both flows
  multipart.ts        hand-written multipart body, see the note below
  examples.ts         reads examples/, with a path traversal guard
  examples.test.ts
  appCatalogue.ts     generated list of known apps and their data types
  localtestClient.ts  GetTestUserToken
  tokenStore.ts       in-memory token store
  appService.ts       applicationmetadata, parties, content type resolution
  altinnClient.ts     fetch wrapper: bearer, timeout, never throws on non-2xx
  urls.ts             app url building
web/src
  App.tsx             state and wiring
  components/         TokenPanel, TargetPanel, PayloadPanel, ExamplePicker, FetchPanel, RunLog
  styles.css          all the styling
```

The UI is plain and dark only. It uses system fonts with no webfonts to load, a single accent colour, hairline borders, and no decoration. All colours are CSS variables in `:root` at the top of `styles.css`, so changing the theme means editing that one block.

### Why multipart is written by hand

`FormData.append(name, blob)` in Node always adds `filename="blob"` to the part's Content-Disposition header, and Altinn stores that as the data element's filename, so a prefilled form data element ends up named "blob". `multipart.ts` writes the body directly, so form data parts carry no filename and only real attachments get one.

## Limits

Everything is addressed relative to `ALTINN_APP_HOST`, so this tool only talks to a local Altinn. It has no knowledge of tt02 or production.

Data elements are sent as text, either JSON or XML. Binary upload is not wired into the UI, although `runService` accepts a `filename` and sets `Content-Disposition` when one is given.

Token claims are decoded for display only. The signature is never verified here, because the app does that.

Payload and target state persist in `localStorage`, so a page refresh does not lose your work. Tokens are not stored in the browser. They are listed again from the server when the page loads.
