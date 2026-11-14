import { plugin } from 'bun';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { APP_SRC } from './engine-aliases.mjs';

/**
 * Bun resolves the app's own `@/` imports through the app's tsconfig, so the
 * stand-ins are swapped in at load time instead: the same two files Vite
 * points the engine at (`engine-aliases.mjs`).
 */
const shims = path.resolve(import.meta.dir, 'src/engine/shims');
const I18N = path.join(APP_SRC, 'shared/lib/i18n/index.ts');
const STATE = path.join(APP_SRC, 'entities/program/model/state.ts');

plugin({
  name: 'walkito-engine',
  setup(build) {
    build.onLoad({ filter: /\/src\/shared\/lib\/i18n\/index\.ts$|\/src\/entities\/program\/model\/state\.ts$/ }, (args) => {
      if (args.path === I18N) {
        const text = readFileSync(path.join(shims, 'i18n.ts'), 'utf8').replace(
          "'@app/shared/lib/i18n/catalogue/en/exercises'",
          "'./catalogue/en/exercises'",
        );
        return { contents: text, loader: 'ts' };
      }
      if (args.path === STATE) return { contents: readFileSync(path.join(shims, 'state.ts'), 'utf8'), loader: 'ts' };
      return undefined;
    });
  },
});
