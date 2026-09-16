import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { injectIdentity, partstypeFor, withIdentity } from "./formIdentity";
import type { Identity } from "./identity";

const person: Identity = { kind: "person", number: "01899699552", name: "Sophie Salt & Sons" };
const organization: Identity = { kind: "organization", number: "312949555", name: "PENGELENS PARTNER AS" };

/** Shaped like the DIBK forms: a party per role, a nested contact, and a name in both. */
const form = `<?xml version="1.0" encoding="utf-8"?>
<ettrinn xmlns="https://skjema.ft.dibk.no/ettrinn/v4">
  <tiltakshaver>
    <partstype>
      <kodeverdi>Foretak</kodeverdi>
      <kodebeskrivelse>Foretak</kodebeskrivelse>
    </partstype>
    <foedselsnummer xsi:nil="true" />
    <organisasjonsnummer>910748548</organisasjonsnummer>
    <navn>BLOMSTERDALEN</navn>
  </tiltakshaver>
  <ansvarligSoeker>
    <partstype>
      <kodeverdi>Organisasjon</kodeverdi>
      <kodebeskrivelse>Organisasjon</kodebeskrivelse>
    </partstype>
    <foedselsnummer></foedselsnummer>
    <organisasjonsnummer>312949555</organisasjonsnummer>
    <navn>FREIDIG ALLSIDIG KATT</navn>
    <kontaktperson>
      <navn>Kontakt Person</navn>
    </kontaktperson>
  </ansvarligSoeker>
</ettrinn>
`;

/** The children of an element, as `name=text`, for asserting on one party at a time. */
function party(xml: string, name: string): string[] {
    const inner = new RegExp(`<${name}>([\\s\\S]*?)</${name}>`).exec(xml)?.[1] ?? "";
    const flat = inner.replace(/<kontaktperson>[\s\S]*?<\/kontaktperson>/, "");
    return [...flat.matchAll(/<([\w]+)(?: [^>]*)?(?:\/>|>([^<]*)<\/\1>)/g)].map((match) => `${match[1]}=${match[2] ?? ""}`);
}

describe("partstypeFor", () => {
    it("is a private person whatever the form", () => {
        assert.equal(partstypeFor(person, "ET"), "Privatperson");
        assert.equal(partstypeFor(person, "AN"), "Privatperson");
    });

    it("is a Foretak in the forms a company files as a company", () => {
        for (const dataType of ["AN", "SA", "KO"]) assert.equal(partstypeFor(organization, dataType), "Foretak");
    });

    it("is a public authority in the hearing form, and not in the answer to one", () => {
        assert.equal(partstypeFor(organization, "HoeringOgOffentligEttersyn"), "Offentlig myndighet");
        assert.equal(partstypeFor(organization, "HoeringOgOffentligEttersynUttalelse"), "Organisasjon");
    });

    it("is an ordinary organisation otherwise", () => {
        assert.equal(partstypeFor(organization, "ET"), "Organisasjon");
    });
});

describe("injectIdentity", () => {
    it("writes a person into the first party of the person priority", () => {
        const { xml, party: name } = injectIdentity(form, person, "ET");
        assert.equal(name, "ansvarligSoeker");
        assert.deepEqual(party(xml, "ansvarligSoeker"), [
            "kodeverdi=Privatperson",
            "kodebeskrivelse=Privatperson",
            "foedselsnummer=01899699552",
            "organisasjonsnummer=",
            "navn=Sophie Salt &amp; Sons"
        ]);
    });

    it("writes an organisation into the first party of the organisation priority", () => {
        // tiltakshaver outranks ansvarligSoeker for a person and not for an organisation, so a
        // form with both is where the two lists visibly differ.
        const { xml, party: name } = injectIdentity(form, organization, "ET");
        assert.equal(name, "ansvarligSoeker");
        assert.deepEqual(party(xml, "ansvarligSoeker"), [
            "kodeverdi=Organisasjon",
            "kodebeskrivelse=Organisasjon",
            "foedselsnummer=",
            "organisasjonsnummer=312949555",
            "navn=PENGELENS PARTNER AS"
        ]);
    });

    it("falls through the priority to the next party the form has", () => {
        const without = form.replace(/<ansvarligSoeker>[\s\S]*<\/ansvarligSoeker>/, "");
        const { party: name, xml } = injectIdentity(without, person, "ET");
        assert.equal(name, "tiltakshaver");
        assert.match(xml, /<foedselsnummer>01899699552<\/foedselsnummer>/);
    });

    it("leaves the other parties alone", () => {
        const { xml } = injectIdentity(form, person, "ET");
        assert.deepEqual(party(xml, "tiltakshaver"), [
            "kodeverdi=Foretak",
            "kodebeskrivelse=Foretak",
            "foedselsnummer=",
            "organisasjonsnummer=910748548",
            "navn=BLOMSTERDALEN"
        ]);
    });

    it("leaves the contact person's name alone, which is a navn one level down", () => {
        const { xml } = injectIdentity(form, person, "ET");
        assert.match(xml, /<kontaktperson>\s*<navn>Kontakt Person<\/navn>/);
    });

    it("changes nothing else in the document", () => {
        const { xml } = injectIdentity(form, person, "ET");
        const lines = (text: string): string[] => text.split("\n");
        const differences = lines(xml).filter((line, index) => line !== lines(form)[index]);
        assert.equal(differences.length, 5);
        assert.equal(lines(xml).length, lines(form).length);
    });

    it("has nowhere to write when the form names none of the parties", () => {
        const { xml, party: name } = injectIdentity("<gjennomfoeringsplan><dato>2026-01-01</dato></gjennomfoeringsplan>", person, "ET");
        assert.equal(name, null);
        assert.equal(xml, "<gjennomfoeringsplan><dato>2026-01-01</dato></gjennomfoeringsplan>");
    });

    describe("a field the form does not carry", () => {
        const thin = `<rs>
  <ansvarligSoeker>
    <partstype>
      <kodeverdi>Organisasjon</kodeverdi>
      <kodebeskrivelse>Organisasjon</kodebeskrivelse>
    </partstype>
    <organisasjonsnummer>310973513</organisasjonsnummer>
    <navn>VERDIFULL FALSK APE</navn>
  </ansvarligSoeker>
</rs>`;

        it("is put in where the usual form keeps it", () => {
            const { xml } = injectIdentity(thin, person, "RS");
            assert.deepEqual(party(xml, "ansvarligSoeker"), [
                "kodeverdi=Privatperson",
                "kodebeskrivelse=Privatperson",
                "foedselsnummer=01899699552",
                "organisasjonsnummer=",
                "navn=Sophie Salt &amp; Sons"
            ]);
        });

        it("is put in where this form keeps it, when another party in it says", () => {
            // The hearing form puts foedselsnummer last, after the contact person, and a schema
            // counts the order. The party next to it is the same type, so it is the one to copy.
            const hearing = thin.replace(
                "</rs>",
                `  <kommune>
    <partstype>
      <kodeverdi>Offentlig myndighet</kodeverdi>
    </partstype>
    <organisasjonsnummer>958935420</organisasjonsnummer>
    <navn>UKLAR PLAST</navn>
    <epost>post@oslo.no</epost>
    <foedselsnummer>10921148513</foedselsnummer>
  </kommune>
</rs>`
            );
            const { xml } = injectIdentity(hearing, person, "RS");
            assert.match(xml, /<navn>Sophie Salt &amp; Sons<\/navn>\n {4}<foedselsnummer>01899699552<\/foedselsnummer>\n {2}<\/ansvarligSoeker>/);
        });

        it("is not put in to hold nothing", () => {
            // A form that does not carry the field says something different from one that carries
            // it empty, and this is not the place to decide it should.
            const { xml } = injectIdentity(thin, organization, "RS");
            assert.equal(xml.includes("foedselsnummer"), false);
        });
    });

    describe("a field written as nil", () => {
        it("is written out afresh to hold a value, since nil and content cannot both be true", () => {
            const { xml } = injectIdentity(form.replace(/<ansvarligSoeker>[\s\S]*<\/ansvarligSoeker>/, ""), person, "ET");
            assert.match(xml, /<foedselsnummer>01899699552<\/foedselsnummer>/);
            assert.equal(xml.includes('xsi:nil="true"'), false);
        });

        it("is left as it is when it is being cleared, being already blank", () => {
            const { xml } = injectIdentity(form.replace(/<ansvarligSoeker>[\s\S]*<\/ansvarligSoeker>/, ""), organization, "ET");
            assert.match(xml, /<foedselsnummer xsi:nil="true" \/>/);
        });
    });
});

describe("withIdentity", () => {
    const example = { kind: "form" as const, group: "ET", name: "01_Maksimumsversjon.xml" };
    const loaded = { dataType: "ET", content: form, example, exampleName: example.name };

    it("writes into an element still holding a shipped example", () => {
        const [element] = withIdentity([loaded], person);
        assert.equal(element?.identityIn, "ansvarligSoeker");
        assert.match(element?.content ?? "", /<foedselsnummer>01899699552<\/foedselsnummer>/);
    });

    it("leaves text you wrote alone, example or not", () => {
        const typed = [{ dataType: "ET", content: form }];
        assert.equal(withIdentity(typed, person), typed);
    });

    it("leaves a file alone, which is bytes rather than a form", () => {
        const binary = [{ ...loaded, encoding: "base64" as const, content: "AAAA" }];
        assert.equal(withIdentity(binary, person), binary);
    });

    it("gives the same list back when there is nothing to do, so it settles", () => {
        const once = withIdentity([loaded], person);
        assert.equal(withIdentity(once, person), once);
    });

    it("follows the identity when it changes", () => {
        const asPerson = withIdentity([loaded], person);
        const asOrganisation = withIdentity(asPerson, organization);
        assert.match(asOrganisation[0]?.content ?? "", /<organisasjonsnummer>312949555<\/organisasjonsnummer>/);
        assert.match(asOrganisation[0]?.content ?? "", /<kodeverdi>Organisasjon<\/kodeverdi>/);
    });

    it("waits for an identity rather than guessing at one", () => {
        const elements = [loaded];
        assert.equal(withIdentity(elements, null), elements);
    });

    it("says nothing about an element whose form names none of the parties", () => {
        const other = [{ dataType: "GjennomfoeringsplanDataV7", content: "<gjennomfoeringsplan />", example }];
        const [element] = withIdentity(other, person);
        assert.equal(element?.content, "<gjennomfoeringsplan />");
        assert.equal(element?.identityIn, undefined);
    });

    it("settles on a form with no party in it too, having looked once and found nothing", () => {
        const other = [{ dataType: "GjennomfoeringsplanDataV7", content: "<gjennomfoeringsplan />", example }];
        const once = withIdentity(other, person);
        assert.equal(withIdentity(once, person), once);
    });

    /*
     * The two below are what says the element was skipped rather than scanned to the same answer.
     * The content of each is a form the identity is not in, so anything that looked would rewrite it.
     */
    it("leaves an element already marked with this identity unread", () => {
        const marked = [{ ...loaded, identityKey: "person:01899699552:Sophie Salt & Sons" }];
        assert.equal(withIdentity(marked, person), marked);
        assert.equal(marked[0]?.content, form);
    });

    it("knows the identity by its values, since a fresh object is a new one every render", () => {
        const again: Identity = { kind: "person", number: "01899699552", name: "Sophie Salt & Sons" };
        const once = withIdentity([loaded], person);
        assert.equal(withIdentity(once, again), once);
    });
});
