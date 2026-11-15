"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mask = void 0;
exports.shape = shape;
exports.describe = describe;
exports.describeChanged = describeChanged;
exports.skeleton = skeleton;
exports.describeSiblings = describeSiblings;
exports.describeDailyPlan = describeDailyPlan;
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
/** F-0035: HTML skeleton without content: tags with their class attribute, text masked, max `max` chars. */
function skeleton(html, max = 2500) {
    const out = String(html || '').replace(/<(\/?)([a-zA-Z0-9]+)([^>]*)>/g, (_, close, tag, attrs) => {
        const cls = /class=["']([^"']*)["']/.exec(attrs);
        return `<${close}${tag}${cls ? `.${cls[1].trim().replace(/\s+/g, '.')}` : ''}>`;
    }).replace(/>([^<]+)</g, (_, t) => `>${(0, exports.mask)(t)}<`);
    return out.slice(0, max);
}
/** F-0035: for the first changed lessons, ALL timetable items at the same date + period (the original lesson may be a
 *  separate item), as shapes. Also which keys differ between them. */
function describeSiblings(items, max = 2) {
    const changed = items.filter((it) => it.changed).slice(0, max);
    return changed.map((c) => {
        const same = items.filter((it) => it.date === c.date && String(it.uniperiod) === String(c.uniperiod));
        return { count: same.length, items: same.slice(0, 4).map((it) => shape(it, 3)) };
    });
}
/** F-0035: shape of userhome.dp (daily plan) for the first date that has entries, 5 levels, masked. */
function describeDailyPlan(home) {
    const dp = home?.dp;
    if (!dp || typeof dp !== 'object')
        return null;
    const top = Object.fromEntries(Object.keys(dp).slice(0, 30).map((k) => [k, kind(dp[k])]));
    const dates = (dp.dates ?? {});
    // per date: the plan entries that carry something (header / flags / fields / teachers), 6 levels, max 6 per date
    const full = (v) => (Array.isArray(v) ? v.length > 0 : !!v && typeof v === 'object' && Object.keys(v).length > 0);
    const perDate = Object.keys(dates).sort().map((d) => {
        const plan = (dates[d]?.plan ?? []);
        const busy = plan.filter((it) => it && (full(it.header) || full(it.flags) || full(it.fields) || full(it.teacherids)));
        // F-0035: entries of a changed lesson: dp0.changes / orig / substids not empty
        const dp0 = (it) => (it.flags?.dp0 ?? {});
        const changed = busy.filter((it) => full(dp0(it).changes) || full(dp0(it).orig) || full(dp0(it).substids));
        return { entries: plan.length, busy: busy.length, changed: changed.length,
            items: changed.slice(0, 3).map((it) => ({ infos: shape(it.infos, 6), header: shape(it.header, 6), changes: shape(dp0(it).changes, 6), orig: shape(dp0(it).orig, 5),
                substids: shape(dp0(it).substids, 4), teacherids: shape(dp0(it).teacherids, 3), studentsinfo: shape(dp0(it).studentsinfo, 5) })) };
    });
    return { top, perDate };
}
//# sourceMappingURL=structure.js.map