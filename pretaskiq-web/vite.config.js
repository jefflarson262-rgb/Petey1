import { statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` has no Vercel to run /api/claude, so this small plugin serves the same function locally.
// Put ANTHROPIC_API_KEY and ACCESS_CODE in a file named .env.local (see .env.example).
function localApi(env) {
  const file = resolve('api/claude.js');
  return {
    name: 'local-claude-proxy',
    configureServer(server) {
      for (const k of ['ANTHROPIC_API_KEY', 'ACCESS_CODE', 'ANTHROPIC_MODEL']) if (env[k]) process.env[k] = env[k];
      server.middlewares.use('/api/claude', async (req, res) => {
        // re-import when the file changes, so edits to api/claude.js take effect without restarting
        const { default: handler } = await import(`${pathToFileURL(file).href}?t=${statSync(file).mtimeMs}`);
        return handler(req, res);
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), localApi(loadEnv(mode, process.cwd(), ''))],
  // The prototype's knowledge base (about 140 KB) and scripts ship as one bundle of roughly 0.7 MB. That is expected here.
  build: { chunkSizeWarningLimit: 1500 },
}));
