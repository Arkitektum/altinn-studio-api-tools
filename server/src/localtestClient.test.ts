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

    it("leaves the authentication level dropdown alone", () => {
        // This is what taking any numeric option value off the page picked up: five levels
        // offered as people. Its id says nothing about users, so it is not read.
        const html = `
            <select id="AuthenticationLevel" name="AuthenticationLevel">
                <option value="0">Niv&#xE5; 0</option>
                <option value="1">Niv&#xE5; 1</option>
                <option value="2">Niv&#xE5; 2</option>
                <option value="3">Niv&#xE5; 3</option>
                <option value="4">Niv&#xE5; 4</option>
            </select>`;

        assert.deepEqual(parseTestUsersHtml(html), []);
    });

    it("takes UserSelect off the real front page, which holds three selects", () => {
        // Markup as LocalTest writes it: capital Class, a group per person, and one option per
        // party they can act for, valued userId.partyId.
        const html = `
            <select class="form-control" id="AppPathSelection" name="AppPathSelection">
                <option value="dibk/et-v4">dibk/et-v4</option>
            </select>
            <select Class="form-control" id="UserSelect" name="UserSelect">
                <optgroup label="Sophie Salt">
                    <option value="1337.501337">Sophie Salt (Person)</option>
                    <option value="1337.500000">DDG Fitness AS (Organisation)</option>
                    <option value="1337.500600">EAS Health Consulting (Organisation)</option>
                </optgroup>
                <optgroup label="Pengelens Partner">
                    <option value="1001.501001">Pengelens Partner (Person)</option>
                    <option value="1001.510001">Testdepartementet (Organisation)</option>
                </optgroup>
            </select>
            <select Class="form-control" id="AuthenticationLevel" name="AuthenticationLevel">
                <option value="2">Niv&#xE5; 2</option>
            </select>`;

        // One entry per user, not one per party: a token is minted for a user. The group names
        // the person, where the option text would say "Sophie Salt (Person)".
        assert.deepEqual(parseTestUsersHtml(html), [
            { userId: "1337", label: "Sophie Salt" },
            { userId: "1001", label: "Pengelens Partner" }
        ]);
    });

    it("still reads a flat list of users, without groups or party ids", () => {
        const html = `
            <select id="UserSelect">
                <option value="">Select user</option>
                <option value="1001">Pengelens Partner</option>
            </select>`;

        assert.deepEqual(parseTestUsersHtml(html), [{ userId: "1001", label: "Pengelens Partner" }]);
    });

    it("keeps groups apart, so an option is labelled by the person above it", () => {
        const html = `
            <select id="UserSelect">
                <optgroup label="Sm&#xE5;stein &#216;degaard"><option value="42.5042">Sm&#xE5;stein (Person)</option></optgroup>
                <optgroup label="Ola Nordmann"><option value="43.5043">Ola (Person)</option></optgroup>
            </select>`;

        assert.deepEqual(parseTestUsersHtml(html), [
            { userId: "42", label: "Småstein Ødegaard" },
            { userId: "43", label: "Ola Nordmann" }
        ]);
    });

    it("takes the user select and nothing else from a page holding several", () => {
        const html = `
            <select id="AuthenticationLevel"><option value="2">Niv&#xE5; 2</option></select>
            <select id="AppSelect"><option value="dibk/et-v4">dibk/et-v4</option></select>
            <select name="userId"><option value="1337">Sophie Salt</option></select>`;

        assert.deepEqual(parseTestUsersHtml(html), [{ userId: "1337", label: "Sophie Salt" }]);
    });

    it("decodes the entities Razor writes, which is how the Norwegian vowels arrive", () => {
        const html = `
            <select id="userSelect">
                <option value="1">Sm&#xE5;stein &#216;degaard</option>
                <option value="2">Ola &aring;s</option>
                <option value="3">Pengelens &amp; Partner</option>
                <option value="4">Doubly &amp;#xE5; encoded</option>
            </select>`;

        assert.deepEqual(parseTestUsersHtml(html), [
            { userId: "1", label: "Småstein Ødegaard" },
            { userId: "2", label: "Ola ås" },
            { userId: "3", label: "Pengelens & Partner" },
            // Decoded once, not twice, so a literal entity in a name stays literal.
            { userId: "4", label: "Doubly &#xE5; encoded" }
        ]);
    });

    it("strips tags out of the label", () => {
        const html = `<select id="userSelect"><option value="1001"><span>Pengelens Partner</span></option></select>`;
        assert.deepEqual(parseTestUsersHtml(html), [{ userId: "1001", label: "Pengelens Partner" }]);
    });

    it("keeps the first of a repeated id, and names an option with no text", () => {
        const html = `
            <select id="userSelect">
                <option value="1001">First</option>
                <option value="1001">Again</option>
                <option value="42"></option>
            </select>`;

        assert.deepEqual(parseTestUsersHtml(html), [
            { userId: "1001", label: "First" },
            { userId: "42", label: "Test user 42" }
        ]);
    });

    it("finds nothing in a page without a user dropdown", () => {
        assert.deepEqual(parseTestUsersHtml("<html><body>LocalTest</body></html>"), []);
        // Options loose on the page are not read either, since nothing says whose they are.
        assert.deepEqual(parseTestUsersHtml(`<option value="1001">Pengelens Partner</option>`), []);
    });
});
