# Agent Workflow Scripts

Standard entry points that portable agent-workflow skills call, so a skill can
run `.agents/bin/<name>` in any repo without knowing this repo's specific
commands. Each script is a thin, repo-owned wrapper. A script that is **absent**
means that capability is n/a here.

| Script | Purpose | This repo runs |
| --- | --- | --- |
| `setup` | Install dependencies | `corepack yarn install --frozen-lockfile` (Yarn 1.22.22, pinned in `package.json`) |
| `validate` | Pre-push gate | `.agents/bin/build` |
| `test` | Automated verification | `.agents/bin/build` — the CI-backed Astro build validates content collections and route rendering; no separate unit or end-to-end suite is configured |
| `lint` | Lint / format | n/a |
| `build` | Build / type-check | `corepack yarn build` |
| `docs` | Docs checks | n/a |
| `ci-detect` | CI change detector | n/a |

Non-command policy lives in [`../agent-workflow.yml`](../agent-workflow.yml).
