---
title: Test user
nav_order: 4
---

# Test user

Pick a test user and the tool calls `GET {localtest}/Home/GetTestUserToken/{userId}`. The stored token is named after the person rather than the id. Getting a token for a user who already has one replaces it, since a second LocalTest token for the same user carries the same claims and would only add a row that differs by the time. A pasted token is never replaced. Each row in the stored list shows the user id beside the name, because LocalTest has people with the same name. That is the only way in: nothing else in the interface works without a token, so this is the one panel a cold start shows.

The party id is read from the `urn:altinn:partyid` claim and prefilled as the instance owner, and it follows the active token when you switch user. A party you typed yourself is left alone, since acting on behalf of another party is a real case.

## Person number

The token card shows the person number of the person the token acts as, the fødselsnummer, unformatted, because it is usually on its way into a form field. It is labelled **Person no.**, which is what the claim summary above it already calls the `pid` claim: the same number under the same name, and the looked-up row steps aside for the claim where a token carries one.

It is not a claim. A LocalTest test user token carries `nameid`, `urn:altinn:userid`, `urn:altinn:username`, `urn:altinn:partyid`, `urn:altinn:authlevel` and a scope, and no personal identity number at all, so there is nothing to decode. The server reads it from the party the token belongs to instead, with one `GET {localtest}/profile/api/v1/users/current` sent as the new token. Using `current` rather than a user id means the same lookup works for a pasted token, where there is no id to ask about.

The lookup is best effort and never blocks a token: an organisation has no such number, and a LocalTest version that moved the endpoint has no answer, and in both cases the row is simply absent. The register's name for the person is used as the token's label when nothing better was given, which is how a pasted token stops being called "Pasted token".

## Where the list comes from

LocalTest itself. It has no documented endpoint for its users, so the server tries the json one some versions serve at `/Home/GetTestUsers` and otherwise reads the option list off the front page it already renders, which is where those names are shown anyway. Whichever it was is stated under the picker, since a scraped list deserves to say so.

The page read takes only a `<select>` whose `id` or `name` says it holds users or profiles, which on LocalTest is `UserSelect`. A select the parser does not recognise yields nothing, which leaves the fallback pair and the typed id.

LocalTest's picker offers a user and a party together: an `<optgroup label="Sophie Salt">` holding one option per party she can act for, each valued `1337.501337`, which is user id then party id. Only the user id is taken, since that is what a token is minted for, so several parties for one person collapse to one entry, labelled with the group's plain name rather than the option's "Sophie Salt (Person)".

The party comes from the token's own claim and from the app's parties endpoint, not from the page.

Where LocalTest offers nothing, the two we work with are offered instead, Pengelens Partner (1001) and Sophie Salt (1337). Either way **Other user id** takes any id by hand, which is the path that depends on no discovery at all: LocalTest mints a token for any user it knows, listed or not.

## Renewing

The remaining validity counts down live. **Renew** on the token card fetches another token for the same user and activates it, so an expiry mid-session costs a click rather than a trip back through the picker. It takes the accent colour once the token has expired, since that is then the thing to press.

The spent token is deleted rather than left to fill the list with dead tokens for the same person, the same replacing that Get token does, and a token the server has already pruned is treated as the same outcome. Only a LocalTest token offers this.

## Pasted tokens

`POST /api/tokens/raw` stores a token you already have, for a script or a token obtained some other way, see [API](api.md). It is decoded for its claims and expiry, gets the same profile lookup, and appears in the picker like any other. It has no **Renew**, since it cannot be minted again.

## Token handling

The token is held in server memory only. The browser receives an opaque id, the decoded claims and the looked-up person number, never the bearer token itself. Claims are decoded for display, never verified: the app that receives the token does that, and it holds the key.

More in [SECURITY.md](https://github.com/Arkitektum/altinn-studio-api-tools/blob/main/SECURITY.md).
