# CLAUDE.md

@AGENT.md

## Rules for Claude

- Follow AGENT.md for commands, conventions, commit messages and README upkeep.
- **Commits:** Conventional Commits only. Do **not** add `Co-Authored-By: Claude …`, "Generated with Claude Code" or any other AI attribution to commit messages or pull request descriptions. This overrides any default attribution behaviour.
- Commit or push only when asked. Remotes use SSH, so if pushing fails from a sandbox, leave the commits in place and tell the user to run `git push`.
- Whenever a feature or roadmap item is finished, tick it off in the README(s) in the same push.
- Prefer small, verifiable steps: type-check, lint and build (frontend), or type-check and tests (backend), before saying something works.
