const fs = require('node:fs');
const { BACKDROPS, findBackdrop, backdropsByCategory, BACKDROP_CATEGORIES } =
  require('../.build/lib/models/backdrops.js');

let failures = 0;
function eq(a, b, label) {
  if (!Object.is(a, b)) { failures++; console.log(`FAIL ${label}: expected ${b}, got ${a}`); }
  else console.log(`ok   ${label}`);
}
function ok(c, label) { eq(Boolean(c), true, label); }

ok(BACKDROPS.length >= 16, `library has ${BACKDROPS.length} backdrops`);

// The catalog is hand-maintained alongside a generator; a missing file would
// render as a broken backdrop with no error, so assert every one exists.
for (const b of BACKDROPS) {
  const path = `public${b.url}`;
  ok(fs.existsSync(path), `file exists: ${b.url}`);
  if (fs.existsSync(path)) {
    const svg = fs.readFileSync(path, 'utf8');
    ok(svg.startsWith('<svg') && svg.includes('</svg>'), `valid svg: ${b.id}`);
    // Textures need intrinsic dimensions or three.js sizes them at 0.
    ok(/width="\d+"/.test(svg) && /height="\d+"/.test(svg), `has explicit size: ${b.id}`);
  }
}

// Ids and urls must be unique or the picker selects the wrong one.
eq(new Set(BACKDROPS.map((b) => b.id)).size, BACKDROPS.length, 'ids are unique');
eq(new Set(BACKDROPS.map((b) => b.url)).size, BACKDROPS.length, 'urls are unique');

// Every declared category has at least one backdrop, so no empty tab.
for (const c of BACKDROP_CATEGORIES) {
  ok(backdropsByCategory(c).length > 0, `category '${c}' is non-empty`);
}
ok(BACKDROPS.every((b) => BACKDROP_CATEGORIES.includes(b.category)), 'no orphan categories');

// Scenes persist the url, but the picker may pass an id.
ok(findBackdrop('blue-sky'), 'lookup by id');
ok(findBackdrop('/backdrops/blue-sky.svg'), 'lookup by url');
eq(findBackdrop('nope'), undefined, 'unknown value returns undefined');
eq(findBackdrop(null), undefined, 'null is safe');
eq(findBackdrop(''), undefined, 'empty string is safe');

if (failures > 0) { console.log(`\n${failures} test(s) failed`); process.exit(1); }
console.log('\nAll backdrop tests passed');
