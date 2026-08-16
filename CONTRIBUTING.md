# Contributing

## Requirements

- Node.js 20 or newer
- Discord or DiscordPTB with BetterDiscord
- BDFDB Library installed in BetterDiscord

## Development Workflow

1. Read `docs/README.md` and the relevant canonical document.
2. Reproduce the behavior with a focused test.
3. If the focused test loads `DiscordAITranslator.plugin.js`, run `npm run build` first so it exercises the current `src/` tree.
4. Run the test and confirm it fails for the expected reason.
5. Implement the smallest behavior change.
6. Rebuild when `src/` changed, run the focused test, then `npm run verify`.
7. Review the diff for unrelated settings, documentation, and metadata changes.
8. Back up and deploy the plugin for a Discord smoke test when runtime behavior changed.

## Commands

```powershell
npm run build        # regenerate DiscordAITranslator.plugin.js from src/
npm run build:check  # confirm the committed plugin matches a fresh build
npm run check        # syntax-check the generated plugin
npm test             # run the full test suite
npm run verify       # build check + syntax check + full test suite
```

Run one test file:

```powershell
npm test -- tests/channel-primary-engine-regression.test.js
```

After changing `src/`, run `npm run build` before a focused test that instantiates the generated plugin. Otherwise the test may load an older bundle.

## Release Metadata

`src/plugin/metadata.json` is the source of truth for the BetterDiscord metadata banner, including `@version`. The build copies it into `DiscordAITranslator.plugin.js`; keep `package.json`, `README.md`, and `CHANGELOG.md` aligned with that source.

The distributed plugin metadata must use an English description and include the repository through `@authorLink`, `@website`, or `@source` metadata.

## Deployment

The installed development copy is normally:

```text
%AppData%\BetterDiscord\plugins\DiscordAITranslator.plugin.js
```

Before replacing it:

1. Copy the installed file to the repository-external archive.
2. Copy the verified runtime file into the BetterDiscord plugin directory.
3. Compare SHA-256 hashes.
4. Confirm the version and basic behavior in DiscordPTB.

Do not commit deployment backups to this repository.
