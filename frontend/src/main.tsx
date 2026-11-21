import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
// Ikon Material Symbols (sumbu FILL) di-self-host: tanpa ini ikon tampil sebagai kata seperti "dark_mode".
import '@fontsource-variable/material-symbols-outlined/fill.css';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
