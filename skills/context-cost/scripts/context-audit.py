#!/usr/bin/env python3
"""Audit where a project's context went: which tool results filled it, which
sessions carried them, and which skills and subagents a project actually fired.

Reads transcripts only; a rule of the skill moves when the numbers here say so.
"""

import argparse
import collections
import datetime
import json
import os
import sys

PROJECTS = os.path.expanduser("~/.claude/projects")

BIG_RESULT = 40_000  # bytes: the "> 40 KB" column, KB as 1000 bytes like MB as 1e6
TOP_SESSIONS = 10

# A full json.loads per line dominates the runtime over a gigabyte of transcripts,
# and most lines of a long history fall outside the window. The parsed timestamp
# below stays authoritative; this only skips the lines it would drop anyway.
TS_MARK = '"timestamp":"'


def blocks(entry):
    content = (entry.get("message") or {}).get("content")
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    if isinstance(content, list):
        return [b for b in content if isinstance(b, dict)]
    return []


def dated_out(line, since):
    at = line.find(TS_MARK)
    if at < 0:
        return False
    day = line[at + len(TS_MARK) : at + len(TS_MARK) + 10]
    return day < since


def empty_session(name):
    return {
        "session": name,
        "user_turns": 0,
        "compactions": 0,
        "branches": set(),
        "bytes": 0,
    }


def scan_file(path, since):
    """Count one transcript: its turns, its compactions, its branches, its results."""
    out = {
        "session": empty_session(os.path.basename(path)[: -len(".jsonl")]),
        "tools": collections.defaultdict(lambda: {"calls": 0, "bytes": 0, "over": 0}),
        "skills": collections.Counter(),
        "agents": collections.Counter(),
    }
    names = {}  # tool_use_id -> the tool that produced the result
    try:
        fh = open(path, errors="ignore")
    except OSError:
        return out
    with fh:
        for line in fh:
            if since and dated_out(line, since):
                continue
            try:
                entry = json.loads(line)
            except Exception:
                continue
            if not isinstance(entry, dict):
                continue
            ts = entry.get("timestamp") or ""
            # An entry with no timestamp carries nothing to date it out by.
            if since and ts and ts[:10] < since:
                continue
            branch = entry.get("gitBranch")
            if branch:
                out["session"]["branches"].add(branch)
            kind = entry.get("type")
            entry_blocks = blocks(entry)
            if kind == "user":
                if entry.get("isCompactSummary"):
                    out["session"]["compactions"] += 1
                elif not any(b.get("type") == "tool_result" for b in entry_blocks):
                    if any(b.get("type") == "text" for b in entry_blocks):
                        out["session"]["user_turns"] += 1
            for block in entry_blocks:
                btype = block.get("type")
                if btype == "tool_use":
                    name = block.get("name") or "?"
                    if block.get("id"):
                        names[block["id"]] = name
                    inp = block.get("input")
                    if not isinstance(inp, dict):
                        continue
                    if name == "Skill" and inp.get("skill"):
                        out["skills"][inp["skill"]] += 1
                    elif name == "Agent":
                        out["agents"][inp.get("subagent_type") or "?"] += 1
                elif btype == "tool_result":
                    size = len(json.dumps(block.get("content")).encode("utf-8"))
                    tool = out["tools"][names.get(block.get("tool_use_id"), "?")]
                    tool["calls"] += 1
                    tool["bytes"] += size
                    tool["over"] += size > BIG_RESULT
                    out["session"]["bytes"] += size
    return out


def transcripts(projects_dir, project_filter):
    for root, _dirs, names in os.walk(projects_dir):
        rel = os.path.relpath(root, projects_dir)
        project = os.path.basename(projects_dir) if rel == "." else rel.split(os.sep)[0]
        if project_filter and project_filter not in project:
            continue
        for name in names:
            if name.endswith(".jsonl"):
                yield project, os.path.join(root, name)


def collect(projects_dir, project_filter, since):
    projects = {}
    for project, path in transcripts(projects_dir, project_filter):
        data = scan_file(path, since)
        agg = projects.setdefault(
            project,
            {
                "sessions": [],
                "tools": collections.defaultdict(
                    lambda: {"calls": 0, "bytes": 0, "over": 0}
                ),
                "skills": collections.Counter(),
                "agents": collections.Counter(),
            },
        )
        agg["sessions"].append(data["session"])
        for name, tool in data["tools"].items():
            for field in ("calls", "bytes", "over"):
                agg["tools"][name][field] += tool[field]
        agg["skills"] += data["skills"]
        agg["agents"] += data["agents"]
    return projects


def mb(size):
    return round(size / 1e6, 6)


def build_rows(projects):
    rows = []
    for project in sorted(projects):
        agg = projects[project]
        total = sum(t["bytes"] for t in agg["tools"].values())
        tools = sorted(
            (
                {
                    "tool": name,
                    "calls": tool["calls"],
                    "bytes": tool["bytes"],
                    "mb": mb(tool["bytes"]),
                    "avg_bytes": tool["bytes"] // tool["calls"],
                    "over_40kb": tool["over"],
                }
                for name, tool in agg["tools"].items()
            ),
            key=lambda t: -t["bytes"],
        )
        sessions = sorted(
            (
                {
                    "session": s["session"][:8],
                    "user_turns": s["user_turns"],
                    "compactions": s["compactions"],
                    "branches": len(s["branches"]),
                    "bytes": s["bytes"],
                    "mb": mb(s["bytes"]),
                }
                for s in agg["sessions"]
            ),
            key=lambda s: -s["bytes"],
        )
        rows.append(
            {
                "project": project,
                "sessions": len(agg["sessions"]),
                "bytes": total,
                "mb": mb(total),
                "tools": tools,
                "top_sessions": sessions[:TOP_SESSIONS],
                "skills": [
                    {"skill": name, "calls": n} for name, n in agg["skills"].most_common()
                ],
                "agents": [
                    {"subagent_type": name, "calls": n}
                    for name, n in agg["agents"].most_common()
                ],
            }
        )
    rows.sort(key=lambda r: -r["bytes"])
    return rows


def report(rows, since):
    if not rows:
        print(f"no transcripts since {since}")
        return
    for row in rows:
        print(
            f"\n=== {row['project']}  sessions={row['sessions']}  "
            f"{row['mb']:.1f} MB of tool results"
        )
        header = f"{'tool':22}  {'calls':>6}  {'MB':>7}  {'avg bytes':>10}  {'>40KB':>6}"
        print(header)
        print("-" * len(header))
        for tool in row["tools"]:
            print(
                f"{tool['tool'][:22]:22}  {tool['calls']:>6}  {tool['mb']:>7.1f}  "
                f"{tool['avg_bytes']:>10}  {tool['over_40kb']:>6}"
            )

        header = (
            f"{'session':8}  {'turns':>6}  {'compact':>7}  {'branches':>8}  {'MB':>7}"
        )
        print(f"\n{header}")
        print("-" * len(header))
        for session in row["top_sessions"]:
            print(
                f"{session['session']:8}  {session['user_turns']:>6}  "
                f"{session['compactions']:>7}  {session['branches']:>8}  "
                f"{session['mb']:>7.1f}"
            )

        skills = " ".join(f"{s['skill']}={s['calls']}" for s in row["skills"])
        agents = " ".join(f"{a['subagent_type']}={a['calls']}" for a in row["agents"])
        print(f"\nSKILLS: {skills or 'none'}")
        print(f"AGENTS: {agents or 'none'}")


def main():
    parser = argparse.ArgumentParser(
        prog="context-audit.py",
        description="Audit context cost from ~/.claude/projects transcripts: per "
        "project, the tool results that filled the context, the sessions that "
        "carried them, and the skills and subagents the project fired.",
        epilog="A result is sized as its serialised content in UTF-8 bytes, and MB "
        "is bytes / 1e6. The audit reads transcripts and writes nothing.",
    )
    parser.add_argument(
        "--days", type=int, default=30, metavar="N", help="window in days (default 30)"
    )
    parser.add_argument(
        "--since", metavar="YYYY-MM-DD", help="start of the window, overriding --days"
    )
    parser.add_argument(
        "--project", metavar="SUBSTR", help="substring of the project directory name"
    )
    parser.add_argument(
        "--projects-dir", default=PROJECTS, metavar="PATH", help=f"default {PROJECTS}"
    )
    parser.add_argument("--json", action="store_true", help="emit the rows as JSON")
    args = parser.parse_args()

    if not os.path.isdir(args.projects_dir):
        print(f"no such projects directory: {args.projects_dir}", file=sys.stderr)
        return 2

    since = args.since or (
        datetime.date.today() - datetime.timedelta(days=args.days)
    ).isoformat()
    rows = build_rows(collect(args.projects_dir, args.project, since))
    if args.json:
        json.dump(rows, sys.stdout, indent=2)
        print()
    else:
        report(rows, since)
    return 0


if __name__ == "__main__":
    sys.exit(main())
