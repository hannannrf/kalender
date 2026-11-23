// NFR-05 / AC-05.8 gate: the 80-message Detection Test Set scored exactly as fixtures/detection/evaluate.py does.
// The test set and thresholds are never edited to make this pass (AGENTS.md section 6); fix the rules instead.
// It also writes detector_output.csv, which CI scores again with evaluate.py as a parity check.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pktToUtc } from '../../shared/time';
import { detect } from './detect';

const FIXTURES = join(__dirname, '../../../test/fixtures/detection');
const OUT_DIR = join(__dirname, '../../../test/out');
const SENT_AT = pktToUtc(2026, 10, 19, 10, 0); // Monday 19 Oct 2026 10:00 PKT (PRD Appendix A)

const THRESHOLDS = { recall: 0.9, interpretation: 0.9, ambiguousDetected: 0.9, flagged: 1, maxFalse: 4, maxPast: 0 };
const PAST = new Set(['N01', 'N04', 'N05', 'N07', 'N11', 'N15', 'N16', 'N20']);

type Row = Record<string, string>;

/** Minimal RFC 4180 reader: commas, quoted fields, doubled quotes. */
function readCsv(text: string): Row[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.some(Boolean));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

const marks = (s: string) => new Set(s.split(';').filter(Boolean));

function run() {
  const truth = readCsv(readFileSync(join(FIXTURES, 'detection_test_set.csv'), 'utf-8'));
  const out = new Map<string, Row>();
  for (const t of truth) {
    const drafts = detect(t.message, SENT_AT);
    const d = drafts.find((x) => x.date === t.date) ?? drafts[0];
    out.set(t.id, {
      id: t.id,
      detected: d ? 'Y' : 'N',
      needs_date: d && d.date === null ? 'Y' : 'N',
      date: d?.date ?? '',
      time: d ? (d.time ?? (d.date ? 'ALLDAY' : '')) : '',
      uncertain: d ? d.uncertain.join(';') : '',
    });
  }
  return { truth, out };
}

function score(truth: Row[], out: Map<string, Row>) {
  const det = (id: string) => out.get(id)?.detected === 'Y';
  const ids = (pred: (r: Row) => boolean) => truth.filter(pred).map((r) => r.id);
  const byId = new Map(truth.map((r) => [r.id, r]));
  const report: { metric: string; result: string; target: string; pass: boolean; failing: string[] }[] = [];

  for (const g of ['E-EN', 'E-RU']) {
    const all = ids((r) => r.group === g);
    const hit = all.filter(det);
    report.push({ metric: `M1 recall ${g}`, result: `${hit.length}/${all.length}`, target: '>= 90%', pass: hit.length / all.length >= THRESHOLDS.recall, failing: all.filter((i) => !hit.includes(i)) });
  }
  const clear = ids((r) => (r.group === 'E-EN' || r.group === 'E-RU') && det(r.id));
  const right = clear.filter((i) => out.get(i)!.date === byId.get(i)!.date && out.get(i)!.time === byId.get(i)!.time);
  report.push({ metric: 'M2 correct date + time', result: `${right.length}/${clear.length}`, target: '>= 90%', pass: clear.length > 0 && right.length / clear.length >= THRESHOLDS.interpretation, failing: clear.filter((i) => !right.includes(i)) });

  const amb = ids((r) => r.group === 'A');
  const ambHit = amb.filter(det);
  report.push({ metric: 'M3 ambiguous detected', result: `${ambHit.length}/${amb.length}`, target: '>= 90%', pass: ambHit.length / amb.length >= THRESHOLDS.ambiguousDetected, failing: amb.filter((i) => !ambHit.includes(i)) });
  const flagged = ambHit.filter((i) => {
    const t = byId.get(i)!;
    const o = out.get(i)!;
    if (t.needs_date === 'Y' && o.needs_date !== 'Y') return false;
    const got = marks(o.uncertain);
    return [...marks(t.uncertain)].every((m) => got.has(m));
  });
  report.push({ metric: 'M3 uncertainty flagged', result: `${flagged.length}/${ambHit.length}`, target: '100%', pass: ambHit.length > 0 && flagged.length / ambHit.length >= THRESHOLDS.flagged, failing: ambHit.filter((i) => !flagged.includes(i)) });

  const fp = ids((r) => r.group === 'N').filter(det);
  report.push({ metric: 'M4 false suggestions', result: `${fp.length}/20`, target: '<= 4', pass: fp.length <= THRESHOLDS.maxFalse, failing: fp });
  const past = fp.filter((i) => PAST.has(i));
  report.push({ metric: 'M4 past-reference detected', result: `${past.length}/${PAST.size}`, target: '0', pass: past.length <= THRESHOLDS.maxPast, failing: past });
  return report;
}

describe('NFR-05 detection gate (AC-05.8)', () => {
  const { truth, out } = run();
  const report = score(truth, out);

  it('writes detector_output.csv for the evaluate.py parity check', () => {
    mkdirSync(OUT_DIR, { recursive: true });
    const cols = ['id', 'detected', 'needs_date', 'date', 'time', 'uncertain'];
    writeFileSync(join(OUT_DIR, 'detector_output.csv'), [cols.join(','), ...[...out.values()].map((r) => cols.map((c) => r[c]).join(','))].join('\n') + '\n');
    console.log(report.map((r) => `${r.metric.padEnd(28)} ${r.result.padEnd(8)} ${r.target.padEnd(7)} ${r.pass ? 'PASS' : 'FAIL'} ${r.failing.join(', ')}`).join('\n'));
  });

  it.each(report.map((r) => [r.metric, r] as const))('%s meets its threshold', (_name, r) => {
    expect(r.pass, `${r.metric}: ${r.result}, failing ${r.failing.join(', ')}`).toBe(true);
  });

  it('gets every one of the 80 messages right (stricter than NFR-05, to see regressions early)', () => {
    const wrong = truth.filter((t) => {
      const o = out.get(t.id)!;
      if (t.event === 'N') return o.detected === 'Y';
      if (o.detected !== 'Y') return true;
      if (t.needs_date === 'Y') return o.needs_date !== 'Y' || ![...marks(t.uncertain)].every((m) => marks(o.uncertain).has(m));
      return o.date !== t.date || o.time !== t.time || ![...marks(t.uncertain)].every((m) => marks(o.uncertain).has(m));
    });
    expect(wrong.map((t) => `${t.id}: ${JSON.stringify(out.get(t.id))}`)).toEqual([]);
  });
});
