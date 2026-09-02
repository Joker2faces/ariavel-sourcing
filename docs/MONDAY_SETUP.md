# monday Developer Center setup

1. Open the existing Ariavel Sourcing app (ID `12049778`) in Developer Center.
2. Inspect the current draft version and its Features tab.
3. Reuse the existing **Object / Custom Object** feature named **Ariavel Sourcing Hub**. Only if authenticated inspection proves it is absent should a feature be created, and never create a new app.
4. Build this project with `npm run build`. For current CLI-hosted client deployment, use the selected existing draft version with `mapps code:push --client-side -d ./dist -i <DRAFT_APP_VERSION_ID>`. Alternatively configure a custom URL on the same draft feature.
5. Test through the development installation and verify the Object opens from the workspace Add item menu.
6. Configure permissions and backend environment variables only through monday’s supported settings/secret mechanisms. Never commit `.env`, tokens, client secrets or signing secrets.
7. Keep the version in draft. Promotion to live is intentionally outside this milestone and requires explicit approval.

The current official CLI is `@mondaycom/apps-cli` (`mapps`), not the deprecated legacy `monday-cli`. The app can later use `mapps code:push` and the related deployment commands when a monday-hosted backend is introduced.

## Authentication prerequisite

This repository never stores the monday API token. Configure the Apps MCP in `apps` mode using its supported local MCP configuration, or initialize the CLI outside version control:

```bash
npx mapps init
npx mapps app:list
npx mapps app-version:list -a 12049778
npx mapps app-features:list -a 12049778 -i <DRAFT_APP_VERSION_ID>
```

Use interactive secret entry or an approved local secret manager; do not put tokens on a committed command line, `.env.example`, source file or documentation value. Before any deployment, verify the app ID, draft version ID and existing feature ID. Never use `mapps app:promote` for Milestone 2.

Milestone 2 can run with its normalized mock board provider inside monday. Real board discovery is intentionally deferred until least-privilege runtime authentication and required read scopes are configured.
