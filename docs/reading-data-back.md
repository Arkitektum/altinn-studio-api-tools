---
title: Reading data back
nav_order: 9
---

# Reading data back

**Instances** is the list of what the party has, plus a **New instance** row, and what is selected there is both what a post goes to and what the rest of the tool is pointed at. Selecting one reads and validates it, which fills the panels below: **Data element**, then **Compare with stored** for the element picked there, then **Pdf**.

None of those have fields of their own. They work on whatever is selected in Instances, and each names in its header what that is.

Every request appears in the run log alongside posts, with method, URL, status, timing, and body.

## Instances

`GET /{org}/{app}/instances/{party}/active`, the app's own list endpoint, the one its frontend uses to offer an unfinished form back to the user. It needs a party but no guid, since finding the guid is the point of it.

There is no button for it. It is one read, and a panel whose whole purpose is showing the list may as well ask for it: the listing runs once there is a token, an app and a party, debounced because the party is typed a character at a time, and attempted once per target so a party that 403s is not retried forever. **Refresh** in the panel header lists again, and a post refreshes it too, since a post either makes an instance or changes one.

The first row is **New instance**, which is not an instance yet: with it selected, posting creates one. Under it come the party's instances, each the first eight characters of its guid, when it was last changed and by whom, newest first.

Clicking a row points the whole tool at that instance: what a post adds data to, and what the panels below it read. The selected row is marked.

**Open** on a row is a link into the app, which is a session of its own. The token here lives in server memory so the browser never receives one, which means Altinn bounces to LocalTest's user picker until you have logged in there, and the deep link's fragment is dropped on the way back so you land on the app root. **Log in** in the panel header is that same picker, and opening the instance again afterwards works.

An instance whose process has ended leaves Altinn's active list, so the one being worked on can be absent from it, which happens after a post that advanced the process. It keeps a row of its own, marked "not in the active list", rather than leaving the list with nothing selected while the post button says otherwise. **Open** is the deep link into the app, which needs a LocalTest session in the browser, see [Validation and the run log](validation-and-log.md#run-log).

Altinn lists the instances whose process has not ended, so an archived one is not here. **Other instance** at the bottom of the list is the way to one anyway: it reveals a field that takes a guid, or the whole `510001/99d0632c-…` pair as Altinn writes it, in which case the party comes along too. What you reach that way gets the same row as any other, marked "not in the active list", and is just as readable and deletable.

Within a session it rarely comes up, since an instance stays selected after a post even once its process ends. A listing belongs to one app and one party, so changing either drops it. A party that genuinely has no instances says so, while a failed request does not, since "none" is not something we know in that case.

## Reading and validating, on selection

`GET /{org}/{app}/instances/{party}/{guid}` and then `GET …/validate`, without a button: selecting an instance is asking to see it, and both are reads. It happens once per selection, debounced because a guid typed into **Other instance** arrives a character at a time, and a post marks its own instance as read since it already read and validated it.

The two land as one run log entry, "Read instance", with the steps renumbered across both, the same way a post folds in its follow-ups. Two entries per click would have been noise.

Besides logging the whole response, the read fills the data element select so you do not have to copy a dataGuid by hand, and fills the [Process](process.md) panel, which needs no request of its own. The validation fills the [Validation](validation-and-log.md) panel. A read that failed skips the validation, which would only fail the same way.

## Get data element

`GET /{org}/{app}/instances/{party}/{guid}/data/{dataGuid}` for whichever element is selected. The select labels each one by data type, filename, content type, and size. The first is preselected after reading an instance, so fetching one is a single click.

The request goes out with `Accept: */*`, and the two kinds of data element answer differently.

A data type with `appLogic` is served through the app's model: Altinn reads the stored XML, deserialises it into the model class and returns that object, which comes back as JSON. A data type without `appLogic`, a `Valideringsrapport` for instance, is streamed as stored, so its XML arrives as XML. Asking for `application/xml` instead was tried and changes nothing, because the app registers no XML output formatter; asking for JSON would be worse, since it would stop the streamed ones coming back as stored.

Two content types are in play, and the tool shows both: the picker labels an element with the content type Altinn has it **stored** under, from the instance's `data` array, while the log entry's **Content type** row is what the response actually carried. They differ for form data, and that is Altinn's doing rather than a setting here.

### What you can do with it

What came back is held, so it can be used rather than only read:

- **Download** saves it as a file. The name is whatever Altinn stored, since an attachment was uploaded under a name someone chose, and otherwise the data type with an extension from the content type, so `ET` becomes `ET.xml`.
- **Copy content** puts the text on the clipboard. Binary content offers no copy button, because copying base64 as text hands over the encoding rather than the file.

Picking another data element, or another instance, drops what is held instead of offering to download an element you are no longer looking at.

There was a **Load into payload** button here, putting what came back into the payload editor for a round trip. It is gone: what a form data element returns is the model as JSON, not the xml that was stored, so it was never the thing you wanted to post back, and the panel below compares the two rather than editing one into the other. Downloading it and picking the file up as a file from disk does the same job when it is really wanted.

### Validating an element

**Validate data element** calls `GET .../data/{dataGuid}/validate`, which Altinn answers against the task the element's data type belongs to. The button is disabled once that no longer holds: an ended process has no task to validate against, and an instance sitting in a later task would be answering about rules this element is not covered by. The reason takes the place of the URL preview, so the panel says why rather than making a call whose answer is about somewhere the instance has left.

A data type the app declares with no `taskId` is never blocked. Nothing was said about which task it belongs to, so there is nothing to compare against, and guessing would take away a request that works.

## Comparing with the stored xml

Reading a form data element gives the model as JSON, so what Altinn actually wrote to storage is not visible anywhere else. That matters because the model is lossy in both directions: a field it has no place for is dropped on the way in, and a value it formats its own way is rewritten, neither with any complaint. The **Compare with stored** panel puts the two side by side and reports only the differences that mean something.

The right-hand side comes from LocalTest's storage api, `GET {localtest}/storage/api/v1/instances/{party}/{guid}/data/{dataGuid}`, which serves the blob itself rather than the model. A 403 there almost always means the token may not act for that party, not that the element is missing, and the panel says so rather than leaving you to guess.

The left-hand side is the xml as written, which is always the payload element of the same data type: that is where the file you are working on already is. There was a picker offering the example files as well, and it was never used for anything else, so it is gone. With no payload element of that type the panel says so and points at the example files and the file picker, which is where content for one comes from.

Differences are reported as paths, with three kinds:

| Kind        | What it means                                                                          |
| ----------- | -------------------------------------------------------------------------------------- |
| **dropped** | The file has it and the stored xml does not. The model had no place for it.            |
| **added**   | The stored xml has it and the file does not. Usually a value the model defaulted.      |
| **changed** | Both have it and the values differ. Usually a date, a number or a boolean reformatted. |

Each row also carries the field's declared type, read from the app's own json schema at `{app}/api/jsonschema/{dataType}`, which Studio generates from the same XSD the model came from. The XSD type is preferred over the json schema one, because json schema calls a date a string and the XSD does not, and an enumeration says how many values it allows, which is often why a value was rejected.

A row with no type is informative rather than incomplete: it means the schema has no entry for that path, which for a dropped field is exactly why it was dropped. Nothing is guessed, and a schema that will not load costs the types and not the comparison. `schemaTypes.test.ts` covers the resolution, including `$ref` into `$defs`, repeating groups through `items`, attributes however the schema spells them, and a schema that offers a choice, where picking a branch would be a guess.

So `/ettrinn/eiendom/festenr dropped` with no type says the model has no such field at all, and `/ettrinn/dato changed 2026-09-09 → 2026-09-09T00:00:00 date` says the model reformatted a date. A whole subtree that went missing is reported once at its root rather than leaf by leaf, and repeated siblings are told apart by position, `/ettrinn/part[2]/navn`.

**Hide altinnRowId** is on by default. Altinn stamps every row of a repeating group with an `altinnRowId`, a guid it uses to keep track of rows, so the stored xml has one per row and a file written by hand has none. Left in, they are the majority of the report and bury everything else. The count of what was held back is always shown, so nothing disappears quietly, and the toggle is a view rather than a request: turning it off costs no round trip because the server reports everything it found either way.

The run log names them apart for the same reason, as "1, plus 2 altinnRowId", so the entry does not read as three problems when the panel is showing one.

### The same thing over everything at once

The panel confirms a problem you already suspect. `npm run diff --workspace server` finds the ones you do not:

```bash
npm run diff --workspace server                                 # the whole catalogue
npm run diff --workspace server -- 1001 dibk/varselplanoppstart-v3
npm run diff --workspace server -- 1001 dibk/et-v4 --keep
```

For every form data type an app declares and every example file on disk for it, it creates an instance, posts the file, compares the stored xml with it, and prints what the model changed, with the field types. The first argument is the LocalTest user id, defaulting to 1001, and the party is the token's own, which is the one it is certainly allowed to post as.

Each instance is hard deleted once it has been compared, because a sweep that leaves a hundred instances behind is worse than no sweep. `--keep` leaves them, for when a difference needs looking at in the panel afterwards.

The summary counts four outcomes: identical, row ids only, differs, and could not. Only the third is a finding, and each one lists up to five differences with their paths and types. An app the catalogue names but localtest does not serve is listed separately rather than counted as a failure, the same way the content type sweep does it.

What it ignores is everything that carries no meaning: whitespace, the xml declaration, comments, self-closing versus longhand empty elements, attribute order and namespace prefixes. Two documents that differ only in those ways are reported as identical, which is the point: the noise is what made this cumbersome by hand. `xmlDiff.test.ts` pins all of it, and `compareService.test.ts` covers the storage read.

## Validate a data element

The instance's own validation runs with the read above. **Validate data element** is its own button, since it is about one element: `GET /{org}/{app}/instances/{party}/{guid}/data/{dataGuid}/validate`. Altinn answers with an array of issues, empty when everything passes.

The verdict summarises them by severity, for example "1 error, 1 warning, 1 other", and the full array is in the step body. Severity 1 counts as an error and 2 as a warning, following Altinn's `ValidationIssueSeverity`. The issues themselves are listed in the [Validation](validation-and-log.md) panel rather than left as raw JSON.

## Pdf

`GET /{org}/{app}/instances/{party}/{guid}/pdf/preview`, the pdf the app would archive. Altinn calls it the receipt pdf, and the panel does not, because some of the forms are themselves called receipts and the word would mean two things a line apart. It is the quickest way to see what the form data turns into without walking the process to the end.

It has a panel of its own, last, because it is a different kind of action: everything above it reads data, and this renders a document from it. It is also the one read that is still a button, since rendering a pdf on every selection would be wasteful.

The pdf arrives base64 encoded, is turned into a blob in the browser and shown in the browser's own pdf viewer, so nothing is written to disk and no viewer library is bundled. It opens in a window over the tool rather than in a panel below it: it is something you look at and dismiss, not something you work in. That window is a native `<dialog>`, so Escape closes it, the backdrop dims what is behind, and focus stays inside without any of that being written by hand. Clicking the backdrop closes it too, and **Open in new tab** gives you the browser's full viewer with print and save.

One preview is held at a time. Rendering again replaces it and revokes the previous blob url, a failed render clears it rather than leaving a stale pdf looking current, and selecting another instance clears it along with that instance's validation results.

## Deleting an instance

Every row in **Instances** has a delete, for clearing up after a test run. It calls `DELETE /{org}/{app}/instances/{party}/{guid}?hard={true|false}` for that row, not for whatever is selected.

Soft is the default: Altinn marks the instance deleted, which takes it out of the active list while leaving it in storage. **Hard delete** removes it outright and cannot be undone, so it is a checkbox under the list rather than the default reading of a `hard` parameter that happens to be absent.

Delete asks twice. The first click arms that row's button, which then says which kind of delete it is about to do. One row is armed at a time, and a listing that changed underneath drops a pending confirmation, so a second click never lands on an instance you did not mean. A refusal from Altinn, a locked instance or a party you may not act for, lands in the run log with the app's own reason.

Afterwards the instance leaves the list. If it was the one being inspected, the guid is cleared too, which takes the data elements, the process state and the validation issues with it, since all of them described an instance that is no longer there.
