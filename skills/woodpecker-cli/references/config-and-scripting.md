# Scripting

Most list/info commands accept output formatting. Prefer JSON over parsing the
table:

```sh
woodpecker-cli pipeline ls <repo> --output json
woodpecker-cli repo ls --output json | jq -r '.[] | "\(.id)\t\(.full_name)"'
```

`--output-no-headers` strips the header row from table output when JSON is not
supported by that subcommand.

# Working on the config file itself

The pipeline definition lives at `.woodpecker.yaml` or, split into workflows,
under `.woodpecker/*.yaml`.

```sh
woodpecker-cli lint                    # validate config in the current repo
woodpecker-cli lint .woodpecker/       # validate a specific path
woodpecker-cli exec .woodpecker/build.yaml
```

`lint` catches schema errors and deprecated fields **without a server round-trip**
— run it before pushing a config change rather than burning a CI run on a typo.

`exec` runs a workflow locally against the Docker backend. It does **not** get
the server's secrets, and its environment is not identical to the real agent —
use it to iterate on step logic, not to certify that CI will pass.
