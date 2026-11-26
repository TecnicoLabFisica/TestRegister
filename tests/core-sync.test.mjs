import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('apps-script/Core.gs is identical to site/js/core.js (run npm run sync-core)', () => {
  const a = readFileSync(new URL('../site/js/core.js', import.meta.url));
  const b = readFileSync(new URL('../apps-script/Core.gs', import.meta.url));
  assert.ok(a.equals(b));
});
