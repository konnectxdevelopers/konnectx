import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { supportedLanguages, translations } from './translations';

const LocaleContext = createContext(null);

export default function LocaleProvider({ children }) {
  const [language, setLanguageState] = useState('en');
  const messages = translations[language];

  const setLanguage = useCallback((nextLanguage) => {
    if (!supportedLanguages.includes(nextLanguage)) {
      throw new Error(`Unsupported language: ${nextLanguage}`);
    }
    setLanguageState(nextLanguage);
  }, []);

  const t = useCallback((path, values = {}) => {
    const read = (source) => path.split('.').reduce((current, key) => current?.[key], source);
    let value = read(messages);
    if (value === undefined || value === null) {
      value = read(translations.en);
    }
    if (typeof value !== 'string') {
      return value ?? path;
    }

    return value.replace(/\{\{(\w+)\}\}/g, (_, key) => String(values[key] ?? ''));
  }, [messages]);

  const contextValue = useMemo(() => ({
    language,
    setLanguage,
    t,
  }), [language, setLanguage, t]);

  return <LocaleContext.Provider value={contextValue}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale must be used within LocaleProvider.');
  }
  return context;
}
