import { test } from 'node:test';
import assert from 'node:assert/strict';
import { afterSchoolDay, dayLabel, enrich, periodLabel, toLessons, homeworkDue, homeworkGiven, nextSchoolDay, openHomework, type Lesson } from './lessons';
import type { ClassbookLesson, Homework } from './edupage';

const l = (date: string): Lesson => ({ date, period: '1', periodLabel: '1', periods: 1, start: '08:00', end: '08:45', subject: 'M', teacher: '', room: '', cancelled: false, changed: false, note: '', subjectId: '11', topic: '', homework: [] });

test('next school day: skips the weekend and days without lessons', () => {
    // Friday 2026-11-13 → Monday 2026-11-16
    assert.equal(nextSchoolDay([l('2026-11-13'), l('2026-11-16'), l('2026-11-17')], '2026-11-13'), '2026-11-16');
    // holiday on Monday: no lessons that day → Tuesday
    assert.equal(nextSchoolDay([l('2026-11-13'), l('2026-11-17')], '2026-11-13'), '2026-11-17');
    // called on Saturday (no lessons today) → Monday
    assert.equal(nextSchoolDay([l('2026-11-16')], '2026-11-14'), '2026-11-16');
    // nothing in range (long holidays) → ''
    assert.equal(nextSchoolDay([l('2026-11-13')], '2026-11-13'), '');
});

test('next school day: a day where every lesson is cancelled still counts (the panel shows "fällt aus")', () => {
    assert.equal(nextSchoolDay([{ ...l('2026-11-16'), cancelled: true }], '2026-11-13'), '2026-11-16');
});

test('after school day: the school day after next (Sat → Mon + Tue), skips weekends and empty days', () => {
    // called on Saturday 2026-11-14: next = Monday 16th, after = Tuesday 17th
    assert.equal(afterSchoolDay([l('2026-11-16'), l('2026-11-17')], '2026-11-16'), '2026-11-17');
    // Tuesday is a holiday (no lessons) → Wednesday
    assert.equal(afterSchoolDay([l('2026-11-16'), l('2026-11-18')], '2026-11-16'), '2026-11-18');
    // Friday → Monday → Tuesday, across the weekend
    assert.equal(afterSchoolDay([l('2026-11-13'), l('2026-11-16'), l('2026-11-17')], '2026-11-16'), '2026-11-17');
    // no day after next in the range → ''
    assert.equal(afterSchoolDay([l('2026-11-16')], '2026-11-16'), '');
    // no next school day at all → '' (must not fall back to the first lesson day)
    assert.equal(afterSchoolDay([l('2026-11-16'), l('2026-11-17')], ''), '');
});

test('day label: "Morgen" for the next day, else the weekday; DST change in between is fine', () => {
    assert.equal(dayLabel('2026-11-17', '2026-11-16'), 'Morgen');
    assert.equal(dayLabel('2026-11-16', '2026-11-13'), 'Montag');
    assert.equal(dayLabel('2026-03-30', '2026-03-27'), 'Montag');   // over the DST switch (29.03.)
    assert.equal(dayLabel('2026-10-26', '2026-10-25'), 'Morgen');   // DST end
    assert.equal(dayLabel('', '2026-11-13'), '');
});

const plus45 = (t: string): string => { const [h, m] = t.split(':').map(Number); const x = h * 60 + m + 45; return `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`; };
const at = (date: string, start: string, subjectId: string, extra: Partial<Lesson> = {}): Lesson => ({ ...l(date), start, end: plus45(start), subjectId, ...extra });
const reg = (date: string, start: string, subjectId: string, topic: string, homeworkIds: string[] = []): ClassbookLesson => ({ date, start, period: '', subjectId, topic, homeworkIds });
const hw = (id: string, subjectId: string, given: string, due: string, title = 'Aufgabe ' + id): Homework => ({ id, subjectId, title, details: '', given, due });
const HOME = { dbi: { subjects: { '11': { name: 'Mathematik' }, '12': { name: 'Englisch' } } } };

test('enrich: topic from the register by date + subject + start; the timetable stays the source of truth', () => {
    const lessons = [at('2026-11-13', '08:00', '11'), at('2026-11-13', '08:50', '12', { cancelled: true, note: 'fällt aus' }), at('2026-11-13', '09:55', '11')];
    const out = enrich(lessons, [reg('2026-11-13', '08:00', '11', 'Brüche'), reg('2026-11-13', '08:50', '12', 'Vokabeln'), reg('2026-11-13', '09:55', '11', '')], []);
    assert.deepEqual(out.map((x) => x.topic), ['Brüche', 'Vokabeln', '']);
    assert.equal(out[1].cancelled, true, 'register never un-cancels a lesson');
    assert.equal(out[1].note, 'fällt aus');
});

test('enrich: no register entry or an empty register → topic stays empty, nothing breaks', () => {
    assert.deepEqual(enrich([at('2026-11-13', '08:00', '11')], [], []).map((x) => x.topic), ['']);
    assert.deepEqual(enrich([at('2026-11-13', '08:00', '11')], [reg('2026-11-12', '08:00', '11', 'x')], []).map((x) => x.topic), ['']);
});

test('enrich: homework given in a lesson, by register link or by date + subject, attached once', () => {
    const lessons = [at('2026-11-13', '08:00', '11'), at('2026-11-13', '09:55', '11'), at('2026-11-13', '08:50', '12')];
    const out = enrich(lessons, [reg('2026-11-13', '08:50', '12', '', ['h2'])],
        [hw('h1', '11', '2026-11-13', '2026-11-18'), hw('h2', '12', '2026-11-10', '2026-11-16'), hw('h3', '11', '2026-11-12', '2026-11-13')]);
    assert.deepEqual(out.map((x) => x.homework), [['Aufgabe h1'], [], ['Aufgabe h2']]);
});

test('homework due / given on a date, with the subject name', () => {
    const list = [hw('h1', '11', '2026-11-13', '2026-11-16'), hw('h2', '12', '2026-11-12', '2026-11-16'), hw('h3', '11', '2026-11-13', '2026-11-20')];
    assert.deepEqual(homeworkDue(list, '2026-11-16', HOME as never).map((x) => [x.subject, x.title]), [['Mathematik', 'Aufgabe h1'], ['Englisch', 'Aufgabe h2']]);
    assert.deepEqual(homeworkGiven(list, '2026-11-13', HOME as never).map((x) => x.title), ['Aufgabe h1', 'Aufgabe h3']);
    assert.deepEqual(homeworkDue(list, '', HOME as never), []);
});

test('enrich: double lesson (one timetable entry, two register entries) gets both topics', () => {
    const dbl = at('2026-11-13', '10:20', '11', { end: '12:10' });
    const out = enrich([dbl, at('2026-11-13', '12:15', '12', { end: '13:00' })], [
        reg('2026-11-13', '10:20', '11', 'Teil 1'), reg('2026-11-13', '11:25', '11', 'Teil 2'), reg('2026-11-13', '12:15', '12', 'Anderes'),
    ], []);
    assert.deepEqual(out.map((x) => x.topic), ['Teil 1 / Teil 2', 'Anderes']);
    // same topic in both periods → shown once
    assert.equal(enrich([dbl], [reg('2026-11-13', '10:20', '11', 'Gleich'), reg('2026-11-13', '11:25', '11', 'Gleich')], [])[0].topic, 'Gleich');
});

test('open homework: due today or later, soonest first, past ones dropped', () => {
    const list = [hw('late', '11', '2026-11-12', '2026-11-20'), hw('past', '12', '2026-11-05', '2026-11-10'), hw('today', '12', '2026-11-11', '2026-11-13'), hw('soon', '11', '2026-11-13', '2026-11-18')];
    assert.deepEqual(openHomework(list, '2026-11-13', HOME as never).map((x) => [x.title, x.subject, x.due]), [
        ['Aufgabe today', 'Englisch', '2026-11-13'], ['Aufgabe soon', 'Mathematik', '2026-11-18'], ['Aufgabe late', 'Mathematik', '2026-11-20'],
    ]);
    assert.deepEqual(openHomework([], '2026-11-13', HOME as never), []);
});

test('period label: the school\'s names from dbi.periods (id 2 = "1"), double lessons "1–2", unknown → ""', () => {
    // shape as seen live 2026-11-13 (structure only): id 1 = "0.", id 2 = "1", …
    const dbi = { periods: { '1': { id: '1', name: '0.', short: '0.', _oind: 1 }, '2': { id: '2', name: '1', short: '1', _oind: 2 },
        '3': { id: '3', name: '2', short: '2', _oind: 3 }, '4': { id: '4', name: '3', short: '3', _oind: 4 }, '5': { id: '5', name: '4', short: '4', _oind: 5 },
        '6': { id: '6', name: '5', short: '5', _oind: 6 } } };
    assert.equal(periodLabel(dbi, '2', 2), '1–2');
    assert.equal(periodLabel(dbi, '4', 2), '3–4');
    assert.equal(periodLabel(dbi, '6', 1), '5');
    assert.equal(periodLabel(dbi, '1', 1), '0');
    assert.equal(periodLabel(dbi, '6', 2), '5');        // runs past the table → only the first
    assert.equal(periodLabel(dbi, '99', 1), '');
    assert.equal(periodLabel(undefined, '2', 1), '');
    const ls = toLessons([{ date: '2026-11-13', uniperiod: '2', starttime: '08:20', endtime: '10:15', durationperiods: 2, subjectid: '1', type: 'card' },
        { date: '2026-11-13', uniperiod: '6', starttime: '12:15', endtime: '13:00', subjectid: '2', type: 'card' }], { dbi });
    assert.deepEqual(ls.map((x) => [x.periodLabel, x.periods]), [['1–2', 2], ['5', 1]]);
});
