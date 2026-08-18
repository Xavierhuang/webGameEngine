# LingPlay Durable Work and Data Lifecycle Design

Date: 2026-08-18
Status: Approved design, awaiting written-spec review

## Summary

Make every visible save, undo, account transition, upload, and deletion truthful and recoverable. LingPlay retains its normalized MySQL project model, but writes flow through transactions, revision checks, idempotent commands, and one storage abstraction. Secure guest work is visible in My Games and transfers atomically to an account during signup or login.

This project depends on the actor and authorization interfaces from the trust-boundary design.

## Goals

- Prevent partial multi-row mutations and stale overwrites.
- Persist the same authored state that the editor displays.
- Make undo and redo survive reload and Play.
- Preserve secure guest projects when an account is created or linked.
- Store child media privately and delete it when promised.
- Back up the database and assets off-site with a verified restore path.

## Non-goals

- Real-time multi-user collaboration.
- A full event-sourced rewrite of every historical mutation.
- Automatically reclaiming quarantined legacy guest projects.
- Offline-first multi-device synchronization.
- Live infrastructure deployment without separate authorization.

## Transaction Boundary

The MySQL module adds `withTransaction<T>(operation): Promise<T>`. The callback receives one connection; it commits only after the callback succeeds and rolls back on every thrown error. Signup/profile creation, secure-guest claim, remix/import, block replacement, AI updates, project deletion metadata, and other multi-row writes must use this boundary.

Transactions are short and never include network calls, AI generation, moderation, email, or blob transfer. External work completes first into a quarantined state, then a short transaction records the result. Retryable deadlocks use a bounded retry policy with jitter and preserve the same idempotency key.

## Revisions and Commands

Each project has a monotonically increasing `revision`. An authored mutation carries:

- project ID;
- expected revision;
- unique idempotency key;
- typed command name and schema-validated payload;
- inverse payload sufficient for persistent undo where applicable.

The command endpoint authorizes the actor, checks the expected revision, applies the complete mutation transactionally, increments the revision, and stores the idempotency result. A repeated idempotency key returns the original result. A stale revision returns `409` with the current revision and no mutation.

Existing narrow endpoints remain temporarily as adapters that call the same command handlers. New editor code does not write project tables directly through separate component-specific fetches.

## Persistent Undo and Redo

User-visible editor actions form command groups. Adding an object, dragging it, renaming it, changing properties, replacing a Blockly workspace, and deleting content each record a validated inverse at commit time. Undo submits that inverse as a new command against the current revision; redo submits the original command again with a new idempotency key.

History is scoped to the current editing session and retained long enough to survive reload through a small persisted history record. If a later change makes an inverse unsafe, Undo reports a conflict and preserves current work; it never shows a local state that the server rejected.

## Save State and Recovery

The editor exposes exactly four persistence states: `Unsaved`, `Saving`, `Saved`, and `Retry`. `Saved` means the server has acknowledged the current authored revision. Failed commands remain in a recoverable local queue and expose Retry and Export Recovery actions. Metadata-only saving cannot change the global state to Saved while scene, object, or block commands remain pending.

Recovery exports contain the last confirmed project snapshot plus ordered pending commands, schema version, and no authentication credentials. Importing recovery data creates a new project rather than overwriting an unrelated project ID.

## Secure Guest Claiming

My Games queries projects for the resolved actor, including a secure guest. Signup or login can claim the current secure guest profile in the same transaction that links or creates the authenticated profile:

1. lock the guest session and both profiles;
2. verify the guest token and destination account;
3. move project and asset ownership or merge the profile according to existing schema constraints;
4. revoke the guest session;
5. record an audit entry and commit.

The operation is idempotent. Failure leaves ownership and the guest session unchanged. Quarantined legacy profiles are excluded from automatic claiming.

## Asset Storage and Deletion

All uploads use an `AssetStore` interface with put, open, quarantine, promote, and delete operations. Production storage is private object storage; local development uses a non-public filesystem directory. Database rows contain opaque storage keys, checksums, byte sizes, media metadata, scan status, and ownership. Public delivery uses same-origin authenticated or short-lived signed URLs according to project visibility.

Blob upload completes to quarantine before its database row is committed. A failed database write deletes the quarantined blob. Promotion happens only after validation and moderation. Per-user and per-project quotas prevent unbounded storage.

Project and account deletion create idempotent deletion jobs. A worker deletes dependent blobs, verifies absence, records results, and retries transient failures. The user-facing record is not declared fully erased until the deletion audit reaches `completed`; administrators can inspect and retry failures without seeing child media.

## Backup and Restore

Backup tooling produces an encrypted database dump plus a versioned asset manifest and copies both to configurable off-site storage. Local same-host copies are optional cache, not the durable backup. Retention supports daily and monthly tiers configured through environment variables with startup validation.

A restore-verification command restores into an isolated database and asset prefix, checks schema version, row counts, checksums, project-to-asset references, and sample project loading, then destroys only the explicitly named verification target. Production documentation includes backup, restore, key rotation, and incident steps.

## Error Handling

- Transaction failure returns no partial mutation.
- Revision conflict preserves pending local commands and offers reload/reapply, not silent last-write-wins.
- Blob/database mismatch enters a repair queue and is visible in administrative health output.
- Guest-claim failure does not revoke the guest session.
- Backup failure produces a durable alert event and never deletes the last known-good backup.
- Deletion failure remains retryable and is never reported as completed.

## Testing and Acceptance Criteria

- Every multi-row write rolls back completely when each intermediate step is forced to fail.
- Duplicate idempotency keys never duplicate objects, blocks, projects, or ownership moves.
- Concurrent writes produce one success and one revision conflict rather than data loss.
- Edit, undo, reload, Play, redo, and reload all show the same persisted authored state.
- My Games displays projects for a secure guest.
- Guest create to signup/login to publish preserves projects, assets, and access atomically.
- Failed guest claiming leaves the guest project accessible through the original secure session.
- Upload failure leaves neither public nor orphaned blobs.
- Project/account deletion removes database rows and blobs and produces a completed audit.
- Backup and isolated restore verification cover both database and assets.
- Focused tests, the complete logic suite, type-checking, lint, build, and browser recovery journeys pass.

