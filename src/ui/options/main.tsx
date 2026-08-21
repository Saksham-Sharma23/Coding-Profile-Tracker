import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Pulls in both stylesheets and stamps data-theme before the first paint.
import '../theme';
import { Dashboard } from '../dashboard/Dashboard';

/*
 * The options page is the same app, opened on its Settings view.
 *
 * `options_page` has to name a real declared page — a hash cannot be smuggled into that
 * manifest key — so rather than redirect, this entry point renders the dashboard shell
 * directly. chrome.runtime.openOptionsPage() then lands somewhere with the sidebar, the
 * live platform list and every other view one click away, instead of on an island.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Dashboard initialView="settings" />
  </StrictMode>,
);
