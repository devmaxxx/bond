#!/usr/bin/env python3
"""Audit routing decisions against what the sessions actually did.

Reads transcripts only; a rule moves when the numbers here say it fires wrong.
"""

import argparse
import collections
import json
import os
import re
import statistics
import sys

PROJECTS = os.path.expanduser("~/.claude/projects")

ROUTE_RE = re.compile(r"route: tier=[^\n]*")
SCAN_RE = re.compile(r"scan: files=[^\n]*")
REVIEW_RE = re.compile(r"review-route: level=[^\n]*")
TIER_RE = re.compile(r"tier=(\w+)")
FIRED_RE = re.compile(r"tier=\w+\s*\(([^)]*)\)")
LEVEL_RE = re.compile(r"level=(\w+)")
LEVEL_FIRED_RE = re.compile(r"level=\w+\s*\(([^)]*)\)")
TARGET_RE = re.compile(r"target=(.+?)(?:\s+flags=|\s+→|$)")
ASK_RE = re.compile(r"route|escalat|tier|xhigh|fable|opus/high", re.I)
# A review escalation is asked in its own words; widening ASK_RE itself would
# re-attach those questions to the task routes and move numbers this audit is
# meant to hold still.
REVIEW_ASK_RE = re.compile(ASK_RE.pattern + r"|review|ultra|code-review", re.I)
PAIR_RE = re.compile(r'"([^"]*)"="([^"]*)"')

ANSWER_MARK = "Your questions have been answered:"

# Every line is parsed only when one of these appears in it; the transcripts are
# large enough that a full json.loads per line dominates the runtime.
MARKERS = (
    "route: tier=",
    "scan: files=",
    "review-route: level=",
    "AskUserQuestion",
    ANSWER_MARK,
    '"Edit"',
    '"Write"',
    '"NotebookEdit"',
)

# The skill body quotes its own route template, and a session that reads or
# echoes the skill would otherwise be counted as having routed.
TEMPLATE_MARKS = ("<t>", "<matched predicate")
REVIEW_TEMPLATE_MARKS = TEMPLATE_MARKS + ("<l>", "<kind>", "<fields")
LEVELS = ("ultra", "max", "high", "medium", "low", "skip")


def blocks(entry):
    content = (entry.get("message") or {}).get("content")
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    if isinstance(content, list):
        return [b for b in content if isinstance(b, dict)]
    return []


def result_text(block):
    content = block.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(
            c.get("text", "") for c in content if isinstance(c, dict)
        )
    return ""


def scan_file(path):
    """Pull routes, scans, asks, answers and edited paths out of one transcript."""
    out = {
        "session": os.path.basename(path)[: -len(".jsonl")],
        "routes": [],
        "scans": [],
        "reviews": [],
        "asks": [],
        "review_asks": [],
        "answers": [],
        "files": set(),
    }
    try:
        fh = open(path, errors="ignore")
    except OSError:
        return out
    with fh:
        for lineno, line in enumerate(fh):
            if lineno == 0:
                try:
                    head = json.loads(line)
                except Exception:
                    head = {}
                if isinstance(head, dict) and head.get("sessionId"):
                    out["session"] = head["sessionId"]
            if not any(m in line for m in MARKERS):
                continue
            try:
                entry = json.loads(line)
            except Exception:
                continue
            if not isinstance(entry, dict):
                continue
            kind = entry.get("type")
            ts = entry.get("timestamp") or ""
            for block in blocks(entry):
                btype = block.get("type")
                if btype == "text" and kind == "assistant":
                    text = block.get("text") or ""
                    for m in ROUTE_RE.finditer(text):
                        raw = m.group(0)
                        if any(t in raw for t in TEMPLATE_MARKS):
                            continue
                        tier = TIER_RE.search(raw)
                        fired = FIRED_RE.search(raw)
                        out["routes"].append(
                            {
                                "ts": ts,
                                "tier": tier.group(1) if tier else "?",
                                "fired": fired.group(1).strip() if fired else "",
                            }
                        )
                    for m in SCAN_RE.finditer(text):
                        out["scans"].append({"ts": ts, "scan": m.group(0).strip()})
                    for m in REVIEW_RE.finditer(text):
                        raw = m.group(0)
                        if any(t in raw for t in REVIEW_TEMPLATE_MARKS):
                            continue
                        level = LEVEL_RE.search(raw)
                        if not level or level.group(1) not in LEVELS:
                            continue
                        fired = LEVEL_FIRED_RE.search(raw)
                        target = TARGET_RE.search(raw)
                        out["reviews"].append(
                            {
                                "ts": ts,
                                "level": level.group(1),
                                "fired": fired.group(1).strip() if fired else "",
                                "target": target.group(1).strip() if target else "",
                            }
                        )
                elif btype == "tool_use":
                    name = block.get("name")
                    inp = block.get("input") or {}
                    if not isinstance(inp, dict):
                        continue
                    if name in ("Edit", "Write") and inp.get("file_path"):
                        out["files"].add(inp["file_path"])
                    elif name == "NotebookEdit" and inp.get("notebook_path"):
                        out["files"].add(inp["notebook_path"])
                    elif name == "AskUserQuestion":
                        questions = [
                            q.get("question", "")
                            for q in inp.get("questions") or []
                            if isinstance(q, dict)
                        ]
                        hits = [q for q in questions if ASK_RE.search(q)]
                        if hits:
                            out["asks"].append({"ts": ts, "questions": hits})
                        review_hits = [q for q in questions if REVIEW_ASK_RE.search(q)]
                        if review_hits:
                            out["review_asks"].append({"ts": ts, "questions": review_hits})
                elif btype == "tool_result" and kind == "user":
                    text = result_text(block)
                    if ANSWER_MARK in text:
                        out["answers"].append(
                            {"ts": ts, "pairs": dict(PAIR_RE.findall(text))}
                        )
    return out


def transcripts(project_filter):
    for root, _dirs, names in os.walk(PROJECTS):
        rel = os.path.relpath(root, PROJECTS)
        project = PROJECTS if rel == "." else rel.split(os.sep)[0]
        if project_filter and project_filter not in project:
            continue
        for name in names:
            if name.endswith(".jsonl"):
                yield project, os.path.join(root, name)


def collect(project_filter):
    """Group main transcripts with their sidechains: the subagents do the edits."""
    sessions = {}
    for project, path in transcripts(project_filter):
        data = scan_file(path)
        key = (project, data["session"])
        agg = sessions.setdefault(
            key,
            {
                "routes": [],
                "scans": [],
                "reviews": [],
                "asks": [],
                "review_asks": [],
                "answers": [],
                "files": set(),
            },
        )
        for field in ("routes", "scans", "reviews", "asks", "review_asks", "answers"):
            agg[field].extend(data[field])
        agg["files"] |= data["files"]
    return sessions


def latest_before(events, ts):
    prior = [e for e in events if e["ts"] and e["ts"] <= ts]
    return prior[-1] if prior else (events[0] if events else None)


def answer_for(ask, answers):
    later = [a for a in answers if a["ts"] >= ask["ts"]]
    for a in later:
        for question in ask["questions"]:
            if question in a["pairs"]:
                return a["pairs"][question]
        if a["pairs"]:
            return next(iter(a["pairs"].values()))
    return ""


def build_rows(sessions, since):
    rows = []
    for (project, session), agg in sessions.items():
        for field in ("routes", "scans", "asks", "answers"):
            agg[field].sort(key=lambda e: e["ts"])
        multi = len(agg["routes"]) > 1
        for route in agg["routes"]:
            if since and route["ts"][:10] < since:
                continue
            scan = latest_before(agg["scans"], route["ts"])
            ask = latest_before(agg["asks"], route["ts"])
            answer = answer_for(ask, agg["answers"]) if ask else ""
            rows.append(
                {
                    "ts": route["ts"],
                    "session": session,
                    "project": project,
                    "tier": route["tier"],
                    "fired": route["fired"],
                    "scan": scan["scan"] if scan else "",
                    "files": len(agg["files"]),
                    "asked": bool(ask),
                    "answer": answer,
                    "declined": answer.strip().lower().startswith("opus/high"),
                    "_multi": multi,
                    "_ask_ts": ask["ts"] if ask else "",
                }
            )
    rows.sort(key=lambda r: r["ts"])
    return rows


def build_review_rows(sessions, since):
    """One row per review-route line, carrying the task route that preceded it."""
    rows = []
    for (project, session), agg in sessions.items():
        for field in ("routes", "reviews", "review_asks", "answers"):
            agg[field].sort(key=lambda e: e["ts"])
        for review in agg["reviews"]:
            if since and review["ts"][:10] < since:
                continue
            route = latest_before(agg["routes"], review["ts"])
            ask = latest_before(agg["review_asks"], review["ts"])
            rows.append(
                {
                    "ts": review["ts"],
                    "session": session,
                    "project": project,
                    "level": review["level"],
                    "fired": review["fired"],
                    "target": review["target"],
                    "task_tier": route["tier"] if route else "",
                    "asked": bool(ask),
                    "answer": answer_for(ask, agg["answers"]) if ask else "",
                }
            )
    rows.sort(key=lambda r: r["ts"])
    return rows


def report(rows):
    header = (
        f"{'date':10}  {'session':8}  {'project':28}  {'tier':6}  "
        f"{'fired':50}  {'files':>6}  {'ask':3}  answer"
    )
    print(header)
    print("-" * len(header))
    for r in rows:
        mark = "*" if r["_multi"] else " "
        print(
            f"{r['ts'][:10]:10}  {r['session'][:8]:8}  {r['project'][-28:]:28}  "
            f"{r['tier']:6}  {r['fired'][:50]:50}  {r['files']:>5}{mark}  "
            f"{'yes' if r['asked'] else 'no':3}  {r['answer'][:30]}"
        )

    tiers = collections.Counter(r["tier"] for r in rows)
    print(f"\nROUTES: {len(rows)}")
    print("TIERS: " + " ".join(f"{t}={n}" for t, n in tiers.most_common()))

    asked = {(r["session"], r["_ask_ts"]) for r in rows if r["asked"]}
    declined = {(r["session"], r["_ask_ts"]) for r in rows if r["asked"] and r["declined"]}
    rate = f"{len(declined) / len(asked):.0%}" if asked else "n/a"
    print(f"ASKS: asked={len(asked)} declined={len(declined)} rate={rate}")

    per_tier = collections.defaultdict(list)
    for r in rows:
        per_tier[r["tier"]].append(r["files"])
    print("FILES BY TIER: " + " ".join(
        f"{t}={statistics.median(v):g}" for t, v in sorted(per_tier.items())
    ))

    fired = collections.Counter(r["fired"] for r in rows if r["fired"])
    print("\nFIRED (top 15)")
    for text, n in fired.most_common(15):
        print(f"  {n:3d}  {text[:80]}")


def report_reviews(rows):
    header = (
        f"{'date':10}  {'session':8}  {'project':22}  {'level':6}  "
        f"{'fired':34}  {'target':20}  {'task':6}  {'ask':3}  answer"
    )
    print()
    print(header)
    print("-" * len(header))
    for r in rows:
        print(
            f"{r['ts'][:10]:10}  {r['session'][:8]:8}  {r['project'][-22:]:22}  "
            f"{r['level']:6}  {r['fired'][:34]:34}  {r['target'][:20]:20}  "
            f"{r['task_tier']:6}  {'yes' if r['asked'] else 'no':3}  {r['answer'][:24]}"
        )

    levels = collections.Counter(r["level"] for r in rows)
    print(f"\nREVIEWS: {len(rows)}")
    print("LEVELS: " + " ".join(f"{l}={n}" for l, n in levels.most_common()))


def main():
    parser = argparse.ArgumentParser(
        prog="route-audit.py",
        description="Audit routing-model-and-effort decisions from ~/.claude/projects "
        "transcripts: one row per route line, with the scan card that preceded it, "
        "the escalation question and its answer, and the files the session and its "
        "subagents actually edited.",
        epilog="File counts come from Edit, Write and NotebookEdit tool calls only; "
        "files written through a Bash heredoc or redirect are not counted. "
        "The audit reads transcripts and writes nothing.",
    )
    parser.add_argument("--since", metavar="YYYY-MM-DD", help="drop routes before this date")
    parser.add_argument("--project", metavar="SUBSTR", help="substring of the project directory name")
    parser.add_argument("--json", action="store_true", help="emit the rows as JSON")
    parser.add_argument(
        "--reviews",
        action="store_true",
        help="also list the review-route lines beside the task routes they followed",
    )
    args = parser.parse_args()

    sessions = collect(args.project)
    rows = build_rows(sessions, args.since)
    review_rows = build_review_rows(sessions, args.since) if args.reviews else []
    if args.json:
        payload = [{k: v for k, v in r.items() if not k.startswith("_")} for r in rows]
        if args.reviews:
            payload = {"routes": payload, "reviews": review_rows}
        json.dump(payload, sys.stdout, indent=2)
        print()
    else:
        report(rows)
        if args.reviews:
            report_reviews(review_rows)
    return 0


if __name__ == "__main__":
    sys.exit(main())
