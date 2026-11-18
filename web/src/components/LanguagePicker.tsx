import { REQUEST_LANGUAGES, type RequestLanguage } from "../lib/requestLanguage";

interface LanguagePickerProps {
    /** Unique on the page, since each panel that sends a language has a picker of its own. */
    id: string;
    value: RequestLanguage;
    onChange: (language: RequestLanguage) => void;
    disabled?: boolean;
    /** Spacing, one of the above-/below- classes. */
    className?: string;
}

/** The language a request asks to be answered in. Every picker shows the same choice, kept in App. */
export function LanguagePicker({ id, value, onChange, disabled, className }: LanguagePickerProps) {
    return (
        <div className={["field", className].filter(Boolean).join(" ")}>
            <label htmlFor={id}>Language</label>
            <select id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value as RequestLanguage)}>
                {REQUEST_LANGUAGES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                        {entry.label}
                    </option>
                ))}
            </select>
        </div>
    );
}
