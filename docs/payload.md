---
title: Payload
nav_order: 6
---

# Payload

One editor card per data element, holding the data type, the content type, and the body. The content type defaults to what the app declares in `allowedContentTypes`, falling back to detection from the payload itself.

Elements collapse to a single row, so a payload with several of them stays readable. Adding an element collapses the ones already there and leaves the new one open, and **Collapse all** in the panel header folds the lot. A collapsed row still shows its data type, size and which example it came from, and an element with no content says so in the warning colour, since that is what blocks the post. Collapsing hides the editor rather than unmounting it, so nothing is lost and the state survives a reload.

## Where content comes from

Three ways, and one more if you count reading it back:

- **Example data.** Each element has a picker listing the shipped files for its data type, so the common case needs no pasting. See [Example data](example-data.md).
- **File from disk.** For a file the shipped dummies do not cover, a real pdf or a real GML rather than a placeholder.
- **By hand.** Paste or type XML or JSON into the editor. **Format JSON** appears when the content looks like JSON.
- **Read back off an instance.** **Load into payload** in the Data element panel puts a stored data element in here, see [Reading data back](reading-data-back.md).

## File from disk

It is read in the browser: text formats arrive in the editor and stay editable, and anything else becomes base64 that the server decodes before the request goes to Altinn, so what gets stored is byte identical to the file you picked.

The content type follows the browser's own guess, falling back to the extension where the browser has none, which is the case for `.gml` and `.geojson`. Either way a spelling the app declared wins over an equivalent one it did not, so an app asking for `text/xml` gets `text/xml`. Where nothing the app declares looks like the file, the honest guess is posted and the app is left to refuse it, since that is more informative than quietly relabelling it. The file dialog itself filters to the types the app declares.

Only attachments carry the filename to Altinn. Form data and subforms do not, for the reason the multipart body is written by hand, which [ARCHITECTURE.md](https://github.com/Arkitektum/altinn-studio-api-tools/blob/main/ARCHITECTURE.md) explains.

Files travel as base64 inside a json request and the server parses bodies up to 25 MB, so the picker refuses anything over 15 MB rather than letting express refuse it less clearly.

## Binary content

Base64 elements show a placeholder rather than a textarea, since editing base64 as text would corrupt the file, and the picker or **Clear** are the only ways to change it. The data element is posted with a `Content-Disposition` filename. Reading a binary data element back returns base64 too, for the same reason.

## The data type picker

Grouped as **Main form**, **Sub forms** and **Attachments**, read from the app's `mainFormDataType` and `subFormDataTypes`. Anything the app declares that is not one of those counts as an attachment.

Four data types the app produces itself are left out, since they are not something you post: `Signatur`, `FoedselsnummerTiltakshaver`, `Valideringsrapport` and `ref-data-as-pdf`. A hidden type that is already selected on an element stays selectable, so switching between apps never blanks a selection.

Apps that declare neither field fall back to grouping by app logic, where a single-instance form data type is the main form and any other is a subform.

Changing the data type clears the content and content type, since both belonged to the type you left, and the picker then loads the new type's first example.

## After upload

One checkbox, **Advance process to next task**, which calls `PUT .../process/next` after the data is stored. It submits the step and fails if validation does not pass. The same call sits on its own button in the [Process](process.md) panel, for an instance you are not posting to.
