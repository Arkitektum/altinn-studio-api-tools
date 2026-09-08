# altinn-studio-api-tools

A local web tool for posting test data into Altinn 3 apps running under Altinn Studio localtest. It fetches a test user token from LocalTest, targets an org and app, posts one or more data elements, and shows the full request and response log for every call it made.

The interface has three columns: the test user on the left, the target app, payload and fetch controls in the middle, and the validation results and run log on the right. It both posts data and reads it back, see [Reading data back](#reading-data-back).

Panels appear as they become usable rather than sitting there dead. On a cold start you get the test user and the target app, since that is all you can act on. Payload, the post button and Fetch arrive once you have a token and an app to aim at. Validation and the run log arrive with their first content, and the process panel and the data element controls in Fetch appear once an instance read has told them what to show. The right column takes its width whether or not it holds anything, so nothing shifts when the first run lands.

## Quick start

Have Node 22.12 or later and localtest running, with apps on `local.altinn.cloud:8000` and LocalTest on `localhost:5101`, then:

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

Pick a test user and the tool calls `GET {localtest}/Home/GetTestUserToken/{userId}`. The stored token is named after the person rather than the id.

The list comes from LocalTest itself. It has no documented endpoint for its users, so the server tries the json one some versions serve at `/Home/GetTestUsers` and otherwise reads the option list off the front page it already renders, which is where those names are shown anyway. Whichever it was is stated under the picker, since a scraped list deserves to say so.

The page read is deliberately narrow: only a `<select>` whose `id` or `name` says it holds users or profiles, which on LocalTest is `UserSelect`. Reading every numeric option value off the page instead picked up the `AuthenticationLevel` dropdown and offered "Nivå 0" through "Nivå 4" as people. A select this does not recognise yields nothing at all, which leaves the fallback pair and the typed id rather than five levels pretending to be users.

LocalTest's picker offers a user and a party together: an `<optgroup label="Sophie Salt">` holding one option per party she can act for, each valued `1337.501337`, which is user id then party id. Only the user id is taken, since that is what a token is minted for, so several parties for one person collapse to one entry, labelled with the group's plain name rather than the option's "Sophie Salt (Person)". The party is not read off the page because there are two better sources for it already: the token's own claim, and the app's parties endpoint once it is probed, which is authoritative about what the token may act for.

Razor writes the Norwegian vowels as entities like `&#xE5;`, so labels are decoded, and `&amp;` last of all, which keeps a literal `&#xE5;` in a name from being decoded twice. `localtestClient.test.ts` covers both parsers against the markup the page actually serves, the level dropdown, the groups and the entities.

Where LocalTest offers nothing, the two we work with are offered instead, Pengelens Partner (1001) and Sophie Salt (1337). Either way **Other user id** takes any id by hand, which is the path that depends on no discovery at all: LocalTest mints a token for any user it knows, listed or not. The token is held in server memory only. The browser receives an opaque id and the decoded claims, never the bearer token itself. The party id is read from the `urn:altinn:partyid` claim and prefilled as the instance owner, and it follows the active token when you switch user. A party you typed yourself is left alone, since acting on behalf of another party is a real case. The remaining validity counts down live, and **Renew** on the token card fetches another one for the same user and activates it, so an expiry mid-session costs a click rather than a trip back through the picker. It takes the accent colour once the token has expired, since that is then the thing to press. The spent token is deleted rather than left to fill the list with dead tokens for the same person, and a token the server has already pruned is treated as the same outcome. Only a LocalTest token offers this, since a pasted one cannot be minted again.

A **Paste** tab accepts a token obtained some other way.

### Target

Enter org and app, then press **Probe app**. This reads `/api/v1/applicationmetadata` to fill the data type picker, and `/api/v1/parties?allowedToInstantiateFilter=true` to fill the party picker with subunits flattened, so you do not have to guess a party id that would return 403. A **Will call** line shows the exact URL that is about to be requested.

**Instance template** holds two optional fields, due before and visible after, for the cases where an instance needs a deadline or a date before which it is not visible. Both are local wall clock in the input and go out as UTC. Leaving them empty is the normal case and sends no template at all, which keeps the simpler request with the party in the query string; setting either moves the party into the instance body, because the query string form carries nothing else. The **Will call** line says which of the two it will be. A visible after date in the future warns, since it hides the instance you just made, including from the instance listing here. The fields are not offered when posting onto an existing instance, where Altinn ignores them.

Altinn's instance template takes more than these two. The api accepts any of it through `instanceTemplate` on `/api/runs`, see [API](#api), and the UI offers the two that a test run has a use for.

### Payload

One editor card per data element, holding the data type, the content type, and the body. The content type defaults to what the app declares in `allowedContentTypes`, falling back to detection from the payload itself. Each element has an example data picker that loads a shipped XML file for its data type, so the common case needs no pasting. See [Example data](#example-data). Data read back off an instance can be loaded in here too, see [Reading data back](#reading-data-back).

Elements collapse to a single row, so a payload with several of them stays readable. Adding an element collapses the ones already there and leaves the new one open, and **Collapse all** in the panel header folds the lot. A collapsed row still shows its data type, size and which example it came from, and an element with no content says so in the warning colour, since that is what blocks the post. Collapsing hides the editor rather than unmounting it, so nothing is lost and the state survives a reload.

**File from disk** takes a file the shipped dummies do not cover, a real pdf or a real GML rather than a placeholder. It is read in the browser: text formats arrive in the editor and stay editable, and anything else becomes base64 that the server decodes before the request goes to Altinn, so what gets stored is byte identical to the file you picked. `fileUpload.test.ts` covers the round trip.

The content type follows the browser's own guess, falling back to the extension where the browser has none, which is the case for `.gml` and `.geojson`. Either way a spelling the app declared wins over an equivalent one it did not, so an app asking for `text/xml` gets `text/xml`. Where nothing the app declares looks like the file, the honest guess is posted and the app is left to refuse it, since that is more informative than quietly relabelling it. The file dialog itself filters to the types the app declares.

Only attachments carry the filename to Altinn. Form data and subforms do not, for the same reason the multipart body is written by hand, see [Why multipart is written by hand](#why-multipart-is-written-by-hand).

The data type picker is grouped as **Main form**, **Sub forms** and **Attachments**, read from the app's `mainFormDataType` and `subFormDataTypes`. Anything the app declares that is not one of those counts as an attachment. Four data types the app produces itself are left out, since they are not something you post: `Signatur`, `FoedselsnummerTiltakshaver`, `Valideringsrapport` and `ref-data-as-pdf`. A hidden type that is already selected on an element stays selectable, so switching between apps never blanks a selection.

Apps that declare neither field fall back to grouping by app logic, where a single-instance form data type is the main form and any other is a subform. `web/src/lib/dataTypeGroups.test.ts` covers both paths.

### Process

Where the instance stands, and the button that moves it on. The panel shows the current task and its Altinn task type, when the process started, and when it ended together with the end event once it has. The badge in the header repeats the same thing in one line, so a folded glance is enough.

The state comes out of the instance read rather than from a request of its own, so the panel appears with the first **Get instance** or with the read that follows a post, and it says nothing until then. Changing the instance guid clears it, since it described the instance you just left.

**Advance process** calls `PUT .../instances/{party}/{guid}/process/next`, the same call the post flow's advance checkbox makes. The app validates before it moves, so a refusal here is usually validation talking and lands in the run log with the app's own reason. The move answers with the process it landed in, so the panel updates without another read, and a refused move leaves the task the instance is still in on screen rather than blanking it. An ended process hides the button, since there is nowhere left to go.

### Pdf preview

**Preview pdf** in the Fetch panel calls `GET /instances/{party}/{guid}/pdf/preview`, which is the receipt pdf the app would archive. It is the quickest way to see what the form data turns into without walking the process to the end.

The pdf arrives base64 encoded, is turned into a blob in the browser and shown in the browser's own pdf viewer, so nothing is written to disk and no viewer library is bundled. **Open in new tab** gives you the full viewer with print and save, and **Close preview** puts the panel away.

One preview is held at a time. Rendering again replaces it and revokes the previous blob url, a failed render clears it rather than leaving a stale pdf looking current, and changing the instance guid clears it along with that instance's validation results.

### Validation

Its own panel, separate from the run log, holding one result per thing validated: the instance, and each data element you have validated. Results are grouped by target so several can be on screen at once, with the instance first and the data elements after it by name. Validating the same target again replaces its result rather than adding another, so what you see is always current.

Every result starts folded, showing its label, its worst severity and a count. Expanded issue lists run long enough to push the run log off screen, so the headers are the default view and you open the one you want. Inside an open result, issues are grouped by severity with the worst first and each group folds too. Errors start open because they are what blocks a submission, while warnings and anything else start folded with their counts still showing.

Each issue shows its code, the data type it belongs to, the description and the field path, on a severity coloured card. The `dataElementId` is resolved to a data type name when the instance read is available, so an issue says `ET` rather than a guid, and the full `source` sits in the tooltip on the code.

The panel only changes when something validates. Fetching an instance or a data element afterwards leaves the issues on screen, so they stay readable while you fix the payload. Issues describe one instance, so changing the instance guid clears them rather than leaving results that no longer apply, and **Clear results** empties the panel by hand. Posting creates a new instance, which likewise drops the previous instance's results.

### Run log

Every call in order with method, URL, status, duration, and both bodies, plus a link that opens the instance in the app.

Runs are kept rather than replaced. Each one is a row showing what it was, how many steps it took, how long it ran and when, and the newest is open while the rest fold to a single line. Posts, fetches and validations all land here, so a fetch no longer wipes the post you are looking at. **Clear history** empties it, and the last 25 runs are kept.

Every step carries a **Copy curl** button, and each body a **Copy**, since the usual next move after a surprising log entry is handing the request to someone else. The command reads:

```bash
curl -i -X POST 'http://local.altinn.cloud:8000/dibk/et-v4/instances/510001/{guid}/data?dataType=ET' \
  -H 'accept: application/json' \
  -H 'authorization: Bearer $TOKEN' \
  -H 'content-type: application/xml' \
  --data-binary '<ET>…</ET>'
```

The headers are the ones the request actually went out with, recorded by `altinnClient.ts` as it built them, so a data element read carries its `accept: */*` and an upload its real content type. The bearer token is replaced with the literal `$TOKEN` at that point, which is why the browser can be given the headers at all: run `TOKEN=$(…)` first and the command works. `altinnClient.test.ts` covers the substitution.

Two kinds of step cannot be replayed as written, because their logged body is a summary and not the payload: a base64 attachment, which is logged as a byte count, and a multipart instantiation, which is mostly boundaries. Those commands come with a comment saying so and a `--data-binary @body` for you to fill in, rather than quietly posting the summary. `curl.test.ts` covers both shapes.

## Destinations

| Destination                                          | Calls                                                                                                |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| New instance, one request per data element (default) | `POST /{org}/{app}/instances?instanceOwnerPartyId={party}`, then one request per data element        |
| New instance, all data in one request                | a single multipart `POST /{org}/{app}/instances` with an `instance` part plus one part per data type |
| Existing instance                                    | `POST /{org}/{app}/instances/{party}/{guid}/data?dataType={type}`                                    |

The first row's query string form is what you get with no instance template. With one, the party moves into a json instance body on the same URL, since the query string carries nothing but the party. The multipart row already sends an instance part, so a template just goes in it.

After a run the instance guid is carried into the existing instance field, so creating an instance and then posting more data onto it takes two clicks. Pasting a full `510001/99d0632c-...` pair into that field splits the party id out for you.

One option applies to any run: advance process, which calls `PUT .../process/next` to submit the step. The same call sits on its own button in the [Process](#process) panel, for an instance you are not posting to.

**Repeat** next to the post button posts the same payload more than once, for building up test data without clicking the same button ten times. The posts run one after another rather than at once, so the log stays in order and localtest is not hammered, and the button counts them off as "Posting 3 of 10". Each one is read back and validated like any other post, and a failure stops the rest instead of failing the same way another forty times. Up to 50 in one go, which is high enough to be useful and low enough that an extra digit does not run for minutes. Note that the run log keeps the last 25 entries, so a long repeat pushes its own early runs out.

The destination decides what repeating means. Against a new instance it makes that many instances, and against an existing one it posts onto the same instance that many times, aiming each post at the instance you chose rather than at the one the previous post created.

Every post is followed automatically by `GET .../instances/{party}/{guid}` and `GET .../instances/{party}/{guid}/validate`, so the log always shows what Altinn actually stored and whether it validates. Those two requests are appended to the same log entry as the post, and the verdict gains a data element count and an issue summary. The data element select in the Fetch panel is filled in at the same time, so validating or reading a single element afterwards needs no extra click. A post that fails skips both follow-ups, since there is no instance to read.

## Example data

73 example XML files ship in `examples/`, laid out so that the directory name is the data type:

```
examples/
  forms/ET/01_Maksimumsversjon.xml
  forms/ET/02_Minimumsversjon.xml
  forms/MB/08_Tiltakstype oppretting av matrikkelenhet.xml
  subforms/GjennomfoeringsplanDataV7/GjennomfoeringsplanDataV7.xml
  attachments/dummy.pdf
  attachments/dummy.png
```

Each data element's example picker lists the files matching its data type. The numeric prefix is stripped for display, so `01_Maksimumsversjon.xml` shows as "Maksimumsversjon", but it still determines the order. Loading a file also sets the content type to `application/xml`.

Changing the data type clears the content and loads the new type's first example automatically, so picking a type leaves the element holding something valid to post. A type with no examples leaves the content empty. Two cases deliberately do not auto-load: pressing **Clear** stays cleared, and content restored from a previous session is never overwritten.

These files were copied from the example data used by our other Altinn tooling. To avoid maintaining a second copy, point the tool at your canonical directory instead:

```
ALTINN_EXAMPLE_DATA_DIR=/path/to/exampleData
```

It expects `forms/{dataType}/*.xml`, `subforms/{dataType}/*.xml` and `attachments/*` under that directory. Any of them may be absent. Adding a file needs no restart, because the directory is read on each request.

### Dummy attachments

Attachment data types are keyed not by data type but by the content types they accept, so one dummy file serves every attachment type that accepts it. `examples/attachments/` holds one dummy per format:

| File            | Content types                                                             | Sent as |
| --------------- | ------------------------------------------------------------------------- | ------- |
| `dummy.pdf`     | `application/pdf`                                                         | base64  |
| `dummy.docx`    | `application/vnd.openxmlformats-officedocument.wordprocessingml.document` | base64  |
| `dummy.xlsx`    | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`       | base64  |
| `dummy.odt`     | `application/vnd.oasis.opendocument.text`                                 | base64  |
| `dummy.ods`     | `application/vnd.oasis.opendocument.spreadsheet`                          | base64  |
| `dummy.rtf`     | `application/rtf`, `text/rtf`                                             | text    |
| `dummy.png`     | `image/png`                                                               | base64  |
| `dummy.jpg`     | `image/jpeg`                                                              | base64  |
| `dummy.gif`     | `image/gif`                                                               | base64  |
| `dummy.bmp`     | `image/bmp`, `image/x-ms-bmp`                                             | base64  |
| `dummy.webp`    | `image/webp`                                                              | base64  |
| `dummy.tif`     | `image/tiff`                                                              | base64  |
| `dummy.svg`     | `image/svg+xml`                                                           | text    |
| `dummy.gml`     | `application/gml+xml`                                                     | text    |
| `dummy.geojson` | `application/geo+json`, `application/vnd.geo+json`                        | text    |
| `dummy.xml`     | `application/xml`, `text/xml`                                             | text    |
| `dummy.json`    | `application/json`, `text/json`                                           | text    |
| `dummy.csv`     | `text/csv`, `application/csv`                                             | text    |
| `dummy.html`    | `text/html`                                                               | text    |
| `dummy.md`      | `text/markdown`                                                           | text    |
| `dummy.txt`     | `text/plain`                                                              | text    |
| `dummy.zip`     | `application/zip`, `application/x-zip-compressed`                         | base64  |
| `dummy.bin`     | `application/octet-stream`                                                | base64  |

The picker offers the dummies matching the data type's `allowedContentTypes`, in the order the app declares them, so the first declared one is what loads automatically. Where a format has several content type spellings, the file is offered under each and posted as the one the app asked for, so an app declaring `text/xml` gets `text/xml` rather than `application/xml`.

A content type with no dummy is simply not offered. Adding one means dropping a file into the directory and listing its extension in `FORMATS` in `server/src/examples.ts`. For a one-off, **File from disk** on the element takes any file without it having to be shipped first.

To find out which content types your own apps declare and which of them have no dummy, run this with localtest up:

```bash
npm run gaps --workspace server                              # walks the whole catalogue
npm run gaps --workspace server -- 1001 dibk/et-v4           # one or more specific apps
```

It probes each app's `applicationmetadata`, collects every `allowedContentTypes` entry, and prints which are covered, which are missing and which data types ask for them. The first argument is the LocalTest user id, defaulting to 1001. Apps in the catalogue that are not deployed locally are listed separately rather than treated as a gap.

The GML is a real Reguleringsplanforslag feature collection of about 950 kB, and the GeoJSON a real feature collection. Both are registered under their own content types rather than as plain XML or JSON, so the large GML does not become the default example for every XML attachment. Say the word if you want them offered under `application/xml` and `application/json` as well.

The other files are minimal but real, not padding with the right extension. The PDF is a one page document with correct xref offsets. The office and OpenDocument files are valid zip packages with the parts their formats require, and the OpenDocument ones put an uncompressed `mimetype` first as the spec demands. PNG, JPEG, GIF, BMP, WebP and SVG were each checked by decoding them in a browser. TIFF has no browser decoder, so its IFD was parsed back tag by tag instead. They carry no meaningful content, only enough structure to pass as genuine files.

Legacy Office formats are not included, because `.doc` and `.xls` are OLE2 compound files and hand building a valid one is a different order of effort. Ask if you need them.

Binary formats travel to the server as base64 and are decoded to bytes before the request goes to Altinn, so what gets stored is byte identical to the file on disk. The editor shows a placeholder for them rather than a textarea, since editing base64 as text would corrupt the file, and the data element is posted with a `Content-Disposition` filename. Reading a binary data element back returns base64 too, for the same reason.

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

The **Fetch** panel does six GET requests: list the party's instances, then get and validate for the instance and for one data element, plus the pdf preview. It also holds the delete, see [Deleting an instance](#deleting-an-instance).

**List instances** calls `GET /{org}/{app}/instances/{party}/active`, the app's own list endpoint, the one its frontend uses to offer an unfinished form back to the user. It needs a party but no guid, since finding the guid is the point of it. The picker labels each instance by the first eight characters of its guid, when it was last changed and by whom, newest first, and choosing one fills in both the party id and the guid. Altinn lists the instances whose process has not ended, so an archived one is not in there and still has to be pasted.

A listing belongs to one app and one party, so changing either drops it. A party that genuinely has no instances says so, while a failed request does not, since "none" is not something we know in that case.

**Get instance** calls `GET /{org}/{app}/instances/{party}/{guid}`. Besides logging the whole response it reads the instance's `data` array and fills the data element select, so you do not have to copy a dataGuid by hand.

**Get data element** calls `GET /{org}/{app}/instances/{party}/{guid}/data/{dataGuid}` for whichever element is selected. The select labels each one by data type, filename, content type, and size. The first is preselected after reading an instance, so fetching one is a single click.

The party id and instance guid are the same fields the existing instance destination uses, so posting an instance and then reading it back needs no retyping. The request goes out with `Accept: */*`, because asking for JSON would stop Altinn returning stored XML. XML comes back verbatim and JSON comes back parsed.

**Load into payload** puts what came back into the Payload panel, which is the round trip: read a stored element, change one field, post it again. An element that is standing empty is reused rather than a second one being added next to it, and otherwise it is appended with the others collapsed, so the loaded element is the one in front of you. The collapsed row and the editor hint both say `instance 99d0632c` where an example file would have named itself, so loaded and shipped content never look alike. A content type parameter is dropped on the way in, so a stored `application/xml; charset=utf-8` does not become an extra option in the picker.

The destination is deliberately left alone. Posting it back to the same instance and using it as the payload for a new one are both real cases, and only you know which this is, so pick the destination in Target as usual. Posting it back to the same instance needs nothing else: the party id and guid are already filled in, and a form data type with `maxCount: 1` is replaced with `PUT` rather than rejected, see [Max count behaviour](#max-count-behaviour).

What came back is held, so **Download** saves it as a file and **Copy content** puts the text on the clipboard, rather than leaving it as text in a `pre` to be selected by hand. The download is named after whatever Altinn stored, since an attachment was uploaded under a name someone chose, and otherwise after the data type with an extension from the content type, so `ET` becomes `ET.xml`. Binary content is written from the decoded bytes and offers no copy button, because copying base64 as text hands over the encoding rather than the file. Picking another data element, or another instance, drops what is held instead of offering to download an element you are no longer looking at.

Validation results are listed out rather than left as raw JSON. Issues are grouped by severity with the worst first, each one showing its code, the data type it belongs to, the description and the field path, on a severity coloured card. The `dataElementId` is resolved to a data type name when the instance read is available, so an issue says `ET` rather than a guid, and the full `source` sits in the tooltip on the code. This appears both for the validation that runs automatically after a post and for the two validate buttons.

**Validate instance** calls `GET /{org}/{app}/instances/{party}/{guid}/validate` and **Validate data element** calls `GET /{org}/{app}/instances/{party}/{guid}/data/{dataGuid}/validate`. Altinn answers with an array of issues, empty when everything passes. The verdict summarises them by severity, for example "1 error, 1 warning, 1 other", and the full array is in the step body. Severity 1 counts as an error and 2 as a warning, following Altinn's `ValidationIssueSeverity`.

**Preview pdf** calls `GET /{org}/{app}/instances/{party}/{guid}/pdf/preview`, see [Pdf preview](#pdf-preview).

### Deleting an instance

At the bottom of the Fetch panel, behind a rule and away from the read buttons, for clearing up after a test run. It calls `DELETE /{org}/{app}/instances/{party}/{guid}?hard={true|false}`.

Soft is the default: Altinn marks the instance deleted, which takes it out of the active list while leaving it in storage. **Hard delete** removes it outright and cannot be undone, so it is a checkbox you tick rather than the default reading of a `hard` parameter that happens to be absent.

Delete asks twice. The first click arms the button, which then names what it is about to do and which instance, as in "Confirm hard delete of 99d0632c". Changing the instance guid or the party drops a pending confirmation, so a second click never lands on an instance you did not mean. A refusal from Altinn, a locked instance or a party you may not act for, lands in the run log with the app's own reason.

Afterwards the instance is dropped from the listing and the guid is cleared, which takes the data elements, the process state and the validation issues with it, since all of them described an instance that is no longer there.

All six requests appear in the run log alongside posts, with method, URL, status, timing, and body.

Posting already runs the instance get and validate automatically, so the buttons here are for an instance you did not just create. List the party's instances and pick one, or paste a party id and guid.

## API

The backend is usable on its own, which is useful for scripting a data load.

| Method   | Path                                   | Notes                                                                 |
| -------- | -------------------------------------- | --------------------------------------------------------------------- |
| `GET`    | `/api/health`                          |                                                                       |
| `GET`    | `/api/config`                          | Resolved `appHost` and `localtestUrl`                                 |
| `GET`    | `/api/localtest/status`                | Whether LocalTest is reachable                                        |
| `GET`    | `/api/localtest/users`                 | Its test users, with `source` naming where the list came from         |
| `GET`    | `/api/catalogue`                       | Known org and app pairs with their data types and subforms            |
| `GET`    | `/api/examples`                        | Example files grouped by data type                                    |
| `GET`    | `/api/examples/file`                   | `?kind=form\|subform&dataType=ET&name=01_Maksimumsversjon.xml`        |
| `POST`   | `/api/tokens/test-user`                | Takes `{userId}` and calls `/Home/GetTestUserToken/{userId}`          |
| `POST`   | `/api/tokens/raw`                      | Takes `{token}` to store a token you already have                     |
| `GET`    | `/api/tokens`                          | Claims only, never the bearer token                                   |
| `DELETE` | `/api/tokens/:id`                      |                                                                       |
| `GET`    | `/api/app/metadata`                    | `?tokenId&org&app`                                                    |
| `GET`    | `/api/app/parties`                     | `?tokenId&org&app`                                                    |
| `POST`   | `/api/runs`                            | The orchestrator, described below                                     |
| `GET`    | `/api/instances/active`                | List a party's instances. `?tokenId&org&app&instanceOwnerPartyId`     |
| `GET`    | `/api/instances`                       | Get an instance. `?tokenId&org&app&instanceOwnerPartyId&instanceGuid` |
| `GET`    | `/api/instances/data-element`          | Get one data element. Same query plus `&dataGuid`                     |
| `GET`    | `/api/instances/validate`              | Validate an instance. Same query as `/api/instances`                  |
| `GET`    | `/api/instances/data-element/validate` | Validate one data element. Same query plus `&dataGuid`                |
| `GET`    | `/api/instances/pdf-preview`           | Render the receipt pdf. Same query as `/api/instances`                |
| `DELETE` | `/api/instances`                       | Delete an instance. Same query plus `&hard=true` for a hard delete    |
| `PUT`    | `/api/instances/process/next`          | Advance an existing instance. Same body as `/api/instances`'s query   |

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

A request that fails still returns `200`, with `ok` set to `false`, a `failedAt` reason, and the step log up to the point of failure. This applies to `/api/runs`, to every read endpoint and to `/api/instances/process/next`, and keeps the whole log available to the UI instead of collapsing it into one error. Malformed requests return `400`.

## Scripts

| Command                           |                                                          |
| --------------------------------- | -------------------------------------------------------- |
| `npm run dev`                     | Both servers with prefixed output                        |
| `npm test`                        | Server and web tests, stubbed Altinn, no network         |
| `npm run gaps --workspace server` | Which content types your apps declare that have no dummy |
| `npm run typecheck`               | Both workspaces                                          |
| `npm run build`                   | Compile the server and bundle the UI                     |
| `npm run format`                  | Format everything with Prettier                          |
| `npm run format:check`            | Fail if anything is unformatted, for CI                  |

## CI

`.github/workflows/ci.yml` runs on pushes to main and on pull requests: `format:check`, `typecheck`, `test`, then `build`, cheapest first. A new push cancels the run still in flight, so a series of commits does not queue up behind itself.

It runs on Node 24. The floor is Node 22.12, which is what `engines` says: the test scripts hand `src/**/*.test.ts` to `node --test` and let node expand it, which node has only done since 22, and the shell leaves the pattern alone because it matches nothing itself. Vite 8 wants 22.12 as well.

## Formatting

Prettier owns the formatting, configured in `.prettierrc`: four space indent, double quotes, semicolons, no trailing commas, and a 150 column print width. Run `npm run format` to apply it and `npm run format:check` to verify.

`.prettierignore` keeps Prettier away from `examples/`. Those files are fixtures that get posted byte for byte, and reformatting the JSON and GeoJSON dummies would change the very bytes the tests assert on.

One thing to know: `server/src/appCatalogue.ts` is generated, so if you regenerate it from the `altinnStudioApps` registry, run `npm run format` afterwards.

## Project layout

```
examples/             form and subform xml, by data type
server/src
  index.ts            express app, CORS, error middleware
  routes.ts           endpoints and zod schemas
  runService.ts       orchestrates create, upload, validate, advance
  runService.test.ts
  readService.ts      instance operations: list, get, validate, process, delete
  readService.test.ts
  stepRecorder.ts     shared request logging for both flows
  multipart.ts        hand-written multipart body, see the note below
  examples.ts         reads examples/, with a path traversal guard
  examples.test.ts
  appCatalogue.ts     generated list of known apps and their data types
  contentTypeGaps.ts  reports content types with no dummy attachment
  localtestClient.ts  GetTestUserToken, and the test user list
  localtestClient.test.ts
  tokenStore.ts       in-memory token store
  appService.ts       applicationmetadata, parties, content type resolution
  altinnClient.ts     fetch wrapper: bearer, timeout, never throws on non-2xx
  urls.ts             app url building
web/src
  App.tsx             state and wiring only, the pure parts live in lib/
  components/         TokenPanel, TargetPanel, PayloadPanel, ExamplePicker, FetchPanel, ProcessPanel, RunLog, CopyButton
  lib/curl.ts         a logged step as a curl command
  lib/formats.ts      content types, extensions and base64
  lib/download.ts     saving a data element as a file
  lib/fileUpload.ts   reading a picked file into a payload
  lib/payload.ts      where a loaded data element goes in the list
  lib/instanceTemplate.ts  dueBefore and visibleAfter as an instance body
  lib/logResults.ts   each api result as a run log entry
  lib/inputs.ts       normalising a pasted instance id and a repeat count
  styles.css          all the styling
```

Colour is used to encode things rather than to decorate:

- HTTP methods, so a long log can be scanned for the request that changed something. GET blue, POST green, PUT amber, DELETE red. The same colours appear in the "will call" URL previews, so a preview and its log entry read the same way.
- Status codes by class, since 4xx is usually something about the request and 5xx is the app falling over. 2xx green, 3xx blue, 4xx amber, 5xx red.
- Payload element badges by group, with the main form in the accent blue, subforms in violet and attachments left neutral.
- Which example a collapsed element was filled from, in the accent, so loaded and hand-typed content differ at a glance.
- Validation counts, amber for warnings only and red when there are errors.
- An element with no content, whose summary turns amber and whose example picker gets an accent border, because that is the thing to press next.

Everything else stays grey.

The UI is plain and dark only. It uses system fonts with no webfonts to load, a single accent colour, hairline borders, and no decoration. All colours are CSS variables in `:root` at the top of `styles.css`, so changing the theme means editing that one block.

### Why multipart is written by hand

`FormData.append(name, blob)` in Node always adds `filename="blob"` to the part's Content-Disposition header, and Altinn stores that as the data element's filename, so a prefilled form data element ends up named "blob". `multipart.ts` writes the body directly, so form data parts carry no filename and only real attachments get one.

## Limits

Everything is addressed relative to `ALTINN_APP_HOST`, so this tool only talks to a local Altinn. It has no knowledge of tt02 or production.

Files travel as base64 inside a json request, and the server parses bodies up to 25 MB, so the file picker refuses anything over 15 MB rather than letting express refuse it less clearly.

Token claims are decoded for display only. The signature is never verified here, because the app does that.

Payload and target state persist in `localStorage`, so a page refresh does not lose your work. Tokens are not stored in the browser. They are listed again from the server when the page loads.
