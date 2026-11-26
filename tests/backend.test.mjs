import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import core from './load-core.mjs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const students = core.parseCsv(read('./fixtures/students.csv'));
const supervisors = core.parseCsv(read('./fixtures/supervisors.csv'));

// ---- minimal in-memory Apps Script fakes ----
function fakeSheet() {
  let data = [];
  const grow = (r, c) => {
    while (data.length < r) data.push([]);
    for (let i = 0; i < r; i++) while (data[i].length < c) data[i].push('');
  };
  return {
    getMaxRows: () => 1000,
    getMaxColumns: () => 26,
    getLastRow: () => data.length,
    getRange(r, c, nr = 1, nc = 1) {
      return {
        setNumberFormat() { return this; },
        setValues(v) { grow(r - 1 + nr, c - 1 + nc); v.forEach((row, i) => row.forEach((x, j) => { data[r - 1 + i][c - 1 + j] = x; })); },
        getDisplayValues() { grow(r - 1 + nr, c - 1 + nc); return data.slice(r - 1, r - 1 + nr).map((row) => row.slice(c - 1, c - 1 + nc).map(String)); },
        clearContent() { data.splice(r - 1, nr); },
      };
    },
  };
}

function makeEnv() {
  const sheets = {}, props = {}, mails = [], logs = [];
  let now = Date.parse('2026-06-01T10:00:30Z');
  const ctx = vm.createContext({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({
      getSheetByName: (n) => sheets[n] || null,
      insertSheet: (n) => (sheets[n] = fakeSheet()),
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      computeHmacSha256Signature: (msg, key) => [...crypto.createHmac('sha256', key).update(msg).digest()].map((b) => (b > 127 ? b - 256 : b)),
    },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; }, getContent() { return this.t; } }) },
    MailApp: { sendEmail: (m) => mails.push(m) },
    Logger: { log: (m) => logs.push(m) },
    console,
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } },
  });
  vm.runInContext(read('../apps-script/Core.gs') + '\n' + read('../apps-script/Code.gs'), ctx);
  const call = (req) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(req) } }).getContent());
  return { ctx, call, mails, logs, props, sheets, setNow: (t) => { now = t; } };
}

function setupEnv() {
  const env = makeEnv();
  env.ctx.initSecrets();
  const adminKey = env.props.ADMIN_KEY;
  const res = env.call({ action: 'setup', adminKey, students, supervisors: supervisors.map(({ name, email, classroom, expected_students }) => ({ name, email, classroom, expected_students })) });
  return { ...env, adminKey, tokens: res.supervisors.map((s) => s.token), sups: res.supervisors, setupRes: res };
}

const roomOf = (id) => students.find((s) => s.id === id).assigned_classroom;
const supA = supervisors[0];
const otherRoom = students.find((s) => s.assigned_classroom !== supA.classroom);
const inA = students.filter((s) => s.assigned_classroom === supA.classroom);

test('doGet and initSecrets', () => {
  const env = makeEnv();
  assert.equal(env.ctx.doGet().t, 'TestRegister OK');
  env.ctx.initSecrets();
  const key = env.props.ADMIN_KEY;
  assert.ok(key.length >= 20 && env.props.SELF_SECRET);
  env.ctx.initSecrets();
  assert.equal(env.props.ADMIN_KEY, key);
  assert.ok(env.logs[0].includes(key));
});

test('setup returns long unique tokens; bad admin key rejected', () => {
  const e = setupEnv();
  assert.equal(e.sups.length, supervisors.length);
  assert.ok(e.tokens.every((t) => t.length >= 64));
  assert.equal(new Set(e.tokens).size, e.tokens.length);
  assert.equal(e.call({ action: 'listSupervisors', adminKey: 'nope' }).error, 'bad_admin_key');
  assert.equal(e.call({ action: 'listSupervisors', adminKey: e.adminKey }).supervisors.length, supervisors.length);
});

test('bad token, bad action, bad json', () => {
  const e = setupEnv();
  assert.equal(e.call({ action: 'session', token: 'x' }).error, 'bad_token');
  assert.equal(e.call({ action: 'constructor' }).error, 'bad_request');
  assert.equal(JSON.parse(e.ctx.doPost({ postData: { contents: '{' } }).getContent()).error, 'server_error');
});

test('session returns directory and co-supervisors', () => {
  const e = setupEnv();
  const r = e.call({ action: 'session', token: e.tokens[0] });
  assert.equal(r.supervisor.classroom, supA.classroom);
  assert.equal(Object.keys(r.directory).length, students.length);
  assert.deepEqual(r.directory[inA[0].id], [inA[0].name, supA.classroom]);
  assert.deepEqual(r.coSupervisors, [supervisors[1].name]);
});

test('register: ok / wrong_room / unknown / invalid / idempotent / duplicate', () => {
  const e = setupEnv();
  const items = [
    { id: inA[0].id, method: 'scan', client_ts: '2026-06-01T10:00:00Z', client_id: 'c1' },
    { id: otherRoom.id, method: 'manual', client_ts: '2026-06-01T10:00:01Z', client_id: 'c2' },
    { id: '999999999', method: 'scan', client_ts: '2026-06-01T10:00:02Z', client_id: 'c3' },
    { id: '123', method: 'scan', client_ts: '2026-06-01T10:00:03Z', client_id: 'c4' },
  ];
  const r = e.call({ action: 'register', token: e.tokens[0], items });
  assert.deepEqual(r.results.map((x) => x.status), ['ok', 'wrong_room', 'unknown', 'invalid']);
  assert.ok(r.results.every((x) => !x.duplicate));
  // same batch again: idempotent, nothing new written
  const r2 = e.call({ action: 'register', token: e.tokens[0], items });
  assert.deepEqual(r2.results.map((x) => x.status), ['ok', 'wrong_room', 'unknown', 'invalid']);
  assert.ok(r2.results.every((x) => !x.duplicate));
  assert.equal(e.call({ action: 'classroomStatus', token: e.tokens[0] }).registrations.length, 3);
  // new client_id, same id: duplicate with existing, nothing written
  const r3 = e.call({ action: 'register', token: e.tokens[0], items: [{ id: inA[0].id, method: 'manual', client_ts: 'x', client_id: 'c9' }] });
  assert.equal(r3.results[0].duplicate, true);
  assert.equal(r3.results[0].existing.client_id, 'c1');
  assert.equal(e.call({ action: 'classroomStatus', token: e.tokens[0] }).registrations.length, 3);
  const reg = e.call({ action: 'classroomStatus', token: e.tokens[0] }).registrations[0];
  assert.equal(reg.registered_by, supA.name);
  assert.equal(reg.registered_at, '2026-06-01T10:00:00Z');
  assert.equal(reg.id, inA[0].id);
});

test('co-supervisors share a classroom: duplicate across them', () => {
  const e = setupEnv();
  const mk = (cid) => [{ id: inA[1].id, method: 'scan', client_ts: 't', client_id: cid }];
  assert.equal(e.call({ action: 'register', token: e.tokens[0], items: mk('a') }).results[0].duplicate, false);
  assert.equal(e.call({ action: 'register', token: e.tokens[1], items: mk('b') }).results[0].duplicate, true);
  assert.equal(e.call({ action: 'classroomStatus', token: e.tokens[1] }).registrations.length, 1);
});

test('selfCode -> selfRegister ok; expired -> bad_code; wrong_room; no names', () => {
  const e = setupEnv();
  const { code, classroom, expires_in } = e.call({ action: 'selfCode', token: e.tokens[0] });
  assert.equal(classroom, supA.classroom);
  assert.equal(code.length, 10);
  assert.equal(expires_in, 30);
  const r = e.call({ action: 'selfRegister', classroom, code, id: inA[2].id });
  assert.deepEqual(r, { ok: true, status: 'ok', duplicate: false, assigned_classroom: '' });
  assert.equal(e.call({ action: 'selfRegister', classroom, code, id: inA[2].id }).duplicate, true);
  const w = e.call({ action: 'selfRegister', classroom, code, id: otherRoom.id });
  assert.equal(w.status, 'wrong_room');
  assert.equal(w.assigned_classroom, otherRoom.assigned_classroom);
  assert.ok(!JSON.stringify(w).includes(otherRoom.name));
  // previous bucket still accepted, two buckets back is not
  e.setNow(Date.parse('2026-06-01T10:01:10Z'));
  assert.equal(e.call({ action: 'selfRegister', classroom, code, id: inA[3].id }).ok, true);
  e.setNow(Date.parse('2026-06-01T10:02:10Z'));
  assert.equal(e.call({ action: 'selfRegister', classroom, code, id: inA[4].id }).error, 'bad_code');
  assert.equal(e.call({ action: 'selfRegister', classroom: 'nope', code, id: inA[4].id }).error, 'bad_code');
  const rows = e.call({ action: 'classroomStatus', token: e.tokens[0] }).registrations;
  assert.ok(rows.some((x) => x.method === 'self' && x.registered_by === 'autoregistro'));
});

test('dashboard counts and report statuses incl. absent', () => {
  const e = setupEnv();
  e.call({ action: 'register', token: e.tokens[0], items: [
    { id: inA[0].id, method: 'scan', client_ts: '2026-06-01T10:00:00Z', client_id: '1' },
    { id: otherRoom.id, method: 'scan', client_ts: '2026-06-01T10:00:01Z', client_id: '2' },
    { id: '999999999', method: 'manual', client_ts: '2026-06-01T10:00:02Z', client_id: '3' },
  ] });
  const d = e.call({ action: 'dashboard', adminKey: e.adminKey });
  assert.deepEqual(d.totals, { students: students.length, registered: 3, wrong_room: 1, unknown: 1, absent: students.length - 2 });
  const roomA = d.classrooms.find((c) => c.classroom === supA.classroom);
  assert.equal(roomA.registered, 3);
  assert.equal(roomA.wrong_room, 1);
  assert.deepEqual(roomA.supervisors, [supervisors[0].name, supervisors[1].name]);
  const rows = e.call({ action: 'report', adminKey: e.adminKey }).rows;
  const st = (id) => rows.find((r) => r.id === id).status;
  assert.equal(st(inA[0].id), 'ok');
  assert.equal(st(otherRoom.id), 'wrong_room');
  assert.equal(st('999999999'), 'unknown');
  assert.equal(st(inA[5].id), 'absent');
});

test('emailLinks sends one email per supervisor with the right link', () => {
  const e = setupEnv();
  const r = e.call({ action: 'emailLinks', adminKey: e.adminKey, baseUrl: 'https://x.example/app/' });
  assert.equal(r.sent, supervisors.length);
  assert.equal(e.mails.length, supervisors.length);
  e.sups.forEach((s, i) => {
    assert.equal(e.mails[i].to, s.email);
    assert.ok(e.mails[i].htmlBody.includes('https://x.example/app/supervisor.html?t=' + s.token));
    assert.ok(e.mails[i].subject.startsWith('Registro de asistencia'));
  });
  assert.equal(e.call({ action: 'emailLinks', adminKey: e.adminKey }).error, 'bad_request');
});

test('setup replaces data and clears registrations', () => {
  const e = setupEnv();
  e.call({ action: 'register', token: e.tokens[0], items: [{ id: inA[0].id, method: 'scan', client_ts: 't', client_id: '1' }] });
  const r = e.call({ action: 'setup', adminKey: e.adminKey, students, supervisors: [{ name: 'X', email: '', classroom: supA.classroom, expected_students: '5' }] });
  assert.equal(r.supervisors.length, 1);
  assert.equal(e.call({ action: 'report', adminKey: e.adminKey }).rows.filter((x) => x.status !== 'absent').length, 0);
  assert.equal(e.call({ action: 'session', token: e.tokens[0] }).error, 'bad_token');
});
