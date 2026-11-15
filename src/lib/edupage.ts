/**
 * EduPage session for one parent account (docs/protocol.md §3–5). Read-only.
 * Rules: one password login per call of login(); on any login error we throw and do NOT try again or another way.
 */
import { decodeResponse, rpcBody } from './eqap';
import { Http } from './http';

export class LoginFailed extends Error { public readonly code = 'login_failed'; }
export class CaptchaRequired extends Error { public readonly code = 'captcha'; }
export class TwoFactorRequired extends Error { public readonly code = 'twofactor'; }
export class SessionExpired extends Error { public readonly code = 'session_expired'; }
export class ProtocolChanged extends Error { public readonly code = 'protocol_changed'; }

/** The parts of the app page we use. dbi = lookup tables (subjects, teachers, classes, classrooms, students). */
export interface UserHome { userid?: string; dp?: { year?: number }; parentStudentids?: unknown[]; dbi?: Record<string, Record<string, Record<string, unknown>>>; [k: string]: unknown }

export interface Student { id: string; name: string; classId?: string }

/** A homework item (docs/protocol.md §8). `given` = datefrom, `due` = dateto (YYYY-MM-DD). */
export interface Homework { id: string; subjectId: string; title: string; details: string; given: string; due: string }
/** One lesson of the class register (docs/protocol.md §9). Only what we use: the topic and linked homework. */
export interface ClassbookLesson {
    date: string; start: string; period: string; subjectId: string; topic: string; homeworkIds: string[];
    /** F-0035: substitution teacher ids (dp.changes column teacherids, else orig.teacherids vs teacherids); null = none */
    teacherChange: { old: string[]; new: string[] } | null;
}

const ids = (v: unknown): string[] => (Array.isArray(v) ? v : v === undefined || v === null || v === '' ? [] : String(v).split(','))
    .map((x) => String(x).trim()).filter(Boolean);
/** F-0035 (verified live 2026-11-15 on a parent account): a substituted lesson's dp0 has
 *  changes: [{ column: 'teacherids', old: '<id>', new: '<id>' }] and orig.teacherids = the original teacher. */
export function teacherChangeOf(dp: Record<string, unknown>): { old: string[]; new: string[] } | null {
    const ch = (Array.isArray(dp.changes) ? dp.changes : []).find((c) => (c as { column?: unknown })?.column === 'teacherids') as { old?: unknown; new?: unknown } | undefined;
    let o = ids(ch?.old), n = ids(ch?.new);
    if (!ch) {
        o = ids((dp.orig as { teacherids?: unknown } | undefined)?.teacherids);
        n = ids(dp.teacherids);
        if (!o.length || !n.length || (o.length === n.length && o.every((x) => n.includes(x)))) return null;
    }
    return o.length && n.length ? { old: o, new: n } : null;
}

/** Lunch of one day (docs/protocol.md §7). `menus` = the choosable dishes, e.g. S = Standard-Essen, W = Wahl-Essen. */
export interface Lunch {
    date: string; cooking: boolean; from: string; to: string; menus: { code: string; label: string; dish: string; allergens: string }[];
    /** The CURRENT child's order (after switchChild): menu code (e.g. "S"), or '' if none. evidencia.obj A/B/C = menu 1/2/3
     *  (confirmed by Jens in the app 2026-11-13: A = Standard, B = Wahl-Essen). evidencia.stav is not interpreted. */
    ordered: string;
}

const d10 = (v: unknown): string => String(v ?? '').slice(0, 10);

/** Parses the canteen page (`edupageData: {<school>: {novyListok: {<date>: {"2": lunch}}}}`). One page = one week. */
export function parseMenuPage(html: string, school: string): Lunch[] | null {
    const i = html.indexOf('edupageData');
    if (i < 0) return null;
    const json = jsonObjectAt(html, html.indexOf('{', i));
    if (!json) throw new ProtocolChanged('menu: edupageData found, but its JSON could not be read');
    const data = JSON.parse(json) as Record<string, { novyListok?: Record<string, Record<string, Record<string, unknown>>> }>;
    const days = (data[school] ?? Object.values(data)[0])?.novyListok;
    if (!days || typeof days !== 'object') throw new ProtocolChanged('menu: no novyListok');
    const out: Lunch[] = [];
    for (const [date, meals] of Object.entries(days)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;                  // e.g. addInfo
        const m = meals?.['2'];                                             // 1 snack · 2 lunch · 3 afternoon
        if (!m) continue;
        const names = (m.nazvyMenu ?? {}) as Record<string, { nazov?: string; skratka?: string }>;
        const label = (code: string): string => Object.values(names).find((n) => n.skratka === code)?.nazov ?? '';
        const rows = (Array.isArray(m.rows) ? m.rows : []) as ({ nazov?: string; menusStr?: string; alergenyStr?: string } | null)[];
        const menus = rows.filter((r): r is NonNullable<typeof r> => !!r && !!String(r.nazov ?? '').trim()).map((r) => {
            const code = String(r.menusStr ?? '').replace(/[:\s]+$/, '').trim();
            return { code, label: label(code), dish: String(r.nazov).trim(), allergens: String(r.alergenyStr ?? '').trim() };
        });
        const obj = String((m.evidencia as { obj?: unknown } | undefined)?.obj ?? '').trim().toUpperCase();
        const ordered = /^[A-Z]$/.test(obj) ? String(names[String(obj.charCodeAt(0) - 64)]?.skratka ?? '') : '';
        out.push({ date, cooking: m.isCooking !== false && menus.length > 0, from: String(m.vydaj_od ?? ''), to: String(m.vydaj_do ?? ''), menus, ordered });
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
}
const looksLikeLogin = (html: string): boolean => /\/login\//.test(html) && !html.includes('edubar(');

/** Parses the homework page (`homeworklist({...})`). Returns null if the page isn't the homework page. */
export function parseHomeworkPage(html: string): Homework[] | null {
    const i = html.indexOf('homeworklist(');
    if (i < 0) return null;
    const json = jsonObjectAt(html, html.indexOf('{', i));
    if (!json) throw new ProtocolChanged('homeworklist(...) found, but its JSON could not be read');
    const list = (JSON.parse(json) as { homeworks?: Record<string, unknown>[] }).homeworks;
    if (!Array.isArray(list)) throw new ProtocolChanged('homeworklist: no homeworks list');
    return list.map((h) => ({
        id: String(h.homeworkid ?? h.hwkid ?? ''), subjectId: String(h.predmetid ?? ''), title: String(h.name ?? '').trim(),
        details: String(h.details ?? '').trim(), given: d10(h.datefrom), due: d10(h.dateto),
    }));
}

/** Finds the class register gadget's `gpid=…&gsh=…` on the ttday page, or null. */
export function classbookGparam(html: string): string | null {
    return /_gclass="DashboardClassbook";[^;]*_gparam="(gpid=\d+&gsh=[0-9a-f]+)"/.exec(html)?.[1] ?? null;
}

/** Parses the class register answer (`JS:… .classbook.fill("<id>", {...})`) into lessons. */
export function parseClassbook(js: string): ClassbookLesson[] {
    const i = js.indexOf('.classbook.fill(');
    if (i < 0) throw new ProtocolChanged('class register: no classbook.fill(...)');
    const json = jsonObjectAt(js, js.indexOf('{', i));
    if (!json) throw new ProtocolChanged('class register: fill(...) JSON could not be read');
    const dates = (JSON.parse(json) as { dates?: Record<string, { plan?: Record<string, unknown>[] }> }).dates ?? {};
    const out: ClassbookLesson[] = [];
    for (const [date, day] of Object.entries(dates)) {
        for (const p of day.plan ?? []) {
            if (p.type !== 'lesson') continue;
            const flags = (p.flags ?? {}) as Record<string, Record<string, unknown>>;
            const dp = flags[Object.keys(flags).find((k) => /^dp\d+$/.test(k)) ?? ''] ?? {};
            out.push({
                date: d10(dp.date ?? date), start: String(dp.starttime ?? p.starttime ?? ''), period: String(dp.uniperiod ?? p.uniperiod ?? p.period ?? ''),
                subjectId: String(dp.subjectid ?? p.subjectid ?? ''), topic: String(dp.note_wd ?? '').trim(),
                homeworkIds: Array.isArray(dp.homeworkids) ? (dp.homeworkids as unknown[]).map(String) : [],
                teacherChange: teacherChangeOf(dp),
            });
        }
    }
    return out;
}

/** Extracts `userhome({...});` and `ASC.gsechash="…"` from the app page. Returns null if it isn't the app page. */
export function parseAppPage(html: string): { userhome: UserHome; gsechash: string } | null {
    const h = /ASC\.gsechash\s*=\s*"([^"]+)"/.exec(html);
    const start = html.indexOf('userhome(');
    if (!h || start < 0) return null;
    const json = jsonObjectAt(html, start + 'userhome('.length);
    if (!json) throw new ProtocolChanged('userhome(...) found, but its JSON could not be read');
    return { userhome: JSON.parse(json) as UserHome, gsechash: h[1] };
}

/** Returns the balanced {...} starting at index i (strings and escapes respected). */
export function jsonObjectAt(s: string, i: number): string | null {
    while (s[i] === ' ' || s[i] === '\n' || s[i] === '\r' || s[i] === '\t') i++;
    if (s[i] !== '{') return null;
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < s.length; j++) {
        const c = s[j];
        if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
        if (c === '"') inStr = true;
        else if (c === '{') depth++;
        else if (c === '}' && --depth === 0) return s.slice(i, j + 1);
    }
    return null;
}

export class EdupageSession {
    public readonly http: Http;
    public userhome: UserHome | null = null;
    public gsechash = '';
    public passwordLogins = 0;

    public constructor(public readonly school: string, public readonly username: string, base?: string) {
        this.http = new Http(base ?? `https://${school}.edupage.org`);
    }

    public get sessionId(): string | undefined { return this.http.jar.get('PHPSESSID'); }

    /** Reuses a stored session. Returns false (no exception) if it is no longer valid. */
    public async restore(phpsessid: string): Promise<boolean> {
        this.http.jar.set('PHPSESSID', phpsessid);
        const r = await this.http.request('GET', '/user/');
        const page = parseAppPage(r.text);
        if (!page) return false;
        ({ userhome: this.userhome, gsechash: this.gsechash } = page);
        return true;
    }

    /** One password login (4 requests). Throws LoginFailed / CaptchaRequired / TwoFactorRequired / ProtocolChanged. */
    public async login(password: string): Promise<void> {
        await this.http.request('GET', '/login/?cmd=MainLogin');
        const tok = this.json(await this.http.request('POST', '/login/?cmd=MainLogin&akcia=getToken', rpcBody({ username: this.username, edupage: '' })));
        if (typeof tok.token !== 'string') throw new ProtocolChanged('getToken: no token in the answer');
        this.passwordLogins++;
        const res = this.json(await this.http.request('POST', '/login/?cmd=MainLogin&akcia=login', rpcBody({
            username: this.username, password, userToken: tok.token, edupage: '', ctxt: '', tu: null, gu: null, au: null,
        })));
        const err = res.err as { error_id?: string; error_text?: string } | undefined;
        if (err || res.status !== 'OK') {
            const text = `${err?.error_id ?? ''} ${err?.error_text ?? ''}`.trim() || String(res.status);
            if (/captcha/i.test(text) || res.needCaptcha === '1' || res.captchaSrc) throw new CaptchaRequired('EduPage asks for a captcha: ' + text);
            throw new LoginFailed('login refused: ' + text);
        }
        const redirect = String(res.redirectUrl ?? '');
        if (!redirect) throw new ProtocolChanged('login OK but no redirectUrl');
        if (/twofactor/i.test(redirect)) throw new TwoFactorRequired('EduPage asks for a second factor (2FA)');
        const page = await this.http.request('GET', redirect);
        if (/twofactor/i.test(page.url)) throw new TwoFactorRequired('EduPage asks for a second factor (2FA)');
        if (/cap=1|lerr=b43b43/.test(page.url)) throw new CaptchaRequired('EduPage asks for a captcha');
        const parsed = parseAppPage(page.text);
        if (!parsed) throw new ProtocolChanged('after login: app page without userhome/gsechash');
        ({ userhome: this.userhome, gsechash: this.gsechash } = parsed);
    }

    public get isParent(): boolean { return /Rodic/.test(String(this.userhome?.userid ?? '')); }

    /** Students known to this account (dbi.students). Name = "firstname lastname". (Field names: unverified, checked live in M1.) */
    public students(): Student[] {
        const st = this.userhome?.dbi?.students ?? {};
        // A parent account sees whole classes in dbi.students (live: 52 entries). Only its own children count:
        // userhome.parentStudentids (verified live 2026-11-13). Without it (student account) all entries.
        const own = Array.isArray(this.userhome?.parentStudentids) ? new Set((this.userhome!.parentStudentids as unknown[]).map(String)) : null;
        return Object.entries(st).filter(([id, s]) => !own || own.has(String(s.id ?? id))).map(([id, s]) => ({
            id: String(s.id ?? id),
            name: [s.firstname, s.lastname].filter(Boolean).join(' ').trim() || String(s.name ?? s.short ?? id),
            classId: s.classid !== undefined ? String(s.classid) : undefined,
        }));
    }

    /** Finds a configured child by name: exact, else every word of the configured name contained (case-insensitive). */
    public findStudent(name: string): Student | undefined {
        const all = this.students(), n = name.trim().toLowerCase();
        return all.find((s) => s.name.toLowerCase() === n)
            ?? all.find((s) => n.split(/\s+/).every((w) => s.name.toLowerCase().includes(w)));
    }

    public async switchChild(studentId: string): Promise<void> {
        const r = await this.http.request('GET', `/login/switchchild?studentid=${encodeURIComponent(studentId)}`);
        if (r.text.trim() !== 'OK') throw new ProtocolChanged(`switchchild: unexpected answer (${r.status})`);
    }

    /** Raw timetable items for one student and a date range (YYYY-MM-DD). */
    public async timetable(studentId: string, from: string, to: string): Promise<Record<string, unknown>[]> {
        const r = await this.call('/timetable/server/currenttt.js?__func=curentttGetData', [null, {
            year: this.userhome?.dp?.year, datefrom: from, dateto: to, table: 'students', id: studentId,
            showColors: true, showIgroupsInClasses: true, showOrig: true, log_module: 'CurrentTTView',
        }]);
        const out = r.r as { ttitems?: unknown; error?: unknown } | undefined;
        if (!out) throw new ProtocolChanged('timetable: no "r" in the answer');
        if (out.error) throw new ProtocolChanged('timetable: ' + String(out.error));
        if (!Array.isArray(out.ttitems)) throw new ProtocolChanged('timetable: no ttitems list');
        return out.ttitems as Record<string, unknown>[];
    }

    /** Lunch menus of the week that contains `date` (YYYY-MM-DD). GET only: a POST to /menu/ would order meals. */
    public async menuWeek(date: string): Promise<Lunch[]> {
        const r = await this.http.request('GET', `/menu/?date=${date.replaceAll('-', '')}`);
        const week = parseMenuPage(r.text, this.school);
        if (week) return week;
        if (looksLikeLogin(r.text)) throw new SessionExpired('menu: not logged in');
        throw new ProtocolChanged('menu page without edupageData');
    }

    /** Homework of the current child (after switchChild). GET only. */
    public async homeworks(): Promise<Homework[]> {
        const r = await this.http.request('GET', '/dashboard/eb.php?mode=exam&filterTab=works');
        const list = parseHomeworkPage(r.text);
        if (list) return list;
        if (looksLikeLogin(r.text)) throw new SessionExpired('homework page: not logged in');
        throw new ProtocolChanged('homework page without homeworklist(...)');
    }

    /** Class register (lesson topics) of the current child. Read action `loadData` only (all other gadget actions are teacher actions; safety.test.ts enforces it). */
    public async classbook(from: string, to: string): Promise<ClassbookLesson[]> {
        const page = await this.http.request('GET', '/dashboard/eb.php?mode=ttday');
        const gp = classbookGparam(page.text);
        if (!gp) {
            if (looksLikeLogin(page.text)) throw new SessionExpired('class register: not logged in');
            throw new ProtocolChanged('class register gadget not found');
        }
        const r = await this.http.request('POST', '/gcall', `${gp}&action=loadData&&datefrom=${from}&dateto=${to}`);
        return parseClassbook(r.text);
    }

    /** JSON call with __gsh. {"reload": …} → SessionExpired. */
    private async call(path: string, args: unknown[]): Promise<Record<string, unknown>> {
        if (!this.gsechash) throw new SessionExpired('not logged in');
        const res = this.json(await this.http.request('POST', path, JSON.stringify({ __args: args, __gsh: this.gsechash }), 'application/json; charset=utf-8'));
        if ('reload' in res) throw new SessionExpired('EduPage asks to reload (session expired)');
        return res;
    }

    private json(r: { status: number; text: string }): Record<string, unknown> {
        if (r.status >= 500) throw new Error(`EduPage HTTP ${r.status}`);
        try {
            return JSON.parse(decodeResponse(r.text)) as Record<string, unknown>;
        } catch (e) {
            if (e instanceof SyntaxError) throw new ProtocolChanged(`answer is not JSON (HTTP ${r.status})`);
            throw e;
        }
    }
}
