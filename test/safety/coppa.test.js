const {
  agePolicy,
  ageFromDateOfBirth,
  isValidAge,
  COPPA_AGE,
} = require('../.build/lib/safety/coppa.js');

let failures = 0;
function eq(actual, expected, label) {
  const ok = Object.is(actual, expected);
  if (!ok) { failures++; console.log(`FAIL ${label}: expected ${expected}, got ${actual}`); }
  else console.log(`ok   ${label}`);
}

// --- age band boundaries ----------------------------------------------------
eq(agePolicy(12).band, 'under-13', '12 is under-13');
eq(agePolicy(13).band, 'teen', '13 is a teen (COPPA boundary)');
eq(agePolicy(17).band, 'teen', '17 is a teen');
eq(agePolicy(18).band, 'adult', '18 is an adult');
eq(COPPA_AGE, 13, 'COPPA boundary is 13');

// --- the gate that actually matters: can this account share publicly? -------
eq(agePolicy(9, false).canShare, false, 'under-13 without consent cannot share');
eq(agePolicy(9, true).canShare, true, 'under-13 WITH consent can share');
eq(agePolicy(9, false).requiresParentalConsent, true, 'under-13 requires consent');
eq(agePolicy(14, false).canShare, true, 'teen can share without consent');
eq(agePolicy(14, false).requiresParentalConsent, false, 'teen needs no consent');

// --- unknown age must degrade to the STRICTEST band, not the loosest -------
eq(agePolicy(null).band, 'under-13', 'null age is treated as under-13');
eq(agePolicy(null).canShare, false, 'null age cannot share');
eq(agePolicy(undefined).requiresParentalConsent, true, 'undefined age requires consent');
eq(agePolicy(NaN).canShare, false, 'NaN age cannot share');
eq(agePolicy(999).canShare, false, 'out-of-range age cannot share');

// --- content filter tightens as age drops ----------------------------------
eq(agePolicy(8).contentFilterLevel > agePolicy(15).contentFilterLevel, true, 'younger = stricter filter');

// --- age validation ---------------------------------------------------------
eq(isValidAge(4), true, 'age 4 is valid');
eq(isValidAge(18), true, 'age 18 is valid');
eq(isValidAge(3), false, 'age 3 is too young');
eq(isValidAge(19), false, 'age 19 is out of range');
eq(isValidAge(10.5), false, 'fractional age is invalid');
eq(isValidAge('10'), false, 'string age is invalid');

// --- date-of-birth conversion ----------------------------------------------
const now = new Date('2026-08-14T00:00:00Z');
eq(ageFromDateOfBirth('2016-08-14', now), 10, 'exact birthday counts the full year');
eq(ageFromDateOfBirth('2016-08-15', now), 9, 'day before birthday is a year younger');
eq(ageFromDateOfBirth('2013-01-01', now), 13, 'crosses the COPPA boundary correctly');
eq(ageFromDateOfBirth('not-a-date', now), null, 'garbage input returns null');
eq(ageFromDateOfBirth('2030-01-01', now), null, 'future date returns null');

// A birthday later this month must NOT round up past the COPPA boundary.
eq(agePolicy(ageFromDateOfBirth('2013-12-01', now)).band, 'under-13', 'not-yet-13 stays under-13');

if (failures > 0) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll COPPA tests passed');
