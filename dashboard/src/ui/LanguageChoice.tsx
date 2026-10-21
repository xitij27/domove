import { LANGUAGE_NAMES, LANGUAGES, setLanguage, useLanguage, useStrings } from '../i18n';

/** DE | EN in the header's toolbar: a plate slides under the language in use. */
export function LanguageChoice() {
  const language = useLanguage();
  const t = useStrings();
  return (
    <div className="lang-toggle" role="group" aria-label={t.language} data-language={language}>
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
