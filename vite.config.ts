// vitest/config re-exports Vite's defineConfig with the `test` key typed.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { fileURLToPath, URL } from 'node:url';
import manifest from './manifest.config.ts';

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    /*
     * Vite emits <link rel="modulepreload" crossorigin> for every shared chunk. On a
     * chrome-extension:// page Chrome fetches that preload in CORS mode while the real
     * import of the same-origin resource does not, so the cached entry never matches
     * and is thrown away — filling the console with "cross-world extension resource
     * mismatch" and "preloaded but not used" warnings that drown out real errors.
     *
     * Nothing is lost by turning it off: these chunks come off local disk with no
     * network round trip, which is the latency preloading exists to hide.
     */
    modulePreload: false,

    rollupOptions: {
      input: {
        // None of these is referenced by an action/options key, so CRXJS needs them
        // declared explicitly to emit them.
        dashboard: 'src/ui/dashboard/index.html',
        offscreen: 'src/offscreen/offscreen.html',
        sidepanel: 'src/ui/sidepanel/index.html',
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
