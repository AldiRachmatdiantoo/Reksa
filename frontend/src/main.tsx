import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './shared/pwa/registerServiceWorker';
// Ikon Material Symbols (sumbu FILL) di-self-host: tanpa ini ikon tampil sebagai kata seperti "dark_mode".
// Semua font di-host sendiri: CSP produksi (font-src 'self') memblokir Google Fonts.
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/radio-canada-big/600.css';
import '@fontsource/radio-canada-big/700.css';
import '@fontsource/spline-sans-mono/500.css';
import '@fontsource-variable/material-symbols-outlined/fill.css';
import './index.css';

registerServiceWorker();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
