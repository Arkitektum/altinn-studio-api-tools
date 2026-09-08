---
title: The interface
nav_order: 3
---

# The interface

Three columns: the test user on the left, the target app, payload and fetch controls in the middle, and the validation results and run log on the right.

## Panels appear as they become usable

Rather than sitting there dead. On a cold start you get the test user and the target app, since that is all you can act on. Payload, the post button and Fetch arrive once you have a token and an app to aim at, and Instances once there is a party as well. Validation and the run log arrive with their first content, and the process panel and the data element controls in Fetch appear once an instance read has told them what to show.

The right column takes its width whether or not it holds anything, so nothing shifts when the first run lands.

Results stand on their own. An expired token hides the request panels, because you cannot act with it, but it does not hide what you already read.

## State that describes one instance is dropped together

Selecting another instance, or another party, clears the validation issues, the data element list, the process state and the pdf preview in one go, because all of them described the instance you just left. Stale results are more misleading than absent ones.

Everything you chose survives a reload: org, app, party, the selected instance, destination and the payload elements with their content all persist in `localStorage`. Tokens do not. They live in server memory and are listed again when the page loads.

## Colour encodes rather than decorates

- **HTTP methods**, so a long log can be scanned for the request that changed something. GET blue, POST green, PUT amber, DELETE red. The same colours appear in the "will call" URL previews, so a preview and its log entry read the same way.
- **Status codes by class**, since 4xx is usually something about the request and 5xx is the app falling over. 2xx green, 3xx blue, 4xx amber, 5xx red.
- **Payload element badges by group**, with the main form in the accent blue, subforms in violet and attachments left neutral.
- **Which example a collapsed element was filled from**, in the accent, so loaded and hand-typed content differ at a glance.
- **Validation counts**, amber for warnings only and red when there are errors.
- **An element with no content**, whose summary turns amber and whose example picker gets an accent border, because that is the thing to press next.

Everything else stays grey.

The UI is plain and dark only. System fonts with no webfonts to load, a single accent colour, hairline borders, no decoration. All colours are CSS variables in `:root` at the top of `styles.css`, so changing the theme means editing that one block.
