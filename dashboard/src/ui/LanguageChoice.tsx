import { LANGUAGE_NAMES, LANGUAGES, setLanguage, useLanguage, useStrings } from '../i18n';

/** EN | DE beside the light/dark switch, framed the same way; the language in use is pressed. */
export function LanguageChoice() {
  const language = useLanguage();
  const t = useStrings();
  return (
    <div className="theme-choice language-choice" role="group" aria-label={t.language}>
      {LANGUAGES.map((option) => (
        <button
          key={option} type="button" lang={option} aria-pressed={language === option} aria-label={LANGUAGE_NAMES[option]} title={LANGUAGE_NAMES[option]}
          onClick={() => setLanguage(option)}
        >
          {option.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
