const { decideAccess } = require('../.build/lib/auth/projectAccess.js');

let failures = 0;
function eq(actual, expected, label) {
  const ok = Object.is(actual, expected);
  if (!ok) { failures++; console.log(`FAIL ${label}: expected ${expected}, got ${actual}`); }
  else console.log(`ok   ${label}`);
}

const OWNER = 'profile-owner';
const OTHER = 'profile-other';

const priv = { owner_id: OWNER, visibility: 'private', moderation_status: 'pending' };
const publicApproved = { owner_id: OWNER, visibility: 'public', moderation_status: 'approved' };
const publicRejected = { owner_id: OWNER, visibility: 'public', moderation_status: 'rejected' };
const shared = { owner_id: OWNER, visibility: 'shared', moderation_status: 'approved' };

// --- owner ------------------------------------------------------------------
eq(decideAccess(priv, OWNER).canView, true, 'owner can view own private project');
eq(decideAccess(priv, OWNER).canEdit, true, 'owner can edit own private project');
eq(decideAccess(priv, OWNER).isOwner, true, 'owner is flagged as owner');
eq(decideAccess(publicRejected, OWNER).canView, true, 'owner can still view their rejected project');

// --- the guest bypass this module was written to close ----------------------
// An unidentified caller previously fell through an empty `if` and got full
// read AND write access to any project by UUID.
eq(decideAccess(priv, null).canView, false, 'anonymous cannot view a private project');
eq(decideAccess(priv, null).canEdit, false, 'anonymous cannot edit a private project');
eq(decideAccess(publicApproved, null).canEdit, false, 'anonymous cannot edit a PUBLIC project');
eq(decideAccess(publicApproved, null).canView, true, 'anonymous can view an approved public project');

// --- a different signed-in user --------------------------------------------
eq(decideAccess(priv, OTHER).canView, false, 'non-owner cannot view a private project');
eq(decideAccess(priv, OTHER).canEdit, false, 'non-owner cannot edit a private project');
eq(decideAccess(publicApproved, OTHER).canView, true, 'non-owner can view an approved public project');
eq(decideAccess(publicApproved, OTHER).canEdit, false, 'public visibility does NOT grant write');
eq(decideAccess(publicApproved, OTHER).isOwner, false, 'non-owner is not flagged as owner');

// --- moderation gating ------------------------------------------------------
eq(decideAccess(publicRejected, OTHER).canView, false, 'rejected public project is hidden from others');
eq(decideAccess(publicRejected, null).canView, false, 'rejected public project is hidden from anonymous');

// --- 'shared' is not 'public' ----------------------------------------------
eq(decideAccess(shared, OTHER).canView, false, "visibility 'shared' does not imply public read");

// --- missing/undefined fields degrade closed --------------------------------
eq(decideAccess({ owner_id: OWNER }, null).canView, false, 'missing visibility degrades closed');
eq(decideAccess({ owner_id: OWNER }, OTHER).canEdit, false, 'missing visibility grants no write');
// moderation_status is absent on some legacy queries; public should still read.
eq(
  decideAccess({ owner_id: OWNER, visibility: 'public' }, OTHER).canView,
  true,
  'absent moderation_status treated as not-rejected'
);

if (failures > 0) {
  console.log(`\n${failures} test(s) failed`);
  process.exit(1);
}
console.log('\nAll project-access tests passed');
