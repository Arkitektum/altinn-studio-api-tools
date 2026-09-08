---
title: Test user
nav_order: 4
---

# Test user

Pick a test user and the tool calls `GET {localtest}/Home/GetTestUserToken/{userId}`. The stored token is named after the person rather than the id.

The party id is read from the `urn:altinn:partyid` claim and prefilled as the instance owner, and it follows the active token when you switch user. A party you typed yourself is left alone, since acting on behalf of another party is a real case.

## Where the list comes from

LocalTest itself. It has no documented endpoint for its users, so the server tries the json one some versions serve at `/Home/GetTestUsers` and otherwise reads the option list off the front page it already renders, which is where those names are shown anyway. Whichever it was is stated under the picker, since a scraped list deserves to say so.

The page read is deliberately narrow: only a `<select>` whose `id` or `name` says it holds users or profiles, which on LocalTest is `UserSelect`. Reading every numeric option value off the page instead picked up the `AuthenticationLevel` dropdown and offered "Nivå 0" through "Nivå 4" as people. A select the parser does not recognise yields nothing at all, which leaves the fallback pair and the typed id rather than five levels pretending to be users.

LocalTest's picker offers a user and a party together: an `<optgroup label="Sophie Salt">` holding one option per party she can act for, each valued `1337.501337`, which is user id then party id. Only the user id is taken, since that is what a token is minted for, so several parties for one person collapse to one entry, labelled with the group's plain name rather than the option's "Sophie Salt (Person)".

The party is not read off the page because there are two better sources already: the token's own claim, and the app's parties endpoint once it is probed, which is authoritative about what the token may act for.

Razor writes the Norwegian vowels as entities like `&#xE5;`, so labels are decoded, and `&amp;` last of all, which keeps a literal `&#xE5;` in a name from being decoded twice.

Where LocalTest offers nothing, the two we work with are offered instead, Pengelens Partner (1001) and Sophie Salt (1337). Either way **Other user id** takes any id by hand, which is the path that depends on no discovery at all: LocalTest mints a token for any user it knows, listed or not.

## Renewing

The remaining validity counts down live. **Renew** on the token card fetches another token for the same user and activates it, so an expiry mid-session costs a click rather than a trip back through the picker. It takes the accent colour once the token has expired, since that is then the thing to press.

The spent token is deleted rather than left to fill the list with dead tokens for the same person, and a token the server has already pruned is treated as the same outcome. Only a LocalTest token offers this, since a pasted one cannot be minted again.

## Pasting a token

The **Paste** tab accepts a token obtained some other way. It is decoded for its claims and expiry and stored like any other.

## Token handling

The token is held in server memory only. The browser receives an opaque id and the decoded claims, never the bearer token itself. Claims are decoded for display, never verified: the app that receives the token does that, and it holds the key.

More in [SECURITY.md](https://github.com/Arkitektum/altinn-studio-api-tools/blob/main/SECURITY.md).
