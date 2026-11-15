/**
 * Discovery for homework / lesson topics (F-0024): describes the SHAPE of the userhome, never its content.
 * Output = key names, value types, counts, item types and the date range of timeline items. No texts, no names,
 * no subjects, no ids as values. Written to the state debug.structure.
 */
import type { UserHome } from './edupage';

const kind = (v: unknown): string => (Array.isArray(v) ? `array(${v.length})` : v === null ? 'null' : typeof v === 'object' ? `object(${Object.keys(v as object).length})` : typeof v);
const HINT = /homework|ulohy|uloha|hw|tema|topic|dennik|plan|lesson|etest|test|znamk|grade/i;
const keysOf = (v: unknown): string[] => {
    if (typeof v === 'string' && v.startsWith('{')) { try { return Object.keys(JSON.parse(v) as object); } catch { return []; } }
    return v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v) : [];
};
/** Text shape without content (F-0035): capital -> A, lowercase -> a, digit -> 9, whitespace -> ' '; symbols stay
 *  (arrows, colons, dots, brackets). Max 80 chars. "3. Std WAT: RB -> FB" becomes "9. Aaa AAA: AA -> AA". */
export const mask = (t: string): string => t.slice(0, 80).replace(/\p{Lu}/gu, 'A').replace(/\p{Ll}/gu, 'a').replace(/\p{Nd}/gu, '9').replace(/\s+/g, ' ');
/** Shape of a value: objects -> key: shape (date keys -> DATE), arrays -> first 3 elements, strings -> mask, else the type. */
export function shape(v: unknown, depth = 3): unknown {
    if (typeof v === 'string') {
        if (v.startsWith('{') || v.startsWith('[')) { try { return shape(JSON.parse(v), depth); } catch { /* plain text */ } }
        return `str:${mask(v)}`;
    }
    if (v === null || typeof v !== 'object') return typeof v;
    if (depth <= 0) return kind(v);
    if (Array.isArray(v)) return { [`array(${v.length})`]: v.slice(0, 3).map((x) => shape(x, depth - 1)) };
    return Object.fromEntries(Object.keys(v).slice(0, 30).map((k) => [/^\d{4}-\d{2}-\d{2}$/.test(k) ? 'DATE' : k, shape((v as Record<string, unknown>)[k], depth - 1)]));
}
const day = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '');

export interface Structure {
    userhome: Record<string, string>;
    dbiTables: Record<string, number>;
    items: { count: number; byType: Record<string, number>; fields: string[]; dataFields: Record<string, string[]>; dates: { from: string; to: string } };
    /** per homework item: days from "added" (cas_pridania) to data.date, and whether predmetid is a known subject. Numbers/booleans only. */
    homework: { addedToDateDays: number | null; subjectKnown: boolean; hasDescription: boolean }[];
    hints: string[];
    /** F-0035: timeline items of type substitution: shape of text and data (masked, no content), max 3 items */
    substitution: unknown[];
    /** F-0035: key names of one teacher row (to confirm the short code field) */
    teacherKeys: string[];
}

export function describe(home: UserHome | null): Structure {
    const h = (home ?? {}) as Record<string, unknown>;
    const userhome = Object.fromEntries(Object.keys(h).sort().map((k) => [k, kind(h[k])]));
    const dbiTables = Object.fromEntries(Object.entries(home?.dbi ?? {}).map(([k, v]) => [k, v && typeof v === 'object' ? Object.keys(v).length : 0]));
    const raw = Array.isArray(h.items) ? (h.items as Record<string, unknown>[]) : [];
    const byType: Record<string, number> = {}, dataFields: Record<string, Set<string>> = {}, fields = new Set<string>();
    const dates: string[] = [];
    for (const it of raw) {
        const t = String(it.typ ?? it.type ?? '?').slice(0, 40);
        byType[t] = (byType[t] ?? 0) + 1;
        Object.keys(it).forEach((k) => fields.add(k));
        keysOf(it.data).forEach((k) => (dataFields[t] ??= new Set()).add(k));
        const d = day(it.cas_pridania ?? it.timestamp ?? it.datum ?? it.date);
        if (d) dates.push(d);
    }
    dates.sort();
    const days = (a: string, b: string): number | null => (a && b ? Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86400000) : null);
    const homework = raw.filter((it) => it.typ === 'homework').map((it) => {
        const data = (typeof it.data === 'string' ? (() => { try { return JSON.parse(it.data as string) as Record<string, unknown>; } catch { return {}; } })() : (it.data ?? {})) as Record<string, unknown>;
        return { addedToDateDays: days(day(it.cas_pridania ?? it.timestamp), day(data.date)), subjectKnown: !!home?.dbi?.subjects?.[String(data.predmetid)], hasDescription: !!String(data.popis ?? '').trim() };
    });
    const hints = [...Object.keys(h), ...Object.keys(home?.dbi ?? {}), ...fields].filter((k) => HINT.test(k));
    return {
        userhome, dbiTables,
        items: { count: raw.length, byType, fields: [...fields].sort(), dataFields: Object.fromEntries(Object.entries(dataFields).map(([k, v]) => [k, [...v].sort()])), dates: { from: dates[0] ?? '', to: dates[dates.length - 1] ?? '' } },
        hints: [...new Set(hints)].sort(),
        homework,
        substitution: raw.filter((it) => it.typ === 'substitution').slice(0, 3).map((it) => ({ text: shape(it.text), data: shape(it.data, 4), user: shape(it.user), target_user: shape(it.target_user) })),
        teacherKeys: Object.keys((Object.values(home?.dbi?.teachers ?? {})[0] ?? {}) as object).sort(),
    };
}

/** F-0035: shape of changed / removed timetable items (keys + masked values), max 3, to find the original teacher. */
export function describeChanged(items: Record<string, unknown>[]): unknown[] {
    return items.filter((it) => it.changed || it.removed || it.type === 'absent' || (it.flags && Object.keys(it.flags as object).length))
        .slice(0, 3).map((it) => shape(it, 3));
}

/** F-0035: HTML skeleton without content: tags with their class attribute, text masked, max `max` chars. */
export function skeleton(html: string, max = 2500): string {
    const out = String(html || '').replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_, close: string, tag: string, attrs: string) => {
        const cls = /class=["']([^"']*)["']/.exec(attrs);
        return `<${close}${tag}${cls ? `.${cls[1].trim().replace(/\s+/g, '.')}` : ''}>`;
    }).replace(/>([^<]+)</g, (_, t: string) => `>${mask(t)}<`);
    return out.slice(0, max);
}

/** F-0035: for the first changed lessons, ALL timetable items at the same date + period (the original lesson may be a
 *  separate item), as shapes. Also which keys differ between them. */
export function describeSiblings(items: Record<string, unknown>[], max = 2): unknown[] {
    const changed = items.filter((it) => it.changed).slice(0, max);
    return changed.map((c) => {
        const same = items.filter((it) => it.date === c.date && String(it.uniperiod) === String(c.uniperiod));
        return { count: same.length, items: same.slice(0, 4).map((it) => shape(it, 3)) };
    });
}

/** F-0035: shape of userhome.dp (daily plan) for the first date that has entries, 5 levels, masked. */
export function describeDailyPlan(home: unknown): unknown {
    const dp = (home as { dp?: Record<string, unknown> } | null)?.dp;
    if (!dp || typeof dp !== 'object') return null;
    const top = Object.fromEntries(Object.keys(dp).slice(0, 30).map((k) => [k, kind(dp[k])]));
    const dates = (dp.dates ?? {}) as Record<string, unknown>;
    const first = Object.keys(dates).sort().find((d) => dates[d] && typeof dates[d] === 'object');
    return { top, firstDate: first ? shape(dates[first], 5) : null };
}
