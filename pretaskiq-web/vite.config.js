import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// `npm run dev` has no Vercel to run the functions in /api, so this small plugin serves them locally.
// Put your settings in a file named .env.local (see .env.example).
const SETTINGS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_MODEL', 'ACCESS_CODE', 'AI_CALLS_PER_HOUR', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY'];
function localApi(env) {
  return {
    name: 'local-api',
    configureServer(server) {
      for (const k of SETTINGS) if (env[k]) process.env[k] = env[k];
      server.middlewares.use('/api', async (req, res, next) => {
        const name = (req.url || '').split('?')[0].replace(/^\/+|\/+$/g, '');
        const file = resolve('api', `${name}.js`);
        if (!/^[a-z]+$/.test(name) || !existsSync(file)) return next();
        // re-import when the file changes, so edits take effect without restarting
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
