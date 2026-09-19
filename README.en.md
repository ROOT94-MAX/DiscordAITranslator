<div align="center">

# DiscordAITranslator

[简体中文](README.md) | [English](README.en.md)

[![Platform](https://img.shields.io/badge/Platform-Discord-5865F2?style=flat-square&logo=discord&logoColor=white)](https://discord.com)
[![Loader](https://img.shields.io/badge/Loader-BetterDiscord-4E5D94?style=flat-square)](https://betterdiscord.app)
[![Version](https://img.shields.io/badge/Version-1.0.0-success?style=flat-square)](https://github.com/ROOT94-MAX/DiscordAITranslator/releases/latest)
[![Verify](https://img.shields.io/github/actions/workflow/status/ROOT94-MAX/DiscordAITranslator/verify.yml?branch=master&style=flat-square&label=verify)](https://github.com/ROOT94-MAX/DiscordAITranslator/actions/workflows/verify.yml)
[![Downloads](https://img.shields.io/github/downloads/ROOT94-MAX/DiscordAITranslator/total?style=flat-square&color=yellow)](https://github.com/ROOT94-MAX/DiscordAITranslator/releases)
[![License](https://img.shields.io/badge/License-GPL%20v2-blue?style=flat-square)](LICENSE)

A BetterDiscord translation plugin for channel-aware incoming translation, outgoing translation, historical backfill, manual actions, forwarded messages, and protected text.

**Current version: v1.0.0** · **Runtime: BetterDiscord + BDFDB Library**

Version 1.0.0 is released. Use [GitHub Releases](https://github.com/ROOT94-MAX/DiscordAITranslator/releases/latest) for downloads and release notes. Advanced settings allow 100–10,000 cache entries (default 500). Diagnostics shows the version, build, and provider status with expandable troubleshooting details.

[Download latest plugin](https://github.com/ROOT94-MAX/DiscordAITranslator/releases/latest/download/DiscordAITranslator.plugin.js) · [Open release notes](https://github.com/ROOT94-MAX/DiscordAITranslator/releases/latest) · [Read the documentation](docs/README.md)

</div>

## Why This Plugin

DiscordAITranslator keeps translation controls close to the conversation instead of applying one global mode to every channel.

- **Per-channel control:** right-click the composer translation icon to enable or pause automatic translation for the selected channel.
- **One translation path:** live messages, historical messages, manual actions, replies, embeds, thread titles, and forwarded snapshots share the same state and restore rules.
- **Readable history:** historical results are committed in batches, while viewport anchoring and user-intent checks reduce disruptive jumps during scroll-back.
- **Translation integrity:** missing batch items, wrong-language output, malformed protected placeholders, and provider failures enter repair or fallback paths instead of silently disappearing.
- **Single-file install:** modular source is built deterministically into one readable BetterDiscord plugin file.

## Translation Example

These are synthetic examples; they contain no real conversations, accounts, or channel information.

| Source | Translation (target: Simplified Chinese) |
| --- | --- |
| Please review the update tomorrow. | 请明天查看更新。 |
| Keep `npm run build` unchanged. | 保持 `npm run build` 不变。 |

Incoming messages show a translation and its marker; displaying the original alongside it is configurable. Actual output depends on the selected provider.

## Features

- **Incoming translation:** automatic translation is isolated by channel, with channel-specific language choices and optional primary-provider override.
- **Outgoing translation:** translate before sending, keep or hide the original, and use prefix-directed language selection.
- **Historical backfill:** translate already loaded messages by scope, count, and time window; historical work remains lower priority than new live messages.
- **Manual translation:** translate or restore a single message from its context menu even when automatic translation is disabled.
- **Forwarded messages:** snapshot-aware extraction, translation, original display, cancellation, and restoration.
- **Reply, embed, and title support:** reply previews, embeds, forum posts, and thread titles follow the owning channel's translation state.
- **Original-text protection:** preserve configured terms, wrapper pairs, code-like content, spoilers, and skip prefixes through provider round trips.
- **Primary and backup providers:** use a channel-specific primary provider while keeping credentials and backup behavior global.
- **Five-page settings center:** Providers, Translation, General, Advanced, and Diagnostics each have a focused page with searchable languages and dependent rows.
- **Copyable diagnostics:** inspect version, build, provider and repaint health, then run a read-only release check or copy the report.
- **Cumulative history status:** the floating capsule tracks translated message IDs per channel across multiple history batches.
- **Viewport protection:** history translation aims to preserve your reading position, waits for active scrolling to idle, and avoids pulling the view back after you have moved elsewhere.

## Supported Providers

| Key | Provider | Credential | Notes |
| --- | --- | :---: | --- |
| `googleapi` | Google Free | No | Keyless default option; transport is split by encoded query size |
| `googlecloud` | Google Cloud Translation | API key | Official Google Cloud translation service |
| `microsoft` | Azure Translator | API key | Optional Azure region setting |
| `deepl` | DeepL API | API key | Official DeepL translation API |
| `deepseek` | DeepSeek | API key | AI translation, batching, and decision mode |
| `openai` | OpenAI API | API key | Retained Responses API adapter for existing configurations; see below |
| `gemini` | Google Gemini | API key | Native `generateContent` integration |
| `oaicompat` | Custom providers | Endpoint, model; credentials according to protocol | Self-hosted or third-party services; protocol options below |
| `papago` | Papago | Client ID and secret | Retained Naver compatibility provider |
| `baidu` | Baidu | App ID and secret | Retained compatibility provider with provider-specific signing |

The table lists adapters retained in the code. The built-in OpenAI and Papago entries are archived in the current UI: new selections hide them by default, while existing primary, backup or channel selections remain visible and configurable. Custom providers use their configured protocol; the table is not a list of buttons every new user will see.

Custom providers support OpenAI Chat Completions, OpenAI Responses, Ollama, Gemini and Anthropic Messages protocols. Match the endpoint and model to your service. The native Ollama protocol accepts an optional API key; your server determines whether authentication is needed.

Provider credentials, endpoints, models, the global primary default, and the backup provider are configured in BetterDiscord settings. A channel may override only its primary provider and language choices. See [provider contracts](docs/providers.md) for the exact behavior.

## Quick Start

### Requirements

1. The desktop Discord client.
2. [BetterDiscord](https://betterdiscord.app/).
3. [BDFDB Library](https://mwittrien.github.io/downloader/?library).

### Install

1. [Download `DiscordAITranslator.plugin.js`](https://github.com/ROOT94-MAX/DiscordAITranslator/releases/latest/download/DiscordAITranslator.plugin.js).
2. Download `0BDFDB.plugin.js` from the BDFDB Library link above.
3. Use **Open Plugins Folder** in BetterDiscord’s Plugins page and place both files there. On Windows, the default is `%AppData%\BetterDiscord\plugins`.
4. Open Discord → **User Settings** → **BetterDiscord** → **Plugins**.
5. Enable BDFDB Library, then enable DiscordAITranslator.
6. Open the plugin settings and configure a provider plus incoming/outgoing languages.

After replacing the plugin with a newer release, toggle it off and on once or reload Discord with `Ctrl + R`.

### Your first translation

1. Choose a primary provider in **Providers**. Google Free needs no key; supply credentials for other services when their protocol requires them. A custom service also needs its real endpoint and model, not the example placeholders.
2. In **Translation**, set separate source/target directions for incoming and outgoing messages. Incoming source language can usually be set to automatic detection.
3. Return to the channel, left-click the translation icon beside the composer to check its language/provider choices, then right-click the icon to enable automatic translation for that channel.
4. Try an ordinary test sentence and check its translation marker. For a single message, leave automatic translation off and use the message context menu.

Installing a release does not require compiling the source. A repository branch may contain changes not yet released; check the downloaded file’s version and build in **Diagnostics**, and consult its Release notes for shipped behavior.

## Usage

- **Right-click the composer translation icon:** enable or pause automatic translation for the current channel.
- **Left-click the composer translation icon:** open the current channel's provider and language controls.
- **Open global plugin settings:** use the five tabs to configure providers, translation policy, display, protected text, and diagnostics.
- **Open a message context menu:** translate, restore, detect language, or translate selected text manually.
- **Check the history capsule:** view cumulative channel progress and retry eligible failures.

Automatic translation has no global on-by-default switch. A channel remains off until it is explicitly enabled.

### Pause, update and uninstall

Disabling a channel cancels its pending automatic work and restores displayed incoming messages, replies, embeds and titles, including translations previously shown by manual actions. You can still translate one message manually afterward; valid cached results are retained.

To update, back up your plugin configuration privately, replace the matching `.plugin.js` file, then toggle the plugin or reload the client. To uninstall, disable the plugin first and remove it from the Plugins page. Configuration and backups may contain personal settings or credentials; keep them on your own machine.

### Troubleshooting

| Symptom | Check first |
| --- | --- |
| No automatic translation after enabling the plugin | Whether the current channel was enabled by right-clicking the icon; language directions, source filters and history scope |
| Translation error or timeout | Provider connection test, credentials, real endpoint/model, quota and network; configure a global backup if needed |
| Only some historical messages were translated | The quantity is a maximum; the plugin uses eligible loaded/cached messages and does not page indefinitely to fill it |
| A message can still be translated after automatic translation is off | Manual actions remain available by design |
| Unexpected behavior after an update | Version/build in Diagnostics, only one enabled plugin copy, then a client reload |

For unresolved problems, open an [Issue](https://github.com/ROOT94-MAX/DiscordAITranslator/issues) with the version, build, provider category, reproduction steps and a synthetic test sentence. Inspect copied diagnostics before sharing. Do not include keys, private endpoints, real conversations or configuration files; see [SECURITY.md](SECURITY.md) for security reports.

### Data and privacy

Content to translate is sent to the selected translation service and may also reach the backup service if fallback runs. The default local-first language detection calls Google detection when local evidence is insufficient. You can select local-only detection; that choice controls detection requests, while translation network use still depends on the provider.

Text protection preserves terms and formatting; it does not replace reviewing sensitive content before translation. Enter credentials through plugin settings and never put them into source code or an Issue. See [provider contracts](docs/providers.md) for detection and request boundaries.

## Known Limitations

- Discord's internal component, Store, and forwarded-snapshot shapes are not public APIs and may require adaptation after client updates.
- Translation results stay on bounded Store-targeted retry and do not widen into a whole-chat repaint. Plugin start/stop and applying global settings remain separate host lifecycle operations and may briefly refresh the Composer.
- Adding translated text changes row and total-list height. The plugin protects the reader's message position, but the scrollbar thumb can still move or resize.
- Keyless and third-party providers may apply quotas, rate limits, payload limits, regional restrictions, or output transformations outside the plugin's control.
- PTB observation is still required for render-boundary changes even when the automated suite passes.

For diagnosis, follow the [debugging cookbook](docs/cookbook/debugging.md) or its [Simplified Chinese version](docs/cookbook/debugging.zh-CN.md). It links to historical cause analysis and current observation boundaries separately.

## Development

The repository keeps modular source under `src/` and generates the single installable plugin deterministically.

```text
src/plugin/index.js
        -> scripts/build-plugin.mjs
        -> DiscordAITranslator.plugin.js
```

Requirements: Node.js 20 or newer.

```powershell
npm ci
npm run build
npm run verify
```

`npm run verify` checks publication privacy rules, Agent Notes structure and archives, source/artifact parity, JavaScript syntax, architecture budgets, release metadata, bilingual documentation entry points, and the complete unit/contract/integration suite. Do not edit the generated plugin by hand.

Contribution rules are documented in [CONTRIBUTING.md](CONTRIBUTING.md); repository invariants and current ownership boundaries are documented in the [architecture guide](docs/architecture.md).

## Documentation

- Product behavior: [docs/product.md](docs/product.md)
- Setting ownership: [docs/settings.md](docs/settings.md)
- Provider contracts: [docs/providers.md](docs/providers.md)
- Architecture: [English](docs/architecture.md) | [简体中文](docs/architecture.zh-CN.md)
- Debugging cookbook: [English](docs/cookbook/debugging.md) | [简体中文](docs/cookbook/debugging.zh-CN.md)
- Optional developer tool: [Discord MCP diagnosis and reproduction (Chinese)](docs/cookbook/discord-mcp.zh-CN.md) for client investigation; not required for normal installation.
- Open observation boundaries: [docs/recovery-plan.md](docs/recovery-plan.md)
- Release history: [CHANGELOG.md](CHANGELOG.md)

## Credits

- Original BetterDiscord Translator foundation: [mwittrien/BetterDiscordAddons](https://github.com/mwittrien/BetterDiscordAddons)
- Runtime library: [BDFDB](https://mwittrien.github.io/downloader/?library)

## License

Licensed under [GNU General Public License v2.0](LICENSE). Redistribution and derivative work must remain compatible with GPL v2.0. The upstream Translator foundation is also GPL v2.0.
