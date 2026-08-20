# Product Behavior

## Purpose

DiscordAITranslator translates sent messages, received messages, reply previews, supported embedded content, and enabled forum/thread titles while preserving Discord markup and the user's original text.

The primary user is not expected to understand provider APIs or repository internals. Common channel actions must be available next to the Discord message input; advanced defaults and credentials belong in BetterDiscord settings.

## Current Channel Interaction

- Left-clicking the translator icon opens current-channel translation settings.
- Right-clicking the translator icon toggles automatic translation only for the current channel.
- Turning a channel off cancels automatic sent/received work and restores every displayed received-message translation, reply preview, embed, and translated thread title in that channel, including translations previously shown by a manual action.
- Turning a channel off retains valid translation-cache entries and sent-message original/edit metadata. Manual message translation remains available after the channel is off.
- A clean plugin stop flushes one pending debounced translation-cache write before shutdown. It does not start new translation work; it only persists cache entries already committed in memory.
- Channel state never changes another channel or the global backup provider.

## Approved Channel Popout

The channel popout contains:

- Current-channel primary translation provider
- Restore-following-global action
- Language detection helper
- Input language for received messages
- Output language for received messages
- Input language for sent messages
- Output language for sent messages
- Existing channel, server, and global language scope lock

The channel popout does not contain:

- Automatic translation toggle
- Read-only status explanation
- Backup provider
- API key, endpoint, or model fields
- Global display or automation defaults

## Approved Global Behavior

- Channels without an explicit record default to automatic translation off.
- The current-channel right-click icon is the only automatic translation switch exposed to users.
- Existing explicit channel records must survive migration.
- The input-box translator button and message action translate button are always available and are not user settings.
- The global backup provider and provider credentials remain global.

## Translation Quality

- Short foreign words and short conversational phrases must remain translatable.
- Length alone must not produce an AI skip decision.
- URLs, mentions, Discord markup, code, commands, IDs, model names, product names, configured glossary terms, and protected placeholders must not be damaged.
- A professional term should remain untranslated when it has no accepted target-language translation; an official or widely accepted localized name may be used.
- Translation output must contain translated text only, without explanations or commentary.
- Google Free splits long input losslessly by encoded request length and transports protected placeholders through a reversible provider-specific wire form. Every chunk and every protected segment must survive before any combined translation is displayed; a partial or protection-damaged response is never painted as complete.
- A forwarded message uses its visible snapshot body as the translation source. Automatic and manual translation paint inside the forwarded frame, the optional original is composed there exactly once, and untranslate or channel disable restores that same snapshot body without mutating Discord's stored record.

## Live And Historical Messages

- In `new_only` scope, the current channel's last message ID is frozen as the session boundary before the first message-stream walk. Rows that mount late or after an empty first render remain pre-existing history and never enter the live queue; a message after that boundary remains eligible even when it appears during the first walk. If neither the channel model nor the stream supplies a baseline, initialization remains open instead of accepting a null boundary. This scope has no historical job, so it intentionally has no loaded-history capsule.
- Live messages use a dedicated high-priority path. The first new message is submitted immediately, without a fixed batching delay, and its translation is displayed as soon as that request returns.
- A live message shows a fixed-size translation loading icon while its request is pending. Messages arriving in the same event-loop turn may share one request, but the runtime never waits to fill a batch.
- Historical work is lower priority and never makes a live message wait for the whole historical job. If the provider permits concurrency, one live request and one historical request may run together; otherwise an in-flight request may finish, then the next available request slot always serves live work first.
- Historical collection merges rendered messages with messages already present in Discord's message cache. It deduplicates by message ID, orders newest first, and selects up to the configured number of eligible messages.
- If the cache contains fewer eligible messages than the configured limit, the plugin performs a bounded background prefetch only to fill that job. It does not simulate scrolling, inject the prefetched messages into the visible list, or continue paging beyond the configured limit.
- The configured historical quantity is a maximum. Status uses the actual immutable job size: a job with 50 eligible messages reports `/50`, while a channel with only 20 available eligible messages reports `/20`.
- Loaded messages form one immutable, channel-scoped, ID-keyed job. A historical job may make several provider or repair requests, but valid terminal results become visible in one atomic display transaction.
- Historical results that belong to virtualized rows are stored without repainting the chat. Those rows render their final stored state when they later mount.
- Output-language selectors contain only explicit language targets. The retired `$discord` alias is hidden from both sent and received output settings; an older stored alias is converted once to the client's current concrete language, so later client-language changes cannot silently retarget translation.
- Changing the effective received target language retires any translation displayed under the previous configuration, restores the immutable original before the next source capture, and admits that message to at most one replacement decision. An old target-language paint never becomes new source text or a repeated historical job.
- Completed translations become visible even while the user is typing. While the user is actively scrolling through history, the committed result is stored immediately but the repaint waits for the scroll gesture to idle (a bounded sub-second deferral) - a rebuild's scroll restore landing mid-gesture is the snap-back users feel (2026-08-19). The live view at the bottom always paints promptly.
- Enabling automatic translation while reading history preserves the current reading neighbourhood and eye-line message. A recent manual-translation lock belongs only to that message's own transaction and must not redirect the channel-enable repaint; if virtualization temporarily removes the eye-line row during remount, the captured raw history offset is restored first and later settle passes refine it back to the exact row.
- One historical display transaction refreshes the mounted message rows in that configured batch together while preserving the viewport anchor once; if the user changes scroll intent during paint, the plugin does not pull the viewport back. Virtualized rows render their final stored state when they mount.
- Automatic translation display repaints the whole message list at most once per translation transaction. Confirmation retries only re-read painted rows, and purely virtualized rows never trigger a repaint; they render their stored state when they mount.
- The compact loaded-message status is `translation icon completed/total · elapsed`, for example `20/50 · 8s`. It counts valid results stored for visible or virtualized rows, not merely currently painted rows.
- A backfill scan that finds nothing to translate (every loaded message already translated, skipped, or ineligible) reports a checkmark with "no pending messages", never `0/N` — a zero-over-total reading is reserved for real failures.
- The pill is ONE cumulative channel ratio (final form, user-specified 2026-08-19): numerator = messages whose translation was displayed so far, denominator = numerator plus the running batch's remaining work. First batch: `0/13 → 13/13`; scrolling queues 20 more: `13/33 → 33/33`. The numerator counts UNIQUE displayed message ids fed by every display transaction - live and historical alike - so retries, echoes, and re-collections never inflate it; it survives ordinary batch restarts and channel re-entry. A global tracking reset drops every channel, while an effective received-translation configuration change starts a fresh cumulative session only for the affected channel, so completed and failed work from an old target language never enters the new ratio. A finished state stays visible (no auto-hide) until the channel's status changes; each channel keeps its own count and shows it when visited. Per-batch detail lives in the hover text. A workless finish keeps the checkmark; failure branches keep their diagnostic batch ratios.
- The status icon uses the active Discord theme: brand color while translating, positive when complete, warning during repair, and danger for terminal partial failure. Detailed visible, background-ready, and retry counts appear only in the hover explanation.
- A completed status remains briefly and then collapses. Status updates never repaint the message list.
- Missing, duplicate, malformed, empty, wrong-language, and placeholder-damaged batch results enter repair instead of disappearing.
- A historical item that exhausts repair remains parked in the channel's retry ledger. Automatic render or virtualization passes do not re-admit it; only the explicit retry action, a genuine source edit, or an effective configuration change may create new work for that message.
- Each pending message uses a fixed-size CSS loading indicator without timer-driven React rerenders.
- Translated messages always carry a small inline watermark styled like Discord's edited marker; it identifies the translation and shows source/target details on hover. It is not a user setting.
- Received messages have one original-text control. When enabled, the original remains alongside the translation using the existing inline quote or spoiler presentation; there is no separate direct-original display mode.
- Disabling automatic translation restores automatic and manual message displays, reply previews, embeds, and titles through one channel-scoped display transaction without a second broad repaint.

## Message Lifecycle

- Editing a translated sent message must open editable original text and save a correctly translated replacement.
- When another user edits a received message, stale cache and display data must be invalidated and the new content translated.
- Stopping or uninstalling the plugin must restore original message, reply, and embed content.
- Reloading the plugin must not reuse stale display state left by an earlier runtime session.

## Providers And Detection

- Official OpenAI uses the Responses API.
- Gemini uses its native `generateContent` API.
- Third-party and self-hosted services use the separate OpenAI-compatible provider and require an explicit endpoint and model.
- Google Free remains keyless; official Google API keys belong to Google Cloud Translation.
- Global language detection supports local-first with Google fallback, Google-only, and local-only strategies.

## Forum And Thread Titles

- Title translation follows the current thread or forum-post channel configuration.
- The plugin replaces only rendered title text and never mutates the Discord channel store object.
- Edited titles invalidate stale translations.
- Disabling the channel or stopping the plugin restores the original title and rejects late callbacks.

## Incomplete Work

Remaining work, its order, and the parked investigations live in `docs/recovery-plan.md`. Deferred items include provider and Discord render latency instrumentation.
