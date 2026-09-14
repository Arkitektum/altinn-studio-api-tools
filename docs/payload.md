---
title: Payload
nav_order: 6
---

# Payload

One editor card per data element, holding the data type, the content type, and the body. The content type defaults to what the app declares in `allowedContentTypes`, falling back to detection from the payload itself.

Elements collapse to a single row, so a payload with several of them stays readable. **Add data element** collapses the ones already there and leaves the new one open, since one element added by hand is one to work on. Elements that arrive as a set, from the validation report's **Add them** or from opening a saved payload, arrive folded: what you want to see is which of them came, not the first one's contents. **Collapse all** in the panel header folds the lot. A collapsed row still shows its data type, size and which example it came from, and an element with no content says so in the warning colour, since that is what blocks the post. Collapsing hides the editor rather than unmounting it, so nothing is lost and the state survives a reload.

## The editor

XML and JSON are coloured: element names in the accent blue, attribute names and JSON keywords in violet, strings in green, numbers in amber, and declarations, comments and punctuation faint. Element text and whitespace get no colour at all, since they are the bulk of any document and there would be nothing for the syntax to stand out against. A badge on the label's line names the language being coloured, and says nothing when the content is not something to colour.

**Full size** in the content's own top right corner opens the same editor in a window over the tool. It is the same state, so what you type there is there when you close it, and Escape or the backdrop closes it. The window carries the line that sits under the editor in the panel, how much content there is and which example it came from, above the editor the way a response body carries its type and size, so the two windows read the same way.

The button sits in the corner of the content rather than on the label's line, and says "Full size" rather than "Maximize", which named a window operation instead of what you get.

The colouring is a textarea with a coloured copy of its own text behind it, which keeps typing, undo, selection and the caret as the browser's rather than reimplementing an editor. Above 200,000 characters the colour is dropped and the text shown plain: the GML example alone is near a megabyte, and tokenizing that on every keystroke costs more than the colour is worth.

## Where content comes from

Three ways, and one more if you count reading it back:

- **Example data.** Each element has a picker listing the shipped files for its data type, so the common case needs no pasting. The test user is written into the form as it loads, see below. See [Example data](example-data.md).
- **File from disk.** For a file the shipped dummies do not cover, a real pdf or a real GML rather than a placeholder.
- **By hand.** Paste or type XML or JSON into the editor. **Format JSON** appears when the content looks like JSON.

## The test user goes into the form

A DIBK submission is refused when the identity it was sent with is not the identity written in it, so an example file with a company in it fails for everyone but that company. Loading an example writes the test user into it instead, and the line under the editor says which party you were made: `17 552 characters · from 01_Maksimumsversjon.xml · you are ansvarligSoeker`.

A form names several parties and only one of them is the sender. Which one is a priority list, and the first the form has wins:

| Acting as                              | The sender is the first of                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Yourself, with a fødselsnummer         | `ansvarligSoeker`, `plankonsulent`, `tiltakshaver`, `forslagsstiller`                                |
| A company, with an organisasjonsnummer | `ansvarligForetak`, `kommune`, `plankonsulent`, `ansvarligSoeker`, `tiltakshaver`, `forslagsstiller` |

In that one party, five values are set: `navn`, the number in the field for its kind with the other one cleared, and `partstype/kodeverdi` and `partstype/kodebeskrivelse`. What the party is called follows both what you are and which form it is.

| Acting as | Data type                    | partstype             |
| --------- | ---------------------------- | --------------------- |
| Yourself  | any                          | `Privatperson`        |
| A company | `AN`, `SA`, `KO`             | `Foretak`             |
| A company | `HoeringOgOffentligEttersyn` | `Offentlig myndighet` |
| A company | anything else                | `Organisasjon`        |

Who you are is the party the instance is for, read from the app's own party list, falling back to the token's own claim before the app has been read. It is the same identity the validation report is sent with, so the two agree by construction rather than by luck.

Four things are worth knowing about how it is written, all in `lib/formIdentity.ts`:

- **Only an example is written into.** The `example` marker is what says an element still holds a shipped file unedited, and an edit clears it, so the tool stops writing into an element the moment the text is yours. A file you picked off disk is yours from the start and is never touched.
- **It follows the identity rather than the moment of loading.** The app is read for its parties while the first example is already loading, and the party can change after that, so it is written again whenever who you are changes. Writing the same identity into a form it is already in changes nothing, so it settles.
- **Only the five values change.** The edit is made in the text rather than through a parser and a serializer, because a round trip would reformat the document you are looking at and the one the [comparison with the stored xml](reading-data-back.md#comparing-with-the-stored-xml) is about. Everything else comes out byte for byte as it went in.
- **A field the form does not carry is put in where the form keeps it.** These forms do not agree on the order, and one has `foedselsnummer` after `partstype` where another has it last, after the contact person. An xml schema counts the order, so the position is taken from another party element in the same form, which is the same type as this one. A form with nothing to learn from falls back to the usual order.

The one thing it cannot do is take back what it wrote. In the five forms where the two lists pick different parties, `AN`, `SA`, `KO` and the two hearing forms, switching between yourself and a company writes the new identity into the new party and leaves the old one holding the old. Loading the example again is the way out.

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

One checkbox, **Sign and submit once it is posted**, which calls `PUT .../process/next` after the data is stored, naming the action for the task the instance is in. It is the same step as pressing send in the app, and it fails if validation does not pass, with the data posted either way. The wording says the step rather than the action, since which task the instance lands in is the app's business and there is nothing to read it off yet. The same call sits on its own button in the [Process](process.md) panel, for an instance you are not posting to.

## Validation report

**Validation report**, under the elements, posts the payload to the DIBK validation service and puts what it answers in the run log. It is the one request this tool makes that leaves your machine, so it waits to be pressed and says where it goes.

It exists because `applicationmetadata` is not a reliable answer to what a submission needs. The `minCount` an app declares does not match what the validation insists on, and the service does know, so the question goes where the answer is.

The payload becomes a submission on the way out, which is a translation rather than a decision, since the tool already knows which element is which:

| Sent as                            | Taken from                                                                |
| ---------------------------------- | ------------------------------------------------------------------------- |
| `formData`                         | The main form element's content                                           |
| `subForms[].formName`              | The subform element's Altinn data type id                                 |
| `subForms[].subFormData`           | Its content                                                               |
| `attachments[].attachmentTypeName` | The data type of everything else with content                             |
| `attachments[].filename`           | Its filename, else the example it came from, else its data type           |
| `attachments[].fileSize`           | Bytes, decoded for base64 and counted as utf-8 for text                   |
| `authenticatedSubmitter`           | The organisation number of the party, its person number, else the token's |

An element with nothing in it is left out, and a payload with no main form has nothing to ask about, which the line beside the button says instead of sending half a submission. The submitter comes from the app's parties, so pressing the button before the app has been read falls back to the token's own person number.

### What it says is required

The report is one message per rule the service has something to say about, and the ones about documents name the document. Those become the line under the button: **The validation service wants 4 more documents in this ET submission**, each named with the service's own reason under it and the checklist point beside it, and a button that adds one element per document. Each lands folded, with its data type and content type filled in, and the example picker loads the first example for it, so a full payload is a click from an incomplete one.

`lib/validationReport.ts` does the reading, and four things about it are worth knowing:

- **A rule about a document has `Vedlegg` in its reference**, `Ettrinn.Vedlegg.Situasjonsplan`, and the last segment is the attachment type. Everything else the report says is about what is inside the form, which is no payload element, so it is counted and left to the log: **And 2 things about the form's own content**.
- **A rule that takes any one of several documents quotes them**, so the names are read out of the prose as well as off the rule. `SnittPlanFasadeTegninger` is not something to attach; the six drawings its message lists are, and the line offers them as `TegningNyPlan or TegningNyFasade`.
- **A name is matched against the data types the app declares**, and only the matches are offered, since a type the app does not have is not one you can select. A name that matches nothing is still named, and says it cannot be added here.
- **An error is what the submission needs and a warning is what the service advises**, listed as one line of names. Adding one is your call, so it is a line rather than a list with a button.

What is already in the payload, or already on the instance, drops off the list. That is a live count against a fixed report, so the payload can move past what was asked about: any edit at all makes the report stale, and it says so, because the service reads the form to decide which rules apply and there is no change too small to matter.

The whole report goes to the run log either way, request and response, since the panel reads only the part of it about documents. `VALIDATION_URL` points the call elsewhere or, emptied, hides the button.

## Saved payloads

**Open** and **Save** in the panel header, each opening a window over the tool. A run of a form and three subforms takes a few clicks to put together, and a payload you post twice a week is worth keeping.

They are two buttons rather than a section of the panel because neither is part of a payload: one is what you do before writing one, the other after finishing it. Windows rather than a fold, because opening a saved payload replaces every element in the panel behind it, and a list you are about to do that with deserves the foreground while you pick from it. **Open** counts what it holds and is disabled with nothing in it.

**What is kept depends on where the content came from.** An element still holding an unedited example is kept as a reference to that file, `{kind, group, name}`, and nothing else. Loading the payload reads the file as it stands then, so a payload saved today posts the corrected example tomorrow. That is the common case here: the examples are the shipped test data, and a saved payload is usually a combination of them rather than a document of its own.

An element you have edited, typed, or picked off disk has no file to point at, so its text is kept. Editing an example is what tells the two apart: the first keystroke drops the reference, the same moment the editor stops saying which example the content came from.

The file is authoritative for everything it knows about itself when the payload is loaded, its content type included. An example retyped from `text/xml` to `application/xml` since it was saved comes back as what it is now, which is the point of keeping a reference rather than a copy.

**An example that has gone** leaves its element behind, with its data type and no content, and the load says which files it could not find, in the panel rather than in the window it just closed. A payload quietly one element short would post quietly too. The example picker leaves that gap alone rather than filling it with the data type's first file, since the gap is what the payload said.

Saving under a name that is already taken replaces it, and the button in the save window reads **Replace** rather than **Save** while it would. Loading over a payload that has content in it asks first, in the row itself, since that content is about to go. Deleting asks twice, like everything else that cannot be undone. Both windows are the same `<dialog>` the pdf preview uses, so Escape, the backdrop and the focus trap are the browser's.

They are kept in `localStorage`, in this browser, and go no further. A payload holding a file picked off disk keeps that file's bytes, which is the one way to fill the browser's storage quota from here: the save says so rather than failing quietly. Everything else in here is a reference or a document, and neither is large.
