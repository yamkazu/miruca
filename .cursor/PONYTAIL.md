# Upstream: ponytail

Vendored from [krissman/ponytail](https://github.com/krissman/ponytail) (MIT), version **4.8.4** (commit `16f29800fd26`).

| Path | Role |
| --- | --- |
| `.cursor/rules/ponytail.mdc` | Always-on lazy senior mode (upstream Cursor adapter) |
| `.cursor/skills/ponytail*/SKILL.md` | Invocable skills — Cursor discovers project skills here ([docs](https://cursor.com/docs/skills)) |

**ponytail review in Cursor:** `/ponytail-review` (skill folder `ponytail-review`).

Refresh from a newer release: copy upstream `.cursor/rules/ponytail.mdc` and `skills/*/SKILL.md` into these paths, then bump the version/commit above. Claude marketplace settings (`.claude/settings.json`) stay unchanged.

Team init: `npm run setup:cursor-plugins` — see [docs/cursor-plugins.md](../docs/cursor-plugins.md).
