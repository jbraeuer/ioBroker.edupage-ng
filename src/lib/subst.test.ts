import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSubstitutions, teacherSwap, coversLesson, rowsForClass } from './subst';
import { applySubstitutions, type Lesson } from './lessons';

// synthetic page in the structure of the asc substitution viewer (codes and classes made up)
const ROW = (action: string, p: string, text: string): string =>
    `<div class="row ${action}"><div class="period"><span class="print-font-resizable">${p}</span></div><div class="info"><span class="print-font-resizable">${text}</span></div></div>`;
const SEC = (cls: string, rows: string): string =>
    `<div class="section print-nobreak"><div class="header"><span class="print-font-resizable">${cls}</span></div><div class="rows">${rows}</div></div>`;
const PAGE = `<div class="print-nobreak"><span class="print-font-resizable">Abwesende Lehrer: X</span></div>`
    + SEC('5a', ROW('change', '1', 'Mathe - (KM) ➔ SW'))
    + SEC('6b', ROW('change', '3', 'WAT - (RB) ➔ FB') + ROW('remove', '5 - 6', 'Sport - Entfall') + ROW('change', '2', 'Englisch - Raum 112'))
    + `<div style="text-align:center;font-size:12px"><a href="https://www.asctimetables.com">www.asctimetables.com</a></div>`;

test('subst: sections per class, rows with action, lessons (5–6) and plain text', () => {
    const c = parseSubstitutions(PAGE);
    assert.deepEqual(c.map((x) => x.className), ['5a', '6b']);
    assert.deepEqual(c[1].rows[0], { action: 'change', lessons: '3', text: 'WAT - (RB) ➔ FB' });
    assert.equal(c[1].rows[1].lessons, '5–6');
    assert.deepEqual(parseSubstitutions('<html>login</html>'), []);
    assert.deepEqual(parseSubstitutions(''), []);
});

test('subst: teacher swap only from the arrow pattern, never guessed', () => {
    assert.deepEqual(teacherSwap('WAT - (RB) ➔ FB'), { from: 'RB', to: 'FB' });
    assert.deepEqual(teacherSwap('Mathe: RB → FB'), { from: 'RB', to: 'FB' });
    assert.deepEqual(teacherSwap('(Mü) -> (Sch)'), { from: 'Mü', to: 'Sch' });
    assert.equal(teacherSwap('Sport - Entfall'), null);
    assert.equal(teacherSwap('Englisch - Raum 112'), null);
});

test('subst: lesson ranges', () => {
    assert.ok(coversLesson('3', '3'));
    assert.ok(coversLesson('3. Std.', '3'));
    assert.ok(coversLesson('4–5', '5'));
    assert.ok(coversLesson('5', '4–5'));
    assert.ok(!coversLesson('3', '4–5'));
    assert.ok(!coversLesson('', '3'));
    assert.ok(!coversLesson('3', ''));
    assert.deepEqual(rowsForClass(parseSubstitutions(PAGE), '6B').length, 3);
    assert.deepEqual(rowsForClass(parseSubstitutions(PAGE), '7c'), []);
});

const L = (periodLabel: string, subject: string, x: Partial<Lesson> = {}): Lesson => ({ date: '2026-11-16', period: periodLabel, periodLabel, periods: 1, start: '', end: '', subject,
    teacher: '', room: '', cancelled: false, changed: false, note: '', subjectId: '', topic: '', homework: [], ...x });

test('subst: note "Vertretung RB → FB" only on a changed lesson with a matching row; own notes and other lessons untouched', () => {
    const rows = rowsForClass(parseSubstitutions(PAGE), '6b');
    const out = applySubstitutions([
        L('1', 'Mathe'), L('2', 'Englisch', { changed: true }), L('3', 'WAT', { changed: true }),
        L('4', 'Deutsch', { changed: true, note: 'Raum 5' }), L('5–6', 'Sport', { cancelled: true, note: 'fällt aus' }),
    ], rows);
    assert.deepEqual(out.map((l) => l.note), ['', '', 'Vertretung RB → FB', 'Raum 5', 'fällt aus']);
    assert.deepEqual(out[2].substitution, { from: 'RB', to: 'FB' });
    assert.equal(out[0].substitution, undefined);
    // an unchanged lesson never gets a note, even if a row matches (plan for another group)
    assert.equal(applySubstitutions([L('3', 'WAT')], rows)[0].note, '');
    // no rows → lessons unchanged
    assert.deepEqual(applySubstitutions([L('3', 'WAT', { changed: true })], []), [L('3', 'WAT', { changed: true })]);
});
