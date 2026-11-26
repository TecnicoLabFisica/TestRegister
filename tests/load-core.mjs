import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Run core.js in its own context (it has no exports). Results are JSON-cloned so
// deepStrictEqual does not trip over the other realm's Object/Array prototypes.
const ctx = vm.createContext({});
vm.runInContext(readFileSync(new URL('../site/js/core.js', import.meta.url), 'utf8'), ctx);
const clone = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const core = {};
for (const k of Object.keys(ctx)) {
  core[k] = typeof ctx[k] === 'function' ? (...a) => clone(ctx[k](...a)) : clone(ctx[k]);
}
export default core;
