import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyLanguage } from './i18n';
import '@fontsource/barlow-semi-condensed/latin-500.css';
import '@fontsource/barlow-semi-condensed/latin-600.css';
import './styles.css';
import { applyTheme } from './ui/theme';

applyTheme();
applyLanguage();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
