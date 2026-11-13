"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toLessons = toLessons;
exports.lastEnd = lastEnd;
exports.toText = toText;
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
//# sourceMappingURL=lessons.js.map