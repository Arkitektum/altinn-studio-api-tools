/**
 * The language the app and the validation service are asked to answer in.
 *
 * One choice for every request that takes one, kept in App and handed to each panel that sends one:
 * the pdf preview (`language`), process/next in the Process panel and in a run (`lang`), and the
 * validation service (`spraak`). Altinn uses it in place of the profile's language.
 */
export type RequestLanguage = "nb" | "nn" | "en";

export const REQUEST_LANGUAGES: { value: RequestLanguage; label: string }[] = [
    { value: "nb", label: "Bokmål" },
    { value: "nn", label: "Nynorsk" },
    { value: "en", label: "English" }
];

/** The name a panel shows for a language, or the code itself for one it does not know. */
export function languageName(value: string): string {
    return REQUEST_LANGUAGES.find((entry) => entry.value === value)?.label ?? value;
}

/**
 * A url with the language added under the name its receiver reads it by, after any query it already
 * has. For the request lines the panels print, so they show what is sent.
 */
export function withLanguage(url: string, name: string, language: RequestLanguage): string {
    return `${url}${url.includes("?") ? "&" : "?"}${new URLSearchParams({ [name]: language })}`;
}
