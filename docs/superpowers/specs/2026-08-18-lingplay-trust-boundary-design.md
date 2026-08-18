# LingPlay Trust Boundary Design

Date: 2026-08-18
Status: Approved design, awaiting written-spec review

## Summary

Replace LingPlay's forgeable guest identity, scattered authorization checks, permissive AI routes, and incomplete publishing moderation with one explicit trust boundary. The release invalidates all legacy guest cookies, quarantines their projects for admin-assisted recovery, and issues opaque revocable guest sessions going forward. No high-risk AI mutation or public publishing path remains enabled unless its complete authorization and moderation path passes regression tests.

This is the first of four remediation projects. It must ship before durable-work, creation-experience, or production-readiness changes depend on the new actor and access interfaces.

## Goals

- Make a public profile or project identifier useless as an authentication credential.
- Apply the same project access decision to every route and nested resource.
- Prevent anonymous or unauthorized AI reads and writes.
- Treat parental consent as a server-controlled state machine.
- Moderate the complete publishable project graph and fail closed.
- Enforce shared quotas and request budgets for paid or resource-intensive operations.
- Provide adversarial tests that fail if any protected route skips the trust boundary.

## Non-goals

- Automatically reclaiming legacy guest projects from the insecure cookie.
- Determining legal compliance without qualified privacy counsel.
- Replacing the existing user-session format when it already uses secure HttpOnly cookies.
- Adding comments, messaging, or other new social features.
- Deploying changes to the live service as part of repository implementation.

## Actor and Session Model

### Actor resolution

One server-only module resolves every request to exactly one actor:

- `user`: an authenticated account and its profile;
- `guest`: an unexpired opaque guest session and its profile;
- `anonymous`: neither credential is valid.

An authenticated user always wins over a guest cookie. Actor resolution never accepts a profile ID, owner ID, project ID, forwarded user header, or client-supplied role as proof of identity.

### Guest sessions

The guest cookie is named `lingplay_guest_session`. Its value is 32 cryptographically random bytes encoded as base64url. The database stores only a SHA-256 hash plus `profile_id`, `created_at`, `last_seen_at`, `expires_at`, and `revoked_at`. The cookie is `HttpOnly`, `Secure` in production, `SameSite=Lax`, `Path=/`, and expires after 30 days. Rotation creates a new row and revokes the previous token.

The legacy `guest-profile-id` cookie is ignored and cleared. A migration creates a quarantine record for every profile with no `user_id` that predates the secure-session rollout. Quarantine records contain the guest profile ID, quarantine time, recovery status, recovering administrator, and audit note. Recovery is manual and never treats knowledge of a public project or profile ID as sufficient proof.

## Authorization Boundary

### Interfaces

The access module exposes typed, server-only operations:

- `resolveActor(request): Promise<Actor>`;
- `getProjectAccess(actor, projectId): Promise<ProjectAccess>`;
- `requireProjectView(actor, projectId): Promise<AuthorizedProject>`;
- `requireProjectEdit(actor, projectId): Promise<AuthorizedProject>`;
- `requireResourceEdit(actor, resourceType, resourceId): Promise<AuthorizedResource>`.

`ProjectAccess` contains `canView`, `canEdit`, `canPublish`, `canRemix`, and a reason code. Nested-resource authorization resolves the resource's owning project in the same database query; callers cannot supply a project ID that is trusted separately from the resource.

### Route policy

- Private project reads require `canView` before loading scenes, objects, blocks, assets, or AI context.
- Editor entry requires `canEdit`; public visitors use the project page or a future explicit read-only remix view.
- Every project, scene, object, block, upload, test, player, import, remix, and AI route calls the centralized boundary.
- Development-only test pages return 404 in production and still require access in development.
- API responses expose stable public author metadata, not internal owner/profile IDs.
- Authorization failures use 404 where revealing resource existence would leak private information; authenticated actors lacking an allowed action receive 403 where existence is already public.

## Consent State Machine

Consent status is one of `not_required`, `pending`, `approved`, `denied`, or `expired`. The server derives the required state from stored birth-date/age-band policy and verified account role; it never trusts a client `isParent` flag.

For an underage `pending` account:

- the child may sign in to a restricted private workspace;
- public sharing, publishing, creation AI, personal-media upload, and community interactions are disabled;
- only the minimum parent contact needed for the consent request is retained;
- the consent bearer token is delivered only to the parent channel and is never returned in the child's response or UI.

Consent tokens are single-use, hashed in storage, purpose-bound, expire after 24 hours, and are invalidated after approval, denial, or replacement. Email failure leaves the account pending and provides a resend action that never reveals the token. The implementation and copy must receive privacy-counsel review before live deployment.

## AI and Resource Budgets

- AI read endpoints require `canView`; project-mutating AI requires `canEdit` and approved consent when consent is required.
- Generated updates are parsed through a strict schema with limits on commands, strings, objects, blocks, assets, and nested depth.
- Every referenced scene, object, or asset is resolved through the authorized project before execution.
- Mutation runs in a database transaction and either commits completely or makes no change.
- Project-mutating AI remains disabled after the trust-boundary release until the durable-work transaction helper is available and its rollback tests pass.
- A shared persistent limiter records per-account, per-guest-session, per-project, and trusted-proxy-derived IP buckets. The first implementation may use atomic MySQL upserts behind a replaceable limiter interface; it cannot rely on process memory.
- AI requests have input-token, output-token, payload-byte, concurrent-job, daily-request, and daily-cost ceilings. Expensive model generation runs as a bounded asynchronous job rather than holding a web request open for minutes.
- Input, retained conversation context, generated text, and generated asset descriptions are moderated. Unsafe output is discarded rather than partially applied.

## Publishing and Media Moderation

Publishing builds an immutable moderation candidate from the complete project graph: project metadata, scene names, object names and properties, dialogue, questions, prompts, block text, audio, textures, models, thumbnails, and every external reference.

All media is imported to same-origin quarantine storage before scanning. Remote URLs are never rendered directly to visitors. Import enforces HTTPS, an allow/deny host policy, timeouts, redirect limits, byte limits, content signatures, image dimensions, texture memory, model polygon counts, and rejection of external model dependencies.

Publishing transitions through `draft`, `moderation_pending`, `published`, or `rejected`. Provider failure remains `moderation_pending`. A published project's mutation marks the published snapshot stale and requires a new moderation pass; the last approved snapshot remains visible until replacement approval or explicit unpublish.

New publishing remains disabled until the durable-work `AssetStore` provides private quarantine storage. The trust-boundary phase may continue serving an already-approved snapshot, but it never accepts a new direct remote-media reference as a shortcut.

## Error Handling and Audit

- Authentication and authorization errors never echo secrets or private resource details.
- Consent delivery and moderation-provider failures are retryable states, not implicit approval.
- AI schema or transaction failure returns no partial success and records a redacted audit event.
- Security audits record actor kind, public operation name, outcome, reason code, request correlation ID, and timestamp. They do not record child prompts, dialogue, email addresses, or raw tokens.
- Repeated suspicious failures can revoke the relevant session and trip a feature-level kill switch.

## Rollout

1. Add new tables and server modules without accepting new guest sessions.
2. Gate AI mutation, publishing, and private-context AI reads behind disabled-by-default server flags.
3. Deploy route-policy tests and migrate route call sites.
4. Create quarantine records, invalidate legacy guest cookies, and enable opaque guest sessions.
5. Keep AI mutation and new publishing disabled until durable-work transactions and private asset quarantine are available.
6. Enable AI and publishing features only after their complete focused and browser test gates pass.

Rollback disables the affected capability and revokes newly issued guest sessions; it never re-enables the legacy cookie.

## Testing and Acceptance Criteria

- A public profile ID cannot authenticate, view private work, edit, delete, upload, or invoke AI.
- Every protected route is exercised for owner, secure guest owner, authenticated stranger, unauthenticated visitor, and administrator where applicable.
- Cross-project scene/object/block IDs are rejected even when the caller can edit another project.
- Private project data never enters AI context for an unauthorized actor.
- Legacy guest cookies are cleared and produce no actor.
- Guest tokens are stored hashed, expire, rotate, and revoke correctly.
- Underage pending accounts cannot publish, share, invoke creation AI, upload personal media, or self-approve consent.
- Consent tokens never appear in child-facing API responses or HTML.
- Moderation includes the entire project graph and provider failure remains pending.
- Paid endpoints enforce shared quotas across separate application processes.
- Focused tests, the complete logic suite, type-checking, lint, build, and hostile browser journeys pass before capability flags are enabled.
