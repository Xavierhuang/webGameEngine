# lingplay

Scratch-style game building in 3D, for kids. Blockly palette, a coroutine
interpreter, React Three Fiber + cannon-es, MySQL, deployed to a single droplet.

Live at [play.lingcode.dev](https://play.lingcode.dev).

## Getting started

```bash
npm install
npm run db:migrate      # applies every migration in migrations/, in order
npm run dev             # http://localhost:3000
```

You need a local MySQL. Defaults are `root` @ `localhost` with no password and
a database named `gameengine` — override with `MYSQL_*` (see `.env.example`).

`JWT_SECRET` is required in production and the app **refuses to sign tokens
without it**. In development it falls back to a random per-process value and
warns. That is deliberate: the previous silent fallback meant every restart
invalidated all sessions with no error anywhere.

## Verifying

```bash
npm run test:all    # one tsc compile, then every pure-logic suite (scripts/all-gate.mjs)
npm run type-check  # must be zero; the build enforces it
npm run lint        # must be zero; the build enforces it
npm run smoke       # loads every page in real Chromium
npm run a11y        # accessibility checks in real Chromium
npm run test:visual # renders real starter models and measures their pixels
npm run test:journey # signs up and builds a game in a real browser
```

`test:journey` needs a local server and database and creates a real account, so
it is local-only — do not point it at production.

**Every block a child can drag is checked to actually do something.**
`test:palette-coverage` asserts each of the 128 blocks resolves to an
interpreter case, a hat the runtime starts, or an operator — and that the
toolbox never offers a type with no definition. That invariant was verified by
hand once, when the palette was 107 blocks. A block that drags, snaps and saves
but does nothing at runtime raises no error anywhere; a child just assumes they
used it wrong.

**Nor is a passing test suite proof anyone can see anything.** A child opened
the Animation Editor and asked "why can't I see anything?" — the model had
loaded, all 16 bones were listed, nothing threw, and every assertion was
green. The viewport was empty because the component that renders the model was
defined *inside* its parent, so React remounted it on every parent render and
discarded the loaded GLB. `react/no-unstable-nested-components` is now an
error, and `npm run test:visual` is the only check in the repo that looks at
rendered pixels.

**A status code is not proof a page works.** A deploy once white-screened the
whole site with a client-side exception while every page returned HTTP 200.
`npm run smoke` exists because of that, and it is verified to fail when a JS
chunk goes missing. Same for `a11y` — its detectors are checked against crafted
DOMs, because a check that cannot fail is decoration.

## Architecture

| Area | Where | Notes |
|---|---|---|
| Blocks | `lib/blockly/definitions.ts` | Pure data. Adding a block needs **no serializer change** — `BLOCK_SPECS` is derived reflectively |
| Runtime | `lib/runtime/interpreter.ts` | Generator-coroutine interpreter. No React, no THREE. A failing or unknown block is recorded on `RuntimeWorld.scriptErrors` and shown as a badge in the player — it used to be swallowed silently |
| Player | `components/player/GamePlayer.tsx` | Implements `RuntimeContext`; every method is optional so old contexts keep compiling |
| Editor | `components/editor/` | Blockly workspace keyed per object, so each sprite owns its scripts |
| Access control | `lib/auth/projectAccess.ts` | Pure `decideAccess()`; `lib/auth/access.ts` wires it to a request |

### Adding a block

1. `lib/blockly/definitions.ts` — one JSON object, plus a toolbox entry
2. `types/game.ts` — add to the `LogicBlockType` union
3. `lib/runtime/interpreter.ts` — one `case` in `runBlock`
4. If it touches the world, add an optional method to `RuntimeContext` and
   implement it in `GamePlayer`

Operators are cheaper still: one line in `BINARY_OPS`/`UNARY_OPS` generates the
block *and* its toolbox entry.

### Pure modules

Several modules are deliberately import-free so node tests can require them
directly: `projectAccess`, `coppa`, `keyword-scan`, `soundCatalog`,
`proceduralAnimation`, `customAnimation`, `paint/tools`, `i18n/messages`,
`tutorials/catalog`, `blockly/definitions`.

**Use relative imports in these** — the test scripts run bare `tsc`, which does
not resolve the `@/` alias.

## Generated content

```bash
npm run generate:backdrops   # 32 SVG backdrops
npm run generate:starters    # 39 character GLBs (macOS + Metal only), then compresses them
npm run models:compress      # meshopt-compress every GLB under public/models (idempotent)
```

Every GLB ships meshopt-compressed (`tools/models/compress.mjs`): the starter
library went from 3.7 MB to 1.3 MB; the red dragon is excluded because its
render contract pins exact vertex bounds. drei's `useGLTF` registers the decoder
itself; a bare `GLTFLoader` needs `setMeshoptDecoder`, and the CSP carries
`wasm-unsafe-eval` for it. `npm run test:visual` renders the compressed
files, so a decoder regression shows up as a blank model there.

Both are deterministic. The starter roster is written down **twice** — in
`StarterCatalog.swift` and in `generate.sh`, which needs the names up front to
reserve publication locks. `test:starter-generator` asserts they match; it
caught `--all` silently emitting 21 of 39 characters.

## Security headers

`next.config.js` sets a Content-Security-Policy, HSTS, `X-Frame-Options`,
`Referrer-Policy` and `Permissions-Policy` on every response, and marks
`/models/*` and `/backdrops/*` immutable. The CSP is strict about scripts
(self only) and permissive about images, media and fetches (`https:`), because
a child's project can reference a model on another host. `unsafe-eval` is only
added in development for React Refresh. If nginx on the droplet also sets any
of these, remove one copy — duplicated CSP headers intersect.

## Deploying

```bash
./deploy.sh
```

rsync → migrations → build → restart → browser smoke test. It will **fail the
deploy** if the smoke test does.

Three things it does deliberately:

- **Stops the service before wiping `.next`.** The old process used to keep
  serving during the rebuild, handing browsers HTML that referenced chunk files
  the build had just deleted. A brief 502 retries cleanly; a corrupted app does
  not.
- **Keeps the previous build** as `.next.prev` until the browser smoke test
  has passed, and **restores it if the smoke test fails**. It used to delete
  the previous build a few lines before the test that would have needed it.
  A machine without Playwright now fails the deploy instead of silently
  skipping the test; set `LINGPLAY_SKIP_SMOKE=1` to ship unverified on purpose.
- **Excludes `public/uploads`.** That holds user drawings, recordings and
  uploaded models, and `rsync --delete` erased it on every deploy until this
  was added. Only `public/uploads/models/` is gitignored, so the other
  subdirectories can exist locally — the rsync exclude is what protects the
  droplet's copy, not `.gitignore`.

Migrations are tracked in a `schema_migrations` table and skipped once applied —
`001` creates a trigger that cannot be re-run without `SUPER`.

## Backups

`scripts/backup-db.sh` runs nightly from cron on the droplet, keeping 14 days.
It verifies the archive is intact and contains tables, and **deletes the file
rather than keeping a dump that restores nothing** — a backup that looks fine
and is empty is worse than a loud failure.

Set `BACKUP_S3_URI` (plus `BACKUP_S3_ENDPOINT` for DigitalOcean Spaces and the
usual `AWS_*` credentials) and each archive is also copied off the droplet;
set `BACKUP_GPG_RECIPIENT` to encrypt it first. Without those it prints that
backups stay on the host, because a host loss then takes the database and its
backups together.

## Alerting

`scripts/alert-errors.mjs` runs from cron every five minutes on the droplet.
It fails `/api/health` loudly and emails `ALERT_EMAIL` (through the same
Resend key as parental-consent mail) when the health check fails or
`error_events` spikes past `ALERT_ERROR_THRESHOLD` in the last window, with a
one-hour cooldown so an outage does not mail twelve times.

## Publishing a child's game

"Share publicly" moves a project to `moderation_pending`. A moderator opens
`/admin/reports`, plays it, and clicks **Publish** or **Reject**
(`/api/admin/moderation`). Only then does it appear in Explore and become
playable from its link — `decideAccess` requires all three of
`visibility = 'public'`, `is_published` and `moderation_status = 'published'`.
Edits after approval go live with the next play, so a report is the safety
net for a game that changes after review.

## Safety

This is a product for children, and the safety paths are load-bearing:

- **COPPA** — date of birth at signup, age band, and single-use hashed parental
  consent tokens. Publishing is blocked server-side for under-13s until a parent
  consents.
- **Moderation** — text is screened on create, update, publish, AI input *and
  AI output*. Reports feed an admin queue; a take-down hides the project from
  the gallery.
- **Access** — editing is owner-only and `visibility === 'public'` never grants
  write. Guests are identified by cookie, which is what made those checks
  possible at all.
- **World Builder is private-phase only** — template worlds start as private
  drafts and can be edited and played only by their owner. Public release is
  blocked until the later candidate, asset-quarantine, approval, and reviewer
  phases are implemented.

## Deliberate omissions

**No comments, and no studios.** Not a gap — a decision. "There is no open chat
between children" is in the privacy policy, not only the marketing, which makes
it a representation to parents and a COPPA-relevant statement for under-13s.
Shipping comments would make it false on deploy. Remix carries the community
loop instead, and `test:journey` covers the whole chain: share → open it signed
out → remix it. Revisit only by changing the promise first, in public, on
purpose.

## Known gaps

Honest, not exhaustive:

- **micro:bit and other hardware extensions** are absent — no board to verify
  against, and shipping unverified hardware code to children is worse than not
  shipping it.

**Video Sensing** ships. `turn video on/off`, `video motion`, `video
direction`, `when video motion > n`, and `set video transparency`. The camera
stays off until a script turns it on, nothing leaves the browser, and the
stream is stopped the moment video is turned off. Motion detection is a pure
function in `lib/video/motion.ts` tested against frames built by hand — a
camera can tell you *something* moved, only a constructed frame can tell you
whether "moved right" reports right. `npm run test:video-camera` drives the
whole pipeline through Chromium's synthetic capture device.

What that still cannot answer is calibration: whether the noise floor and
sensitivity feel right for a hand waving in a real room. That needs a person
with a real camera.
- **Sounds are synthesized**, not recorded. Kids can record their own instead.
- **19 languages, 12 of them not natively reviewed.** The original seven (en,
  zh, es, fr, pt, de, ja) are inline in `messages.ts`; the other twelve live one
  per file in `lib/i18n/locales/` and each carries the header *"Not natively
  reviewed. Complete and placeholder-safe, not yet idiomatic."* That is
  machine-translated UI in front of children until a native speaker reads it.
  RTL is wired (`lib/i18n/direction.ts`, applied in `app/layout.tsx`) but no
  test renders an RTL layout. Block labels and toolbox categories are translated
  in all of them (121 blocks; the maths operators — `%1 + %2`, `sin`, `ln` — are
  deliberately left as symbols, as Scratch leaves them). Dropdown choices
  (`up arrow`, `ghost`, drum and instrument names) and the editor chrome are
  translated too. Still English: **default field values** like `score` and
  `message1`, which are starting points a child renames rather than labels, and
  — intentionally — the privacy policy and tutorial prose, because
  machine-translating a legal document is worse than not doing it. Scratch ships 70+ languages via a volunteer translation community; that
  is a contributor problem, not an engineering one.
- **No error monitoring.** Failures surface in `journalctl -u lingplay`.
- **The React Compiler rules are off in twelve files.** All 67 violations have
  been read individually; two were real defects and are fixed (an impure
  `performance.now()` during render, and a hook returning a stale ref
  snapshot). The remaining 65 are deliberate patterns — SSR-safe state, an
  imperative game loop, refs written inside pointer handlers. The rules are
  errors everywhere else. Reasoning in `eslint.config.mjs`.
- **None of this has been tested with an actual child.** Everything is verified
  against the author's assumptions about what a child will do.
