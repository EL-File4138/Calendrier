import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import en from './locales/en.json';
import zh from './locales/zh.json';
import pl from './locales/pl.json';

const safeStorage = {
  getItem(key: string) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem(key: string, value: string) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Storage can be unavailable in private or restricted browser contexts.
    }
  },
};

// Get saved language from localStorage or use browser detection
const savedLanguage = safeStorage.getItem('calendrier-language');

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      zh: { translation: zh },
      pl: { translation: pl }
    },
    lng: savedLanguage || undefined, // Use saved language if available, otherwise detect
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false // React already escapes values
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'calendrier-language'
    }
  });

// Save language changes to localStorage
i18n.on('languageChanged', (lng) => {
  safeStorage.setItem('calendrier-language', lng);
});

export default i18n;

// Export available languages for the settings
export const AVAILABLE_LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'zh', name: '中文' },
  { code: 'pl', name: 'Polski' }
] as const;
