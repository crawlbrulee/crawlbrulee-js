# Agent context

This file is auto-loaded by coding agents (Claude Code, Codex, Gemini CLI, and others).

## crawlbrulee ecosystem

This repository is one component of the broader crawlbrulee ecosystem of related projects.
The authoritative `crawlbrulee-ecosystem` skill — the full map of related projects,
shared-code locations, and the cross-project conventions — lives one level up, in the
maintainer's umbrella checkout:

    ../.agents/skills/crawlbrulee-ecosystem/SKILL.md

Read it from there when you need the bigger picture. It may be absent if this repository
was cloned on its own. It is also exposed locally as the `crawlbrulee-ecosystem` skill
(`.agents/skills/crawlbrulee-ecosystem/`), which agents discover via the
`.claude/skills` symlink.

## releasing

a release is a `vX.Y.Z` tag pushed on a commit that is already on `main`. the publish
workflow refuses a tag whose commit is not on `origin/main` or whose version doesn't match
`package.json`, runs the checks, publishes with trusted publishing (no tokens anywhere) and
creates the GitHub release.

- bump the version in every place it lives: `package.json` and the user agent in `src/config.ts` (a test fails if they differ).
- add a dated `CHANGELOG.md` entry. a version that is already published is final: later
  changes get a new version, never an edit to the old entry. check the registry, not local
  tags, to see what is out.
