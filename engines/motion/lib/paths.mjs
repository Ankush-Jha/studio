// Fixed locations. Studio Motion only READS outside its own folder, from Studio Stills (engines/stills):
//   stills/tokens               (group families + client brand layers)
//   stills/fonts                (vendored OFL fonts)
//   stills/lib                  (colour + mortgage maths, so stills and motion agree to the cent)
//   stills/library/roster.json  (roster: group, city, province, languages)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ENGINES = path.resolve(ROOT, '..');
export const STATICS = process.env.STUDIO_STILLS || path.join(ENGINES, 'stills');
export const STATIC_TOKENS = path.join(STATICS, 'tokens');
export const FONTS = path.join(STATICS, 'fonts');
export const ROSTER = path.join(STATICS, 'library', 'roster.json');
export const LOCAL_TOKENS = path.join(ROOT, 'tokens');
export const RUNTIME = path.join(ROOT, 'runtime');
export const TEMPLATES = path.join(ROOT, 'templates');
export const NODE_MODULES = path.join(ROOT, 'node_modules');
export const OUT = path.join(ROOT, 'out');
export const WORK = path.join(ROOT, '.work');
