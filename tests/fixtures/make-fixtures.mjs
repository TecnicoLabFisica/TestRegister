// Deterministic synthetic fixtures. No real data.
import { writeFileSync } from 'node:fs';
import c from '../load-core.mjs';

let seed = 2026;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const first = ['Ana', 'Luis', 'Maria', 'Jose', 'Carla', 'Pedro', 'Sofia', 'Diego', 'Lucia', 'Mateo'];
const last = ['Testsson', 'Ejemplo', 'Prueba', 'Falso', 'Sintetico', 'Demo', 'Muestra', 'Ficticio'];
const rooms = [['E26/P5/Auditorio 2', 40], ['E14/P6/E003', 20], ['E14/P6/E004', 20], ['E14/P6/E005', 20], ['E14/P6/E006', 20]];

const students = [];
let n = 0;
for (const [room, count] of rooms) {
  for (let i = 0; i < count; i++, n++) {
    const name = `${pick(first)} ${pick(last)} ${n + 1}`;
    students.push({
      id: String(202600000 + n * 7 + 1), name, email: `est${n + 1}@example.edu`,
      assignment: 'Fisica General', class: 'FIS' + (1 + (n % 3)), faculty: 'Ciencias',
      career: pick(['Fisica', 'Matematica', 'Ingenieria']), assigned_classroom: room,
    });
  }
}
const supervisors = rooms.flatMap(([room, count], i) =>
  i === 0
    ? [1, 2].map((k) => ({ name: `Supervisor Demo A${k}`, email: `supa${k}@example.edu`, classroom: room, expected_students: count }))
    : [{ name: `Supervisor Demo ${i}`, email: `sup${i}@example.edu`, classroom: room, expected_students: count }]);

const dir = new URL('./', import.meta.url);
writeFileSync(new URL('students.csv', dir), c.toCsv(students, ['id', 'name', 'email', 'assignment', 'class', 'faculty', 'career', 'assigned_classroom']));
writeFileSync(new URL('supervisors.csv', dir), c.toCsv(supervisors, ['name', 'email', 'classroom', 'expected_students']));
