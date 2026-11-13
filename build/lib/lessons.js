"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toLessons = toLessons;
exports.lastEnd = lastEnd;
exports.toText = toText;
exports.nextSchoolDay = nextSchoolDay;
exports.dayLabel = dayLabel;
const name = (dbi, table, id) => {
    const row = dbi?.[table]?.[String(id)];
    if (!row)
        return '';
    if (table === 'teachers')
        return [row.firstname, row.lastname].filter(Boolean).join(' ') || row.short || row.name || '';
    return row.name || row.short || '';
};
const list = (v) => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);
function toLessons(items, home) {
    const dbi = home?.dbi;
    return items
        .map((it) => {
        const flags = (it.flags ?? {});
        const removed = !!it.removed || it.type === 'absent';
        const event = it.type === 'event';
        const noteParts = [flags.dp0?.note_wd, event ? flags.event?.name || String(it.name ?? '') : ''].filter(Boolean);
        return {
            date: String(it.date ?? ''),
            period: String(it.uniperiod ?? it.period ?? ''),
            start: String(it.starttime ?? ''),
            end: String(it.endtime ?? ''),
            subject: name(dbi, 'subjects', it.subjectid) || (event ? String(it.name ?? '') : ''),
            teacher: list(it.teacherids).map((t) => name(dbi, 'teachers', t)).filter(Boolean).join(', '),
            room: list(it.classroomids).map((r) => name(dbi, 'classrooms', r)).filter(Boolean).join(', '),
            cancelled: removed,
            changed: !removed && (event || noteParts.length > 0 || !!it.changed),
            note: removed && !noteParts.length ? 'fällt aus' : noteParts.join(' · '),
        };
    })
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}
/** End of the last lesson that actually takes place ("Schluss"), or '' if none. */
function lastEnd(lessons) {
    return lessons.filter((l) => !l.cancelled && l.end).map((l) => l.end).sort().pop() ?? '';
}
function toText(lessons) {
    return lessons.map((l) => `${l.period} ${l.start} ${l.subject}${l.room ? ' ' + l.room : ''}${l.cancelled ? ' (fällt aus)' : l.note ? ' (' + l.note + ')' : ''}`).join('\n');
}
/** The first date after `today` (YYYY-MM-DD) that has at least one lesson, or '' if none in the range. */
function nextSchoolDay(lessons, today) {
    return lessons.map((l) => l.date).filter((d) => d > today).sort()[0] ?? '';
}
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const parse = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd, 12); }; // noon: DST-safe
/** Button label for a school day: "Morgen" if it is the day after `today`, else the weekday ("Montag"); '' if no date. */
function dayLabel(date, today) {
    if (!date)
        return '';
    const days = Math.round((parse(date).getTime() - parse(today).getTime()) / 86400000);
    return days === 1 ? 'Morgen' : WEEKDAYS[parse(date).getDay()];
}
//# sourceMappingURL=lessons.js.map