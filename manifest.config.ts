import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'Coding Profile Tracker',
  description: pkg.description,
  version: pkg.version,

  // The service worker does all network I/O. Extension pages (popup/dashboard/options)
  // only read from chrome.storage, so they never touch these hosts directly.
  // `notifications` backs the optional daily reminder only; with the reminder off,
  // nothing in the extension ever calls it.
  permissions: ['storage', 'alarms', 'offscreen', 'unlimitedStorage', 'notifications'],

  icons: {
    16: 'icon-16.png',
    32: 'icon-32.png',
    48: 'icon-48.png',
    128: 'icon-128.png',
  },

  // Grants the service worker CORS-exempt fetch against each platform. Without a host
  // listed here its adapter cannot fetch at all.
  host_permissions: [
    'https://leetcode.com/*',
    'https://codeforces.com/*',
    'https://www.hackerrank.com/*',
    'https://www.codechef.com/*',
    'https://www.geeksforgeeks.org/*',
    // GeeksforGeeks stats come from its auth API, which is a separate host from the
    // profile pages and needs its own grant.
    'https://authapi.geeksforgeeks.org/*',
  ],

  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },

  action: {
    default_popup: 'src/ui/popup/index.html',
    default_title: 'Coding Profile Tracker',
    default_icon: {
      16: 'icon-16.png',
      32: 'icon-32.png',
      48: 'icon-48.png',
      128: 'icon-128.png',
    },
  },

  options_page: 'src/ui/options/index.html',

  // Username auto-detect. These only read a username and post it to the service
  // worker as a suggestion the user must confirm; they never write to the page.
  content_scripts: [
    {
      matches: ['https://leetcode.com/*'],
      js: ['src/content/leetcode.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://codeforces.com/*'],
      js: ['src/content/codeforces.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://www.hackerrank.com/*'],
      js: ['src/content/hackerrank.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://www.codechef.com/*'],
      js: ['src/content/codechef.ts'],
      run_at: 'document_idle',
    },
    {
      matches: ['https://www.geeksforgeeks.org/*'],
      js: ['src/content/geeksforgeeks.ts'],
      run_at: 'document_idle',
    },
  ],

  web_accessible_resources: [
    {
      resources: ['src/ui/dashboard/index.html'],
      matches: ['<all_urls>'],
    },
  ],
});
