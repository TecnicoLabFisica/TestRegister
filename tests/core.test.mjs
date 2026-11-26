import test from 'node:test';
import assert from 'node:assert/strict';
import c from './load-core.mjs';

const BOM = '﻿';
const SCOLS = 'id,name,email,assignment,class,faculty,career,assigned_classroom';
const PCOLS = 'name,email,classroom,expected_students';
const stu = (id, room = 'A', extra = {}) => ({
  id, name: 'N' + id, email: id + '@example.edu', assignment: 'x', class: 'c',
  faculty: 'f', career: 'k', assigned_classroom: room, ...extra,
});
const sup = (name, classroom, n, email) => ({
  name, email: email || name + '@example.edu', classroom, expected_students: String(n),
});

test('parseCsv: BOM, CRLF, quotes, newlines in quotes, trailing blanks, header trim', () => {
  const text = BOM + ' a , b\r\n1,"x, y"\r\n"he said ""hi""","l1\nl2"\r\n\r\n';
  assert.deepEqual(c.parseCsv(text), [
    { a: '1', b: 'x, y' },
    { a: 'he said "hi"', b: 'l1\nl2' },
  ]);
  assert.deepEqual(c.parseCsv('a,b\n1,2'), [{ a: '1', b: '2' }]);
  assert.deepEqual(c.parseCsv(''), []);
});

test('toCsv: BOM, CRLF, quoting, round trip', () => {
  const rows = [{ a: 'x,y', b: 'q"t' }, { a: 'l1\nl2', b: 'ñ' }];
  const out = c.toCsv(rows, ['a', 'b']);
  assert.ok(out.startsWith(BOM + 'a,b\r\n'));
  assert.ok(out.includes('"x,y","q""t"\r\n'));
  assert.deepEqual(c.parseCsv(out), rows);
  assert.equal(c.toCsv([{ a: undefined }], ['a']), BOM + 'a\r\n\r\n');
});

test('extractId', () => {
  assert.equal(c.extractId('202612345'), '202612345');
  assert.equal(c.extractId(' 202612345\n'), '202612345');
  assert.equal(c.extractId('https://x.example/card?id=202612345&z=1'), '202612345');
  assert.equal(c.extractId('2026123456'), null);
  assert.equal(c.extractId('20261234'), null);
  assert.equal(c.extractId('12345678 202612345'), '202612345');
  assert.equal(c.extractId(''), null);
});

test('validateInputs: valid input builds classrooms', () => {
  const s = [stu('202600001', 'A'), stu('202600002', 'A'), stu('202600003', 'B')];
  const p = [sup('P1', 'A', 2), sup('P2', 'B', 1)];
  const r = c.validateInputs(s, p);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.classrooms, [
    { classroom: 'A', students: 2, expected: 2, supervisors: ['P1'] },
    { classroom: 'B', students: 1, expected: 1, supervisors: ['P2'] },
  ]);
});

test('validateInputs: errors', () => {
  let r = c.validateInputs([{ id: '1' }], [{ name: 'a' }]);
  assert.ok(r.errors.some((e) => /students.*missing.*name/i.test(e)));
  assert.ok(r.errors.some((e) => /supervisors.*missing.*email/i.test(e)));

  r = c.validateInputs(
    [stu('12345'), stu('202600001'), stu('202600001'), stu('202600002', '')],
    [sup('P1', 'ZZ', 1), sup('P2', 'A', 'x'), sup('P3', 'A', '-1')]);
  const all = r.errors.join('\n');
  assert.match(all, /12345/);
  assert.match(all, /duplicate.*202600001/i);
  assert.match(all, /empty assigned_classroom/i);
  assert.match(all, /ZZ/);
  assert.equal(r.errors.filter((e) => /expected_students/.test(e)).length, 2);
});

test('validateInputs: warnings', () => {
  const s = [stu('202600001', 'A'), stu('202600002', 'A'), stu('202600003', 'B')];
  let r = c.validateInputs(s, [sup('P1', 'A', 5, 'same@example.edu'), sup('P2', 'A', 5, 'same@example.edu')]);
  assert.ok(r.warnings.some((w) => /B.*no supervisor/i.test(w)));
  assert.ok(r.warnings.some((w) => /same@example.edu/.test(w)));
  assert.ok(r.warnings.some((w) => /A.*expected/i.test(w)));

  // co-supervisors: each lists full count, or a share summing to the count: no warning
  const full = c.validateInputs(s.slice(0, 2), [sup('P1', 'A', 2), sup('P2', 'A', 2)]);
  const share = c.validateInputs(s.slice(0, 2), [sup('P1', 'A', 1), sup('P2', 'A', 1)]);
  assert.deepEqual(full.warnings, []);
  assert.deepEqual(share.warnings, []);
  assert.equal(full.classrooms[0].supervisors.length, 2);
});

test('buildDirectory', () => {
  assert.deepEqual(c.buildDirectory([stu('202600001', 'A')]), { 202600001: ['N202600001', 'A'] });
});

test('decideRegistration', () => {
  const dir = c.buildDirectory([stu('202600001', 'A')]);
  const ok = c.decideRegistration('202600001', 'A', dir, {});
  assert.equal(ok.status, 'ok');
  assert.equal(ok.duplicate, false);
  assert.equal(ok.name, 'N202600001');
  const wr = c.decideRegistration('202600001', 'B', dir, {});
  assert.equal(wr.status, 'wrong_room');
  assert.equal(wr.assigned_classroom, 'A');
  const un = c.decideRegistration('999999999', 'A', dir, {});
  assert.equal(un.status, 'unknown');
  assert.equal(un.duplicate, false);
  const prev = { id: '202600001', status: 'ok' };
  const dup = c.decideRegistration('202600001', 'B', dir, { 202600001: prev });
  assert.equal(dup.duplicate, true);
  assert.deepEqual(dup.existing, prev);
  assert.equal(dup.status, 'wrong_room');
});

test('buildReport', () => {
  const s = [stu('202600001', 'A'), stu('202600002', 'A')];
  const regs = [
    { id: '202600001', classroom: 'B', registered_at: '2026-01-01T10:05:00Z', registered_by: 'P2', method: 'manual', status: 'wrong_room' },
    { id: '202600001', classroom: 'A', registered_at: '2026-01-01T10:00:00Z', registered_by: 'P1', method: 'scan', status: 'ok' },
    { id: '999999999', classroom: 'A', registered_at: '2026-01-01T10:01:00Z', registered_by: 'P1', method: 'scan', status: 'unknown' },
  ];
  const rows = c.buildReport(s, regs);
  assert.deepEqual(c.REPORT_COLUMNS, ['id', 'name', 'email', 'class', 'career', 'assigned_classroom',
    'registered_classroom', 'registered_at', 'registered_by', 'method', 'status']);
  assert.equal(rows.length, 3);
  assert.equal(rows[0].status, 'ok'); // earliest wins
  assert.equal(rows[0].registered_classroom, 'A');
  assert.equal(rows[0].registered_by, 'P1');
  assert.equal(rows[1].status, 'absent');
  assert.equal(rows[1].registered_at, '');
  assert.equal(rows[2].id, '999999999');
  assert.equal(rows[2].status, 'unknown');
  assert.equal(rows[2].name, '');
});

test('selfCodeBucket', () => {
  assert.equal(c.selfCodeBucket(119999), 1);
  assert.equal(c.selfCodeBucket(120000), 2);
});
