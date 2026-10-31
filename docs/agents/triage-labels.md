# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps those roles to the actual label strings used in this repo's issue tracker.

| Label in mattpocock/skills | Label in our tracker | Meaning                                  |
| -------------------------- | -------------------- | ---------------------------------------- |
| `needs-triage`             | `needs-triage`       | Maintainer needs to evaluate this issue  |
| `needs-info`               | `needs-info`         | Waiting on reporter for more information |
| `ready-for-agent`          | `ready-for-agent`    | Fully specified, ready for an AFK agent  |
| `ready-for-human`          | `ready-for-human`    | Requires human implementation            |
| `wontfix`                  | `wontfix`            | Will not be actioned                     |

When a skill mentions a role (e.g. "apply the AFK-ready triage label"), use the corresponding label string from this table.

How this repo's automation uses them (`.github/workflows/`, `scripts/gate/`):

- Adding `ready-for-agent` to an issue starts Claude in GitHub Actions: it implements the issue (following any agent brief comment), verifies it and opens a PR. The label is swapped for `ai:working` while it runs.
- When the agent finds the issue too ambiguous, it asks in a comment and applies `needs-info`. Answer, then comment `@claude` to resume.
- On a PR, the quality gate applies `ready-for-human` when a person must review and merge, or `auto-merge` when it merges on its own.
