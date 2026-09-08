import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseTestUsersHtml, parseTestUsersJson } from "./localtestClient.js";

describe("parseTestUsersJson", () => {
    it("reads a list of profiles, taking the party name", () => {
        const users = parseTestUsersJson([
            { userId: 1001, party: { name: "Pengelens Partner" } },
            { userId: 1337, party: { name: "Sophie Salt" } }
        ]);

        assert.deepEqual(users, [
            { userId: "1001", label: "Pengelens Partner" },
            { userId: "1337", label: "Sophie Salt" }
        ]);
    });

    it("copes with pascal case and a wrapped list, which versions differ on", () => {
        const users = parseTestUsersJson({ users: [{ UserId: "1001", Party: { Name: "Pengelens Partner" } }] });
        assert.deepEqual(users, [{ userId: "1001", label: "Pengelens Partner" }]);
    });

    it("falls back through the other places a name sits", () => {
        assert.equal(parseTestUsersJson([{ userId: "1", userName: "ola" }])[0]?.label, "ola");
        assert.equal(parseTestUsersJson([{ userId: "1", partyName: "Ola Nordmann" }])[0]?.label, "Ola Nordmann");
        // No name at all still gives something to show.
        assert.equal(parseTestUsersJson([{ userId: "1" }])[0]?.label, "Test user 1");
    });

    it("drops entries without an id, and anything that is not a list", () => {
        assert.deepEqual(parseTestUsersJson([{ party: { name: "No id" } }, "nope"]), []);
        assert.deepEqual(parseTestUsersJson(null), []);
        assert.deepEqual(parseTestUsersJson("<html>"), []);
    });
});

describe("parseTestUsersHtml", () => {
    it("reads the user dropdown off the front page", () => {
        const html = `
            <select id="UserSelect" name="UserSelect">
                <option value="">Select user</option>
                <option value="1001">Pengelens Partner</option>
                <option value="1337">Sophie Salt</option>
            </select>`;

        assert.deepEqual(parseTestUsersHtml(html), [
            { userId: "1001", label: "Pengelens Partner" },
            { userId: "1337", label: "Sophie Salt" }
        ]);
    });

    it("leaves out the app dropdown, whose values are not numbers", () => {
        const html = `
            <option value="dibk/et-v4">dibk/et-v4</option>
            <option value="1001">Pengelens Partner</option>`;
        assert.deepEqual(parseTestUsersHtml(html), [{ userId: "1001", label: "Pengelens Partner" }]);
    });

    it("strips tags and entities out of the label", () => {
        const html = `<option value="1001"><span>Pengelens &amp; Partner</span></option>`;
        assert.deepEqual(parseTestUsersHtml(html), [{ userId: "1001", label: "Pengelens & Partner" }]);
    });

    it("keeps the first of a repeated id, and names an option with no text", () => {
        const html = `<option value="1001">First</option><option value="1001">Again</option><option value="42"></option>`;
        assert.deepEqual(parseTestUsersHtml(html), [
            { userId: "1001", label: "First" },
            { userId: "42", label: "Test user 42" }
        ]);
    });

    it("finds nothing in a page without a dropdown", () => {
        assert.deepEqual(parseTestUsersHtml("<html><body>LocalTest</body></html>"), []);
    });
});
