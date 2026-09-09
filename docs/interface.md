---
title: The interface
nav_order: 3
---

# The interface

Three columns: the test user on the left, the target app, payload and fetch controls in the middle, and the validation results and run log on the right.

## The chain

A strip under the header, showing what the tool is working on: a test user, an application, a party, an instance, a data element. Each link needs the ones before it, which is the reason panels come and go, and that was previously left for you to infer.

Each link shows what it holds. The next one to fill in is in the accent colour and names the panel to do it in, so a cold start reads "Test user → in Test user" rather than leaving you to guess where to begin. Links that cannot be reached yet are faint, and are there to explain the order rather than to be read.

Two details are worth knowing. A link only counts as settled when everything before it is, so a party restored from a previous session still shows its value while reading as blocked, because without a token nothing downstream of it can be used, and the panels are absent to match. And the instance link is settled as soon as there is a party, reading `new` when the new instance row is what is selected, because that is a choice rather than a gap: posting creates one. Only the reading side needs a real instance, which is why the data element link waits for one. `chain.test.ts` covers all of it.

## Panels appear as they become usable

Rather than sitting there dead. On a cold start you get the test user and the target app, since that is all you can act on. Payload, the post button and Fetch arrive once you have a token and an app to aim at, and Instances once there is a party as well. Validation and the run log arrive with their first content, and the process panel and the data element controls in Fetch appear once an instance read has told them what to show. The receipt pdf is not a panel at all: it opens in a window over the tool.

The right column takes its width whether or not it holds anything, so nothing shifts when the first run lands.

A panel that acts on a selection names it in its header rather than repeating it in the body: Instances shows how many there are, Fetch the instance it is reading, Process the task the instance sits in, Compare how many differences it found. The chain above says the same thing once for the whole tool, so Fetch no longer restates the party and guid in four lines of its own.

Results stand on their own. An expired token hides the request panels, because you cannot act with it, but it does not hide what you already read.

## State that describes one instance is dropped together

Selecting another instance, or another party, clears the validation issues, the data element list, the process state and the pdf preview in one go, because all of them described the instance you just left. Stale results are more misleading than absent ones.

Everything you chose survives a reload: org, app, party, the selected instance and the payload elements with their content all persist in `localStorage`. The destination is not among them, because it is not stored: a post follows the selection. Tokens do not. They live in server memory and are listed again when the page loads.

## Colour encodes rather than decorates

- **HTTP methods**, so a long log can be scanned for the request that changed something. GET blue, POST green, PUT amber, DELETE red. The same colours appear in the "will call" URL previews, so a preview and its log entry read the same way.
- **Status codes by class**, since 4xx is usually something about the request and 5xx is the app falling over. 2xx green, 3xx blue, 4xx amber, 5xx red.
- **Payload element badges by group**, with the main form in the accent blue, subforms in violet and attachments left neutral.
- **Which example a collapsed element was filled from**, in the accent, so loaded and hand-typed content differ at a glance.
- **Validation counts**, amber for warnings only and red when there are errors.
- **An element with no content**, whose summary turns amber and whose example picker gets an accent border, because that is the thing to press next.

Everything else stays grey.

The UI is plain and dark only. System fonts with no webfonts to load, a single accent colour, hairline borders, no decoration. All colours are CSS variables in `:root` at the top of `styles.css`, so changing the theme means editing that one block.
