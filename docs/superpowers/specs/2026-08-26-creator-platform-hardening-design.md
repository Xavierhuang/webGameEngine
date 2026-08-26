# Creator Platform Hardening Design

## Goal

Make LingPlay safer and more dependable for children creating and sharing 3D games without changing the existing game model or requiring a new hosting provider.

## Scope

This release repairs the model-import flow, places one policy around model URLs and uploaded model bytes, restores trustworthy automated release gates, shortens deployment interruption from build-length to restart-length, and promotes the maintained starter worlds in discovery.

It does not make World Builder templates publicly publishable yet. That needs a separate moderation and parental-consent release because public templates become a new child-created-content surface.

## Model assets

`lib/assets/modelPolicy.ts` is the shared policy boundary. It accepts packaged and uploaded same-origin paths and HTTPS URLs from an explicit trusted-host list used by LingPlay's generation providers. It rejects arbitrary URLs, insecure URLs, IP-literal hosts, traversal paths, unsupported extensions, and overlong inputs.

The model-upload route accepts only the existing six formats, applies a persistent request limit, checks byte size before and after reading, and verifies each file has the expected binary or text signature before writing it. The UI adds `projectId` to the multipart request and surfaces policy failures beside the input. Both the client and command schema use the shared URL validator so a direct API call cannot bypass the picker.

## Release confidence

The flat ESLint configuration scopes React/React Hooks rules to extensions with their plugins, including CommonJS files, so `npm run lint` checks the whole repository. CI runs a focused critical suite in addition to the historical suite: project command transactions, AI updates, world creation/preview/missions/privacy, publication boundaries, and consent state.

## Deployment

`deploy.sh` builds a complete Next output in a unique temporary sibling directory while the active `.next` output continues to serve. Only after a successful build does it briefly stop the service, atomically replace `.next`, then restart and smoke-test. A failed build leaves the active output untouched. User uploads remain excluded from both staging and replacement.

## Discovery

The public Explore page gets a concise "Start with a polished world" section above legacy examples. It directs children to the maintained World Builder templates, while older projects remain available as coding examples rather than representing the platform's recommended first experience.

## Verification

Each defect receives a regression test first. The complete release gate is lint, type-check, focused critical tests, build, browser smoke, accessibility checks, and a production smoke after deployment.
