# Agent Workflow Scripts

Standard entry points that portable agent-workflow skills call, so a skill can
run `.agents/bin/<name>` in any repo without knowing this repo's specific
commands. Each script is a thin, repo-owned wrapper. A script that is **absent**
means that capability is n/a here.

| Script | Purpose | This repo runs |
| --- | --- | --- |
| `setup` | Install dependencies | `yarn install --frozen-lockfile` |
| `validate` | Pre-push gate | `.agents/bin/build` |
| `test` | Run tests | `yarn build` (the CI workflow defines no separate test command) |
| `lint` | Lint / format | n/a |
| `build` | Build / type-check | `yarn build` |
| `docs` | Docs checks | n/a |
| `ci-detect` | CI change detector | n/a |

Non-command policy lives in [`../agent-workflow.yml`](../agent-workflow.yml).
