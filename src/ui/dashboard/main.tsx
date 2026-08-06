import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Pulls in both stylesheets and stamps data-theme before the first paint.
import '../theme';
import { Dashboard } from './Dashboard';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Dashboard />
  </StrictMode>,
);
