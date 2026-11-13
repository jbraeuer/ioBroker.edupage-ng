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
const day = (v: unknown): string => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '');

export interface Structure {
    userhome: Record<string, string>;
    dbiTables: Record<string, number>;
    items: { count: number; byType: Record<string, number>; fields: string[]; dataFields: Record<string, string[]>; dates: { from: string; to: string } };
    /** per homework item: days from "added" (cas_pridania) to data.date, and whether predmetid is a known subject. Numbers/booleans only. */
    homework: { addedToDateDays: number | null; subjectKnown: boolean; hasDescription: boolean }[];
    hints: string[];
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
    };
}
