#!/usr/bin/env node
// Studio guard (PreToolUse). Keeps the bot from posting anything and from writing into
// the engines, the house rules, or client source data. Read access is never blocked.
// Works from any clone: the repo root is two folders up from this file.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Top-level folders the bot may write in.
const WRITABLE_IN_ROOT = ['studio', 'kits', 'library', 'jobs', 'radar', '.claude'];
// Read-only source (with the narrow exceptions in checkPath).
const READ_ONLY = /(^|[\s/"'])(engines\/(films|stills|motion)|playbook|assets|clients\.(json|csv|jsonl)|assets_manifest\.csv)(\/|$)/;

let raw = '';
process.stdin.on('data', c => (raw += c));
process.stdin.on('end', () => {
  let ev = {};
  try { ev = JSON.parse(raw || '{}'); } catch { process.exit(0); }
  const tool = ev.tool_name || '';
  const input = ev.tool_input || {};
  const reason = check(tool, input, ev.cwd || R);
  if (reason) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: `Studio guard: ${reason}` },
    }));
  }
  process.exit(0);
});

function check(tool, input, cwd) {
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) {
    const p = input.file_path || input.notebook_path;
    if (!p) return null;
    return checkPath(path.resolve(cwd, p));
  }
  if (tool === 'Bash') {
    const c = String(input.command || '');
    if (/ig_publish|media_publish|content_publishing_limit|\/publish\b.*graph\.(facebook|instagram)\.com|graph\.(facebook|instagram)\.com[^\s'"]*\/media\b.*-X\s*POST|-X\s*POST[^|;&]*graph\.(facebook|instagram)\.com[^\s'"]*\/media\b/i.test(c))
      return 'Studio never publishes or uploads to Instagram/Facebook. Delivery stops at the approved files.';
    const destructive = /(^|[;&|]\s*)(rm|mv|truncate|shred)\s[^;&|]*/g;
    for (const m of c.matchAll(destructive)) if (READ_ONLY.test(m[0]) && !/\bjobs\//.test(m[0]))
      return `refusing "${m[0].trim().slice(0, 80)}": that path is read-only (engines, playbook, client data, client images).`;
    const redirect = /(>>?|\btee\b)\s*["']?([^\s"';&|]+)/g;
    for (const m of c.matchAll(redirect)) if (READ_ONLY.test(m[2]) && !/profile\.md$/.test(m[2]))
      return 'refusing to write into read-only source (engines, playbook, client data).';
    return null;
  }
  return null;
}

function checkPath(abs) {
  if (!(abs === R || abs.startsWith(R + path.sep))) return null; // outside the repo: not our business
  // private/ holds the client data that kits/, assets/, library/, jobs/ … link to: judge it as the linked path.
  const rel = path.relative(R, abs).split(path.sep).join('/').replace(/^private\/(evals\/|desk\/fixtures)/, 'studio/$1').replace(/^private\//, '');
  const top = rel.split('/')[0];
  // Exception: a hand-written standing brief per client.
  if (/^assets\/[a-z0-9_-]+\/profile\.md$/.test(rel)) return null;
  // Footage reels write their renders and intake inside the face-reels engine.
  if (/^engines\/face-reels\/(inbox|clients\/[^/]+\/reels)(\/|$)/.test(rel)) return null;
  if (WRITABLE_IN_ROOT.includes(top)) return null;
  if (top === 'engines') return 'engines/ is read-only (Studio Films, Stills, Motion, Face Reels). Copy what you need into jobs/<id>/project/ (studio/engines/bin/shadow.sh does it for stills/motion).';
  if (top === 'playbook') return 'playbook/ holds the house rules and is changed by a person, not the bot. Propose the edit in library/lessons-pending.md.';
  if (top === 'assets' || /^clients\.|^assets_manifest/.test(rel)) return 'client source data (assets/, clients.*) is read-only. Use kits/<slug>/ for anything derived; assets/<slug>/profile.md is the one writable file.';
  return `Studio only writes in ${WRITABLE_IN_ROOT.join(', ')} (blocked: ${rel}).`;
}
