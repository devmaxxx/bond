# What things cost

Measured across one machine's full local history: cache reads were **97 % of raw tokens and 65 % of weighted cost**, against 17 % for everything the model generated.

Measured over 30 days on one machine, 43.1M tokens of tool results:

| Source                                    | Calls  | Tokens | Shape                                |
| ----------------------------------------- | ------ | ------ | ------------------------------------ |
| Screenshots (`computer`, `browser_batch`) | 1,239  | 14.4M  | **541 results over 10k tokens each** |
| `Read`                                    | 977    | 8.4M   | 8.6k tokens per call on average      |
| `Bash`                                    | 35,705 | 14.2M  | ~400 tokens per call, volume does it |
| `take_screenshot` (chrome-devtools MCP)   | 21     | 1.5M   | **~70k tokens each**                 |
