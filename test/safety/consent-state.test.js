const assert = require('node:assert/strict');
const test = require('node:test');
const {
  capabilitiesFor,
  ageBandFromBirthMonth,
} = require('../.build/lib/safety/capabilities.js');

// The reference table below is the wire contract every route consults
// via `capabilitiesFor`. Adding a capability is a schema change; changing
// a value here is a permission change. Both should be visible in review.

test('pending under-13 capabilities are private and non-AI', () => {
  assert.deepEqual(
    capabilitiesFor({ ageBand: 'under_13', consent: 'pending' }),
    {
      editPrivate: true,
      publish: false,
      share: false,
      creationAI: false,
      personalMedia: false,
      community: false,
    },
  );
});

test('granted under-13 unlocks share and community but NOT AI or personal media', () => {
  // A parent's "yes, sharing is fine" must not silently opt them in to
  // microphone recording or AI-generated content — those require a
  // separate explicit consent per the plan's global constraints.
  assert.deepEqual(
    capabilitiesFor({ ageBand: 'under_13', consent: 'granted' }),
    {
      editPrivate: true,
      publish: true,
      share: true,
      creationAI: false,
      personalMedia: false,
      community: true,
    },
  );
});

test('denied under-13 keeps private editing but nothing else', () => {
  assert.deepEqual(
    capabilitiesFor({ ageBand: 'under_13', consent: 'denied' }),
    {
      editPrivate: true,
      publish: false,
      share: false,
      creationAI: false,
      personalMedia: false,
      community: false,
    },
  );
});

test('expired under-13 is pinned at pending capabilities — the child stays useful', () => {
  // A 24-hour expiry that lands on nothing must not lock the child out
  // of their private drafts; they can still build while a resend goes
  // through.
  assert.deepEqual(
    capabilitiesFor({ ageBand: 'under_13', consent: 'expired' }),
    capabilitiesFor({ ageBand: 'under_13', consent: 'pending' }),
  );
});

test('under-13 with not_required is a contradiction — capability lookup returns zeros', () => {
  // The state machine should never produce this pair, but a schema bug
  // that lets it happen must not open a hole.
  assert.deepEqual(
    capabilitiesFor({ ageBand: 'under_13', consent: 'not_required' }),
    {
      editPrivate: false,
      publish: false,
      share: false,
      creationAI: false,
      personalMedia: false,
      community: false,
    },
  );
});

test('teen defaults to the full capability set regardless of consent state', () => {
  const expected = {
    editPrivate: true,
    publish: true,
    share: true,
    creationAI: true,
    personalMedia: true,
    community: true,
  };
  assert.deepEqual(capabilitiesFor({ ageBand: 'teen', consent: 'not_required' }), expected);
  assert.deepEqual(capabilitiesFor({ ageBand: 'teen', consent: 'pending' }), expected);
});

test('adult defaults to the full capability set regardless of consent state', () => {
  const expected = {
    editPrivate: true,
    publish: true,
    share: true,
    creationAI: true,
    personalMedia: true,
    community: true,
  };
  assert.deepEqual(capabilitiesFor({ ageBand: 'adult', consent: 'not_required' }), expected);
  assert.deepEqual(capabilitiesFor({ ageBand: 'adult', consent: 'expired' }), expected);
});

test('returned capabilities object is a fresh copy — callers cannot mutate the frozen source', () => {
  const first = capabilitiesFor({ ageBand: 'under_13', consent: 'granted' });
  first.creationAI = true;
  const second = capabilitiesFor({ ageBand: 'under_13', consent: 'granted' });
  assert.equal(second.creationAI, false, 'mutating the returned object must not leak back');
});

// --- ageBandFromBirthMonth ------------------------------------------------

test('ageBandFromBirthMonth respects the 13-year COPPA boundary', () => {
  const now = new Date('2026-08-14T00:00:00Z');
  assert.equal(ageBandFromBirthMonth('2013-08', now), 'teen', 'birthday this month → 13');
  assert.equal(ageBandFromBirthMonth('2013-09', now), 'under_13', 'not yet 13');
  assert.equal(ageBandFromBirthMonth('2014-01', now), 'under_13', 'clearly under 13');
  assert.equal(ageBandFromBirthMonth('2008-01', now), 'adult', 'clearly 18+');
  assert.equal(ageBandFromBirthMonth('2010-01', now), 'teen', 'between 13 and 18');
});

test('ageBandFromBirthMonth defaults unknown or malformed values to the strictest band', () => {
  assert.equal(ageBandFromBirthMonth(null), 'under_13');
  assert.equal(ageBandFromBirthMonth(undefined), 'under_13');
  assert.equal(ageBandFromBirthMonth(''), 'under_13');
  assert.equal(ageBandFromBirthMonth('2016'), 'under_13', 'missing month');
  assert.equal(ageBandFromBirthMonth('2016-13'), 'under_13', 'invalid month');
  assert.equal(ageBandFromBirthMonth('16-08'), 'under_13', 'two-digit year rejected');
});
