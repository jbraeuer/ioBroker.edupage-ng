import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayLabel, nextSchoolDay, type Lesson } from './lessons';

const l = (date: string): Lesson => ({ date, period: '1', start: '08:00', end: '08:45', subject: 'M', teacher: '', room: '', cancelled: false, changed: false, note: '' });

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
