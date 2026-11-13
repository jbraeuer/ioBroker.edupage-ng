/** Turns raw timetable items (+ the dbi lookup tables) into lessons for the panel. */
import type { UserHome } from './edupage';

export interface Lesson {
    date: string;
    period: string;
    start: string;
    end: string;
    subject: string;
    teacher: string;
    room: string;
    cancelled: boolean;
    changed: boolean;   // substitution / room change / event (detail in note)
    note: string;
}

const name = (dbi: UserHome['dbi'], table: string, id: unknown): string => {
    const row = dbi?.[table]?.[String(id)] as { name?: string; short?: string; firstname?: string; lastname?: string } | undefined;
    if (!row) return '';
    if (table === 'teachers') return [row.firstname, row.lastname].filter(Boolean).join(' ') || row.short || row.name || '';
    return row.name || row.short || '';
};
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : [v]);

export function toLessons(items: Record<string, unknown>[], home: UserHome | null): Lesson[] {
    const dbi = home?.dbi;
    return items
        .map((it) => {
            const flags = (it.flags ?? {}) as Record<string, { name?: string; note_wd?: string } | undefined>;
            const removed = !!it.removed || it.type === 'absent';
            const event = it.type === 'event';
            const noteParts = [flags.dp0?.note_wd, event ? flags.event?.name || String(it.name ?? '') : ''].filter(Boolean) as string[];
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
export function lastEnd(lessons: Lesson[]): string {
    return lessons.filter((l) => !l.cancelled && l.end).map((l) => l.end).sort().pop() ?? '';
}

export function toText(lessons: Lesson[]): string {
    return lessons.map((l) => `${l.period} ${l.start} ${l.subject}${l.room ? ' ' + l.room : ''}${l.cancelled ? ' (fällt aus)' : l.note ? ' (' + l.note + ')' : ''}`).join('\n');
}
