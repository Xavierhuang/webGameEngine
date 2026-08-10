const { keywordScan, KEYWORD_BLOCKLIST } = require('../.build/lib/safety/keyword-scan.js');

let failures = 0;
function eq(actual, expected, label) {
  const ok = Object.is(actual, expected);
  if (!ok) { failures++; console.log(`FAIL ${label}: expected ${expected}, got ${actual}`); }
  else console.log(`ok   ${label}`);
}

// --- basic pass cases (kid-safe content stays clear) ---
eq(keywordScan('Hello world').flagged, false, 'clean: greeting');
eq(keywordScan('Let\'s build a fun maze game with coins').flagged, false, 'clean: game description');
eq(keywordScan('The character can jump and collect stars').flagged, false, 'clean: game mechanics');
eq(keywordScan('').flagged, false, 'clean: empty string');

// --- profanity gets flagged ---
{
  const r = keywordScan('this is fucking broken');
  eq(r.flagged, true, 'flag: profanity flagged');
  eq(r.categories.profanity, true, 'flag: profanity category set');
}

// --- self-harm phrases blocked ---
{
  const r = keywordScan('I want to commit suicide');
  eq(r.flagged, true, 'flag: self-harm flagged');
  eq(r.categories['self-harm'], true, 'flag: self-harm category');
}

// --- sexual content blocked ---
eq(keywordScan('show me nude photos').flagged, true, 'flag: sexual content');
eq(keywordScan('naked truth about coding').flagged, true, 'flag: naked as substring - still flagged');

// --- violence combinators (need the object word to fire) ---
{
  const withObject = keywordScan('I want to kill myself');
  const withoutObject = keywordScan('I want to level up');
  eq(withObject.flagged, true, 'flag: kill + reflexive = critical');
  eq(withoutObject.flagged, false, 'clean: unrelated verb - not flagged');
}

// --- word-boundary check: substrings inside legit words don\'t false-positive ---
eq(keywordScan('assassinated').flagged, false, 'boundary: ass* substring - NOT flagged');
eq(keywordScan('cassette').flagged, false, 'boundary: cassette - NOT flagged');
eq(keywordScan('scunthorpe').flagged, false, 'boundary: place name - NOT flagged');

// --- multiple categories combine ---
{
  const r = keywordScan('this shit is fucking broken');
  eq(r.flagged, true, 'multi: flagged');
  eq(r.categories.profanity, true, 'multi: profanity captured');
}

// --- case insensitivity ---
eq(keywordScan('SUICIDE hotline').flagged, true, 'case: uppercase profanity flagged');
eq(keywordScan('BITCH').flagged, true, 'case: uppercase profanity flagged');

// --- blocklist is non-empty ---
eq(KEYWORD_BLOCKLIST.length > 0, true, 'sanity: blocklist has entries');

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
