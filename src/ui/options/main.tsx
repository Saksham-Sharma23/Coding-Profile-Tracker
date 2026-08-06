import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Pulls in both stylesheets and stamps data-theme before the first paint.
import '../theme';
import { Options } from './Options';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Options />
  </StrictMode>,
);
