"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const subst_1 = require("./subst");
const lessons_1 = require("./lessons");
// synthetic page in the structure of the asc substitution viewer (codes and classes made up)
const ROW = (action, p, text) => `<div class="row ${action}"><div class="period"><span class="print-font-resizable">${p}</span></div><div class="info"><span class="print-font-resizable">${text}</span></div></div>`;
const SEC = (cls, rows) => `<div class="section print-nobreak"><div class="header"><span class="print-font-resizable">${cls}</span></div><div class="rows">${rows}</div></div>`;
const PAGE = `<div class="print-nobreak"><span class="print-font-resizable">Abwesende Lehrer: X</span></div>`
    + SEC('5a', ROW('change', '1', 'Mathe - (KM) ➔ SW'))
    + SEC('6b', ROW('change', '3', 'WAT - (RB) ➔ FB') + ROW('remove', '5 - 6', 'Sport - Entfall') + ROW('change', '2', 'Englisch - Raum 112'))
    + `<div style="text-align:center;font-size:12px"><a href="https://www.asctimetables.com">www.asctimetables.com</a></div>`;
(0, node_test_1.test)('subst: sections per class, rows with action, lessons (5–6) and plain text', () => {
    const c = (0, subst_1.parseSubstitutions)(PAGE);
    strict_1.default.deepEqual(c.map((x) => x.className), ['5a', '6b']);
    strict_1.default.deepEqual(c[1].rows[0], { action: 'change', lessons: '3', text: 'WAT - (RB) ➔ FB' });
    strict_1.default.equal(c[1].rows[1].lessons, '5–6');
    strict_1.default.deepEqual((0, subst_1.parseSubstitutions)('<html>login</html>'), []);
    strict_1.default.deepEqual((0, subst_1.parseSubstitutions)(''), []);
});
(0, node_test_1.test)('subst: teacher swap only from the arrow pattern, never guessed', () => {
    strict_1.default.deepEqual((0, subst_1.teacherSwap)('WAT - (RB) ➔ FB'), { from: 'RB', to: 'FB' });
    strict_1.default.deepEqual((0, subst_1.teacherSwap)('Mathe: RB → FB'), { from: 'RB', to: 'FB' });
    strict_1.default.deepEqual((0, subst_1.teacherSwap)('(Mü) -> (Sch)'), { from: 'Mü', to: 'Sch' });
    strict_1.default.equal((0, subst_1.teacherSwap)('Sport - Entfall'), null);
    strict_1.default.equal((0, subst_1.teacherSwap)('Englisch - Raum 112'), null);
});
(0, node_test_1.test)('subst: lesson ranges', () => {
    strict_1.default.ok((0, subst_1.coversLesson)('3', '3'));
    strict_1.default.ok((0, subst_1.coversLesson)('3. Std.', '3'));
    strict_1.default.ok((0, subst_1.coversLesson)('4–5', '5'));
    strict_1.default.ok((0, subst_1.coversLesson)('5', '4–5'));
    strict_1.default.ok(!(0, subst_1.coversLesson)('3', '4–5'));
    strict_1.default.ok(!(0, subst_1.coversLesson)('', '3'));
    strict_1.default.ok(!(0, subst_1.coversLesson)('3', ''));
    strict_1.default.deepEqual((0, subst_1.rowsForClass)((0, subst_1.parseSubstitutions)(PAGE), '6B').length, 3);
    strict_1.default.deepEqual((0, subst_1.rowsForClass)((0, subst_1.parseSubstitutions)(PAGE), '7c'), []);
});
const L = (periodLabel, subject, x = {}) => ({ date: '2026-11-16', period: periodLabel, periodLabel, periods: 1, start: '', end: '', subject,
    teacher: '', room: '', cancelled: false, changed: false, note: '', subjectId: '', topic: '', homework: [], ...x });
(0, node_test_1.test)('subst: note "Vertretung RB → FB" only on a changed lesson with a matching row; own notes and other lessons untouched', () => {
    const rows = (0, subst_1.rowsForClass)((0, subst_1.parseSubstitutions)(PAGE), '6b');
    const out = (0, lessons_1.applySubstitutions)([
        L('1', 'Mathe'), L('2', 'Englisch', { changed: true }), L('3', 'WAT', { changed: true }),
        L('4', 'Deutsch', { changed: true, note: 'Raum 5' }), L('5–6', 'Sport', { cancelled: true, note: 'fällt aus' }),
    ], rows);
    strict_1.default.deepEqual(out.map((l) => l.note), ['', '', 'Vertretung RB → FB', 'Raum 5', 'fällt aus']);
    strict_1.default.deepEqual(out[2].substitution, { from: 'RB', to: 'FB' });
    strict_1.default.equal(out[0].substitution, undefined);
    // an unchanged lesson never gets a note, even if a row matches (plan for another group)
    strict_1.default.equal((0, lessons_1.applySubstitutions)([L('3', 'WAT')], rows)[0].note, '');
    // no rows → lessons unchanged
    strict_1.default.deepEqual((0, lessons_1.applySubstitutions)([L('3', 'WAT', { changed: true })], []), [L('3', 'WAT', { changed: true })]);
});
//# sourceMappingURL=subst.test.js.map