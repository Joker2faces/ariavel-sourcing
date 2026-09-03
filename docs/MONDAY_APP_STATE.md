# Existing monday application state

This file records non-secret Developer Center metadata for development safety. Verify it against Developer Center or authenticated CLI output before every deployment or destructive operation.

## Verification status (2026-09-03, post-secret-configuration session)

The table below is **not re-verified** this session — `mapps` CLI is non-functional in this environment (`~/.config/configstore` is access-denied to the current user, blocking all `mapps` subcommands including `--help`). Server/client redeploy to pick up the newly configured `MONDAY_CLIENT_SECRET` could not be performed. Treat the draft App Version ID below as last-known, not current, until the CLI access issue is fixed and `mapps app-version:list -i 12049778` is re-run.

## Confirmed inventory

| Setting | Confirmed value |
| --- | --- |
| App | Ariavel Sourcing |
| App ID | `12049778` |
| Current draft App Version ID | `17506248` |
| Existing feature ID | `123330040` |
| Developer Center feature name | Object feature |
| Product-facing feature name | Ariavel Sourcing Hub |
| Feature type | `AppFeatureObject` / Object / Custom Object |
| Frontend | React, Vite, TypeScript |
| Build directory | `./dist` |
| Intended development hosting | monday client-side code / CDN deployment |

## Client-side CDN deployment history

### Milestone 5 (2026-09-03)

| Field | Value |
| --- | --- |
| Deployment date | 2026-09-03 |
| CLI version | `@mondaycom/apps-cli` 4.10.8 |
| Command | `mapps code:push --client-side -s -d ./dist -i 17506248` |
| CDN URL | `https://v0db73a92e586e9b83ce92ef3094ca4eb.cdn2.monday.app` |
| Source archive | `https://v0db73a92e586e9b83ce92ef3094ca4eb.cdn2.monday.app/source/13298178.zip` |
| Security scan | Passed (`-s` flag used) |
| Build size | 245.79 kB JS / 26.32 kB CSS |
| Tests at deploy | 201/201 passing (20 files) |
| Notes | Client-side only; server-side (monday Code) requires manual deploy after Document DB and signing secret setup |

### Milestone 2 (2026-09-02)

| Field | Value |
| --- | --- |
| CLI version | `@mondaycom/apps-cli` 4.10.8 |
| CDN URL | `https://v0db73a92e586e9b83ce92ef3094ca4eb.cdn2.monday.app` |
| Source archive | `.../source/13296729.zip` |
| Security scan | Passed |

### Milestone 4 (2026-09-03)

| Field | Value |
| --- | --- |
| Deployment date | 2026-09-03 |
| CLI version | `@mondaycom/apps-cli` 4.10.8 |
| Command | `mapps code:push --client-side -s -d ./dist -i 17506248` |
| CDN URL | `https://v0db73a92e586e9b83ce92ef3094ca4eb.cdn2.monday.app` |
| Source archive | `https://v0db73a92e586e9b83ce92ef3094ca4eb.cdn2.monday.app/source/13298105.zip` |
| Security scan | Passed (`-s` flag used) |
| Build size | 238.90 kB JS / 24.11 kB CSS |
| Tests at deploy | 162/162 passing (16 files) |
| Feature binding | Bound to feature `123330040` via Developer Center |

### Milestone 3 (2026-09-03)

| Field | Value |
| --- | --- |
| Deployment date | 2026-09-03 |
| CLI version | `@mondaycom/apps-cli` 4.10.8 |
| Command | `mapps code:push --client-side -s -d ./dist -i 17506248` |
| CDN URL | `https://v0db73a92e586e9b83ce92ef3094ca4eb.cdn2.monday.app` |
| Build category | `view` (client-side CDN) |
| Source archive | `https://v0db73a92e586e9b83ce92ef3094ca4eb.cdn2.monday.app/source/13297670.zip` |
| Security scan | Passed (`-s` flag used) |
| Feature binding | Bound to feature `123330040` via Developer Center (same URL as M2) |

## Deployment boundary

- The canonical target is the existing draft version `17506248`, after verifying it is still current.
- Reuse feature `123330040`; never create a duplicate Object feature.
- Never create another Ariavel Sourcing app.
- Deploy the Vite `./dist` output as client-side code, not server-side monday code.
- Never promote a draft to live without separate explicit approval.
- App Version IDs can change when new drafts are created. Always re-run authenticated inspection before deployment.
- Verify App IDs and Feature IDs against Developer Center or the CLI before destructive operations.

## Authenticated inspection and deployment

After the user configures `mapps` authentication locally:

```bash
mapps app:list
mapps app-version:list -i 12049778
mapps app-features:list -a 12049778 -i 17506248
npm run build
mapps code:push --client-side -d ./dist -i 17506248
```

The final command is permitted only for the verified development draft. It does not authorize promotion, release, or Marketplace submission.

Never store personal developer tokens, client secrets, signing secrets, or `.mappsrc` in Git. If a manifest is exported, inspect it for credentials before committing it.
