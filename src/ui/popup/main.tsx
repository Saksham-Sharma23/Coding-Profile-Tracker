import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Pulls in both stylesheets and stamps data-theme before the first paint.
import '../theme';
import { Popup } from './Popup';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Popup />
  </StrictMode>,
);
