#!/usr/bin/env node
// Studio job tool: the only way agents change job.json, so the Desk's live flow graph stays exact.
// Usage:
//   node studio/tools/job.mjs new --client <slug|group:N> --format <f> --topic "<t>" [--brief '<json>']
//   node studio/tools/job.mjs node <id> <node> <idle|running|done|waiting|failed|skipped> [--summary "..."] [--out a,b]
//   node studio/tools/job.mjs log <id> <node> "message"
//   node studio/tools/job.mjs set <id> key=value [key=value ...]      (value parsed as JSON when possible)
//   node studio/tools/job.mjs output <id> --kind <video|image|carousel|caption|cover|contact|gif> --path out/<file>
//   node studio/tools/job.mjs gate <id> <g1|g2> --decision <pick|revise|approve|reject> [--choice A] [--notes "..."] [--by chat|desk]
//   node studio/tools/job.mjs show <id>        node studio/tools/job.mjs list
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JOBS = path.join(R, 'jobs');
const NODES = ['intake', 'strategist', 'gate1', 'checker', 'director', 'critic', 'gate2', 'librarian'];
const STATUS_FOR = { intake: 'intake', strategist: 'concepts', gate1: 'gate1', checker: 'checking', director: 'producing', critic: 'qa', gate2: 'gate2', librarian: 'approved' };
const now = () => new Date().toISOString();

function args(list) {
  const pos = [], opt = {};
  for (let i = 0; i < list.length; i++) {
    if (list[i].startsWith('--')) { const k = list[i].slice(2); const v = list[i + 1] && !list[i + 1].startsWith('--') ? list[++i] : true; opt[k] = v; }
    else pos.push(list[i]);
  }
  return { pos, opt };
}
const slugify = s => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-').slice(0, 40);
const dir = id => { const d = path.join(JOBS, id); if (!fs.existsSync(path.join(d, 'job.json'))) die(`no job ${id}`); return d; };
const load = id => JSON.parse(fs.readFileSync(path.join(dir(id), 'job.json'), 'utf8'));
function save(job) {
  job.updated = now();
  const f = path.join(JOBS, job.id, 'job.json');
  fs.writeFileSync(f + '.tmp', JSON.stringify(job, null, 2));
  fs.renameSync(f + '.tmp', f); // atomic so the Desk never reads half a file
}
function die(m) { console.error('job.mjs: ' + m); process.exit(1); }
const log = (job, node, msg) => job.log.push({ t: now(), node, msg });

const [cmd, ...rest] = process.argv.slice(2);
const { pos, opt } = args(rest);

if (cmd === 'new') {
  if (!opt.client || !opt.format || !opt.topic) die('new needs --client --format --topic');
  const day = new Date().toISOString().slice(0, 10);
  let id = `${day}-${slugify(String(opt.client).replace(':', '-'))}-${slugify(opt.topic)}`;
  for (let n = 2; fs.existsSync(path.join(JOBS, id)); n++) id = id.replace(/-v\d+$/, '') + `-v${n}`;
  const d = path.join(JOBS, id);
  for (const sub of ['project', 'out', 'qa/frames']) fs.mkdirSync(path.join(d, sub), { recursive: true });
  const job = {
    id, created: now(), updated: now(), client: opt.client, format: opt.format, topic: opt.topic,
    brief: opt.brief ? JSON.parse(opt.brief) : {}, status: 'intake', engine: null, style: null,
    nodes: NODES.map(n => ({ id: n, status: 'idle', started: null, ended: null, summary: '', outputs: [] })),
    concepts: 'concepts.json', chosen: null,
    gates: { g1: { at: null, decision: null, choice: null, notes: '' }, g2: { at: null, decision: null, notes: '' } },
    outputs: [], qa: { report: 'qa/report.json', pass: null }, log: [],
  };
  log(job, 'intake', `job created: ${opt.format} for ${opt.client} about "${opt.topic}"`);
  save(job);
  console.log(id);
} else if (cmd === 'node') {
  const [id, nodeId, status] = pos;
  if (!NODES.includes(nodeId)) die(`unknown node ${nodeId}`);
  if (!['idle', 'running', 'done', 'waiting', 'failed', 'skipped'].includes(status)) die(`bad status ${status}`);
  const job = load(id), n = job.nodes.find(x => x.id === nodeId);
  if (status === 'running' || status === 'waiting') { n.started = n.started && n.status === status ? n.started : now(); n.ended = null; }
  if (['done', 'failed', 'skipped'].includes(status)) n.ended = now();
  n.status = status;
  // Learning loop: fingerprint what the bot made, so later human edits can be detected (studio/tools/learn.mjs).
  if ((nodeId === 'director' || nodeId === 'critic') && status === 'done') {
    try { execFileSync(process.execPath, [path.join(R, 'studio', 'tools', 'learn.mjs'), 'snapshot', id], { stdio: 'ignore' }); } catch { /* never block the job */ }
  }
  if (opt.summary) n.summary = String(opt.summary);
  if (opt.out) n.outputs = [...new Set([...n.outputs, ...String(opt.out).split(',').map(s => s.trim()).filter(Boolean)])];
  if (status === 'failed') job.status = 'failed';
  else if (status === 'running' || status === 'waiting') job.status = STATUS_FOR[nodeId];
  else if (nodeId === 'librarian' && status === 'done') job.status = 'delivered';
  log(job, nodeId, `${status}${opt.summary ? ': ' + opt.summary : ''}`);
  save(job);
} else if (cmd === 'log') {
  const [id, nodeId, ...msg] = pos; const job = load(id); log(job, nodeId, msg.join(' ')); save(job);
} else if (cmd === 'set') {
  const [id, ...kvs] = pos; const job = load(id);
  for (const kv of kvs) {
    const i = kv.indexOf('='); if (i < 0) die(`bad key=value ${kv}`);
    const k = kv.slice(0, i), raw = kv.slice(i + 1);
    let v; try { v = JSON.parse(raw); } catch { v = raw; }
    let o = job; const ks = k.split('.'); ks.slice(0, -1).forEach(p => { o = o[p] ??= {}; }); o[ks.at(-1)] = v;
  }
  save(job);
} else if (cmd === 'output') {
  const [id] = pos; const job = load(id);
  if (!opt.kind || !opt.path) die('output needs --kind --path');
  const abs = path.join(JOBS, id, opt.path); if (!fs.existsSync(abs)) die(`missing file ${opt.path}`);
  const item = { kind: opt.kind, path: opt.path, w: null, h: null, durationS: null };
  try {
    const p = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', abs], { encoding: 'utf8' }));
    item.w = p.streams?.[0]?.width ?? null; item.h = p.streams?.[0]?.height ?? null;
    const d = parseFloat(p.format?.duration); if (opt.kind === 'video' || opt.kind === 'gif') item.durationS = isNaN(d) ? null : +d.toFixed(2);
  } catch { /* captions and folders have no dimensions */ }
  job.outputs = job.outputs.filter(o => o.path !== opt.path).concat(item);
  log(job, 'director', `output ${opt.kind}: ${opt.path}`);
  save(job);
} else if (cmd === 'gate') {
  const [id, gate] = pos; const job = load(id);
  if (!['g1', 'g2'].includes(gate)) die('gate must be g1 or g2');
  const decision = opt.decision; if (!['pick', 'revise', 'approve', 'reject'].includes(decision)) die('bad --decision');
  const rec = { at: now(), decision, choice: opt.choice && opt.choice !== true ? String(opt.choice) : null, notes: opt.notes && opt.notes !== true ? String(opt.notes) : '', by: opt.by || 'chat' };
  job.gates[gate] = { ...job.gates[gate], ...rec };
  const gn = job.nodes.find(n => n.id === (gate === 'g1' ? 'gate1' : 'gate2'));
  if (decision === 'revise') { gn.status = 'idle'; job.status = gate === 'g1' ? 'concepts' : 'producing'; }
  else if (decision === 'reject') { gn.status = 'done'; gn.ended = now(); job.status = 'parked'; }
  else { gn.status = 'done'; gn.ended = now(); job.status = gate === 'g1' ? 'checking' : 'approved'; if (gate === 'g1' && rec.choice) job.chosen = rec.choice; }
  log(job, gn.id, `${decision}${rec.choice ? ' ' + rec.choice : ''}${rec.notes ? ': ' + rec.notes : ''}`);
  save(job);
  fs.mkdirSync(path.join(R, 'library'), { recursive: true });
  fs.appendFileSync(path.join(R, 'library', 'feedback.jsonl'), JSON.stringify({ job: id, gate, ...rec, client: job.client, format: job.format, engine: job.engine, style: job.style, topic: job.topic }) + '\n');
} else if (cmd === 'show') {
  const job = load(pos[0]);
  console.log(`${job.id}  [${job.status}]  ${job.format} for ${job.client}: ${job.topic}  engine=${job.engine ?? '-'} style=${job.style ?? '-'}`);
  for (const n of job.nodes) console.log(`  ${n.status.padEnd(8)} ${n.id.padEnd(11)} ${n.summary}`);
  console.log(`  gates: g1=${job.gates.g1.decision ?? '-'}${job.gates.g1.choice ? '(' + job.gates.g1.choice + ')' : ''} g2=${job.gates.g2.decision ?? '-'}  outputs=${job.outputs.length}  qa=${job.qa.pass}`);
} else if (cmd === 'list') {
  if (!fs.existsSync(JOBS)) process.exit(0);
  for (const id of fs.readdirSync(JOBS).filter(d => !d.startsWith('_') && fs.existsSync(path.join(JOBS, d, 'job.json'))).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(JOBS, id, 'job.json'), 'utf8'));
    console.log(`${j.status.padEnd(10)} ${id}`);
  }
} else {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 11).join('\n'));
}
