import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayLabel, enrich, homeworkDue, homeworkGiven, nextSchoolDay, type Lesson } from './lessons';
import type { ClassbookLesson, Homework } from './edupage';

const l = (date: string): Lesson => ({ date, period: '1', start: '08:00', end: '08:45', subject: 'M', teacher: '', room: '', cancelled: false, changed: false, note: '', subjectId: '11', topic: '', homework: [] });

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

test('day label: "Morgen" for the next day, else the weekday; DST change in between is fine', () => {
    assert.equal(dayLabel('2026-11-17', '2026-11-16'), 'Morgen');
    assert.equal(dayLabel('2026-11-16', '2026-11-13'), 'Montag');
    assert.equal(dayLabel('2026-03-30', '2026-03-27'), 'Montag');   // over the DST switch (29.03.)
    assert.equal(dayLabel('2026-10-26', '2026-10-25'), 'Morgen');   // DST end
    assert.equal(dayLabel('', '2026-11-13'), '');
});

const at = (date: string, start: string, subjectId: string, extra: Partial<Lesson> = {}): Lesson => ({ ...l(date), start, subjectId, ...extra });
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
