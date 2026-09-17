---
title: The interface
nav_order: 3
---

# The interface

Three columns: the rail on the left, which is the chain the tool hangs off; the panels you work down in the middle, from the test user through the target app, the payload and the fetch controls; and what came back on the right, the validation results and the run log.

The test user used to have a rail of its own on the far left. It spent 300px on a panel you use once at the start of a session and then leave alone, so it sits at the top of the working column now, where the chain already says it comes first. The width it was holding went to the log, since that is where xml, a response body and a curl command are read.

## The rail

The tool is a wizard in the one way that matters: each step needs the one before it. That used to be a strip under the header, which could show the order and not the progress, and had one line to say a label, a value and a position in. Down the side each row has room for all three.

Ten steps, one per panel in the column beside it, in the same order the column is in:

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

Each row carries a glyph for where it stands: a tick for done, a ring for the one you can act on, a dot for one still out of reach. The glyph says what a word would otherwise have to, which is the test for whether a glyph belongs at all, and the screen reader gets the word anyway.

Two more states belong to Prevalidation, the one step whose whole job is to find things wrong. Once it has answered, the row goes red with a cross where the report found errors and amber with a triangle where it only found warnings, and its value says what they were: `3 documents missing, 1 error`, `2 warnings`. The counts are the whole report, not only the documents the panel can add for you, since a row that went red for missing documents while staying quiet about four errors in the form would be answering a narrower question than it looks like it is answering. A row in either state is still a link, because the panel it leads to is where you would fix it.

Neither colours before there is something to colour. **Not run** is a step still ahead of you rather than a finding, and an answer the payload has changed since describes something else, so both stay blue.

Each row also wears the mark of the panel it leads to, faintly, beside its label. That is the other half of the mark in the panel heading: a shape in a heading is only worth learning if the thing that takes you there wears it too. It is keyed on the panel rather than the row, so Application and Party carry the same one, both being set in Target.

The steps are not a single line, and the rail does not pretend they are. A payload can be written before a party is chosen, and reading a data element needs an instance that posting one does not. So reachability is stated per step, more than one can be open at once, and the rail says both rather than picking one to call next.

Two details are worth knowing. The instance step is settled as soon as there is a party, reading `new` when the new instance row is what is selected, because that is a choice rather than a gap: posting creates one. And the prevalidation step is left out entirely when no validation service is configured, because switched off is not a step you failed to do. `chain.test.ts` covers all of it.

A row you can act on is also a way to get there: clicking one scrolls to the panel it is set in. A row still out of reach stays plain text, because scrolling to a panel you cannot use yet is a worse answer than none.

The panel you are looking at is marked as you scroll, so the rail reads as a position as well as a state: a blue bar down the row's left edge and a faint fill. A bar rather than a fill alone, since the row already carries a colour in its glyph. Blue rather than the violet it was, because violet is one of the three payload element hues and means something else, and because the row you are on is usually also the row you can act on: one colour for both says they are the same place. Application and Party are marked together, since both are set in Target, and a run of marked rows keeps only its outside corners rounded so it reads as one block rather than two answers to the same question.

The column carries a screen's worth of room below the last panel, which is load-bearing rather than spacing. Without it the panels in the last screenful all reach the bottom at the same moment, so there is no scroll position where Pdf has arrived and Process has not, and the rail jumped from Data element straight to Process.

Below 1240px the three columns stack and the rail goes back to a strip across the top, since down the side it would be a column of short rows beside a column of everything else.

## Post, then inspect

The working column is two runs of panels under a quiet heading each. **Post** is Payload, Prevalidation and Post: what to send, what the service makes of it, and the send. **Inspect** is Data element, Pdf and Process: what is there now. Comparing with the stored xml is not a panel of its own but the foot of Data element, since it compares whatever that panel's select is pointing at. Target and Instances sit above both, because they decide what everything else acts on.

Those first three were one panel until recently, set apart by legends inside it. Three things you do in order are three steps, and one panel meant two rail rows pointing at the same place with nothing to say where one ended.

The headings are a rule and a word, not a container. They group what is already there rather than adding something to look at.

## Every panel is on screen, and says what it is waiting for

Rather than appearing as it becomes usable, which is what it used to do. That read as a cleaner first screen and cost more than it saved: the order the tool wants things done in was invisible, so a strip above the panels had to name it, and a panel appearing as you typed moved everything under it.

A panel that cannot be used yet keeps its place and its heading, drops its surface colour, and says the thing that is missing in place of its controls: "Needs an application." rather than "Pick an application", since the panel above it is where you would do that and an instruction would repeat what the layout already says. Rendering the reason instead of the controls is also what stops a waiting panel being half operated.

Each names the first thing missing rather than its own nearest one. With no application there is no point asking for an instance, so Instances says it needs an application too.

The right column takes its width whether or not it holds anything, so nothing shifts when the first run lands.

A panel that acts on a selection names it in its header rather than repeating it in the body: Instances shows how many there are, Data element the instance it is reading, Process the task the instance sits in. The comparison does the same for its own section, saying how many differences it found. The rail says the same thing once for the whole tool.

Results stand on their own. An expired token leaves the request panels waiting, because you cannot act with it, but it does not hide what you already read.

## State that describes one instance is dropped together

Selecting another instance, or another party, clears the validation issues, the data element list, the process state and the pdf preview in one go, because all of them described the instance you just left. Stale results are more misleading than absent ones.

Everything you chose survives a reload: org, app, party, the selected instance, the payload elements with their content and any payload you have saved by name all persist in `localStorage`. The destination is not among them, because it is not stored: a post follows the selection. Tokens do not. They live in server memory and are listed again when the page loads.

## When the interface itself breaks

A render that throws puts a single panel on screen with the message, rather than a blank page. The stack goes to the browser console, where it can be read and copied.

The reason it is more than a message is the paragraph above: what you chose is restored from `localStorage`, so if one of those values is what the interface cannot draw, reloading lands in the same place. The panel offers to throw the saved work away as well as to reload, and asks twice before it does, since that is your payload. Nothing it clears is a credential, because no token is stored in the browser.

## Colour encodes rather than decorates

- **HTTP methods**, so a long log can be scanned for the request that changed something. GET blue, POST green, PUT amber, DELETE red. The same colours appear in the "will call" URL previews and on the buttons, so a button, the preview of what it will call, and its entry in the log all read the same way.
- **Status codes by class**, since 4xx is usually something about the request and 5xx is the app falling over. 2xx green, 3xx blue, 4xx amber, 5xx red.
- **The panel itself**, one surface per panel: the same lightness throughout, a step above the page and below anything raised on top of it, differing only in hue. A column of panels used to be the page colour inside a hairline, which read as one field rather than a stack of containers. All of them are blue to purple, because the warm half of the wheel does not work as a surface here: amber and olive read as dirty against a blue-grey page and the one near the red reads as a warning. The nine panels fit in the hundred degrees that are left on a 13-degree grid, taken in an order that leaves 35 degrees or more between any two that are next to each other. Each one's border takes the same hue at the lightness the plain border has, with a little more saturation than the surface, since a hairline needs it to read as coloured at all. A panel that is waiting drops its surface and takes a dashed border, because a tone says what a panel is for and one that is waiting is not for anything yet. Validation and the run log keep the page colour, since a sidebar of their own already sets them apart from the column you work down.
- **Payload element badges by group**, the main form in the accent blue, subforms in violet and attachments in pink. The three sit in one list, so they are spread as far apart as the four hues that mean a verdict leave room for, and none of them is one of those four. A data type the app has not been read for yet stays grey, which is not knowing rather than a fourth kind.
- **Which example a collapsed element was filled from**, in the accent, so loaded and hand-typed content differ at a glance.
- **Validation counts**, amber for warnings only and red when there are errors.
- **An element with no content**, whose summary turns amber and whose example picker gets an accent border, because that is the thing to press next.
- **An instance's state**, for the ones only storage lists: `completed` green, `deleted` red. Both were grey words after the label, where the thing they decide is what is left to do with the instance.
- **The step that failed** in a run, which takes a red edge like a validation error does. It is what a long run is skimmed for, and the status code at the end of the row was the only thing saying so.
- **A payload with everything the task requires**, which says so on a green notice, the same shape the amber one uses to say what is missing.

- **XML and JSON syntax**, inside code blocks only: element names blue, attribute names and keywords violet, strings green, numbers amber, comments and punctuation faint. This is the one place the palette carries a second meaning, and it can, because nothing else is coloured inside a code block: blue is GET on a button and an element name in a document, and the two never share a surface.

Everything else stays grey, marked text included. Selecting takes no colour from the palette, because inside a code block every one of them already means something, and it is translucent rather than solid: the editor paints its colours on a layer behind a transparent textarea, so a solid selection is drawn in front of the text it is marking rather than behind it.

Colour is never the only carrier. A method is named next to its colour, a status code is a number, a severity says "3 errors", and a failed run says "Failed". The three status dots in the header were the exception, since a green or red dot was the whole message, so each of them now carries its state in words for a screen reader. The dots that only repeat something already written next to them are marked as decoration, and are not read out twice.

Buttons come in four kinds, all the same height, since height is not a thing worth encoding:

| Kind                    | Looks like                    | Means                                                                                                                              |
| ----------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| The primary action      | Filled accent                 | The main thing to press here: **Post**, **Get token**, a **Renew** on a token that has expired                                     |
| Sends a request         | Outlined in its method colour | **Refresh** and **Render pdf** are GET blue, **Prevalidate** is POST green, **Sign and submit** is PUT amber                       |
| Throws something away   | Outlined red                  | **Delete**, **Remove**, **Clear**, **Clear history**, **Clear results**, whether or not a request leaves the machine               |
| Rearranges what is here | Outlined grey                 | **Copy**, **Download**, **Show content**, **Show pdf**, **Full size**, **Collapse all**, **Open**, **Save**, **Close**, **Cancel** |

So the colour answers "will this talk to Altinn, and how", which is the question worth answering before clicking in a tool whose whole purpose is making requests. Primacy wins where the two disagree: the post button is filled rather than green, because being the main action says more than being a POST.

Red is the one that is not about the method. Deleting a saved payload or a token never sent a DELETE anywhere, so the red was already saying "this throws something away" rather than naming a verb, and **Clear** and **Remove** wear it for the same reason. **Close** and **Cancel** stay grey: they give nothing up.

Every button carries an icon beside its label, drawn in `components/Icon.tsx`. Never instead of the label, with one exception: the example reload button has no room for words and names itself to a screen reader. Where the press throws the thing away it is a bin, and where the thing stays but is emptied it is a cross, which is why **Remove** and **Clear** on the same element do not match.

The UI is plain and dark only. System fonts with no webfonts to load, a single accent colour, hairline borders, no decoration. All colours are CSS variables in one `:root` block at the top of `styles/base.css`, so changing the theme means editing that one block. The rest of the stylesheet is split by what it styles, and `styles.css` is only the imports, kept in the order the cascade needs.
