# Documentation

This directory contains the canonical project documentation.

Project overview: [English](../README.md) | [简体中文](../README.zh-CN.md)

## Reading Order

1. [Product behavior](product.md)
2. [Settings ownership](settings.md)
3. [Provider contracts](providers.md)
4. Architecture: [English](architecture.md) | [简体中文](architecture.zh-CN.md)
5. Field debugging handoff: [English](field-debugging-guide.md) | [简体中文](field-debugging-guide.zh-CN.md)
6. [Recovery plan](recovery-plan.md)
7. Architecture decisions:
   - [ADR-0001: keep a single-file runtime during early refactors](adr/0001-keep-single-file-plugin-runtime.md)
   - [ADR-0002: generate the single-file plugin from modular source](adr/0002-generate-single-file-plugin-from-modular-source.md)

## Document Rules

- `product.md` describes approved user-visible behavior.
- `settings.md` decides whether a setting belongs to the current channel or global configuration.
- `providers.md` describes provider capabilities without embedding UI implementation details.
- `architecture.md` and `architecture.zh-CN.md` describe the current runtime boundaries and migration constraints.
- `field-debugging-guide.md` and `field-debugging-guide.zh-CN.md` preserve the proven incident timeline, rejected routes, and handoff checks.
- `recovery-plan.md` is the current stabilization and refactoring sequence. It overrides ad hoc implementation order.
- ADRs record durable architectural decisions and are not task trackers.

Historical PRDs, local issue files, and context snapshots are intentionally excluded from the repository. Archived copies live outside the project and are not authoritative.
