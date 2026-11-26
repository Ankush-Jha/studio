#!/usr/bin/env node
// Studio learning loop: notices what a person changed after the bot made something, and records it
// so the librarian can turn repeated changes into lessons that every later job reads.
//
//   node studio/tools/learn.mjs snapshot <job-id>   fingerprint a job's script, project and out/ (job.mjs runs it
//                                                   when the director finishes, so the snapshot = "what the bot made")
//   node studio/tools/learn.mjs scan [<job-id>]     compare jobs with their snapshot; record every change a person made
//                                                   to library/edits.jsonl, plus changes to the knowledge files
//                                                   (client profiles, kit lessons, playbook, rubric, agents) since the last scan
//   node studio/tools/learn.mjs digest              write library/edits-digest.md: unprocessed edits, grouped by client,
//                                                   for the librarian to turn into proposed lessons
//   node studio/tools/learn.mjs done                mark everything in the digest as processed
//
// Everything it writes lives in library/, which is committed with the repo, so what Studio learns on one laptop
// reaches every other laptop with a git pull.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const R = process.env.STUDIO_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JOBS = path.join(R, 'jobs');
const LIB = path.join(R, 'library');
const EDITS = path.join(LIB, 'edits.jsonl');
const STATE = path.join(LIB, 'learn-state.json');
const DIGEST = path.join(LIB, 'edits-digest.md');
const TRACK = ['script.json', 'concepts.json', 'project', 'out'];           // what the bot made, per job
// Knowledge files a person may tune, per git repo: the public studio repo and the private client-data repo (private/).
const KNOWLEDGE = [
  { repo: R, label: 'studio', paths: ['playbook', 'studio/rubric', '.claude/agents', '.claude/skills'] },
  { repo: path.join(R, 'private'), label: 'private', paths: ['assets/*/profile.md', 'kits/*/lessons.md', 'kits/*/confirm.json'] },
];
const SKIP = /(^|\/)(node_modules|\.cache|\.work|frames|\.DS_Store)(\/|$)/;
const TEXT = /\.(json|md|txt|srt|html|css|js|mjs|py|svg|vtt)$/i;
const MAX_TEXT = 512 * 1024;

const jread = (p, d) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return d; } };
const now = () => new Date().toISOString();
const sha = (p) => crypto.createHash('sha1').update(fs.readFileSync(p)).digest('hex');

function walk(dir, base, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name), rel = path.relative(base, abs).split(path.sep).join('/');
    if (SKIP.test(rel)) continue;
    if (e.isDirectory()) walk(abs, base, out); else if (e.isFile()) out.push(rel);
  }
  return out;
}

function fingerprint(id) {
  const jd = path.join(JOBS, id), files = {}, text = {};
  for (const t of TRACK) {
    const abs = path.join(jd, t);
    const list = fs.existsSync(abs) && fs.statSync(abs).isDirectory() ? walk(abs, jd) : (fs.existsSync(abs) ? [t] : []);
    for (const rel of list) {
      const p = path.join(jd, rel);
      files[rel] = sha(p);
      if (TEXT.test(rel) && fs.statSync(p).size <= MAX_TEXT) text[rel] = fs.readFileSync(p, 'utf8');
    }
  }
  return { files, text };
}

function snapshot(id) {
  const jd = path.join(JOBS, id);
  if (!fs.existsSync(path.join(jd, 'job.json'))) throw new Error(`no job ${id}`);
  const fp = fingerprint(id);
  fs.writeFileSync(path.join(jd, '.snapshot.json'), JSON.stringify({ at: now(), ...fp }));
  return Object.keys(fp.files).length;
}

// Field-level differences between two JSON values: [{path, from, to}]
function jdiff(a, b, p = '', out = []) {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) jdiff(a[k], b[k], p ? `${p}.${k}` : k, out);
  } else out.push({ path: p, from: a, to: b });
  return out;
}

function textDiff(before, after) {
  const A = before.split('\n'), B = after.split('\n'), setA = new Set(A), setB = new Set(B);
  const removed = A.filter((l) => !setB.has(l) && l.trim()), added = B.filter((l) => !setA.has(l) && l.trim());
  return { removed: removed.slice(0, 40), added: added.slice(0, 40) };
}

function scanJob(id) {
  const jd = path.join(JOBS, id), snapP = path.join(jd, '.snapshot.json'), snap = jread(snapP, null);
  if (!snap) return null;
  const job = jread(path.join(jd, 'job.json'), {}), cur = fingerprint(id), changes = [];
  for (const rel of new Set([...Object.keys(snap.files), ...Object.keys(cur.files)])) {
    const a = snap.files[rel], b = cur.files[rel];
    if (a === b) continue;
    const ch = { path: rel, change: !a ? 'added' : !b ? 'removed' : 'edited' };
    if (a && b && rel.endsWith('.json') && snap.text[rel] != null && cur.text[rel] != null) {
      try { ch.fields = jdiff(JSON.parse(snap.text[rel]), JSON.parse(cur.text[rel])).slice(0, 60); } catch { /* not JSON */ }
    }
    if (!ch.fields && a && b && snap.text[rel] != null && cur.text[rel] != null) ch.lines = textDiff(snap.text[rel], cur.text[rel]);
    changes.push(ch);
  }
  if (!changes.length) return null;
  const rec = { kind: 'job-edit', at: now(), job: id, client: job.client, format: job.format, engine: job.engine, style: job.style, topic: job.topic, since: snap.at, changes };
  fs.appendFileSync(EDITS, JSON.stringify(rec) + '\n');
  fs.writeFileSync(snapP, JSON.stringify({ at: now(), ...cur }));            // record each edit once
  return rec;
}

function scanKnowledge(state) {
  const recs = [];
  state.repos ||= {};
  for (const { repo, label, paths } of KNOWLEDGE) {
    const st = (state.repos[label] ||= {});
    let head;
    try { head = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { continue; }
    const range = st.lastCommit ? [`${st.lastCommit}..${head}`] : ['-n', '1', head];
    let log = '';
    try { log = execFileSync('git', ['-C', repo, 'log', '--format=@@%H|%an|%aI|%s', '--name-status', ...range, '--', ...paths], { encoding: 'utf8' }); } catch { /* shallow or new repo */ }
    for (const block of log.split('@@').filter(Boolean)) {
      const [hdr, ...rest] = block.trim().split('\n');
      const [hash, author, date, subject] = hdr.split('|');
      const files = rest.filter(Boolean).map((l) => { const [s, ...f] = l.split('\t'); return { status: s, path: f.join(' → ') }; });
      if (files.length) recs.push({ kind: 'knowledge-edit', repo: label, at: now(), commit: hash, author, date, subject, files });
    }
    // Uncommitted edits count too (someone tweaking a profile right now).
    try {
      const dirty = execFileSync('git', ['-C', repo, 'status', '--porcelain', '--', ...paths], { encoding: 'utf8' }).split('\n').filter(Boolean);
      const sig = crypto.createHash('sha1').update(dirty.join('\n') + dirty.map((l) => { const p = path.join(repo, l.slice(3)); return fs.existsSync(p) && fs.statSync(p).isFile() ? sha(p) : ''; }).join('')).digest('hex');
      if (dirty.length && sig !== st.dirtySig) recs.push({ kind: 'knowledge-edit', repo: label, at: now(), commit: null, uncommitted: true, files: dirty.map((l) => ({ status: l.slice(0, 2).trim(), path: l.slice(3) })) });
      st.dirtySig = sig;
    } catch { /* not a git repo */ }
    st.lastCommit = head;
  }
  for (const r of recs) fs.appendFileSync(EDITS, JSON.stringify(r) + '\n');
  return recs;
}

function digest(state) {
  const lines = fs.existsSync(EDITS) ? fs.readFileSync(EDITS, 'utf8').split('\n').filter(Boolean) : [];
  const start = state.processed || 0, fresh = lines.slice(start).map((l) => JSON.parse(l));
  const by = {};
  for (const r of fresh) (by[r.client || (r.kind === 'knowledge-edit' ? '(knowledge files)' : '(no client)')] ||= []).push(r);
  const out = [`# Edits to learn from`, ``, `${fresh.length} unprocessed change record(s) (edits.jsonl lines ${start + 1}–${lines.length}). Written ${now()}.`,
    `Librarian: for each client, look for changes a person made more than once or that state a preference, and propose lessons in library/lessons-pending.md with these lines as evidence. Then run \`node studio/tools/learn.mjs done\`.`, ``];
  for (const [who, recs] of Object.entries(by)) {
    out.push(`## ${who}`, '');
    for (const r of recs) {
      if (r.kind === 'job-edit') {
        out.push(`- **${r.job}** (${r.format}, ${r.engine}/${r.style || '-'}) changed after delivery:`);
        for (const c of r.changes.slice(0, 25)) {
          if (c.fields?.length) for (const f of c.fields.slice(0, 12)) out.push(`  - ${c.path} \`${f.path}\`: ${JSON.stringify(f.from)?.slice(0, 160)} → ${JSON.stringify(f.to)?.slice(0, 160)}`);
          else if (c.lines) out.push(`  - ${c.path}: −${c.lines.removed.length}/+${c.lines.added.length} lines` + (c.lines.added[0] ? `; e.g. "${c.lines.added[0].trim().slice(0, 140)}"` : ''));
          else out.push(`  - ${c.path}: ${c.change}`);
        }
      } else {
        out.push(`- ${r.uncommitted ? 'uncommitted' : `commit ${String(r.commit).slice(0, 8)} by ${r.author}: "${r.subject}"`}: ${r.files.map((f) => `${f.status} ${f.path}`).join(', ')}`);
      }
    }
    out.push('');
  }
  fs.writeFileSync(DIGEST, out.join('\n'));
  state.digestEnd = lines.length;
  return fresh.length;
}

const [cmd, arg] = process.argv.slice(2);
const state = jread(STATE, {});
fs.mkdirSync(LIB, { recursive: true });
if (cmd === 'snapshot') { console.log(`snapshot ${arg}: ${snapshot(arg)} files`); }
else if (cmd === 'scan') {
  const ids = arg ? [arg] : (fs.existsSync(JOBS) ? fs.readdirSync(JOBS).filter((d) => fs.existsSync(path.join(JOBS, d, '.snapshot.json'))) : []);
  const jobRecs = ids.map(scanJob).filter(Boolean), kRecs = arg ? [] : scanKnowledge(state);
  console.log(`scan: ${jobRecs.length} job(s) edited by a person, ${kRecs.length} knowledge change(s) recorded in library/edits.jsonl`);
  for (const r of jobRecs) console.log(`  ${r.job}: ${r.changes.length} file(s) changed`);
}
else if (cmd === 'digest') { console.log(`digest: ${digest(state)} record(s) → library/edits-digest.md`); }
else if (cmd === 'done') { state.processed = state.digestEnd ?? state.processed ?? 0; console.log(`marked processed up to line ${state.processed}`); }
else { console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 16).join('\n')); process.exit(cmd ? 1 : 0); }
fs.writeFileSync(STATE, JSON.stringify(state, null, 2) + '\n');
