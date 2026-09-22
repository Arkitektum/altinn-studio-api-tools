import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { describeExpiry, instanceLabel, isExpired, partyLabel, processLabel, prettyJson, severityLabel, summariseClaims } from "./format";

const NOW = Date.parse("2026-09-22T12:00:00Z");
const at = (seconds: number) => new Date(NOW + seconds * 1000).toISOString();

describe("summariseClaims", () => {
    it("lists the claims in the order an operator reads them, not the order they arrived in", () => {
        const rows = summariseClaims({
            iss: "https://localtest",
            pid: "01017012345",
            "urn:altinn:partyid": "510001",
            "urn:altinn:userid": "1337"
        });

        assert.deepEqual(
            rows.map((row) => row.label),
            ["User id", "Party id", "Person no.", "Issuer"]
        );
    });

    it("leaves out a claim that is absent or empty", () => {
        const rows = summariseClaims({ "urn:altinn:userid": "1337", "urn:altinn:org": null, iss: "", "urn:altinn:username": undefined });

        assert.deepEqual(rows, [{ label: "User id", value: "1337" }]);
    });

    it("keeps a falsy value that still means something", () => {
        // Authentication level 0 is a real level — the lowest one — and dropping it would say the token has none.
        const rows = summariseClaims({ "urn:altinn:authenticatelevel": 0 });

        assert.deepEqual(rows, [{ label: "Auth level", value: "0" }]);
    });

    it("renders a claim that is an object as JSON rather than [object Object]", () => {
        const rows = summariseClaims({ "urn:altinn:org": { name: "dibk" } });

        assert.deepEqual(rows, [{ label: "Org", value: '{"name":"dibk"}' }]);
    });

    it("ignores claims it has no label for", () => {
        assert.deepEqual(summariseClaims({ nameid: "1337", jti: "abc" }), []);
    });
});

describe("describeExpiry", () => {
    it("says when there is no expiry claim to read", () => {
        assert.equal(describeExpiry(null, NOW), "no expiry claim");
    });

    it("says when the claim is not a date", () => {
        assert.equal(describeExpiry("halv fire", NOW), "unknown expiry");
    });

    it("counts in seconds under the minute", () => {
        assert.equal(describeExpiry(at(45), NOW), "expires in 45s");
    });

    it("counts in minutes and seconds under the hour", () => {
        assert.equal(describeExpiry(at(90), NOW), "expires in 1m 30s");
    });

    it("counts in hours and minutes beyond that", () => {
        assert.equal(describeExpiry(at(7500), NOW), "expires in 2h 5m");
    });

    it("reads an expiry already passed as expired, not as a negative wait", () => {
        assert.equal(describeExpiry(at(-180), NOW), "expired 3m 0s ago");
    });

    it("treats the exact moment of expiry as past", () => {
        // The token is no longer usable at the instant it expires, so it must not read as "expires in 0s".
        assert.equal(describeExpiry(at(0), NOW), "expired 0s ago");
    });
});

describe("isExpired", () => {
    it("is not expired without an expiry claim", () => {
        assert.equal(isExpired(null, NOW), false);
    });

    it("is expired once the moment has arrived, and not before", () => {
        assert.equal(isExpired(at(1), NOW), false);
        assert.equal(isExpired(at(0), NOW), true);
        assert.equal(isExpired(at(-1), NOW), true);
    });

    it("does not call a token dead over a claim it cannot read", () => {
        assert.equal(isExpired("halv fire", NOW), false);
    });
});

describe("prettyJson", () => {
    it("reformats a string that holds JSON", () => {
        assert.equal(prettyJson('{"a":1}'), '{\n  "a": 1\n}');
    });

    it("hands back a string that is not JSON untouched", () => {
        // A plain-text error body from an app is worth showing as it came, not swallowed.
        assert.equal(prettyJson("Bad Request"), "Bad Request");
    });

    it("formats a value that is already parsed", () => {
        assert.equal(prettyJson({ a: [1] }), '{\n  "a": [\n    1\n  ]\n}');
    });

    it("says undefined rather than answering undefined", () => {
        assert.equal(prettyJson(undefined), "undefined");
    });
});

describe("partyLabel", () => {
    it("identifies a party by its organisation number when it has one", () => {
        assert.equal(partyLabel({ partyId: 510001, name: "Arkitektum AS", orgNumber: "912345678" }), "510001 · Arkitektum AS (912345678)");
    });

    it("prefers the organisation number when the party carries both", () => {
        assert.equal(
            partyLabel({ partyId: 510001, name: "Arkitektum AS", orgNumber: "912345678", ssn: "01017012345" }),
            "510001 · Arkitektum AS (912345678)"
        );
    });

    it("falls back to the person number when there is no organisation number", () => {
        assert.equal(partyLabel({ partyId: 510002, name: "Ola", orgNumber: null, ssn: "01017012345" }), "510002 · Ola (01017012345)");
    });

    it("leaves the brackets off entirely when there is neither", () => {
        assert.equal(partyLabel({ partyId: 510003, name: "Ola" }), "510003 · Ola");
    });

    it("says unnamed rather than undefined", () => {
        assert.equal(partyLabel({ partyId: 510004 }), "510004 · unnamed");
    });
});

describe("processLabel", () => {
    it("says unknown when there is no process at all", () => {
        assert.equal(processLabel(null), "unknown");
    });

    it("names the task the instance sits in", () => {
        assert.equal(processLabel({ currentTask: "Task_1", ended: null, endEvent: null }), "Task_1");
    });

    it("says it has ended, with the event when there is one", () => {
        assert.equal(processLabel({ currentTask: null, ended: "2026-09-22T10:00:00Z", endEvent: "EndEvent_1" }), "ended · EndEvent_1");
        assert.equal(processLabel({ currentTask: null, ended: "2026-09-22T10:00:00Z", endEvent: null }), "ended");
    });

    it("prefers ended over a task it somehow still names", () => {
        assert.equal(processLabel({ currentTask: "Task_1", ended: "2026-09-22T10:00:00Z", endEvent: null }), "ended");
    });

    it("says no task when it is neither ended nor anywhere", () => {
        assert.equal(processLabel({ currentTask: null, ended: null, endEvent: null }), "no task");
    });
});

describe("instanceLabel", () => {
    const guid = "99d0632c-5917-448c-8ab6-a5d3b681376b";

    it("shortens the guid to just enough to tell two apart", () => {
        assert.equal(instanceLabel({ instanceGuid: guid, lastChanged: null, lastChangedBy: null }), "99d0632c");
    });

    it("reformats a timestamp it can read, rather than showing the raw ISO string", () => {
        // Asserted by what it is not: the rendering itself is the platform's locale formatting, which is not this
        // module's to promise.
        const label = instanceLabel({ instanceGuid: guid, lastChanged: "2026-09-22T12:00:00Z", lastChangedBy: null });

        assert.match(label, /^99d0632c · /);
        assert.equal(label.includes("2026-09-22T12:00:00Z"), false);
        assert.match(label, /2026/);
    });

    it("shows a timestamp it cannot read exactly as it came", () => {
        const label = instanceLabel({ instanceGuid: guid, lastChanged: "i går", lastChangedBy: null });

        assert.equal(label, "99d0632c · i går");
    });

    it("adds who changed it last, when that is known", () => {
        assert.equal(instanceLabel({ instanceGuid: guid, lastChanged: null, lastChangedBy: "1337" }), "99d0632c · 1337");
    });
});

describe("severityLabel", () => {
    it("names the severities Altinn uses", () => {
        assert.deepEqual([1, 2, 3, 4, 5].map(severityLabel), ["error", "warning", "info", "fixed", "success"]);
    });

    it("says the number when it does not recognise one, rather than nothing at all", () => {
        assert.equal(severityLabel(9), "severity 9");
    });
});
