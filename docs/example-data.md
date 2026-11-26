---
title: Example data
nav_order: 7
---

# Example data

Example data comes from two places. The main form and subform examples are read from the FtPB testmotor at request time. Everything else is a file in `examples/`, laid out so that the directory name is the data type:

```
examples/
  forms/HoeringOgOffentligEttersynUttalelse/uttalelse.xml
  attachments/dummy.pdf
  attachments/dummy.png
```

Each data element's example picker lists what matches its data type. Loading a file also sets the element's content type.

Changing the data type clears the content and loads the new type's first example automatically, so picking a type leaves the element holding something valid to post. A type with no examples leaves the content empty. Two cases do not auto-load: pressing **Clear** stays cleared, and content restored from a previous session is never overwritten.

## Main forms from the testmotor

The testmotor at `TESTMOTOR_URL` serves the examples the DIBK test team maintains, out of an Azure file share, and stamps their date fields with a date ten days out on every request. Several forms only validate with dates inside the next fortnight (a ferdigattest's `bekreftelseInnen` and `utfoertInnen`, for example), so reading them from there keeps the dates inside the window. It is the same data the testmotor's own interface offers.

Four of its endpoints are used, all open and none carrying a token:

```
GET {TESTMOTOR_URL}/api/altinn-app                      the apps it holds data for, and each one's main form data type
GET {TESTMOTOR_URL}/api/xml/{appId}                     that app's example files, contents and all
GET {TESTMOTOR_URL}/api/attachment/{appId}              that app's attachment types, each with its predefined files
GET {TESTMOTOR_URL}/api/attachment/{appId}/{dataType}   one predefined file, named by a fileName header
```

Answers are cached for five minutes, which is also how long the testmotor caches its own reads of the share.

The picker is keyed on the app and not only on the data type, because the testmotor is keyed by app id: `fa-v3` and `fa-v5` are both filed under the data type `FA` and hold different data. An app the testmotor has no data for contributes no main form examples, and they come off disk instead, which covers `hoeringettersynuttalelse-v2`. `yarn workspace server run catalogue` lists the apps that have neither, see [below](#which-apps-have-example-data-at-all).

## Subforms from the testmotor

The testmotor holds subform examples too, as predefined attachments filed per app under the subform's data type. The same subform can hold different files under different apps: `DispensasjonssoeknadDataV1` does under `disp-v1` and `fts-v1`.

So the selected app's subforms are read through that app. A subform the selected app does not declare, which is every subform when the app is a subform app opened on its own or one the catalogue does not name, is read through the first catalogue app that declares it, so every subform still has examples whatever is selected.

If the testmotor cannot be reached, the picker says so rather than showing an empty list, in one line with the reason behind **More**: the url, the status and whatever body came back. There is no on-disk fallback for the main forms or the subforms. `TESTMOTOR_URL=` switches the whole thing off.

## Pointing at your own directory

For the examples kept as files, the tool can read your own directory:

```
ALTINN_EXAMPLE_DATA_DIR=/path/to/exampleData
```

It expects `forms/{dataType}/*.xml` and `attachments/*` under that directory. Either may be absent. Adding a file needs no restart, because the directory is read on each request. The numeric prefix in a name like `01_Maksimumsversjon.xml` is stripped for display but still determines the order.

## Dummy attachments

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

The dummies are for attachments only. A main form or subform accepts `application/xml` too, but when it has no examples of its own it is offered nothing rather than `dummy.xml`, which is not form data and would only be refused when posted.

A content type with no dummy is simply not offered. Adding one means dropping a file into the directory and listing its extension in `FORMATS` in `server/src/examples.ts`. For a one-off, **File from disk** on the element takes any file without it having to be shipped first.

## Finding the gaps

To find out which content types your own apps declare and which of them have no dummy, run this with localtest up:

```bash
yarn workspace server run gaps                              # walks the whole catalogue
yarn workspace server run gaps -- 1001 dibk/et-v4           # one or more specific apps
```

It probes each app's `applicationmetadata`, collects every `allowedContentTypes` entry, and prints which are covered, which are missing and which data types ask for them. The first argument is the LocalTest user id, defaulting to 1001. Apps in the catalogue that are not deployed locally are listed separately rather than treated as a gap.

## Which apps have example data at all

The other gap is whole apps rather than content types, and it needs no localtest, only the testmotor:

```bash
yarn workspace server run catalogue
```

It compares the app catalogue against the testmotor, which keeps its own list of the same apps, and says where each app's examples come from: the testmotor, disk, or nowhere. An app with no example data is one you cannot post to without writing the xml by hand. It also reports apps the testmotor holds that the catalogue does not name, which usually means the app is due an entry in `@arkitektum/ftpb-app-catalogue`, and the two disagreeing about a main form data type, which would put examples where nothing looks for them.

Subforms are checked as well as the apps you can target. A subform app is referenced by its parent rather than given a catalogue entry of its own, because its data is posted as a data element of the parent instance, but it still needs examples. The testmotor files those per parent, so each subform is checked once under every app carrying it, and one it could not ask about is listed as not checked rather than as missing.

The reply apps (a neighbour's reply to a nabovarsel, a hearing reply, and the like) are where gaps usually show up, since the testmotor holds the apps that send things out and not the replies. The one reply example on disk, `examples/forms/HoeringOgOffentligEttersynUttalelse/uttalelse.xml`, names the hearing it replies to as `{instanceOwnerPartyId}/{instanceGuid}` in `hoeringOgOffentligEttersynReferanse`, and that instance does not exist in your localtest until you point it at one you have posted.

## What the dummies are

The GML is a real Reguleringsplanforslag feature collection of about 950 kB, and the GeoJSON a real feature collection. Both are registered under their own content types rather than as plain XML or JSON, so the large GML does not become the default example for every XML attachment.

The other files are minimal but real, not padding with the right extension. The PDF is a one page document with correct xref offsets. The office and OpenDocument files are valid zip packages with the parts their formats require, and the OpenDocument ones put an uncompressed `mimetype` first as the spec demands. PNG, JPEG, GIF, BMP, WebP and SVG were each checked by decoding them in a browser. TIFF has no browser decoder, so its IFD was parsed back tag by tag instead. They carry no meaningful content, only enough structure to pass as genuine files.
