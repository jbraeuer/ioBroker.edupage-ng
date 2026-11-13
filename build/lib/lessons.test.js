"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const lessons_1 = require("./lessons");
const l = (date) => ({ date, period: '1', start: '08:00', end: '08:45', subject: 'M', teacher: '', room: '', cancelled: false, changed: false, note: '', subjectId: '11', topic: '', homework: [] });
(0, node_test_1.test)('next school day: skips the weekend and days without lessons', () => {
    // Friday 2026-11-13 → Monday 2026-11-16
    strict_1.default.equal((0, lessons_1.nextSchoolDay)([l('2026-11-13'), l('2026-11-16'), l('2026-11-17')], '2026-11-13'), '2026-11-16');
    // holiday on Monday: no lessons that day → Tuesday
    strict_1.default.equal((0, lessons_1.nextSchoolDay)([l('2026-11-13'), l('2026-11-17')], '2026-11-13'), '2026-11-17');
    // called on Saturday (no lessons today) → Monday
    strict_1.default.equal((0, lessons_1.nextSchoolDay)([l('2026-11-16')], '2026-11-14'), '2026-11-16');
    // nothing in range (long holidays) → ''
    strict_1.default.equal((0, lessons_1.nextSchoolDay)([l('2026-11-13')], '2026-11-13'), '');
});
(0, node_test_1.test)('next school day: a day where every lesson is cancelled still counts (the panel shows "fällt aus")', () => {
    strict_1.default.equal((0, lessons_1.nextSchoolDay)([{ ...l('2026-11-16'), cancelled: true }], '2026-11-13'), '2026-11-16');
});
(0, node_test_1.test)('day label: "Morgen" for the next day, else the weekday; DST change in between is fine', () => {
    strict_1.default.equal((0, lessons_1.dayLabel)('2026-11-17', '2026-11-16'), 'Morgen');
    strict_1.default.equal((0, lessons_1.dayLabel)('2026-11-16', '2026-11-13'), 'Montag');
    strict_1.default.equal((0, lessons_1.dayLabel)('2026-03-30', '2026-03-27'), 'Montag'); // over the DST switch (29.03.)
    strict_1.default.equal((0, lessons_1.dayLabel)('2026-10-26', '2026-10-25'), 'Morgen'); // DST end
    strict_1.default.equal((0, lessons_1.dayLabel)('', '2026-11-13'), '');
});
const plus45 = (t) => { const [h, m] = t.split(':').map(Number); const x = h * 60 + m + 45; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
const at = (date, start, subjectId, extra = {}) => ({ ...l(date), start, end: plus45(start), subjectId, ...extra });
const reg = (date, start, subjectId, topic, homeworkIds = []) => ({ date, start, period: '', subjectId, topic, homeworkIds });
const hw = (id, subjectId, given, due, title = 'Aufgabe ' + id) => ({ id, subjectId, title, details: '', given, due });
const HOME = { dbi: { subjects: { '11': { name: 'Mathematik' }, '12': { name: 'Englisch' } } } };
(0, node_test_1.test)('enrich: topic from the register by date + subject + start; the timetable stays the source of truth', () => {
    const lessons = [at('2026-11-13', '08:00', '11'), at('2026-11-13', '08:50', '12', { cancelled: true, note: 'fällt aus' }), at('2026-11-13', '09:55', '11')];
    const out = (0, lessons_1.enrich)(lessons, [reg('2026-11-13', '08:00', '11', 'Brüche'), reg('2026-11-13', '08:50', '12', 'Vokabeln'), reg('2026-11-13', '09:55', '11', '')], []);
    strict_1.default.deepEqual(out.map((x) => x.topic), ['Brüche', 'Vokabeln', '']);
    strict_1.default.equal(out[1].cancelled, true, 'register never un-cancels a lesson');
    strict_1.default.equal(out[1].note, 'fällt aus');
});
(0, node_test_1.test)('enrich: no register entry or an empty register → topic stays empty, nothing breaks', () => {
    strict_1.default.deepEqual((0, lessons_1.enrich)([at('2026-11-13', '08:00', '11')], [], []).map((x) => x.topic), ['']);
    strict_1.default.deepEqual((0, lessons_1.enrich)([at('2026-11-13', '08:00', '11')], [reg('2026-11-12', '08:00', '11', 'x')], []).map((x) => x.topic), ['']);
});
(0, node_test_1.test)('enrich: homework given in a lesson, by register link or by date + subject, attached once', () => {
    const lessons = [at('2026-11-13', '08:00', '11'), at('2026-11-13', '09:55', '11'), at('2026-11-13', '08:50', '12')];
    const out = (0, lessons_1.enrich)(lessons, [reg('2026-11-13', '08:50', '12', '', ['h2'])], [hw('h1', '11', '2026-11-13', '2026-11-18'), hw('h2', '12', '2026-11-10', '2026-11-16'), hw('h3', '11', '2026-11-12', '2026-11-13')]);
    strict_1.default.deepEqual(out.map((x) => x.homework), [['Aufgabe h1'], [], ['Aufgabe h2']]);
});
(0, node_test_1.test)('homework due / given on a date, with the subject name', () => {
    const list = [hw('h1', '11', '2026-11-13', '2026-11-16'), hw('h2', '12', '2026-11-12', '2026-11-16'), hw('h3', '11', '2026-11-13', '2026-11-20')];
    strict_1.default.deepEqual((0, lessons_1.homeworkDue)(list, '2026-11-16', HOME).map((x) => [x.subject, x.title]), [['Mathematik', 'Aufgabe h1'], ['Englisch', 'Aufgabe h2']]);
    strict_1.default.deepEqual((0, lessons_1.homeworkGiven)(list, '2026-11-13', HOME).map((x) => x.title), ['Aufgabe h1', 'Aufgabe h3']);
    strict_1.default.deepEqual((0, lessons_1.homeworkDue)(list, '', HOME), []);
});
(0, node_test_1.test)('enrich: double lesson (one timetable entry, two register entries) gets both topics', () => {
    const dbl = at('2026-11-13', '10:20', '11', { end: '12:10' });
    const out = (0, lessons_1.enrich)([dbl, at('2026-11-13', '12:15', '12', { end: '13:00' })], [
        reg('2026-11-13', '10:20', '11', 'Teil 1'), reg('2026-11-13', '11:25', '11', 'Teil 2'), reg('2026-11-13', '12:15', '12', 'Anderes'),
    ], []);
    strict_1.default.deepEqual(out.map((x) => x.topic), ['Teil 1 / Teil 2', 'Anderes']);
    // same topic in both periods → shown once
    strict_1.default.equal((0, lessons_1.enrich)([dbl], [reg('2026-11-13', '10:20', '11', 'Gleich'), reg('2026-11-13', '11:25', '11', 'Gleich')], [])[0].topic, 'Gleich');
});
(0, node_test_1.test)('open homework: due today or later, soonest first, past ones dropped', () => {
    const list = [hw('late', '11', '2026-11-12', '2026-11-20'), hw('past', '12', '2026-11-05', '2026-11-10'), hw('today', '12', '2026-11-11', '2026-11-13'), hw('soon', '11', '2026-11-13', '2026-11-18')];
    strict_1.default.deepEqual((0, lessons_1.openHomework)(list, '2026-11-13', HOME).map((x) => [x.title, x.subject, x.due]), [
        ['Aufgabe today', 'Englisch', '2026-11-13'], ['Aufgabe soon', 'Mathematik', '2026-11-18'], ['Aufgabe late', 'Mathematik', '2026-11-20'],
    ]);
    strict_1.default.deepEqual((0, lessons_1.openHomework)([], '2026-11-13', HOME), []);
});
//# sourceMappingURL=lessons.test.js.map