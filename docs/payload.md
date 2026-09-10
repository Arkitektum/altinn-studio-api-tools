---
title: Payload
nav_order: 6
---

# Payload

One editor card per data element, holding the data type, the content type, and the body. The content type defaults to what the app declares in `allowedContentTypes`, falling back to detection from the payload itself.

Elements collapse to a single row, so a payload with several of them stays readable. Adding an element collapses the ones already there and leaves the new one open, and **Collapse all** in the panel header folds the lot. A collapsed row still shows its data type, size and which example it came from, and an element with no content says so in the warning colour, since that is what blocks the post. Collapsing hides the editor rather than unmounting it, so nothing is lost and the state survives a reload.

## The editor

XML and JSON are coloured: element names in the accent blue, attribute names and JSON keywords in violet, strings in green, numbers in amber, and declarations, comments and punctuation faint. Element text and whitespace get no colour at all, since they are the bulk of any document and there would be nothing for the syntax to stand out against. A badge on the label's line names the language being coloured, and says nothing when the content is not something to colour.

**Maximize** opens the same editor in a window over the tool. It is the same state, so what you type there is there when you close it, and Escape or the backdrop closes it.

The colouring is a textarea with a coloured copy of its own text behind it, which keeps typing, undo, selection and the caret as the browser's rather than reimplementing an editor. Above 200,000 characters the colour is dropped and the text shown plain: the GML example alone is near a megabyte, and tokenizing that on every keystroke costs more than the colour is worth.

## Where content comes from

Three ways, and one more if you count reading it back:

- **Example data.** Each element has a picker listing the shipped files for its data type, so the common case needs no pasting. See [Example data](example-data.md).
- **File from disk.** For a file the shipped dummies do not cover, a real pdf or a real GML rather than a placeholder.
- **By hand.** Paste or type XML or JSON into the editor. **Format JSON** appears when the content looks like JSON.

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

## What the app requires

The app says what it cannot do without, and the panel says whether it is there. A data type in `applicationmetadata` carries a `minCount` and a `taskId`: completing that task needs at least that many data elements of the type, and `process/next` refuses while one is short. The tool already reads that metadata when it probes the app, so this costs no request.

A line above **Add data element** names what is missing, `Task_1 also needs 1 GjennomfoeringsplanDataV7 and 2 vedlegg elements`, with a button that adds one element per element short. Each lands with its data type and content type filled in, and the example picker loads the first example for it the way it does for any new element, so a full payload is one click from an empty one.

The counting is done in `lib/requiredData.ts`, and four things are worth knowing about it:

- **The task decides the list.** A type bound to another task is not what this step is waiting for. With an instance selected the task is the one it sits in, so the list follows it through the process. Without one there is no instance to ask, and metadata never names the first task of a process, so the main form's own task stands in: a new instance starts where its form does.
- **What the instance already holds counts.** Altinn counts data elements, and it makes no difference to the count whether this tool is about to post one or posted it an hour ago.
- **What the app produces itself is left out**, the same list the picker hides. A receipt pdf the app writes at the end of the process is required and is not yours to add.
- **An auto-created form data element counts, which is true and not the whole truth.** Altinn creates it with the instance, empty, so the count is met while the form is not filled in.

Which is the honest limit of the whole thing: it counts data elements. Whether the xml inside one is complete is the model and the app's own validators talking, and nothing in the metadata knows it. That is what validation is for, so the line never promises the instance will pass, only that nothing it can count is missing.

## After upload

One checkbox, **Sign and submit once it is posted**, which calls `PUT .../process/next` after the data is stored, naming the action for the task the instance is in. It is the same step as pressing send in the app, and it fails if validation does not pass, with the data posted either way. The wording says the step rather than the action, since which task the instance lands in is the app's business and there is nothing to read it off yet. The same call sits on its own button in the [Process](process.md) panel, for an instance you are not posting to.

## Saved payloads

**Open** and **Save** in the panel header, each opening a window over the tool. A run of a form and three subforms takes a few clicks to put together, and a payload you post twice a week is worth keeping.

They are two buttons rather than a section of the panel because neither is part of a payload: one is what you do before writing one, the other after finishing it. Windows rather than a fold, because opening a saved payload replaces every element in the panel behind it, and a list you are about to do that with deserves the foreground while you pick from it. **Open** counts what it holds and is disabled with nothing in it.

**What is kept depends on where the content came from.** An element still holding an unedited example is kept as a reference to that file, `{kind, group, name}`, and nothing else. Loading the payload reads the file as it stands then, so a payload saved today posts the corrected example tomorrow. That is the common case here: the examples are the shipped test data, and a saved payload is usually a combination of them rather than a document of its own.

An element you have edited, typed, or picked off disk has no file to point at, so its text is kept. Editing an example is what tells the two apart: the first keystroke drops the reference, the same moment the editor stops saying which example the content came from.

The file is authoritative for everything it knows about itself when the payload is loaded, its content type included. An example retyped from `text/xml` to `application/xml` since it was saved comes back as what it is now, which is the point of keeping a reference rather than a copy.

**An example that has gone** leaves its element behind, with its data type and no content, and the load says which files it could not find, in the panel rather than in the window it just closed. A payload quietly one element short would post quietly too. The example picker leaves that gap alone rather than filling it with the data type's first file, since the gap is what the payload said.

Saving under a name that is already taken replaces it, and the button in the save window reads **Replace** rather than **Save** while it would. Loading over a payload that has content in it asks first, in the row itself, since that content is about to go. Deleting asks twice, like everything else that cannot be undone. Both windows are the same `<dialog>` the pdf preview uses, so Escape, the backdrop and the focus trap are the browser's.

They are kept in `localStorage`, in this browser, and go no further. A payload holding a file picked off disk keeps that file's bytes, which is the one way to fill the browser's storage quota from here: the save says so rather than failing quietly. Everything else in here is a reference or a document, and neither is large.
