"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const lessons_1 = require("./lessons");
const l = (date) => ({ date, period: '1', start: '08:00', end: '08:45', subject: 'M', teacher: '', room: '', cancelled: false, changed: false, note: '' });
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
//# sourceMappingURL=lessons.test.js.map