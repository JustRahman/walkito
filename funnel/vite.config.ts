import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// @ts-expect-error plain ESM helper shared with the Bun tests
import { resolveEngine } from './engine-aliases.mjs';

const BASE = process.env.FUNNEL_BASE || '/go/';

/** The three faces the first screen is set in, as the latin files Vite emits. */
const FIRST_FONTS = /(figtree-latin-wght-normal|fraunces-latin-wght-normal|fraunces-latin-wght-italic)-[\w-]+\.woff2$/;

export default defineConfig({
  plugins: [
    {
      // Fetched with the page rather than after the stylesheet, so the first screen is not set twice.
      name: 'walkito-font-preload',
      transformIndexHtml: {
        order: 'post',
        handler(_html, ctx) {
          return Object.keys(ctx.bundle ?? {})
            .filter((file) => FIRST_FONTS.test(file))
            .map((file) => ({
              tag: 'link',
              attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: BASE + file, crossorigin: '' },
              injectTo: 'head' as const,
            }));
        },
      },
    },
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
  base: BASE,
  server: { fs: { allow: ['..'] } },
  build: { target: 'es2020', sourcemap: true },
});
