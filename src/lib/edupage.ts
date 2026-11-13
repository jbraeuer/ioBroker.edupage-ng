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
export interface UserHome { userid?: string; dp?: { year?: number }; dbi?: Record<string, Record<string, Record<string, unknown>>>; [k: string]: unknown }

export interface Student { id: string; name: string; classId?: string }

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
        return Object.entries(st).map(([id, s]) => ({
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
