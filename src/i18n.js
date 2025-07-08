import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import ja from './locales/ja.json';

const savedLanguage = localStorage.getItem('language') || 'en';

// Initialize i18n
i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: en
    },
    ja: {
      translation: ja
    },
  },
  lng: savedLanguage, // Default language
  fallbackLng: 'en', // Fallback language if translation key is missing
  interpolation: {
    escapeValue: false, // React already escapes values
  },
  // Debug mode to see missing translations
  debug: process.env.NODE_ENV === 'development',
  
  // Handle missing translations
  saveMissing: true,
  missingKeyHandler: (lng, ns, key, fallbackValue) => {
    if (process.env.NODE_ENV === 'development') {
      console.warn(`🌐 Missing translation: "${key}" for language "${lng}"`);
      // You could also send this to an analytics service
    }
  },
  
  // Show the key name when translation is missing (useful for development)
  returnKeyIfNotFound: process.env.NODE_ENV === 'development',
});

export default i18n;

