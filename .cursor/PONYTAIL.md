# Ponytail on Cursor (not vendored)

Skills and the always-on rule are **installed by setup**, not committed.

```sh
npm run setup:cursor-plugins
```

| What | How |
| --- | --- |
| Skills (`/ponytail-review` など) | `npx skills add DietrichGebert/ponytail -a cursor` → `.agents/skills/` |
| Always-on rule | setup が upstream の `.cursor/rules/ponytail.mdc` を取得 |

生成物は `.gitignore` 済み。チーム共有 = clone 後に setup を実行（Claude の `setup:claude-plugins` と同じ考え方）。

詳細: [docs/cursor-plugins.md](../docs/cursor-plugins.md) · 上流: [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail)
