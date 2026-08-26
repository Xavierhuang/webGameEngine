/**
 * Transactional authority for the World Builder public-release beta.
 *
 * This module intentionally does not touch `projects.visibility`, legacy
 * `is_published`, ordinary sharing, or ordinary remix records. A release is
 * authority over exactly one immutable Play snapshot, and public code must
 * consult `world_releases` rather than any mutable project field.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'mysql2/promise';
import type { Actor } from '../auth/actor';
import { withTransaction, type TransactionConnection } from '../mysql/transaction';
import { ageBandFromBirthMonth, capabilitiesFor, type ConsentState } from '../safety/capabilities';
import { readFeatureFlag, type FeatureFlagResult } from '../safety/featureFlags';
import { hashProjectSnapshot, loadProjectSnapshot, type ProjectSnapshot } from '../projects/projectSnapshot';
import {
  isWorldReleaseReviewable,
  runWorldReleaseChecks,
  type ReleaseCheckContext,
  type WorldReleaseCheckResult,
} from './releaseChecks';
import { canTransitionRelease, WORLD_RELEASE_LIVE_STATUSES, type WorldReleaseStatus } from './releaseTypes';
import { getWorldTemplate, type WorldTemplate } from './templates';
import { writeReleaseAudit, type ReleaseAuditEvent } from './releaseAudit';

export interface SubmitWorldReleaseInput {
  actor: Actor;
  projectId: string;
  expectedRevision: number;
  idempotencyKey: string;
}

export type ReleaseDecisionAction = 'publish' | 'request_changes' | 'reject';
export type ReleaseDecisionReasonCode =
  | 'approved'
  | 'changes_requested'
  | 'content_policy'
  | 'age_safety'
  | 'copyright'
  | 'administrative_action';
export type ReleaseTakedownReasonCode = Exclude<ReleaseDecisionReasonCode, 'approved' | 'changes_requested'>;

export interface DecideWorldReleaseInput {
  actor: Actor;
  releaseId: string;
  action: ReleaseDecisionAction;
  reasonCode?: ReleaseDecisionReasonCode;
}

export interface WithdrawWorldReleaseInput {
  actor: Actor;
  projectId: string;
  releaseId: string;
}

export interface TakeDownWorldReleaseInput {
  actor: Actor;
  releaseId: string;
  reasonCode: ReleaseTakedownReasonCode;
}

export interface WorldReleaseSubmission {
  id: string;
  status: WorldReleaseStatus;
  sourceRevision: number;
  submittedAt: string;
  replayed: boolean;
}

export interface WorldReleaseMutation {
  id: string;
  status: WorldReleaseStatus;
  replayed: boolean;
}

export type ReleaseServiceErrorCode =
  | 'release_auth_forbidden'
  | 'release_not_found'
  | 'release_cohort_forbidden'
  | 'feature_unavailable'
  | 'invalid_release_input'
  | 'idempotency_mismatch'
  | 'revision_conflict'
  | 'world_identity_invalid'
  | 'snapshot_unavailable'
  | 'snapshot_integrity_failed'
  | 'invalid_release_transition'
  | 'release_already_in_flight'
  | 'release_reason_invalid';

export class ReleaseServiceError extends Error {
  constructor(
    public readonly code: ReleaseServiceErrorCode,
    public readonly status: 400 | 403 | 404 | 409 | 422 | 503,
  ) {
    super(code);
    this.name = 'ReleaseServiceError';
  }
}

export interface ReleaseServiceOptions {
  pool?: Pick<Pool, 'getConnection'>;
  readFeatureFlag?: (name: 'community_publishing') => FeatureFlagResult;
  getWorldTemplate?: (id: string, version: number) => WorldTemplate | null | undefined;
  runWorldReleaseChecks?: (
    snapshot: ProjectSnapshot,
    context: ReleaseCheckContext,
  ) => Promise<ReadonlyArray<WorldReleaseCheckResult>>;
  writeAudit?: (event: ReleaseAuditEvent) => Promise<void>;
  now?: () => Date;
  uuid?: () => string;
}

interface LockedProjectRow {
  id: string;
  owner_id: string;
  revision: number | string;
}

interface WorldIdentityRow {
  template_id: string;
  template_version: number | string;
  active: number | boolean;
}

interface ProfileRow {
  id: string;
  user_id: string | null;
  profile_kind: string;
  role: string;
  display_name: string | null;
  username: string | null;
  birth_month: string | null;
}

interface ConsentRow {
  status: ConsentState;
  expires_at: Date | string;
}

interface SnapshotRow {
  id: string;
  project_id: string;
  revision: number | string;
  snapshot_json: unknown;
  snapshot_sha256: string;
}

interface AssetSizeRow {
  id: string;
  file_size: number | string | null;
}

interface ReleaseRow {
  id: string;
  project_id: string;
  project_play_snapshot_id: string;
  template_id: string;
  template_version: number | string;
  project_revision: number | string;
  snapshot_sha256: string;
  status: WorldReleaseStatus;
  current_public: number | boolean;
  public_slug: string | null;
  creator_label: string;
  submission_idempotency_key: string;
  submitted_at: Date | string;
}

const DECISION_REASONS: ReadonlySet<ReleaseDecisionReasonCode> = new Set([
  'approved', 'changes_requested', 'content_policy', 'age_safety', 'copyright', 'administrative_action',
]);
const TAKEDOWN_REASONS: ReadonlySet<ReleaseTakedownReasonCode> = new Set([
  'content_policy', 'age_safety', 'copyright', 'administrative_action',
]);

function rows<T>(result: unknown): T[] {
  return (result as [T[]])[0] ?? [];
}

function resultAffectedRows(result: unknown): number {
  return Number((result as [{ affectedRows?: number }])[0]?.affectedRows ?? 0);
}

function isSafeRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function requireString(value: unknown, maximumLength: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximumLength;
}

function isoTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function parseSnapshot(value: unknown): ProjectSnapshot | null {
  let parsed = value;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch { return null; }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  return parsed as ProjectSnapshot;
}

function consentState(row: ConsentRow | undefined, now: Date): ConsentState {
  if (!row) return 'not_required';
  if (row.status === 'pending' && new Date(row.expires_at).getTime() < now.getTime()) return 'expired';
  return row.status;
}

function creatorLabel(profile: ProfileRow): string {
  const candidate = profile.display_name?.trim() || profile.username?.trim() || 'World Builder';
  return candidate.slice(0, 100);
}

function actorAuditKind(actor: Actor): ReleaseAuditEvent['actorKind'] {
  return actor.kind === 'anonymous' ? 'anonymous' : actor.kind;
}

function actorAuditKey(actor: Actor): string {
  if (actor.kind === 'user') return actor.userId;
  if (actor.kind === 'guest') return actor.sessionId;
  return 'anonymous';
}

function requireUserActor(actor: Actor): Extract<Actor, { kind: 'user' }> {
  if (actor.kind !== 'user') throw new ReleaseServiceError('release_auth_forbidden', 403);
  return actor;
}

async function lockProject(
  connection: TransactionConnection,
  projectId: string,
): Promise<LockedProjectRow> {
  const project = rows<LockedProjectRow>(await connection.execute(
    `SELECT id, owner_id, revision
       FROM projects
      WHERE id = ?
      FOR UPDATE`,
    [projectId],
  ))[0];
  if (!project) throw new ReleaseServiceError('release_not_found', 404);
  return project;
}

async function lockWorldIdentity(
  connection: TransactionConnection,
  projectId: string,
): Promise<WorldIdentityRow> {
  const identity = rows<WorldIdentityRow>(await connection.execute(
    `SELECT project_worlds.template_id, project_worlds.template_version, world_templates.active
       FROM project_worlds
       INNER JOIN world_templates
         ON world_templates.template_id = project_worlds.template_id
        AND world_templates.version = project_worlds.template_version
      WHERE project_worlds.project_id = ?
      FOR UPDATE`,
    [projectId],
  ))[0];
  if (!identity) throw new ReleaseServiceError('world_identity_invalid', 422);
  return identity;
}

async function lockProfile(
  connection: TransactionConnection,
  profileId: string,
): Promise<ProfileRow> {
  const profile = rows<ProfileRow>(await connection.execute(
    `SELECT id, user_id, profile_kind, role, display_name, username, birth_month
       FROM profiles
      WHERE id = ?
      FOR UPDATE`,
    [profileId],
  ))[0];
  if (!profile) throw new ReleaseServiceError('release_not_found', 404);
  return profile;
}

async function currentPublishCapability(
  connection: TransactionConnection,
  profile: ProfileRow,
  now: Date,
): Promise<boolean> {
  const consent = rows<ConsentRow>(await connection.execute(
    `SELECT status, expires_at
       FROM parental_consents
      WHERE child_profile_id = ?
      ORDER BY created_at DESC
      LIMIT 1
      FOR UPDATE`,
    [profile.id],
  ))[0];
  const capabilities = capabilitiesFor({
    ageBand: ageBandFromBirthMonth(profile.birth_month, now),
    consent: consentState(consent, now),
  });
  return capabilities.publish && capabilities.community;
}

async function lockCohortMembership(
  connection: TransactionConnection,
  profileId: string,
): Promise<boolean> {
  const member = rows<{ present: number }>(await connection.execute(
    `SELECT 1 AS present
       FROM world_release_beta_cohort_members
      WHERE profile_id = ?
      LIMIT 1
      FOR UPDATE`,
    [profileId],
  ))[0];
  return Boolean(member);
}

async function lockSnapshotForRevision(
  connection: TransactionConnection,
  projectId: string,
  revision: number,
): Promise<SnapshotRow | null> {
  return rows<SnapshotRow>(await connection.execute(
    `SELECT id, project_id, revision, snapshot_json, snapshot_sha256
       FROM project_play_snapshots
      WHERE project_id = ? AND revision = ?
      FOR UPDATE`,
    [projectId, revision],
  ))[0] ?? null;
}

async function reReadSnapshot(
  connection: TransactionConnection,
  projectId: string,
  snapshotId: string,
): Promise<SnapshotRow> {
  const snapshot = rows<SnapshotRow>(await connection.execute(
    `SELECT id, project_id, revision, snapshot_json, snapshot_sha256
       FROM project_play_snapshots
      WHERE id = ? AND project_id = ?
      FOR UPDATE`,
    [snapshotId, projectId],
  ))[0];
  if (!snapshot) throw new ReleaseServiceError('snapshot_unavailable', 422);
  return snapshot;
}

function assertSnapshotIntegrity(snapshot: SnapshotRow, expectedProjectId: string, expectedRevision: number): ProjectSnapshot {
  const payload = parseSnapshot(snapshot.snapshot_json);
  if (
    !payload
    || snapshot.project_id !== expectedProjectId
    || Number(snapshot.revision) !== expectedRevision
    || payload.project.id !== expectedProjectId
    || Number(payload.project.revision) !== expectedRevision
    || hashProjectSnapshot(payload) !== snapshot.snapshot_sha256
  ) {
    throw new ReleaseServiceError('snapshot_integrity_failed', 422);
  }
  return payload;
}

/** Fetch asset sizes only from durable asset rows; no URL/client/snapshot fallback is allowed. */
async function trustedAssetByteSizes(
  connection: TransactionConnection,
  projectId: string,
  snapshot: ProjectSnapshot,
): Promise<Record<string, number>> {
  const assetIds = [...new Set(snapshot.assets.map((asset) => asset.id))];
  if (assetIds.length === 0) return {};
  const placeholders = assetIds.map(() => '?').join(',');
  const assetRows = rows<AssetSizeRow>(await connection.execute(
    `SELECT id, file_size
       FROM assets
      WHERE project_id = ? AND id IN (${placeholders})
      FOR UPDATE`,
    [projectId, ...assetIds],
  ));
  const sizes: Record<string, number> = {};
  for (const row of assetRows) {
    // mysql may return BIGINT as a string; accepting it only after an exact
    // safe-integer conversion preserves the Task 3 no-guessing contract.
    const size = typeof row.file_size === 'string' ? Number(row.file_size) : row.file_size;
    if (typeof size === 'number' && Number.isSafeInteger(size) && size >= 0) sizes[row.id] = size;
  }
  // Deliberately leave a missing, null, fractional, negative, or unsafe row
  // absent. `checkProjectBudgets` turns every absent snapshot asset into the
  // fixed `asset_size_unavailable` result instead of guessing from a URL.
  return sizes;
}

/**
 * A snapshot may back at most one release that is still in review or public.
 * Terminal and superseded releases stay as history, so an ordinary withdraw
 * and resubmit of the same revision reuses the same immutable snapshot row.
 * `migrations/015_world_release_active_snapshot.sql` enforces this in the
 * database; checking it under the project lock turns the boundary into a typed
 * release error the route layer can map instead of a driver duplicate key.
 */
/**
 * Defense in depth behind `assertSnapshotNotAlreadyLive`. The pre-check runs
 * under the project lock and should catch every live collision, but a raw
 * duplicate key on the release table must still surface as a typed release
 * error rather than a driver error the route layer would render as a 500.
 */
async function insertReleaseRow(
  connection: TransactionConnection,
  sql: string,
  parameters: Array<string | number | null>,
): Promise<void> {
  try {
    await connection.execute(sql, parameters);
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code === 'ER_DUP_ENTRY') throw new ReleaseServiceError('release_already_in_flight', 409);
    throw error;
  }
}

async function assertSnapshotNotAlreadyLive(
  connection: TransactionConnection,
  projectId: string,
  snapshotId: string,
): Promise<void> {
  const placeholders = WORLD_RELEASE_LIVE_STATUSES.map(() => '?').join(',');
  const live = rows<{ id: string }>(await connection.execute(
    `SELECT id
       FROM world_releases
      WHERE project_id = ? AND project_play_snapshot_id = ?
        AND status IN (${placeholders})
      LIMIT 1
      FOR UPDATE`,
    [projectId, snapshotId, ...WORLD_RELEASE_LIVE_STATUSES],
  ))[0];
  if (live) throw new ReleaseServiceError('release_already_in_flight', 409);
}

async function lockRelease(
  connection: TransactionConnection,
  releaseId: string,
): Promise<ReleaseRow> {
  const release = rows<ReleaseRow>(await connection.execute(
    `SELECT id, project_id, project_play_snapshot_id, template_id, template_version,
            project_revision, snapshot_sha256, status, current_public, public_slug,
            creator_label, submission_idempotency_key, submitted_at
       FROM world_releases
      WHERE id = ?
      FOR UPDATE`,
    [releaseId],
  ))[0];
  if (!release) throw new ReleaseServiceError('release_not_found', 404);
  return release;
}

async function requireAdmin(
  connection: TransactionConnection,
  actor: Actor,
): Promise<Extract<Actor, { kind: 'user' }>> {
  const user = requireUserActor(actor);
  const profile = await lockProfile(connection, user.profileId);
  if (profile.profile_kind !== 'user' || profile.user_id !== user.userId || profile.role !== 'admin') {
    throw new ReleaseServiceError('release_auth_forbidden', 403);
  }
  return user;
}

function releaseReplay(row: ReleaseRow): WorldReleaseSubmission {
  return {
    id: row.id,
    status: row.status,
    sourceRevision: Number(row.project_revision),
    submittedAt: isoTimestamp(row.submitted_at),
    replayed: true,
  };
}

function decisionFor(action: ReleaseDecisionAction, supplied: ReleaseDecisionReasonCode | undefined): {
  target: Extract<WorldReleaseStatus, 'published' | 'changes_requested' | 'rejected'>;
  decision: 'approved' | 'changes_requested' | 'rejected';
  reason: ReleaseDecisionReasonCode;
} {
  if (supplied !== undefined && !DECISION_REASONS.has(supplied)) {
    throw new ReleaseServiceError('release_reason_invalid', 422);
  }
  if (action === 'publish') {
    if (supplied !== undefined && supplied !== 'approved') throw new ReleaseServiceError('release_reason_invalid', 422);
    return { target: 'published', decision: 'approved', reason: 'approved' };
  }
  if (action === 'request_changes') {
    if (supplied !== undefined && supplied !== 'changes_requested') throw new ReleaseServiceError('release_reason_invalid', 422);
    return { target: 'changes_requested', decision: 'changes_requested', reason: 'changes_requested' };
  }
  if (supplied === 'approved' || supplied === 'changes_requested') throw new ReleaseServiceError('release_reason_invalid', 422);
  return { target: 'rejected', decision: 'rejected', reason: supplied ?? 'administrative_action' };
}

function terminalReplay(release: ReleaseRow, action: ReleaseDecisionAction): WorldReleaseMutation | null {
  const target = action === 'publish' ? 'published' : action === 'request_changes' ? 'changes_requested' : 'rejected';
  if (release.status === target && (target !== 'published' || Boolean(release.current_public))) {
    return { id: release.id, status: release.status, replayed: true };
  }
  return null;
}

function releaseDecisionReason(
  reason: ReleaseDecisionReasonCode,
): 'content_policy' | 'age_safety' | 'copyright' | 'administrative_action' | null {
  // `world_releases` records only adverse, child-safe result codes. The
  // append-only decision table records approved/changes_requested exactly;
  // copying either into this enum would be an invalid database value.
  return reason === 'content_policy' || reason === 'age_safety' || reason === 'copyright' || reason === 'administrative_action'
    ? reason
    : null;
}

export function createReleaseService(options: ReleaseServiceOptions = {}) {
  const now = options.now ?? (() => new Date());
  const makeUuid = options.uuid ?? randomUUID;
  const getTemplate = options.getWorldTemplate ?? getWorldTemplate;
  const readFlag = options.readFeatureFlag ?? readFeatureFlag;
  const runChecks = options.runWorldReleaseChecks ?? runWorldReleaseChecks;
  const writeAudit = options.writeAudit ?? writeReleaseAudit;

  async function auditAfterCommit(event: ReleaseAuditEvent): Promise<void> {
    // A committed removal/publication must not be reported to the caller as a
    // failed mutation if the non-authoritative audit sink is temporarily down.
    // The event payload is already code-only and has no mutable project data.
    try { await writeAudit(event); } catch { /* operational sink retries separately */ }
  }

  async function submitWorldRelease(input: SubmitWorldReleaseInput): Promise<WorldReleaseSubmission> {
    const actor = requireUserActor(input.actor);
    if (!requireString(input.projectId, 64) || !requireString(input.idempotencyKey, 128) || !isSafeRevision(input.expectedRevision)) {
      throw new ReleaseServiceError('invalid_release_input', 400);
    }

    const outcome = await withTransaction<WorldReleaseSubmission>(async (connection) => {
      const project = await lockProject(connection, input.projectId);
      if (project.owner_id !== actor.profileId) throw new ReleaseServiceError('release_not_found', 404);

      const existing = rows<ReleaseRow>(await connection.execute(
        `SELECT id, project_revision, status, submitted_at, project_id, project_play_snapshot_id,
                template_id, template_version, snapshot_sha256, current_public, public_slug,
                creator_label, submission_idempotency_key
           FROM world_releases
          WHERE project_id = ? AND submission_idempotency_key = ?
          FOR UPDATE`,
        [input.projectId, input.idempotencyKey],
      ))[0];
      if (existing) {
        if (Number(existing.project_revision) !== input.expectedRevision) {
          throw new ReleaseServiceError('idempotency_mismatch', 409);
        }
        return releaseReplay(existing);
      }

      const identity = await lockWorldIdentity(connection, input.projectId);
      const template = getTemplate(identity.template_id, Number(identity.template_version));
      if (!template || !template.active || !Boolean(identity.active)) {
        throw new ReleaseServiceError('world_identity_invalid', 422);
      }

      const profile = await lockProfile(connection, actor.profileId);
      if (profile.profile_kind !== 'user' || profile.user_id !== actor.userId) {
        throw new ReleaseServiceError('release_auth_forbidden', 403);
      }
      if (!readFlag('community_publishing').enabled) {
        throw new ReleaseServiceError('feature_unavailable', 503);
      }
      if (!await currentPublishCapability(connection, profile, now())) {
        throw new ReleaseServiceError('release_auth_forbidden', 403);
      }
      if (!await lockCohortMembership(connection, actor.profileId)) {
        throw new ReleaseServiceError('release_cohort_forbidden', 403);
      }
      if (Number(project.revision) !== input.expectedRevision) {
        throw new ReleaseServiceError('revision_conflict', 409);
      }

      let persistedSnapshot = await lockSnapshotForRevision(connection, input.projectId, input.expectedRevision);
      if (!persistedSnapshot) {
        const captured = await loadProjectSnapshot(connection, input.projectId);
        if (!captured || captured.project.revision !== input.expectedRevision) {
          throw new ReleaseServiceError('snapshot_unavailable', 422);
        }
        const snapshotId = makeUuid();
        const snapshotHash = hashProjectSnapshot(captured);
        await connection.execute(
          `INSERT INTO project_play_snapshots (id, project_id, revision, snapshot_json, snapshot_sha256)
           VALUES (?, ?, ?, ?, ?)`,
          [snapshotId, input.projectId, input.expectedRevision, JSON.stringify(captured), snapshotHash],
        );
        persistedSnapshot = await reReadSnapshot(connection, input.projectId, snapshotId);
      }

      // Always re-read after write/reuse while the project remains locked.
      const confirmedSnapshot = await reReadSnapshot(connection, input.projectId, persistedSnapshot.id);
      const immutableSnapshot = assertSnapshotIntegrity(confirmedSnapshot, input.projectId, input.expectedRevision);

      await assertSnapshotNotAlreadyLive(connection, input.projectId, confirmedSnapshot.id);

      const releaseId = makeUuid();
      await insertReleaseRow(
        connection,
        `INSERT INTO world_releases
           (id, project_id, project_play_snapshot_id, template_id, template_version,
            project_revision, snapshot_sha256, creator_label, submission_idempotency_key)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          releaseId,
          input.projectId,
          confirmedSnapshot.id,
          identity.template_id,
          Number(identity.template_version),
          input.expectedRevision,
          confirmedSnapshot.snapshot_sha256,
          creatorLabel(profile),
          input.idempotencyKey,
        ],
      );
      if (resultAffectedRows(await connection.execute(
        `UPDATE world_releases SET status = 'checking'
          WHERE id = ? AND status = 'submitted'`,
        [releaseId],
      )) !== 1) {
        throw new ReleaseServiceError('invalid_release_transition', 409);
      }

      const assetByteSizes = await trustedAssetByteSizes(connection, input.projectId, immutableSnapshot);
      const checkResults = await runChecks(immutableSnapshot, {
        templateId: identity.template_id,
        templateVersion: Number(identity.template_version),
        sourceRevision: input.expectedRevision,
        snapshotHash: confirmedSnapshot.snapshot_sha256,
        creatorLabel: creatorLabel(profile),
        assetByteSizes,
      });
      for (const result of checkResults) {
        await connection.execute(
          `INSERT INTO world_release_checks (id, world_release_id, check_type, status, reason_code)
           VALUES (?, ?, ?, ?, ?)`,
          [makeUuid(), releaseId, result.name, result.status, result.reasonCode],
        );
      }

      const status: WorldReleaseStatus = isWorldReleaseReviewable(checkResults)
        ? 'review_pending'
        : 'changes_requested';
      const reason = status === 'review_pending' ? null : 'automated_check_failed';
      if (!canTransitionRelease('checking', status)) throw new ReleaseServiceError('invalid_release_transition', 409);
      if (resultAffectedRows(await connection.execute(
        `UPDATE world_releases
            SET status = ?, checked_at = CURRENT_TIMESTAMP, decision_reason_code = ?
          WHERE id = ? AND status = 'checking'`,
        [status, reason, releaseId],
      )) !== 1) {
        throw new ReleaseServiceError('invalid_release_transition', 409);
      }

      const release = rows<ReleaseRow>(await connection.execute(
        `SELECT id, status, project_revision, submitted_at, project_id, project_play_snapshot_id,
                template_id, template_version, snapshot_sha256, current_public, public_slug,
                creator_label, submission_idempotency_key
           FROM world_releases
          WHERE id = ?
          FOR UPDATE`,
        [releaseId],
      ))[0];
      if (!release) throw new ReleaseServiceError('release_not_found', 404);
      return { ...releaseReplay(release), replayed: false };
    }, options.pool ? { pool: options.pool } : undefined);

    if (!outcome.replayed) {
      await auditAfterCommit({
        actorKind: actorAuditKind(actor), actorKey: actorAuditKey(actor),
        operation: 'world_release.submitted', outcome: 'allowed', reason: outcome.status,
        attributes: { sourceRevision: outcome.sourceRevision, releaseStatus: outcome.status },
      });
    }
    return outcome;
  }

  async function decideWorldRelease(input: DecideWorldReleaseInput): Promise<WorldReleaseMutation> {
    const action = input.action;
    if (!requireString(input.releaseId, 64) || !(['publish', 'request_changes', 'reject'] as const).includes(action)) {
      throw new ReleaseServiceError('invalid_release_input', 400);
    }
    const decision = decisionFor(action, input.reasonCode);

    const outcome = await withTransaction<WorldReleaseMutation>(async (connection) => {
      const actor = await requireAdmin(connection, input.actor);
      const release = await lockRelease(connection, input.releaseId);
      const project = await lockProject(connection, release.project_id);
      const replay = terminalReplay(release, action);
      if (replay) return replay;
      if (!canTransitionRelease(release.status, decision.target)) {
        throw new ReleaseServiceError('invalid_release_transition', 409);
      }

      if (decision.target === 'published') {
        if (!readFlag('community_publishing').enabled) throw new ReleaseServiceError('feature_unavailable', 503);
        const ownerProfile = await lockProfile(connection, project.owner_id);
        if (!await currentPublishCapability(connection, ownerProfile, now())) {
          throw new ReleaseServiceError('release_auth_forbidden', 403);
        }
        const snapshot = await reReadSnapshot(connection, release.project_id, release.project_play_snapshot_id);
        const payload = assertSnapshotIntegrity(snapshot, release.project_id, Number(release.project_revision));
        if (snapshot.snapshot_sha256 !== release.snapshot_sha256 || hashProjectSnapshot(payload) !== release.snapshot_sha256) {
          throw new ReleaseServiceError('snapshot_integrity_failed', 422);
        }
        await connection.execute(
          `UPDATE world_releases
              SET status = 'superseded', current_public = FALSE
            WHERE project_id = ? AND id <> ? AND status = 'published' AND current_public = TRUE`,
          [release.project_id, release.id],
        );
        if (resultAffectedRows(await connection.execute(
          `UPDATE world_releases
              SET status = 'published', current_public = TRUE, public_slug = ?,
                  decision_reason_code = NULL, reviewed_at = CURRENT_TIMESTAMP,
                  published_at = CURRENT_TIMESTAMP
            WHERE id = ? AND status = 'review_pending' AND current_public = FALSE`,
          [`wr_${makeUuid().replace(/-/g, '')}`, release.id],
        )) !== 1) throw new ReleaseServiceError('invalid_release_transition', 409);
      } else if (resultAffectedRows(await connection.execute(
        `UPDATE world_releases
            SET status = ?, current_public = FALSE, decision_reason_code = ?, reviewed_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'review_pending'`,
        [decision.target, releaseDecisionReason(decision.reason), release.id],
      )) !== 1) {
        throw new ReleaseServiceError('invalid_release_transition', 409);
      }

      await connection.execute(
        `INSERT INTO world_release_decisions (id, world_release_id, reviewer_profile_id, decision, reason_code)
         VALUES (?, ?, ?, ?, ?)`,
        [makeUuid(), release.id, actor.profileId, decision.decision, decision.reason],
      );
      return { id: release.id, status: decision.target, replayed: false };
    }, options.pool ? { pool: options.pool } : undefined);

    if (!outcome.replayed) {
      const actor = requireUserActor(input.actor);
      await auditAfterCommit({
        actorKind: actorAuditKind(actor), actorKey: actorAuditKey(actor), operation: 'world_release.decision',
        outcome: 'allowed', reason: outcome.status, attributes: { releaseStatus: outcome.status },
      });
    }
    return outcome;
  }

  async function withdrawWorldRelease(input: WithdrawWorldReleaseInput): Promise<WorldReleaseMutation> {
    const actor = requireUserActor(input.actor);
    if (!requireString(input.projectId, 64) || !requireString(input.releaseId, 64)) {
      throw new ReleaseServiceError('invalid_release_input', 400);
    }
    const outcome = await withTransaction<WorldReleaseMutation>(async (connection) => {
      const release = await lockRelease(connection, input.releaseId);
      if (release.project_id !== input.projectId) throw new ReleaseServiceError('release_not_found', 404);
      const project = await lockProject(connection, input.projectId);
      if (project.owner_id !== actor.profileId) throw new ReleaseServiceError('release_not_found', 404);
      if (release.status === 'withdrawn') return { id: release.id, status: release.status, replayed: true };
      if (!canTransitionRelease(release.status, 'withdrawn')) throw new ReleaseServiceError('invalid_release_transition', 409);
      if (resultAffectedRows(await connection.execute(
        `UPDATE world_releases
            SET status = 'withdrawn', current_public = FALSE, public_slug = NULL,
                decision_reason_code = 'creator_withdrew', withdrawn_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = ?`,
        [release.id, release.status],
      )) !== 1) throw new ReleaseServiceError('invalid_release_transition', 409);
      return { id: release.id, status: 'withdrawn', replayed: false };
    }, options.pool ? { pool: options.pool } : undefined);

    if (!outcome.replayed) {
      await auditAfterCommit({
        actorKind: actorAuditKind(actor), actorKey: actorAuditKey(actor), operation: 'world_release.withdrawn',
        outcome: 'allowed', reason: 'creator_withdrew', attributes: { releaseStatus: 'withdrawn' },
      });
    }
    return outcome;
  }

  async function takeDownWorldRelease(input: TakeDownWorldReleaseInput): Promise<WorldReleaseMutation> {
    if (!requireString(input.releaseId, 64) || !TAKEDOWN_REASONS.has(input.reasonCode)) {
      throw new ReleaseServiceError('release_reason_invalid', 422);
    }
    const outcome = await withTransaction<WorldReleaseMutation>(async (connection) => {
      const actor = await requireAdmin(connection, input.actor);
      const release = await lockRelease(connection, input.releaseId);
      await lockProject(connection, release.project_id);
      if (release.status === 'taken_down') return { id: release.id, status: release.status, replayed: true };
      if (!canTransitionRelease(release.status, 'taken_down')) throw new ReleaseServiceError('invalid_release_transition', 409);
      if (resultAffectedRows(await connection.execute(
        `UPDATE world_releases
            SET status = 'taken_down', current_public = FALSE, public_slug = NULL,
                decision_reason_code = ?, taken_down_at = CURRENT_TIMESTAMP
          WHERE id = ? AND status = 'published'`,
        [input.reasonCode, release.id],
      )) !== 1) throw new ReleaseServiceError('invalid_release_transition', 409);
      await connection.execute(
        `INSERT INTO world_release_decisions (id, world_release_id, reviewer_profile_id, decision, reason_code)
         VALUES (?, ?, ?, 'taken_down', ?)`,
        [makeUuid(), release.id, actor.profileId, input.reasonCode],
      );
      return { id: release.id, status: 'taken_down', replayed: false };
    }, options.pool ? { pool: options.pool } : undefined);

    if (!outcome.replayed) {
      const actor = requireUserActor(input.actor);
      await auditAfterCommit({
        actorKind: actorAuditKind(actor), actorKey: actorAuditKey(actor), operation: 'world_release.taken_down',
        outcome: 'allowed', reason: input.reasonCode, attributes: { releaseStatus: 'taken_down' },
      });
    }
    return outcome;
  }

  return { submitWorldRelease, decideWorldRelease, withdrawWorldRelease, takeDownWorldRelease };
}

const defaultReleaseService = createReleaseService();
export const submitWorldRelease = defaultReleaseService.submitWorldRelease;
export const decideWorldRelease = defaultReleaseService.decideWorldRelease;
export const withdrawWorldRelease = defaultReleaseService.withdrawWorldRelease;
export const takeDownWorldRelease = defaultReleaseService.takeDownWorldRelease;
