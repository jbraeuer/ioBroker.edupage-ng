/** Turns raw timetable items (+ the dbi lookup tables) into lessons for the panel. */
import type { ClassbookLesson, Homework, Lunch, UserHome } from './edupage';

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
    subjectId: string;
    topic: string;        // "Lehrstoff" from the class register ('' if the teacher didn't enter one)
    homework: string[];   // titles of homework given in this lesson
}

/** Homework as shown on the panel. */
export interface HomeworkEntry { subject: string; title: string; details: string; given: string; due: string }

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
                subjectId: String(it.subjectid ?? ''),
                topic: '',
                homework: [] as string[],
            };
        })
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

/** End of the last lesson that actually takes place ("Schluss"), or '' if none. */
export function lastEnd(lessons: Lesson[]): string {
    return lessons.filter((l) => !l.cancelled && l.end).map((l) => l.end).sort().pop() ?? '';
}

export function toText(lessons: Lesson[]): string {
    return lessons.map((l) => `${l.period} ${l.start} ${l.subject}${l.room ? ' ' + l.room : ''}${l.cancelled ? ' (fällt aus)' : l.note ? ' (' + l.note + ')' : ''}`
        + (l.topic ? ` – ${l.topic}` : '') + (l.homework.length ? ` · HA: ${l.homework.join('; ')}` : '')).join('\n');
}

/**
 * Adds the class register topic and the homework given in a lesson. The timetable stays the source of truth
 * (cancelled / changed are never touched; Jens 2026-11-13: teachers don't use the class register reliably).
 * Match: same date + subject, register start inside the lesson's [start, end) (double lessons: both topics, joined
 * with ' / '), else the same period; a lesson without a register entry keeps topic ''.
 * Homework: linked by id from the register, else given that day in that subject → the first such lesson only.
 */
export function enrich(lessons: Lesson[], register: ClassbookLesson[], homework: Homework[]): Lesson[] {
    const used = new Set<string>();
    return lessons.map((l) => {
        const same = register.filter((r) => r.date === l.date && r.subjectId === l.subjectId);
        // a double lesson is ONE timetable entry (durationperiods 2) but one register entry per period (live 2026-11-13):
        // take every register entry of the subject that starts inside the lesson's time span
        let rs = same.filter((x) => x.start && l.start && x.start >= l.start && (l.end ? x.start < l.end : x.start === l.start));
        if (!rs.length) rs = same.filter((x) => x.period && x.period === l.period);
        if (!rs.length && same.length === 1) rs = same;
        const topic = [...new Set(rs.map((x) => x.topic).filter(Boolean))].join(' / ');
        const linked = new Set(rs.flatMap((x) => x.homeworkIds));
        const hw = homework.filter((h) => !used.has(h.id) && (linked.has(h.id) || (h.given === l.date && h.subjectId === l.subjectId)));
        hw.forEach((h) => used.add(h.id));
        return { ...l, topic, homework: hw.map((h) => h.title || h.details).filter(Boolean) };
    });
}

/** Homework that is due on `date`, with the subject name. */
export function homeworkDue(homework: Homework[], date: string, home: UserHome | null): HomeworkEntry[] {
    return homework.filter((h) => date && h.due === date).map((h) => toEntry(h, home));
}

/** All homework still due: due date today or later, soonest first (Q7, Jens 2026-11-13). */
export function openHomework(homework: Homework[], today: string, home: UserHome | null): HomeworkEntry[] {
    return homework.filter((h) => h.due && h.due >= today).sort((a, b) => (a.due + a.given).localeCompare(b.due + b.given)).map((h) => toEntry(h, home));
}

/** Homework given on `date`. */
export function homeworkGiven(homework: Homework[], date: string, home: UserHome | null): HomeworkEntry[] {
    return homework.filter((h) => date && h.given === date).map((h) => toEntry(h, home));
}

const toEntry = (h: Homework, home: UserHome | null): HomeworkEntry =>
    ({ subject: name(home?.dbi, 'subjects', h.subjectId), title: h.title, details: h.details, given: h.given, due: h.due });

/** The first date after `today` (YYYY-MM-DD) that has at least one lesson, or '' if none in the range. */
export function nextSchoolDay(lessons: Lesson[], today: string): string {
    return lessons.map((l) => l.date).filter((d) => d > today).sort()[0] ?? '';
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
const parse = (d: string): Date => { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd, 12); };   // noon: DST-safe

/** Button label for a school day: "Morgen" if it is the day after `today`, else the weekday ("Montag"); '' if no date. */
export function dayLabel(date: string, today: string): string {
    if (!date) return '';
    const days = Math.round((parse(date).getTime() - parse(today).getTime()) / 86400000);
    return days === 1 ? 'Morgen' : WEEKDAYS[parse(date).getDay()];
}

/** Canteen as text: "S: <dish>" per menu line; '' if there is no menu for the day, "kein Mittagessen" if not cooking. */
export function canteenText(lunch: Lunch | null): string {
    if (!lunch) return '';
    if (!lunch.cooking) return 'kein Mittagessen';
    return lunch.menus.map((m) => (m.code ? `${m.code}: ${m.dish}` : m.dish)).join('\n');
}
