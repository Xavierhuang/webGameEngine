# LingPlay Inclusive Production Readiness Design

Date: 2026-08-18
Status: Approved design, awaiting written-spec review

## Summary

Finish LingPlay's responsive editor, accessibility semantics, localization, low-end-device performance, production guardrails, privacy-preserving observability, and CI enforcement. This phase validates the complete experience created by the preceding trust, durability, and creation projects rather than adding another parallel architecture.

## Goals

- Make core creation and play journeys usable on phone, tablet, keyboard, and screen reader.
- Complete localization and RTL behavior across all child-facing journeys.
- Bound rendering and project complexity for school Chromebooks and mobile devices.
- Add explicit security headers, configuration validation, monitoring, and backup health.
- Put route safety and complete user journeys in CI.
- Remove the lint-warning backlog and keep it at zero.
- Split oversized modules only where the approved boundaries require it.

## Non-goals

- Native mobile applications.
- Pixel-identical layouts across screen sizes.
- Third-party behavioral advertising or invasive child analytics.
- A general rewrite of every large file.
- Declaring translations legally or culturally approved without human review.
- Deploying the live service without separate authorization.

## Responsive Editor Shell

The same authored project and commands power every form factor:

- Desktop shows Stage or Blocks with object navigation and properties panels where space permits.
- Tablet keeps Stage and Blocks primary and moves secondary surfaces into dismissible, focus-managed drawers.
- Phone shows one focused surface at a time with bottom tabs for Stage, Blocks, Objects, and Properties plus an overflow menu for Play, Share, Undo, Redo, Help, and project navigation.

Global navigation always offers Home, Explore, Learn, My Games, locale, account, and administrative links allowed for the viewer. Touch targets are at least 44 CSS pixels. Blockly, scene gestures, drawers, and page scrolling have non-conflicting pointer regions.

## Accessibility

- Every form control has a persistent programmatic label and described validation state.
- Dialogs use the shared semantic dialog primitive with naming, `aria-modal`, initial focus, focus trap, Escape handling, and focus restoration.
- Hidden-on-hover actions become visible with `focus-visible` or `focus-within`.
- Save, speech, game outcomes, and recoverable errors use appropriately polite or assertive live regions.
- Three.js object selection and essential game actions expose equivalent semantic DOM controls and state summaries; decorative canvas content remains hidden from accessibility APIs.
- All primary journeys work without a pointer. Focus order follows the visible workflow and never enters obscured drawers or modal backgrounds.
- Reduced motion disables nonessential camera shake, animated transitions, and decorative motion without changing game logic.

Automated axe checks supplement, but do not replace, complete keyboard journeys and manual screen-reader acceptance notes.

## Localization and RTL

Every user-facing string in landing, authentication, consent, creation, editor, tutorials, player, sharing, reporting, administration, and errors lives in the message catalog. Dynamic control instructions use localized structured fragments rather than concatenated English.

Each locale records `machine_draft`, `native_review_pending`, or `native_reviewed`. Unreviewed translations remain visibly available for testing but are not represented as professionally reviewed. Arabic receives full `dir=rtl` browser journeys; directional icons, panel order, Blockly layout, and mixed code/text content are checked explicitly. Locale switching stays available on mobile and persists without overriding explicit user choice.

## Performance and Complexity Budgets

- The player disables `preserveDrawingBuffer` except during an explicit capture operation.
- Model and texture parsing, bounds, and validated block data are prepared outside per-frame loops.
- Per-frame React state updates are replaced with refs or bounded-rate state publication where UI rendering is required.
- Starter/model selectors lazy-load visible assets under a fixed WebGL-context and network-concurrency budget.
- Rendering uses adaptive device-pixel-ratio and quality tiers with conservative mobile defaults.
- Import and ordinary creation share hard limits for scenes, objects, blocks, clones, audio duration, asset bytes, texture dimensions, model polygons, script steps per frame, and concurrent AI/runtime jobs.
- Exceeding a limit produces a child-readable error before committing or playing the unsafe content.

Performance acceptance uses representative automated fixtures at desktop and mobile viewport/device profiles plus documented manual checks on a low-end Chromebook-class device. Budgets track startup time, interaction responsiveness, frame stability, WebGL context loss, memory trend, and battery-intensive background work.

## Platform Guardrails

The application emits and regression-tests a nonce- or hash-based Content Security Policy, `frame-ancestors`, `Referrer-Policy`, `X-Content-Type-Options`, and a Permissions Policy limiting camera and microphone to routes that explicitly need them. Remote media is served through the approved same-origin asset path.

Production startup fails when JWT/session secrets, database credentials, trusted-proxy configuration, storage configuration, moderation mode, or backup destination are missing or unsafe. Database defaults never fall back to root with an empty password in production. Public error responses omit stack traces and sensitive configuration.

## Observability and Privacy

Operational telemetry records route latency/error class, save success/conflict/failure, moderation state transitions, deletion/backup health, WebGL failures, and coarse activation milestones such as first project, first object, first working script, first Play, and first Share/Remix. Events use pseudonymous rotating actor identifiers and never include birth dates, emails, raw IPs, prompts, dialogue, project titles, recordings, or uploaded content.

Dashboards distinguish correctness, safety, cost, and performance signals. Alerts cover authorization anomaly rates, AI budget exhaustion, moderation backlog, deletion failures, backup age, restore-verification failure, and elevated save conflicts. Retention is documented and bounded.

## Product Truth and Documentation

Marketing, Learn, safety, privacy, and README claims are checked against one maintained capability inventory. Block counts, locale counts, starter availability, moderation behavior, monitoring status, storage/deletion behavior, and supported devices cannot be hard-coded inconsistently across pages. Claims such as “every block,” “every prompt,” or “all systems normal” are removed unless an automated source proves them at render time.

Footer and support links point to real project-specific destinations. Service health links to an actual status surface rather than a static assertion. Community guidelines are a dedicated document, not an anchor to unrelated marketing copy. Repository documentation describes the current locale set, monitoring, backups, consent restrictions, deployment gates, and known external review requirements.

## CI and Quality Gates

Required CI stages are:

1. type-check and lint with zero warnings;
2. focused unit and integration tests;
3. the complete runtime/logic suite;
4. production build and startup smoke test;
5. route authorization matrix and hostile cross-project tests;
6. guest-to-account, consent, publish, deletion, save-conflict, and recovery journeys;
7. desktop, tablet, phone, keyboard, axe, and Arabic RTL journeys;
8. representative rendering and project-budget checks.

The existing 453 warnings are burned down in reviewed, behavior-preserving groups before `--max-warnings=0` becomes mandatory. Disabling rules broadly, converting values to `any`, or deleting useful diagnostics does not count as remediation.

## Module Boundaries

Large files are split only while implementing approved responsibilities:

- actor/access and route guards;
- transaction, command, revision, and save queue;
- editor authored store and responsive shell;
- player control resolution, speech overlays, runtime scene, and debug overlays;
- asset storage/moderation and deletion jobs;
- observability event definitions and sinks.

Public interfaces are typed and covered before consumers move. Refactoring does not intentionally alter unrelated game behavior.

## Error Handling

- Unsupported viewport or WebGL conditions offer a recoverable reduced-quality path.
- Accessibility and localization failures block the affected CI journey.
- Missing production configuration stops startup with the missing key name but never its value.
- Telemetry sink failure never blocks saving or gameplay and is bounded to avoid memory growth.
- Backup, deletion, and moderation backlogs remain visible and alertable until resolved.

## Testing and Acceptance Criteria

- Complete signup or secure-guest, create, edit, Play, save, reload, share, remix, and report journeys work at desktop, tablet, and phone breakpoints.
- Those journeys are keyboard-operable, pass automated accessibility checks, and have documented screen-reader acceptance.
- Arabic journeys render correct direction, navigation, dialogs, Blockly/editor surfaces, controls, and mixed text.
- No production player debug overlay or unused animation loop remains active.
- Representative projects stay within agreed low-end-device budgets and oversized projects fail safely.
- Required security headers and production configuration validation have regression tests.
- Operational events contain no disallowed child content or direct identifiers.
- Public claims, counts, links, safety copy, and README content match the maintained capability inventory.
- Database and asset backup age plus restore verification are observable.
- Lint reports zero warnings and CI fails on any new warning.
- Focused tests, the complete suite, build, browser journeys, accessibility, RTL, and performance gates all pass before release documentation is considered complete.
