---
title: Example data
nav_order: 7
---

# Example data

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

## Pointing at your own directory

These files were copied from the example data used by our other Altinn tooling. To avoid maintaining a second copy, point the tool at your canonical directory instead:

```
ALTINN_EXAMPLE_DATA_DIR=/path/to/exampleData
```

It expects `forms/{dataType}/*.xml`, `subforms/{dataType}/*.xml` and `attachments/*` under that directory. Any of them may be absent. Adding a file needs no restart, because the directory is read on each request.

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

A content type with no dummy is simply not offered. Adding one means dropping a file into the directory and listing its extension in `FORMATS` in `server/src/examples.ts`. For a one-off, **File from disk** on the element takes any file without it having to be shipped first.

## Finding the gaps

To find out which content types your own apps declare and which of them have no dummy, run this with localtest up:

```bash
npm run gaps --workspace server                              # walks the whole catalogue
npm run gaps --workspace server -- 1001 dibk/et-v4           # one or more specific apps
```

It probes each app's `applicationmetadata`, collects every `allowedContentTypes` entry, and prints which are covered, which are missing and which data types ask for them. The first argument is the LocalTest user id, defaulting to 1001. Apps in the catalogue that are not deployed locally are listed separately rather than treated as a gap.

## What the dummies actually are

The GML is a real Reguleringsplanforslag feature collection of about 950 kB, and the GeoJSON a real feature collection. Both are registered under their own content types rather than as plain XML or JSON, so the large GML does not become the default example for every XML attachment.

The other files are minimal but real, not padding with the right extension. The PDF is a one page document with correct xref offsets. The office and OpenDocument files are valid zip packages with the parts their formats require, and the OpenDocument ones put an uncompressed `mimetype` first as the spec demands. PNG, JPEG, GIF, BMP, WebP and SVG were each checked by decoding them in a browser. TIFF has no browser decoder, so its IFD was parsed back tag by tag instead. They carry no meaningful content, only enough structure to pass as genuine files.

Legacy Office formats are not included, because `.doc` and `.xls` are OLE2 compound files and hand building a valid one is a different order of effort.

Binary formats travel to the server as base64 and are decoded to bytes before the request goes to Altinn, so what gets stored is byte identical to the file on disk.
