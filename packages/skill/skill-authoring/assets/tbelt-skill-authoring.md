# Creating and editing skills in tBelt Code

A skill is a folder with a `SKILL.md` file, or a single `<name>.md` file. The agent sees each skill's name and description in its catalog and loads the body only when a task matches. Users can also run a skill by typing `/name` in the message box.

## Where skills live

tBelt Code scans these roots. When two skills share a name, the lowest rank wins.

| Rank | Root | Scope |
|---|---|---|
| 100 | `<project>/.dsh/skills` | Project |
| 200 | `<project>/.agents/skills` | Project |
| 300 | Directories listed in `customSkillDirs` of the `skill-filesystem` plugin | Custom |
| 400 | `<home>/skills` | User |
| 500 | `~/.agents/skills` (or `$DSH_AGENTS_HOME/skills`) | User |
| 600 | Built into the app (this guide is one) | Bundled |

- `<project>` is the nearest parent folder that contains `.git`. Without one, it is the current working folder.
- `<home>` is `$DSH_HOME` when set. The installed desktop app uses `~/.tbelt-code`; running from source uses `~/.dsh`.
- Project skills travel with the repository. User skills apply to every project. Prefer a project skill unless the user asks for a global one.
- Bundled skills are not files, so they cannot be deleted by accident. To change one, create a skill with the same name in any other root. It takes over because bundled skills have the highest rank number.

## Write a skill

```markdown
---
name: my-skill
description: What the skill does and when to use it. Name the actions and subjects that should trigger it.
---

# Steps for the agent

Concrete, ordered instructions.
```

- `name`: lowercase letters, digits, and single hyphens (`my-skill`). It defaults to the folder or file name.
- `description`: the only text the agent sees before loading the skill, so it decides when the skill is used. It defaults to the first paragraph of the body. Capped in the catalog (500 characters by default).
- `disable-model-invocation: true` hides the skill from the agent; only `/name` runs it.
- `user-invocable: false` stops `/name` from running it.
- Quote values that contain `:` or `#`. A file with invalid YAML or an invalid name is skipped with a warning in the log.
- Keep `SKILL.md` short. Put long reference material in files beside it (for example `reference/` or `scripts/`) and tell the agent when to read them. Relative paths resolve from the skill's folder. Edits to those extra files do not refresh the catalog, but they are read fresh on the next load.

Create one from the shell:

```bash
mkdir -p .dsh/skills/my-skill
cat > .dsh/skills/my-skill/SKILL.md <<'SKILL'
---
name: my-skill
description: Does X when the user asks for Y.
---
Steps for the agent.
SKILL
```

## Install an existing skill

Copy its folder into one of the roots above. For a single-file skill:

```bash
mkdir -p .dsh/skills/some-skill
curl -sL "https://raw.githubusercontent.com/OWNER/REPO/main/skills/some-skill/SKILL.md" -o .dsh/skills/some-skill/SKILL.md
```

For a skill inside a larger repository, clone it with `git clone --depth 1`, then copy the skill's folder. Read a downloaded skill before relying on it: its text becomes instructions the agent follows, and its scripts run with the agent's permissions.

## Check that it loaded

1. Adding, renaming, deleting, or editing the frontmatter of a skill refreshes the catalog on the agent's next step. No restart is needed.
2. If it does not appear, check the folder is directly inside one of the roots (`<root>/<name>/SKILL.md`), the frontmatter is valid YAML between two `---` lines, the name is valid, and no skill with the same name sits at a lower rank.
3. If the skill ships a script, run it once with sample input.
