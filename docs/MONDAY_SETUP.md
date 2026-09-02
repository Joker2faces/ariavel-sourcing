# monday Developer Center setup

1. Open the existing Ariavel Sourcing app (ID `12049778`) in Developer Center.
2. Inspect the current draft version and its Features tab.
3. If the required feature is absent, create **Object** and name it **Ariavel Sourcing Hub**. Do not create a new app.
4. Build this project with `npm run build` and configure the resulting frontend build/custom URL on the draft feature according to the current Developer Center flow.
5. Test through the development installation and verify the Object opens from the workspace Add item menu.
6. Configure permissions and backend environment variables only through monday’s supported settings/secret mechanisms. Never commit `.env`, tokens, client secrets or signing secrets.
7. Keep the version in draft. Promotion to live is intentionally outside this milestone and requires explicit approval.

The current official CLI is `@mondaycom/apps-cli` (`mapps`), not the deprecated legacy `monday-cli`. The app can later use `mapps code:push` and the related deployment commands when a monday-hosted backend is introduced.
