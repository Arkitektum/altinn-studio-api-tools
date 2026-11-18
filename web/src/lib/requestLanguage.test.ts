import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { languageName, withLanguage } from "./requestLanguage";

describe("withLanguage", () => {
    it("starts a query on a url that has none", () => {
        assert.equal(
            withLanguage("https://validering.example/api/validationReport", "spraak", "nn"),
            "https://validering.example/api/validationReport?spraak=nn"
        );
    });

    it("adds to a query the url already has", () => {
        assert.equal(
            withLanguage("https://validering.example/api/validationReport?x=1", "spraak", "en"),
            "https://validering.example/api/validationReport?x=1&spraak=en"
        );
    });
});

describe("languageName", () => {
    it("names a language it knows, and gives back the code for one it does not", () => {
        assert.equal(languageName("nn"), "Nynorsk");
        assert.equal(languageName("se"), "se");
    });
});
