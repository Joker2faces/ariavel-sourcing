# monday Developer Center setup

1. Open the existing Ariavel Sourcing app (ID `12049778`) in Developer Center.
2. Verify that draft App Version ID `17506248` is still current. Draft version IDs can change when a new draft is created.
3. Reuse the existing **Object / Custom Object** feature (ID `123330040`). Its product-facing name is **Ariavel Sourcing Hub**; it is currently displayed as **Object feature** in Developer Center. Never create a duplicate app or Object feature.
4. Build this Vite client with `npm run build`. The `./dist` directory contains the required root `index.html` and is deployed as client-side code:

   ```bash
   mapps code:push --client-side -d ./dist -i 17506248
   ```

   Do not use the server-side monday code flow for this frontend.
5. Test through the development installation and verify the existing Object opens from the workspace Add item menu.
6. Configure permissions and backend environment variables only through monday's supported settings and secret mechanisms. Never commit `.env`, tokens, client secrets, signing secrets, or `.mappsrc`.
7. Keep the version in draft. Promotion to live is outside this milestone and requires separate explicit approval.

The supported CLI is `@mondaycom/apps-cli` (`mapps`), not the deprecated legacy `monday-cli`.

## Authentication prerequisite

This repository never stores a monday API token. The user must initialize the CLI locally:

```bash
npm install -g @mondaycom/apps-cli
mapps init -t <PERSONAL_DEVELOPER_TOKEN>
mapps app:list
mapps app-version:list -i 12049778
mapps app-features:list -a 12049778 -i 17506248
```

Run the token-bearing initialization command manually. Never send the token through chat, copy it into repository files, or commit `.mappsrc`; that file is ignored by Git. Before deployment, verify the app ID, current draft version ID, and existing feature ID through Developer Center or authenticated CLI output. Never use `mapps app:promote` without separate explicit approval.

If a version-controlled manifest would help future development, export it only after authentication using the current `mapps manifest:export` command. Inspect every exported file for secrets and credentials before adding it to Git.

Milestone 3 uses `monday.api()` for real board discovery. The `boards:read` OAuth scope must be listed under **Permissions** in Developer Center for the app before board queries will succeed. No additional scopes are required for `monday.storage` calls; storage is always available to client-side apps.

See `docs/MONDAY_APP_STATE.md` for the confirmed non-secret application inventory and deployment boundary.
