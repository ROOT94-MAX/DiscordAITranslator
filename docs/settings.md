# Settings Ownership

## Principle

Channel settings answer: "How should translation work in this channel right now?"

Global settings answer: "What defaults, credentials, protection rules, and display policy should the plugin use everywhere?"

A behavior has one canonical editable owner. The same switch is not duplicated across both surfaces.

## Channel Popout

| Setting | Scope | Persistence |
| --- | --- | --- |
| Primary translation provider | Current channel | Explicit channel override; restore follows global |
| Received input language | Channel, server, or global through the existing lock | Existing scoped language storage |
| Received output language | Channel, server, or global through the existing lock | Existing scoped language storage |
| Sent input language | Channel, server, or global through the existing lock | Existing scoped language storage |
| Sent output language | Channel, server, or global through the existing lock | Existing scoped language storage |
| Language detection helper | Current interaction | Saves only when the user applies the result |

The channel popout does not contain an automatic translation switch, backup provider, credentials, global display settings, or a read-only status line.

## Channel Toggle

- Right-clicking the translator icon toggles the translation master switch only for the current channel.
- Channels without an explicit record default to off.
- The switch controls automatic sent and received translation plus the current thread/forum title; manual message translation remains available whether the switch is on or off.
- Disabling a channel clears pending automatic work and restores all currently displayed received-message translations, reply previews, embeds, and translated thread title, including earlier manual displays.
- Valid translation-cache entries and sent-message original/edit metadata are retained. A manual action made after disabling can display that single cached or newly translated message again.
- There is no global default automatic-translation switch.

## Global BetterDiscord Settings

| Section | Settings |
| --- | --- |
| Providers | Global primary default, global backup, all provider credentials, endpoints, models, model catalogs, connection tests |
| Languages | Global sent and received defaults and source-language filters |
| Language detection | `local_first`, `google_free`, or `local_only` strategy |
| Translation rules | AI decision mode, local pre-check, same-language and similarity policy |
| Display | Original text presentation, translated color, reply-preview behavior |
| Protection | Protected terms, wrapper pairs, prefixes, sent and received scopes |
| Historical translation | New-only or loaded-message scope, loaded count/time range, scroll policy |

Provider credentials remain accessible even when a provider is selected only by a channel override. Active primary and backup fields are not duplicated in the additional-provider section.

The translated watermark is always shown on translated messages and is not a setting.

## Permanent Controls

The following are product controls, not optional settings:

- Input-box translator button
- Message action translator button

Stored legacy values that attempted to hide either button are ignored.

## Removed Controls

- Input-box translator button visibility
- Message action translator button visibility
- Global automatic translation default switch
- Duplicate global language detection helper
- Duplicate sent-original and received-original controls in the channel popout
- Direct received-original display mode (`showOriginalDirectly`); the single received-original switch keeps the established inline quote/spoiler presentation

## Migration Rule

1. Preserve explicit per-channel true or false records.
2. Set the inherited automatic-translation default to false.
3. Do not convert inherited enabled channels into explicit enabled records.
4. Keep right-click changes channel-scoped.
5. Clear the affected channel's pending automatic work and restore all of its displayed received-message translations when disabled.
6. Retire `$discord` from both output-language selectors. On first load, replace any stored received or sent output alias at global, server, or channel scope with the client's current concrete language and persist that explicit choice.
