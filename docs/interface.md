---
title: The interface
nav_order: 3
---

# The interface

Three columns: the rail on the left, the panels you work down in the middle, and what came back on the right, the validation results and the run log.

The test user sits at the top of the working column. The width goes to the log, since that is where xml, a response body and a curl command are read.

## The rail

The rail shows each step in order, what it holds and where it stands. Ten steps, one per panel in the column beside it, in the same order the column is in:

| Step              | Says                                                             |
| ----------------- | ---------------------------------------------------------------- |
| **Test user**     | who the active token was minted for                              |
| **Application**   | `dibk/et-v4`                                                     |
| **Party**         | the instance owner                                               |
| **Instance**      | the guid, or `new` when the new instance row is selected         |
| **Payload**       | `2 elements`, and `incomplete` when one could not be posted      |
| **Prevalidation** | `not run`, `payload has changed`, `3 documents missing, 1 error` |
| **Post**          | what is stored on the instance, which is what a post leaves      |
| **Data element**  | the data type of the one being inspected                         |
| **Pdf**           | `not rendered`, `rendered`, or `out of date`                     |
| **Process**       | the task the instance is in, or how it ended                     |

A step with nothing in it yet says `not set`, fainter than a value, so it does not read as one.

Each row carries a glyph for where it stands: a tick for done, a ring for the one you can act on, a dot for one still out of reach. The screen reader gets the word.

Two more states belong to Prevalidation, the one step whose whole job is to find things wrong. Once it has answered, the row goes red with a cross where the report found errors and amber with a triangle where it only found warnings, and its value says what they were: `3 documents missing, 1 error`, `2 warnings`. The counts are the whole report, not only the documents the panel can add for you. A row in either state is still a link to the panel.

**Not run** and a report the payload has changed since both stay blue.

Each row also wears the mark of the panel it leads to, faintly, beside its label, the same mark as in the panel heading. Application and Party carry the same one, both being set in Target.

The steps are not a single line. A payload can be written before a party is chosen, and reading a data element needs an instance that posting one does not. So reachability is stated per step, and more than one can be open at once.

The instance step is settled as soon as there is a party, reading `new` when the new instance row is selected, since posting creates one. The prevalidation step is left out when no validation service is configured.

Clicking a row you can act on scrolls to the panel it is set in. A row still out of reach stays plain text.

The panel you are looking at is marked as you scroll, with a blue bar down the row's left edge and a faint fill. Application and Party are marked together, since both are set in Target.

The working column carries a screen's worth of room below the last panel, so every panel can reach the top and be marked. Once the columns stack, the room goes below the run log instead.

Below 1240px the three columns stack and the rail becomes a strip across the top. Each step keeps its own width there, up to 180px, and the strip scrolls sideways when they do not all fit.

Below 620px the header puts its three gauges on a second row under the tool's name. LocalTest is never cut, and the app host and the user name take an ellipsis when there is not room for all of them.

## Post, then inspect

The working column is two runs of panels under a quiet heading each. **Post** is Payload, Prevalidation and Post: what to send, what the service makes of it, and the send. **Inspect** is Data element, Pdf and Process: what is there now. Comparing with the stored xml is not a panel of its own but the foot of Data element, since it compares the forms among the elements that panel lists. Target and Instances sit above both, because they decide what everything else acts on.

The headings are a rule and a word, not a container.

## Every panel is on screen, and says what it is waiting for

A panel that cannot be used yet keeps its place and its heading, drops its colour, and says the thing that is missing in place of its controls, such as "Needs an application."

Each names the first thing missing rather than its own nearest one, so with no application Instances says it needs an application too.

The right column takes its width whether or not it holds anything, so nothing shifts when the first run lands.

A panel that acts on a selection names it in its header rather than repeating it in the body: Instances shows how many there are, Data element the instance it is reading, Process the task the instance sits in. The comparison does the same for its own section, saying how many differences it found.

Results stand on their own. An expired token leaves the request panels waiting, because you cannot act with it, but it does not hide what you already read.

## State that describes one instance is dropped together

Selecting another instance, or another party, clears the validation issues, the data element list, the process state and the pdf preview in one go, because all of them described the instance you just left.

Everything you chose survives a reload: org, app, party, the selected instance, the language, the payload elements with their content and any payload you have saved by name all persist in `localStorage`. Tokens live in server memory and are listed again when the page loads.

## When the interface itself breaks

A render that throws puts a single panel on screen with the message, rather than a blank page. The stack goes to the browser console, where it can be read and copied.

Since what you chose is restored from `localStorage`, a value the interface cannot draw would bring a reload back to the same place. So the panel offers **Clear the saved work and reload** as well as a reload, and asks twice before it clears, since that is your payload.

## Colour encodes rather than decorates

The page, the masthead, the panel surface and the borders are one deep blue ink at different lightnesses. Muted text has a 9:1 contrast on a panel and faint text 6.4:1.

- **HTTP methods**, so a long log can be scanned for the request that changed something. GET blue, POST green, PUT amber, DELETE red. The same colours appear in the "will call" URL previews and on the buttons, so a button, the preview of what it will call, and its entry in the log all read the same way. A preview is short: the app host is left out, since the header names it, LocalTest is `{localtest}`, and each guid is cut to its first eight characters, the way the rail shows them. Hovering it shows the whole URL, and the run log prints every URL in full.
- **Status codes by class**, since 4xx is usually something about the request and 5xx is the app falling over. 2xx green, 3xx blue, 4xx amber, 5xx red.
- **The panel itself**, one surface for all of them, a step above the page, with each panel's hue in its header band, its border and its icon. The hues are blue to purple, on a 13-degree grid with at least 35 degrees between neighbours. A panel that is waiting drops its hue and takes a dashed border. Validation and the run log have no hue, but the same band, border and surface in the header's ink.
- **A control against the surface it is on.** An input, a select, a button and a list row sit on a translucent dark tint, so each one darkens the surface it is on and keeps that surface's hue. Under a button wearing a method's colour the tint is that method's: a POST sits on green and a DELETE on red.
- **Payload element badges by group**, the main form in the accent blue, subforms in violet and attachments in pink. A data type the app has not been read for yet stays grey.
- **Which example a collapsed element was filled from**, in the accent, so loaded and hand-typed content differ at a glance.
- **Validation counts**, amber for warnings only and red when there are errors.
- **An element with no content**, whose summary turns amber and whose example picker gets an accent border, because that is the thing to press next.
- **An instance's state**, for the ones only storage lists: `completed` green, `deleted` red.
- **The step that failed** in a run, which takes a red edge like a validation error does.
- **A payload with everything the task requires**, which says so on a green notice, the same shape the amber one uses to say what is missing.
- **XML and JSON syntax**, inside code blocks only: element names blue, attribute names and keywords violet, strings green, numbers amber, comments and punctuation faint. This is the one place the palette carries a second meaning, since nothing else is coloured inside a code block.

Everything else stays grey, selected text included.

Colour is never the only carrier. A method is named next to its colour, a status code is a number, a severity says "3 errors", and a failed run says "Failed". The three gauges in the header carry their state as a tick or a cross beside a name rather than as colour alone, and in words for a screen reader. The dots that only repeat something already written next to them are marked as decoration, and are not read out twice.

Buttons come in four kinds, all the same height:

| Kind                    | Looks like                    | Means                                                                                                                                                                                                     |
| ----------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The primary action      | Filled accent                 | The main thing to press here: **Prevalidate**, **Post**, **Get token** while the picked user has no token, a **Renew** on a token that has expired                                                        |
| Sends a request         | Outlined in its method colour | **Refresh** and **Render pdf** are GET blue, **Sign and submit** is PUT amber, **Start** on a sweep, **Get token** for a user who has one, and a **Renew** on a token that has not expired are POST green |
| Throws something away   | Outlined red                  | **Delete**, **Remove**, **Clear**, **Clear history**, **Clear results**, whether or not a request leaves the machine                                                                                      |
| Rearranges what is here | Outlined grey                 | **Copy**, **Download**, **Show content**, **Show pdf**, **Full size**, **Collapse all**, **Open**, **Save**, **Close**, **Cancel**                                                                        |

So the colour answers "will this talk to Altinn, and how". Primacy wins where the two disagree: **Post** and **Prevalidate** are filled rather than green. Red is the one that is not about the method: it means something is thrown away, whether or not a DELETE is sent.

Every button carries an icon beside its label, drawn in `components/Icon.tsx`. The one exception is the example reload button, which is an icon alone and names itself to a screen reader. Where the press throws the thing away it is a bin, and where the thing stays but is emptied it is a cross, which is why **Remove** and **Clear** on the same element do not match.

The UI is dark only, with system fonts, a single accent colour and hairline borders. All colours are CSS variables in one `:root` block at the top of `styles/base.css`, so changing the theme means editing that one block. The rest of the stylesheet is split by what it styles, and `styles.css` is only the imports, kept in the order the cascade needs.
