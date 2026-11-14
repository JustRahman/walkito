import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// @ts-expect-error plain ESM helper shared with the Bun tests
import { resolveEngine } from './engine-aliases.mjs';

export default defineConfig({
  plugins: [
    {
      name: 'walkito-engine',
      enforce: 'pre',
      async resolveId(source, importer) {
        const target = resolveEngine(source, importer);
        if (target == null) return null;
        const resolved = await this.resolve(target, importer, { skipSelf: true });
        return resolved ?? target;
      },
    },
    react(),
  ],
  envPrefix: 'FUNNEL_',
  server: { fs: { allow: ['..'] } },
  build: { target: 'es2020', sourcemap: true },
});
