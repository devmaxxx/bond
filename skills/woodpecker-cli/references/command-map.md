# Command map

Repos are addressed by `owner/name` or by numeric **repo-id**. v3 tightened this:
several subcommands take the id only. Get ids once with `repo ls`.

```sh
woodpecker-cli repo ls                        # id, full name, activity state
woodpecker-cli repo info <repo>               # config path, visibility, settings
```

Pipelines:

```sh
woodpecker-cli pipeline ls <repo>             # recent pipelines, newest first
woodpecker-cli pipeline last <repo>           # latest pipeline on the default branch
woodpecker-cli pipeline info <repo> <number>  # status, event, commit, per-step state
woodpecker-cli pipeline logs <repo> <number>  # all step logs
woodpecker-cli pipeline logs <repo> <number> <step>
woodpecker-cli pipeline start <repo> <number> # restart an existing pipeline
woodpecker-cli pipeline stop <repo> <number>
woodpecker-cli pipeline approve <repo> <number>
woodpecker-cli pipeline decline <repo> <number>
woodpecker-cli pipeline create <repo> -b <branch>
woodpecker-cli pipeline ps <repo>             # running steps
woodpecker-cli pipeline queue                 # server-wide queue (admin)
```

Config-scoped resources — each takes a scope flag (`--repository`,
`--organization`, or `--global`); **omitting the scope is the usual cause of
"secret not found"**:

```sh
woodpecker-cli secret ls --repository <repo>
woodpecker-cli secret add --repository <repo> --name <key> --value <val>
woodpecker-cli cron ls --repository <repo>
woodpecker-cli registry ls --repository <repo>
```
