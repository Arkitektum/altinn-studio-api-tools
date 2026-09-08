---
title: Reading data back
nav_order: 9
---

# Reading data back

Two panels. **Instances** lists what the party has, so one can be opened or deleted, and **Fetch** reads whichever one is selected.

Posting already runs the instance get and validate automatically, so Fetch is for an instance you did not just create. It has no fields of its own: it reads whatever is selected in Instances, and says which party and instance that is.

Every request appears in the run log alongside posts, with method, URL, status, timing, and body.

## Instances

`GET /{org}/{app}/instances/{party}/active`, the app's own list endpoint, the one its frontend uses to offer an unfinished form back to the user. It needs a party but no guid, since finding the guid is the point of it.

There is no button for it. It is one read, and a panel whose whole purpose is showing the list may as well ask for it: the listing runs once there is a token, an app and a party, debounced because the party is typed a character at a time, and attempted once per target so a party that 403s is not retried forever. **Refresh** in the panel header lists again, and a post refreshes it too, since a post either makes an instance or changes one.

Each row is the first eight characters of the guid, when it was last changed and by whom, newest first. Clicking a row points the whole tool at that instance: Fetch, Process, and the existing instance destination. The row for the selected one is marked. **Open** is the deep link into the app, which needs a LocalTest session in the browser, see [Validation and the run log](validation-and-log.md#run-log).

Altinn lists the instances whose process has not ended, so an archived one is not here. There is nowhere to paste a guid either, which means an instance whose process ended in an earlier session cannot be reached from the UI at all; `/api/instances` still takes any guid, see [API](api.md). Within a session it is not a problem, since the guid stays selected after a post even once the process ends. A listing belongs to one app and one party, so changing either drops it. A party that genuinely has no instances says so, while a failed request does not, since "none" is not something we know in that case.

## Get instance

`GET /{org}/{app}/instances/{party}/{guid}`. Besides logging the whole response it reads the instance's `data` array and fills the data element select, so you do not have to copy a dataGuid by hand. It also fills the [Process](process.md) panel, which needs no request of its own.

## Get data element

`GET /{org}/{app}/instances/{party}/{guid}/data/{dataGuid}` for whichever element is selected. The select labels each one by data type, filename, content type, and size. The first is preselected after reading an instance, so fetching one is a single click.

The request goes out with `Accept: */*`, because asking for JSON would stop Altinn returning stored XML. XML comes back verbatim and JSON comes back parsed.

### What you can do with it

What came back is held, so it can be used rather than only read:

- **Download** saves it as a file. The name is whatever Altinn stored, since an attachment was uploaded under a name someone chose, and otherwise the data type with an extension from the content type, so `ET` becomes `ET.xml`.
- **Copy content** puts the text on the clipboard. Binary content offers no copy button, because copying base64 as text hands over the encoding rather than the file.
- **Load into payload** puts it in the [Payload](payload.md) panel, which is the round trip: read a stored element, change one field, post it again.

Picking another data element, or another instance, drops what is held instead of offering to download an element you are no longer looking at.

### The round trip

**Load into payload** reuses an element that is standing empty rather than adding a second one next to it, and otherwise appends it with the others collapsed, so the loaded element is the one in front of you. The collapsed row and the editor hint both say `instance 99d0632c` where an example file would have named itself, so loaded and shipped content never look alike. A content type parameter is dropped on the way in, so a stored `application/xml; charset=utf-8` does not become an extra option in the picker.

The destination is deliberately left alone. Posting it back to the same instance and using it as the payload for a new one are both real cases, and only you know which this is, so pick the destination in Target as usual. Posting it back to the same instance needs nothing else: it is still the selected one, and a form data type with `maxCount: 1` is replaced with `PUT` rather than rejected, see [Max count behaviour](posting.md#max-count-behaviour).

## Validate

**Validate instance** calls `GET /{org}/{app}/instances/{party}/{guid}/validate` and **Validate data element** calls `GET /{org}/{app}/instances/{party}/{guid}/data/{dataGuid}/validate`. Altinn answers with an array of issues, empty when everything passes.

The verdict summarises them by severity, for example "1 error, 1 warning, 1 other", and the full array is in the step body. Severity 1 counts as an error and 2 as a warning, following Altinn's `ValidationIssueSeverity`. The issues themselves are listed in the [Validation](validation-and-log.md) panel rather than left as raw JSON.

## Preview pdf

`GET /{org}/{app}/instances/{party}/{guid}/pdf/preview`, the receipt pdf the app would archive. It is the quickest way to see what the form data turns into without walking the process to the end.

The pdf arrives base64 encoded, is turned into a blob in the browser and shown in the browser's own pdf viewer, so nothing is written to disk and no viewer library is bundled. **Open in new tab** gives you the full viewer with print and save, and **Close preview** puts the panel away.

One preview is held at a time. Rendering again replaces it and revokes the previous blob url, a failed render clears it rather than leaving a stale pdf looking current, and selecting another instance clears it along with that instance's validation results.

## Deleting an instance

Every row in **Instances** has a delete, for clearing up after a test run. It calls `DELETE /{org}/{app}/instances/{party}/{guid}?hard={true|false}` for that row, not for whatever is in the Fetch fields.

Soft is the default: Altinn marks the instance deleted, which takes it out of the active list while leaving it in storage. **Hard delete** removes it outright and cannot be undone, so it is a checkbox under the list rather than the default reading of a `hard` parameter that happens to be absent.

Delete asks twice. The first click arms that row's button, which then says which kind of delete it is about to do. One row is armed at a time, and a listing that changed underneath drops a pending confirmation, so a second click never lands on an instance you did not mean. A refusal from Altinn, a locked instance or a party you may not act for, lands in the run log with the app's own reason.

Afterwards the instance leaves the list. If it was the one being inspected, the guid is cleared too, which takes the data elements, the process state and the validation issues with it, since all of them described an instance that is no longer there.
