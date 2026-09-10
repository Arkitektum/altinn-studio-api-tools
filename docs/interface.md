---
title: The interface
nav_order: 3
---

# The interface

Two columns: what you do on the left, from the test user down through the target app, the payload and the fetch controls, and what came back on the right, the validation results and the run log.

The test user used to have a rail of its own on the far left. It spent 300px on a panel you use once at the start of a session and then leave alone, so it sits at the top of the working column now, where the chain already says it comes first. The width it was holding went to the two columns that use it, the log most of all, since that is where xml, a response body and a curl command are read.

## The chain

A strip under the header, showing what the tool is working on: a test user, an application, a party, an instance, a data element. Each link needs the ones before it, which is the reason panels come and go, and that was previously left for you to infer.

Each link shows what it holds. The next one to fill in is in the accent colour and names the panel to do it in, so a cold start reads "Test user → in Test user" rather than leaving you to guess where to begin. Links that cannot be reached yet are faint, and are there to explain the order rather than to be read.

The link whose panel you are looking at is marked as you scroll, so the strip reads as a position as well as a state. That marking is neutral rather than accented, a chip and a rule underneath, because the accent already means "the next thing to do" and where you happen to be is not a thing to do. Neutral is not the same as faint, which is what it was at first: a hint of a lighter background on the darkest strip in the tool, easy to miss entirely. Application and Party are both marked together, since both are set in Target. Every link is marked this way, the test user included: it scrolls with everything else now, where before it sat in a rail that was always on screen and marking it would have said nothing.

A link you can act on is also a way to get there: clicking one scrolls to the panel it is set in. A faint link stays plain text, because the panel it names is not on screen yet and a button that did nothing would be worse than no button.

Two details are worth knowing. A link only counts as settled when everything before it is, so a party restored from a previous session still shows its value while reading as blocked, because without a token nothing downstream of it can be used, and the panels are absent to match. And the instance link is settled as soon as there is a party, reading `new` when the new instance row is what is selected, because that is a choice rather than a gap: posting creates one. Only the reading side needs a real instance, which is why the data element link waits for one. `chain.test.ts` covers all of it.

## Post, then inspect

The working column is two runs of panels under a quiet heading each. **Post** is Payload and the post button: what to send. **Inspect** is Data element, Pdf and Process: what is there now. Comparing with the stored xml is not a panel of its own but the foot of Data element, since it compares whatever that panel's select is pointing at. Target and Instances sit above both, because they decide what everything else acts on.

The headings are a rule and a word, not a container. They group what is already there rather than adding something to look at.

## Panels appear as they become usable

Rather than sitting there dead. A cold start is one panel and one thing to do: Test user. Everything else is read with a token, Target included, since the app's data types and its parties are what fill that panel in. Target arrives with the token, Payload and the post button once there is an app to aim at, and Instances once there is a party as well. Data element and Pdf arrive with a selected instance, the comparison inside Data element once an element is picked there, and Validation and the run log with their first content. The rendered pdf is not a panel at all: it opens in a window over the tool.

The right column takes its width whether or not it holds anything, so nothing shifts when the first run lands.

A panel that acts on a selection names it in its header rather than repeating it in the body: Instances shows how many there are, Data element the instance it is reading, Process the task the instance sits in. The comparison does the same for its own section, saying how many differences it found. The chain above says the same thing once for the whole tool.

Results stand on their own. An expired token hides the request panels, because you cannot act with it, but it does not hide what you already read.

## State that describes one instance is dropped together

Selecting another instance, or another party, clears the validation issues, the data element list, the process state and the pdf preview in one go, because all of them described the instance you just left. Stale results are more misleading than absent ones.

Everything you chose survives a reload: org, app, party, the selected instance, the payload elements with their content and any payload you have saved by name all persist in `localStorage`. The destination is not among them, because it is not stored: a post follows the selection. Tokens do not. They live in server memory and are listed again when the page loads.

## When the interface itself breaks

A render that throws puts a single panel on screen with the message, rather than a blank page. The stack goes to the browser console, where it can be read and copied.

The reason it is more than a message is the paragraph above: what you chose is restored from `localStorage`, so if one of those values is what the interface cannot draw, reloading lands in the same place. The panel offers to throw the saved work away as well as to reload, and asks twice before it does, since that is your payload. Nothing it clears is a credential, because no token is stored in the browser.

## Colour encodes rather than decorates

- **HTTP methods**, so a long log can be scanned for the request that changed something. GET blue, POST green, PUT amber, DELETE red. The same colours appear in the "will call" URL previews and on the buttons, so a button, the preview of what it will call, and its entry in the log all read the same way.
- **Status codes by class**, since 4xx is usually something about the request and 5xx is the app falling over. 2xx green, 3xx blue, 4xx amber, 5xx red.
- **Payload element badges by group**, with the main form in the accent blue, subforms in violet and attachments left neutral.
- **Which example a collapsed element was filled from**, in the accent, so loaded and hand-typed content differ at a glance.
- **Validation counts**, amber for warnings only and red when there are errors.
- **An element with no content**, whose summary turns amber and whose example picker gets an accent border, because that is the thing to press next.
- **An instance's state**, for the ones only storage lists: `completed` green, `deleted` red. Both were grey words after the label, where the thing they decide is what is left to do with the instance.
- **The step that failed** in a run, which takes a red edge like a validation error does. It is what a long run is skimmed for, and the status code at the end of the row was the only thing saying so.
- **A payload with everything the task requires**, which says so on a green notice, the same shape the amber one uses to say what is missing.

- **XML and JSON syntax**, inside code blocks only: element names blue, attribute names and keywords violet, strings green, numbers amber, comments and punctuation faint. This is the one place the palette carries a second meaning, and it can, because nothing else is coloured inside a code block: blue is GET on a button and an element name in a document, and the two never share a surface.

Everything else stays grey, marked text included. Selecting takes no colour from the palette, because inside a code block every one of them already means something, and it is translucent rather than solid: the editor paints its colours on a layer behind a transparent textarea, so a solid selection is drawn in front of the text it is marking rather than behind it.

Colour is never the only carrier. A method is named next to its colour, a status code is a number, a severity says "3 errors", and a failed run says "Failed". The three status dots in the header were the exception, since a green or red dot was the whole message, so each of them now carries its state in words for a screen reader. The dots that only repeat something already written next to them are marked as decoration, and are not read out twice.

Buttons come in three kinds, all the same height, since height is not a thing worth encoding:

| Kind                    | Looks like                    | Means                                                                                                   |
| ----------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| The primary action      | Filled accent                 | The main thing to press here: **Post**, **Get token**, a **Renew** on a token that has expired          |
| Sends a request         | Outlined in its method colour | **Refresh** and **Render pdf** are GET blue, **Sign and submit** is PUT amber, **Delete** is DELETE red |
| Rearranges what is here | Outlined grey                 | **Copy**, **Download**, **Show content**, **Maximize**, **Collapse all**, **Open**, **Save**, **Clear** |

So the colour answers "will this talk to Altinn, and how", which is the question worth answering before clicking in a tool whose whole purpose is making requests. Primacy wins where the two disagree: the post button is filled rather than green, because being the main action says more than being a POST.

The UI is plain and dark only. System fonts with no webfonts to load, a single accent colour, hairline borders, no decoration. All colours are CSS variables in `:root` at the top of `styles.css`, so changing the theme means editing that one block.
