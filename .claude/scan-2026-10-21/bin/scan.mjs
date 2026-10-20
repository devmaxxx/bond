#!/usr/bin/env node
// Helper for the 2026-10-21 full scan. Pure node, no dependencies.
//   node scan.mjs split   <PROMPT.md> <briefsDir>   extract the brief blocks into files
//   node scan.mjs tasks   <WT> <contextDir>         open-tasks.tsv / done-tasks.tsv from the milestone files
//   node scan.mjs check   <RUN>                     which lanes are present, valid, skipped or missing
//   node scan.mjs compact <RUN>                     merged/compact.tsv — one row per lane finding
//   node scan.mjs merge   <RUN>                     merged/map.json + lanes -> merged/findings.json, merged/index.tsv (SCAN ids)
//   node scan.mjs show    <RUN> <SCAN-id>...        print those findings (final/ if present, else merged/)
//   node scan.mjs apply   <RUN>                     merged + verify verdicts -> final/
import fs from 'node:fs'
import path from 'node:path'

const [cmd, a, b] = process.argv.slice(2)
const read = (p) => fs.readFileSync(p, 'utf8')
const json = (p) => JSON.parse(read(p).replace(/^﻿/, ''))
const tsv = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim()
const LANE_ID = /^[A-M]\d$/
const SEV = { critical: 8, high: 5, medium: 3, low: 1, info: 0 }
const CONF = { proven: 1, high: 0.85, medium: 0.6, low: 0.3 }
const STAGE = { pilot: 1.5, beta: 1, later: 0.7 }
const EFF = { S: 1, M: 1.5, L: 2.5, XL: 4 }
const REQUIRED = ['id', 'title', 'category', 'severity', 'confidence', 'type', 'stage', 'evidence', 'scenario', 'impact', 'known', 'fix', 'effort']
const at = (f) => (f.evidence?.[0] ? `${f.evidence[0].path}:${f.evidence[0].line ?? ''}` : '')

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

function problems(f) {
  const miss = REQUIRED.filter((k) => f[k] === undefined || f[k] === '')
  if (!SEV.hasOwnProperty(f.severity)) miss.push(`severity=${f.severity}`)
  if (!CONF.hasOwnProperty(f.confidence)) miss.push(`confidence=${f.confidence}`)
  if (f.severity !== 'info' && !(Array.isArray(f.evidence) && f.evidence.length)) miss.push('evidence[]')
  return miss
}

function lanes(run) {
  const expected = fs.readdirSync(path.join(run, 'briefs')).map((n) => n.replace(/\.md$/, '')).filter((n) => LANE_ID.test(n)).sort()
  const dir = path.join(run, 'lanes')
  const res = { expected: expected.length, ok: [], skipped: [], invalid: [], missing: [], findings: 0, warnings: [] }
  // extra gap lanes (C1b, …) run by the orchestrator are read like any lane but never expected
  const extra = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => /^[A-M]\d[a-z]\.json$/.test(n)).map((n) => n.slice(0, -5)).sort() : []
  for (const id of [...expected, ...extra]) {
    const p = path.join(dir, `${id}.json`)
    if (fs.existsSync(path.join(dir, `${id}.skipped`))) { res.skipped.push(id); continue }
    if (!fs.existsSync(p)) { res.missing.push(id); continue }
    try {
      const lane = json(p)
      const fs_ = lane.findings ?? []
      res.findings += fs_.length
      fs_.forEach((f, i) => { const m = problems(f); if (m.length) res.warnings.push(`${id}#${f.id ?? i}: ${m.join(',')}`) })
      res.ok.push(id)
    } catch (e) { res.invalid.push(`${id}: ${e.message.slice(0, 120)}`) }
  }
  return res
}

if (cmd === 'split') {
  const src = read(a)
  fs.mkdirSync(b, { recursive: true })
  let n = 0
  for (const m of src.matchAll(/^<!-- brief:([\w-]+) -->\r?\n([\s\S]*?)^<!-- \/brief -->/gm)) { fs.writeFileSync(path.join(b, `${m[1]}.md`), m[2]); n++ }
  console.log(`${n} briefs -> ${b}`)
} else if (cmd === 'tasks') {
  const root = path.join(a, 'docs/prd-2026-08-16/plans/milestones')
  const open = ['mid\ttask\tstage\ttitle\tfile'], done = ['mid\ttask\tstage\ttitle\tfile']
  for (const file of walk(root)) {
    const mid = (path.basename(file).match(/^([A-Z]+-M\d+)/) || [])[1]
    if (!mid) continue
    const text = read(file), stage = {}
    let whole = null
    for (const m of text.matchAll(/^\*\*(Alpha|Beta|Release)[^*]*:\*\*(.*)$/gm)) {
      const ids = m[2].split(' — ')[0]
      if (/the whole file/.test(ids)) whole ??= m[1].toLowerCase()
      for (const t of ids.match(/\bT\d+\b/g) || []) stage[t] ??= m[1].toLowerCase()
    }
    if (whole) for (const m of text.matchAll(/^\s*- \[[ xX]\] \*\*(T\d+)\*\*/gm)) stage[m[1]] ??= whole
    const rel = path.relative(a, file).split(path.sep).join('/')
    for (const m of text.matchAll(/^\s*- \[([ xX])\] \*\*(T\d+)\*\*\s*(.*)$/gm)) {
      const row = [mid, m[2], stage[m[2]] ?? '-', tsv(m[3]).slice(0, 200), rel].join('\t')
      ;(m[1] === ' ' ? open : done).push(row)
    }
  }
  fs.mkdirSync(b, { recursive: true })
  fs.writeFileSync(path.join(b, 'open-tasks.tsv'), open.join('\n') + '\n')
  fs.writeFileSync(path.join(b, 'done-tasks.tsv'), done.join('\n') + '\n')
  console.log(`open ${open.length - 1}, done ${done.length - 1} -> ${b}`)
} else if (cmd === 'check') {
  const r = lanes(a)
  console.log(JSON.stringify({ ...r, warnings: r.warnings.length, sample_warnings: r.warnings.slice(0, 15) }, null, 1))
} else if (cmd === 'compact') {
  const r = lanes(a), rows = ['lane\tid\tseverity\tconfidence\ttype\tstage\tcategory\tknown\teffort\tat\trefs\ttitle']
  const bySev = {}
  for (const id of r.ok) {
    for (const f of json(path.join(a, 'lanes', `${id}.json`)).findings ?? []) {
      bySev[f.severity] = (bySev[f.severity] ?? 0) + 1
      rows.push([id, f.id, f.severity, f.confidence, f.type, f.stage, f.category, f.known?.status, f.effort, at(f), (f.refs ?? []).join(' '), f.title].map(tsv).join('\t'))
    }
  }
  fs.mkdirSync(path.join(a, 'merged'), { recursive: true })
  fs.writeFileSync(path.join(a, 'merged/compact.tsv'), rows.join('\n') + '\n')
  console.log(JSON.stringify({ rows: rows.length - 1, lanes_ok: r.ok.length, missing: r.missing, skipped: r.skipped, invalid: r.invalid, bySev }))
} else if (cmd === 'merge') {
  // merged/map.json: { groups: [{ canonical, members[], theme?, severity?, note? }], dropped: [{ id, reason }] }
  const r = lanes(a), all = new Map()
  for (const id of r.ok) for (const f of json(path.join(a, 'lanes', `${id}.json`)).findings ?? []) {
    const key = String(f.id).startsWith(`${id}-`) ? f.id : `${id}-${f.id}`
    all.set(key, { ...f, id: key, lane: id })
  }
  const map = json(path.join(a, 'merged/map.json')), used = new Set(), unknown = [], groups = []
  for (const d of map.dropped ?? []) { if (all.has(d.id)) used.add(d.id); else unknown.push(d.id) }
  for (const g of map.groups ?? []) {
    const members = [...new Set([g.canonical, ...(g.members ?? [])])].filter((m) => (all.has(m) ? true : (unknown.push(m), false)))
    if (!members.length || !all.has(g.canonical)) continue
    members.forEach((m) => used.add(m))
    groups.push({ ...g, members })
  }
  for (const k of all.keys()) if (!used.has(k)) groups.push({ canonical: k, members: [k] })
  const out = groups.map((g) => {
    const c = all.get(g.canonical), seen = new Set(), evidence = [], refs = new Set(), ids = new Set(c.known?.ids ?? [])
    for (const m of g.members.map((id) => all.get(id))) {
      for (const e of m.evidence ?? []) { const k = `${e.path}:${e.line}`; if (!seen.has(k) && evidence.length < 6) { seen.add(k); evidence.push(e) } }
      ;(m.refs ?? []).forEach((x) => refs.add(x)); (m.known?.ids ?? []).forEach((x) => ids.add(x))
    }
    return { ...c, severity: g.severity ?? c.severity, theme: g.theme ?? '', merge_note: g.note ?? '', sources: g.members, evidence, refs: [...refs], known: { ...(c.known ?? {}), ids: [...ids] } }
  })
  out.sort((x, y) => (SEV[y.severity] ?? 0) - (SEV[x.severity] ?? 0) || (CONF[y.confidence] ?? 0) - (CONF[x.confidence] ?? 0) || x.id.localeCompare(y.id))
  out.forEach((f, i) => { f.scan_id = `SCAN-${String(i + 1).padStart(3, '0')}` })
  fs.writeFileSync(path.join(a, 'merged/findings.json'), JSON.stringify(out, null, 1))
  const head = 'scan_id\tseverity\tconfidence\ttype\tstage\tcategory\teffort\tknown\tat\tsources\ttheme\ttitle'
  fs.writeFileSync(path.join(a, 'merged/index.tsv'), [head, ...out.map((f) => [f.scan_id, f.severity, f.confidence, f.type, f.stage, f.category, f.effort, f.known?.status, at(f), f.sources.join(' '), f.theme, f.title].map(tsv).join('\t'))].join('\n') + '\n')
  console.log(JSON.stringify({ lane_findings: all.size, dropped: (map.dropped ?? []).length, merged: out.length, multi_member_groups: out.filter((f) => f.sources.length > 1).length, unknown_ids: unknown }))
} else if (cmd === 'show') {
  const ids = new Set(process.argv.slice(4))
  const src = fs.existsSync(path.join(a, 'final/findings.json')) ? 'final/findings.json' : 'merged/findings.json'
  const hits = json(path.join(a, src)).filter((f) => ids.has(f.scan_id))
  console.log(JSON.stringify(hits, null, 1))
  if (hits.length < ids.size) console.error(`not found: ${[...ids].filter((i) => !hits.some((h) => h.scan_id === i)).join(' ')}`)
} else if (cmd === 'apply') {
  const merged = json(path.join(a, 'merged/findings.json'))
  const verdicts = new Map()
  const vdir = path.join(a, 'verify')
  for (const n of fs.existsSync(vdir) ? fs.readdirSync(vdir).filter((n) => n.endsWith('.json')) : []) {
    for (const v of json(path.join(vdir, n)).verdicts ?? []) verdicts.set(v.scan_id, v)
  }
  const keep = [], dropped = [], counts = {}
  for (const f of merged) {
    const v = verdicts.get(f.scan_id)
    const status = v?.verdict ?? 'UNVERIFIED'
    const g = { ...f, status, verify_note: v?.note ?? '' }
    if (status === 'CONFIRMED-ADJUSTED') for (const k of ['severity', 'confidence', 'stage', 'effort']) if (v[k]) g[k] = v[k]
    if (v?.evidence_added?.length) g.evidence = [...(g.evidence ?? []), ...v.evidence_added]
    if (v?.known_ids?.length) g.known = { ...(g.known ?? {}), ids: [...new Set([...(g.known?.ids ?? []), ...v.known_ids])] }
    g.priority = +((SEV[g.severity] ?? 0) * (CONF[g.confidence] ?? 0.3) * (STAGE[g.stage] ?? 1) / (EFF[g.effort] ?? 2.5)).toFixed(2)
    counts[status] = (counts[status] ?? 0) + 1
    ;(['REFUTED', 'KNOWN', 'DECIDED'].includes(status) ? dropped : keep).push(g)
  }
  keep.sort((x, y) => y.priority - x.priority || x.scan_id.localeCompare(y.scan_id))
  const out = path.join(a, 'final')
  fs.mkdirSync(out, { recursive: true })
  fs.writeFileSync(path.join(out, 'findings.json'), JSON.stringify(keep, null, 1))
  const head = 'priority\tscan_id\tstatus\tseverity\tconfidence\tstage\teffort\tcategory\ttype\tat\trefs\ttitle'
  fs.writeFileSync(path.join(out, 'findings.tsv'), [head, ...keep.map((g) => [g.priority, g.scan_id, g.status, g.severity, g.confidence, g.stage, g.effort, g.category, g.type, at(g), [...(g.refs ?? []), ...(g.known?.ids ?? [])].join(' '), g.title].map(tsv).join('\t'))].join('\n') + '\n')
  fs.writeFileSync(path.join(out, 'dropped.tsv'), ['scan_id\tstatus\tseverity\tknown_ids\tnote\ttitle', ...dropped.map((g) => [g.scan_id, g.status, g.severity, (g.known?.ids ?? []).join(' '), g.verify_note, g.title].map(tsv).join('\t'))].join('\n') + '\n')
  const bySev = {}
  for (const g of keep) bySev[g.severity] = (bySev[g.severity] ?? 0) + 1
  fs.writeFileSync(path.join(out, 'counts.json'), JSON.stringify({ merged: merged.length, verdicts: verdicts.size, kept: keep.length, dropped: dropped.length, byStatus: counts, keptBySeverity: bySev }, null, 1))
  console.log(read(path.join(out, 'counts.json')))
} else {
  console.error('usage: scan.mjs split|tasks|check|compact|apply ...'); process.exit(2)
}
