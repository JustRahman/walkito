import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The plan engine is the app's own (src/entities/program/model/plan), run in
 * the browser as it is. Three of its imports reach into the phone (React,
 * MMKV, the app's i18n), so they are pointed at small stand-ins here; every
 * other line of the engine is the app's.
 *
 * Shared by Vite (the build) and Bun (the tests), so both run the same code.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
export const APP_SRC = path.resolve(here, '../src');
const SHIMS = path.resolve(here, 'src/engine/shims');

export function resolveEngine(source, importer) {
  if (importer == null) return null;
  const fromApp = importer.startsWith(APP_SRC);
  if (source.startsWith('@app/')) return path.join(APP_SRC, source.slice(5));
  if (!fromApp) return null;
  if (source === '@/shared/lib/i18n') return path.join(SHIMS, 'i18n.ts');
  if (source.startsWith('@/')) return path.join(APP_SRC, source.slice(2));
  const target = path.resolve(path.dirname(importer), source);
  if (target === path.join(APP_SRC, 'entities/program/model/state')) return path.join(SHIMS, 'state.ts');
  return null;
}
