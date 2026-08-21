# Provider Contracts

## Translation Provider Interface

Every provider adapter receives the same logical inputs:

- Source language or automatic detection
- Target language
- Protected text payload
- Credentials and endpoint from global configuration
- Optional model identifier
- Translation callback or promise result

Provider-specific HTTP schemas stay inside their adapters. Channel code selects a provider key and does not construct provider requests.

## Current Providers

| Provider key | Role | Required configuration |
| --- | --- | --- |
| `googleapi` | Keyless Google Free translation | None |
| `googlecloud` | Official Google Cloud Translation | API key |
| `microsoft` | Azure Translator | API key and optional region |
| `deepl` | DeepL API | API key |
| `deepseek` | DeepSeek Chat Completions | API key; endpoint and model have official defaults |
| `openai` | Official OpenAI Responses API | API key; official endpoint and model have defaults |
| `gemini` | Native Gemini `generateContent` API | API key; official endpoint and model have defaults |
| `oaicompat` | Third-party or self-hosted OpenAI-compatible API | API key, explicit endpoint, and explicit model |
| `itranslate` | iTranslate compatibility adapter | Optional API key; otherwise discovers the public web key at runtime |
| `yandex` | Yandex compatibility adapter | API key |
| `papago` | Naver Papago compatibility adapter | Client ID and client secret in the provider credential field |
| `baidu` | Baidu compatibility adapter | App ID and secret in the provider credential field |

The example `oaicompat` endpoint and model are placeholders only. They are never accepted as a valid runtime configuration and are never sent to the network.

## Provider Settings

- Credentials, endpoints, models, connection tests, and model catalogs are global.
- A channel may override only its primary provider.
- Providers selected only by a channel remain directly configurable in global settings.
- The global backup provider is not duplicated in the channel popout.
- AI decision mode is available only when at least one selected global, backup, or channel provider is both AI-capable and configured.

## Native AI Adapters

### OpenAI

The official adapter uses `/v1/responses`, sends `store: false`, and parses Responses API output items. A ChatGPT subscription is not an OpenAI API credential.

### Gemini

The Gemini adapter uses native `generateContent` request and response schemas. It is not routed through the OpenAI-compatible adapter.

### OpenAI-Compatible

The compatibility adapter uses Chat Completions for self-hosted gateways and third-party services. Validation names missing key, endpoint, or model fields before any request is sent.

## Google Free And Google Cloud

Google Free uses the public keyless web translation endpoint and does not accept a user API key. Official Google credentials belong to the separate Google Cloud provider.

## Backup Provider

- The backup provider is global.
- A channel primary provider may differ from the global primary.
- If the effective primary equals the backup, the provider is not called twice.
- Translation cache and reply signatures include the effective primary and backup providers.

## Language Detection

Language detection is a separate global policy from translation provider selection:

1. `local_first` is the default: use high-confidence local detection, then keyless Google detection when uncertain.
2. `google_free` always uses keyless Google detection.
3. `local_only` never makes a detection request and returns no result when local evidence is uncertain.

AI language detection is intentionally not exposed. It would add latency and paid-token use without improving the default translation path enough to justify the extra setting.
