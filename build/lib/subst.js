"use strict";
/**
 * Substitution plan (F-0035): who replaces whom. The timetable only says "changed" and gives the NEW teacher; the old
 * one is only in the school's substitution viewer (what the app shows as "Hinweis"):
 *   POST /substitution/server/viewer.js?__func=getSubstViewerDayDataHtml  [null, { date, mode: 'classes' }]  → r = HTML
 * HTML (asc substitution viewer, same structure the edupage-api library parses): one section per class
 *   <div class="section print-nobreak"><div class="header"><span class="print-font-resizable">6b</span></div>
 *   <div class="rows"><div class="row change"><div class="period"><span …>3</span></div><div class="info"><span …>TEXT</span></div></div>…
 * The text names teachers by their short codes, e.g. "WAT - (RB) ➔ FB". We only take what matches that pattern.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSubstitutions = parseSubstitutions;
exports.teacherSwap = teacherSwap;
exports.coversLesson = coversLesson;
exports.rowsForClass = rowsForClass;
const strip = (h) => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim();
/** Classes with their rows, in page order. Unknown markup → []. */
function parseSubstitutions(html) {
    const out = [];
    const sections = String(html || '').split(/<div class="section[^"]*">/).slice(1);
    for (const sec of sections) {
        const head = /<div class="header">([\s\S]*?)<\/div>/.exec(sec);
        if (!head)
            continue;
        const className = strip(head[1]);
        const rows = [];
        for (const part of sec.split(/<div class="row\s+/).slice(1)) {
            const action = /^([\w-]+)/.exec(part)?.[1] ?? '';
            const period = /<div class="period">([\s\S]*?)<\/div>/.exec(part);
            const info = /<div class="info">([\s\S]*?)<\/div>/.exec(part);
            if (!period || !info)
                continue;
            rows.push({ action, lessons: strip(period[1]).replace(/\s*-\s*/, '–'), text: strip(info[1]) });
        }
        if (className)
            out.push({ className, rows });
    }
    return out;
}
const CODE = '[A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{0,3}';
const SWAP = new RegExp(`\\(?\\s*(${CODE}(?:\\s*,\\s*${CODE})*)\\s*\\)?\\s*(?:➔|➜|→|->|=>|>)\\s*\\(?\\s*(${CODE}(?:\\s*,\\s*${CODE})*)\\s*\\)?`, 'u');
/** "(RB) ➔ FB" → { from: 'RB', to: 'FB' }; anything else → null (never guessed). */
function teacherSwap(text) {
    const m = SWAP.exec(text);
    return m ? { from: m[1].replace(/\s+/g, ''), to: m[2].replace(/\s+/g, '') } : null;
}
/** Does a row's lesson field ("3", "3–4", "3. Std.") cover the lesson label ("3" or "4–5")? */
function coversLesson(rowLessons, label) {
    const nums = (t) => {
        const m = /(\d+)\D*(?:–|-)\D*(\d+)|(\d+)/.exec(t);
        if (!m)
            return [];
        if (m[3])
            return [Number(m[3])];
        const a = Number(m[1]), b = Number(m[2]);
        return b >= a && b - a < 10 ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [];
    };
    const r = nums(rowLessons), l = nums(label);
    return r.length > 0 && l.length > 0 && l.some((x) => r.includes(x));
}
/** Rows of one class (exact name, else case-insensitive). */
function rowsForClass(classes, className) {
    const c = classes.find((x) => x.className === className) ?? classes.find((x) => x.className.toLowerCase() === className.toLowerCase());
    return c ? c.rows : [];
}
//# sourceMappingURL=subst.js.map