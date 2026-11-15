"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mask = void 0;
exports.shape = shape;
exports.describe = describe;
exports.describeChanged = describeChanged;
const kind = (v) => (Array.isArray(v) ? `array(${v.length})` : v === null ? 'null' : typeof v === 'object' ? `object(${Object.keys(v).length})` : typeof v);
const HINT = /homework|ulohy|uloha|hw|tema|topic|dennik|plan|lesson|etest|test|znamk|grade/i;
const keysOf = (v) => {
    if (typeof v === 'string' && v.startsWith('{')) {
        try {
            return Object.keys(JSON.parse(v));
        }
        catch {
            return [];
        }
    }
    return v && typeof v === 'object' && !Array.isArray(v) ? Object.keys(v) : [];
};
/** Text shape without content (F-0035): capital -> A, lowercase -> a, digit -> 9, whitespace -> ' '; symbols stay
 *  (arrows, colons, dots, brackets). Max 80 chars. "3. Std WAT: RB -> FB" becomes "9. Aaa AAA: AA -> AA". */
const mask = (t) => t.slice(0, 80).replace(/\p{Lu}/gu, 'A').replace(/\p{Ll}/gu, 'a').replace(/\p{Nd}/gu, '9').replace(/\s+/g, ' ');
exports.mask = mask;
/** Shape of a value: objects -> key: shape (date keys -> DATE), arrays -> first 3 elements, strings -> mask, else the type. */
function shape(v, depth = 3) {
    if (typeof v === 'string') {
        if (v.startsWith('{') || v.startsWith('[')) {
            try {
                return shape(JSON.parse(v), depth);
            }
            catch { /* plain text */ }
        }
        return `str:${(0, exports.mask)(v)}`;
    }
    if (v === null || typeof v !== 'object')
        return typeof v;
    if (depth <= 0)
        return kind(v);
    if (Array.isArray(v))
        return { [`array(${v.length})`]: v.slice(0, 3).map((x) => shape(x, depth - 1)) };
    return Object.fromEntries(Object.keys(v).slice(0, 30).map((k) => [/^\d{4}-\d{2}-\d{2}$/.test(k) ? 'DATE' : k, shape(v[k], depth - 1)]));
}
const day = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : '');
function describe(home) {
    const h = (home ?? {});
    const userhome = Object.fromEntries(Object.keys(h).sort().map((k) => [k, kind(h[k])]));
    const dbiTables = Object.fromEntries(Object.entries(home?.dbi ?? {}).map(([k, v]) => [k, v && typeof v === 'object' ? Object.keys(v).length : 0]));
    const raw = Array.isArray(h.items) ? h.items : [];
    const byType = {}, dataFields = {}, fields = new Set();
    const dates = [];
    for (const it of raw) {
        const t = String(it.typ ?? it.type ?? '?').slice(0, 40);
        byType[t] = (byType[t] ?? 0) + 1;
        Object.keys(it).forEach((k) => fields.add(k));
        keysOf(it.data).forEach((k) => (dataFields[t] ??= new Set()).add(k));
        const d = day(it.cas_pridania ?? it.timestamp ?? it.datum ?? it.date);
        if (d)
            dates.push(d);
    }
    dates.sort();
    const days = (a, b) => (a && b ? Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86400000) : null);
    const homework = raw.filter((it) => it.typ === 'homework').map((it) => {
        const data = (typeof it.data === 'string' ? (() => { try {
            return JSON.parse(it.data);
        }
        catch {
            return {};
        } })() : (it.data ?? {}));
        return { addedToDateDays: days(day(it.cas_pridania ?? it.timestamp), day(data.date)), subjectKnown: !!home?.dbi?.subjects?.[String(data.predmetid)], hasDescription: !!String(data.popis ?? '').trim() };
    });
    const hints = [...Object.keys(h), ...Object.keys(home?.dbi ?? {}), ...fields].filter((k) => HINT.test(k));
    return {
        userhome, dbiTables,
        items: { count: raw.length, byType, fields: [...fields].sort(), dataFields: Object.fromEntries(Object.entries(dataFields).map(([k, v]) => [k, [...v].sort()])), dates: { from: dates[0] ?? '', to: dates[dates.length - 1] ?? '' } },
        hints: [...new Set(hints)].sort(),
        homework,
        substitution: raw.filter((it) => it.typ === 'substitution').slice(0, 3).map((it) => ({ text: shape(it.text), data: shape(it.data, 4), user: shape(it.user), target_user: shape(it.target_user) })),
        teacherKeys: Object.keys((Object.values(home?.dbi?.teachers ?? {})[0] ?? {})).sort(),
    };
}
/** F-0035: shape of changed / removed timetable items (keys + masked values), max 3, to find the original teacher. */
function describeChanged(items) {
    return items.filter((it) => it.changed || it.removed || it.type === 'absent' || (it.flags && Object.keys(it.flags).length))
        .slice(0, 3).map((it) => shape(it, 3));
}
//# sourceMappingURL=structure.js.map