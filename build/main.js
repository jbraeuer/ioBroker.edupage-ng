"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.EdupageNg = void 0;
/**
 * ioBroker.edupage-ng: read-only EduPage for parent accounts.
 * M0: configuration, state tree, scheduling and error states. The EduPage calls come in M1–M4 (docs/protocol.md).
 *
 * Login discipline (the accounts must never get captcha-locked):
 *  - reuse the session, at most one password login per account and hour
 *  - stop at the first login error (no second attempt), set info.lastError, wait for control.retry
 *  - poll every pollMinutes (min. 15) with up to 2 min random jitter
 */
const utils = __importStar(require("@iobroker/adapter-core"));
const config_1 = require("./lib/config");
const edupage_1 = require("./lib/edupage");
const lessons_1 = require("./lib/lessons");
const structure_1 = require("./lib/structure");
const HOUR = 3600000;
const LOOKAHEAD_DAYS = 10; // the next school day is searched in today+1 … today+10 (weekend + a holiday week)
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
class EdupageNg extends utils.Adapter {
    timer;
    blocked = false; // true after a login error until control.retry
    sessions = new Map();
    nextSchoolDay = ''; // from the first child's timetable in this poll; the canteen uses it
    canteenWeek = []; // menus of this poll (same for all children), from the first child's fetch
    constructor(options = {}) {
        super({ ...options, name: 'edupage-ng' });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }
    get cfg() { return this.config; }
    async onReady() {
        await this.setStateAsync('info.connection', false, true);
        const errs = (0, config_1.validateConfig)(this.cfg);
        if (errs.length) {
            await this.setStateAsync('info.lastError', 'config: ' + errs.join('; '), true);
            this.log.error('Configuration: ' + errs.join('; '));
            return;
        }
        for (const acc of [1, 2]) {
            await this.setObjectNotExistsAsync(`accounts.${acc}.session`, { type: 'state', common: { name: `Account ${acc}: session (encrypted)`, role: 'text', type: 'string', read: false, write: false, def: '' }, native: {} });
            await this.setObjectNotExistsAsync(`accounts.${acc}.lastLogin`, { type: 'state', common: { name: `Account ${acc}: last password login`, role: 'date', type: 'number', read: true, write: false, def: 0 }, native: {} });
        }
        for (const k of this.cfg.children)
            await this.createChildStates(k);
        await this.createCanteenStates();
        await this.setObjectNotExistsAsync('debug', { type: 'channel', common: { name: 'Discovery (structure only, no content)' }, native: {} });
        for (const acc of [1, 2])
            await this.setObjectNotExistsAsync(`debug.account${acc}`, { type: 'state', common: { name: `Account ${acc}: userhome structure (key names + counts only)`, role: 'json', type: 'string', read: true, write: false, def: '' }, native: {} });
        await this.removeObsoleteTomorrow();
        this.subscribeStates('control.retry');
        await this.poll();
    }
    async createChildStates(k) {
        await this.setObjectNotExistsAsync(k.alias, { type: 'device', common: { name: k.name }, native: {} });
        for (const day of ['today', 'next']) {
            await this.setObjectNotExistsAsync(`${k.alias}.${day}`, { type: 'channel', common: { name: day }, native: {} });
            for (const [id, role, name] of [
                ['lessons', 'json', 'Lessons (JSON list)'], ['changes', 'json', 'Substitutions / changes (JSON list)'],
                ['text', 'text', 'Timetable as text'], ['end', 'text', 'End of the last lesson that takes place ("Schluss")'],
                ['homework', 'json', 'Homework given on this day (JSON list)'], ['homeworkDue', 'json', 'Homework due on this day (JSON list)'],
            ]) {
                await this.setObjectNotExistsAsync(`${k.alias}.${day}.${id}`, { type: 'state', common: { name, role, type: 'string', read: true, write: false, def: '' }, native: {} });
            }
        }
        await this.setObjectNotExistsAsync(`${k.alias}.openHomework`, { type: 'state', common: { name: 'Open homework: due today or later, soonest first (JSON list)', role: 'json', type: 'string', read: true, write: false, def: '[]' }, native: {} });
        for (const day of ['today', 'next']) {
            await this.setObjectNotExistsAsync(`${k.alias}.${day}.lunch`, { type: 'state', common: { name: `${day}: this child's lunch order (JSON {code, label, dish}, '' = none)`, role: 'json', type: 'string', read: true, write: false, def: '' }, native: {} });
        }
        await this.setObjectNotExistsAsync(`${k.alias}.next.date`, { type: 'state', common: { name: 'Date of the next school day (YYYY-MM-DD)', role: 'text', type: 'string', read: true, write: false, def: '' }, native: {} });
        await this.setObjectNotExistsAsync(`${k.alias}.next.label`, { type: 'state', common: { name: 'Button label: "Morgen" or the weekday', role: 'text', type: 'string', read: true, write: false, def: '' }, native: {} });
    }
    /** 0.0.1 had `<child>.tomorrow.*` and `canteen.tomorrow.*` (0.0.2: `next.*`); the `.html` states were never filled (0.0.8: removed). */
    async removeObsoleteTomorrow() {
        // by pattern: canteen.tomorrow.* were states without a channel object, so deleting the parent misses them
        const old = await this.getForeignObjectsAsync(`${this.namespace}.*`);
        for (const id of Object.keys(old).filter((i) => /\.tomorrow(\.|$)|\.(today|next)\.html$/.test(i)).sort().reverse())
            await this.delForeignObjectAsync(id);
    }
    async createCanteenStates() {
        await this.setObjectNotExistsAsync('canteen', { type: 'channel', common: { name: 'Canteen' }, native: {} });
        for (const day of ['today', 'next']) {
            for (const [id, role, name] of [['menu', 'json', 'Menu (JSON)'], ['text', 'text', 'Menu as text']]) {
                await this.setObjectNotExistsAsync(`canteen.${day}.${id}`, { type: 'state', common: { name: `${day}: ${name}`, role, type: 'string', read: true, write: false, def: '' }, native: {} });
            }
        }
    }
    schedule() {
        if (this.timer)
            this.clearTimeout(this.timer);
        const jitter = Math.floor(Math.random() * 120000);
        this.timer = this.setTimeout(() => void this.poll(), this.cfg.pollMinutes * 60000 + jitter);
    }
    async poll() {
        if (this.blocked)
            return;
        this.nextSchoolDay = '';
        this.canteenWeek = [];
        try {
            for (const acc of [1, 2]) {
                const kids = this.cfg.children.filter((k) => (k.account || 1) === acc);
                if (!kids.length)
                    continue;
                try {
                    await this.pollAccount(acc, kids);
                }
                catch (e) {
                    if (!(e instanceof edupage_1.SessionExpired))
                        throw e;
                    this.sessions.delete(acc); // session ran out during the run: once more (restore or one guarded login)
                    await this.pollAccount(acc, kids);
                }
            }
            await this.pollCanteen();
            await this.setStateAsync('info.connection', true, true);
            await this.setStateAsync('info.lastError', '', true);
            await this.setStateAsync('info.lastSuccess', Date.now(), true);
        }
        catch (e) {
            const code = e.code ?? 'error';
            await this.setStateAsync('info.connection', false, true);
            await this.setStateAsync('info.lastError', `${code}: ${e.message}`, true);
            if (['login_failed', 'captcha', 'twofactor', 'protocol_changed', 'child_not_found'].includes(code)) {
                this.blocked = true; // never hammer the account: wait for control.retry
                this.log.error(`${e.message}. Stopped. Fix it (e.g. solve the captcha in the browser), then press control.retry.`);
                return;
            }
            this.log.warn(`update failed: ${e.message}`);
        }
        this.schedule();
    }
    /** Session for an account: reuse (memory → stored encrypted PHPSESSID) or one password login, at most once per hour. */
    async session(acc) {
        const have = this.sessions.get(acc);
        if (have?.gsechash)
            return have;
        const user = acc === 1 ? this.cfg.account1Username : this.cfg.account2Username;
        const pass = acc === 1 ? this.cfg.account1Password : this.cfg.account2Password;
        const s = new edupage_1.EdupageSession(this.cfg.school, user);
        const id = `accounts.${acc}`;
        const stored = (await this.getStateAsync(`${id}.session`))?.val;
        if (typeof stored === 'string' && stored && (await s.restore(this.decrypt(stored)))) {
            this.sessions.set(acc, s);
            return s;
        }
        const last = Number((await this.getStateAsync(`${id}.lastLogin`))?.val) || 0;
        if (Date.now() - last < HOUR) {
            throw Object.assign(new Error(`account ${acc}: last password login ${Math.round((Date.now() - last) / 60000)} min ago, waiting (max. 1 per hour)`), { code: 'login_wait' });
        }
        await this.setStateAsync(`${id}.lastLogin`, Date.now(), true);
        await s.login(pass); // throws on any refusal, never a second attempt
        if (s.sessionId)
            await this.setStateAsync(`${id}.session`, this.encrypt(s.sessionId), true);
        this.sessions.set(acc, s);
        return s;
    }
    async pollAccount(acc, kids) {
        const s = await this.session(acc);
        await this.setStateAsync(`debug.account${acc}`, JSON.stringify((0, structure_1.describe)(s.userhome)), true);
        const now = new Date(), today = ymd(now);
        const until = ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() + LOOKAHEAD_DAYS, 12));
        for (const k of kids) {
            const st = s.findStudent(k.name);
            if (!st) {
                throw Object.assign(new Error(`account ${acc}: no child "${k.name}" (found: ${s.students().map((x) => x.name).join(', ') || 'none'})`), { code: 'child_not_found' });
            }
            if (s.isParent)
                await s.switchChild(st.id);
            const plain = (0, lessons_1.toLessons)(await s.timetable(st.id, today, until), s.userhome);
            const next = (0, lessons_1.nextSchoolDay)(plain, today);
            if (next && (!this.nextSchoolDay || next < this.nextSchoolDay))
                this.nextSchoolDay = next;
            const { register, homework } = await this.extras(s, k, today, next || today);
            const lessons = (0, lessons_1.enrich)(plain, register, homework);
            await this.setStateAsync(`${k.alias}.openHomework`, JSON.stringify((0, lessons_1.openHomework)(homework, today, s.userhome)), true);
            await this.childLunch(s, k, today, next);
            await this.setStateAsync(`${k.alias}.next.date`, next, true);
            await this.setStateAsync(`${k.alias}.next.label`, (0, lessons_1.dayLabel)(next, today), true);
            for (const [day, date] of [['today', today], ['next', next]]) {
                const l = date ? lessons.filter((x) => x.date === date) : [];
                await this.setStateAsync(`${k.alias}.${day}.lessons`, JSON.stringify(l), true);
                await this.setStateAsync(`${k.alias}.${day}.changes`, JSON.stringify(l.filter((x) => x.cancelled || x.changed)), true);
                await this.setStateAsync(`${k.alias}.${day}.text`, (0, lessons_1.toText)(l), true);
                await this.setStateAsync(`${k.alias}.${day}.end`, (0, lessons_1.lastEnd)(l), true);
                await this.setStateAsync(`${k.alias}.${day}.homework`, JSON.stringify((0, lessons_1.homeworkGiven)(homework, date, s.userhome)), true);
                await this.setStateAsync(`${k.alias}.${day}.homeworkDue`, JSON.stringify((0, lessons_1.homeworkDue)(homework, date, s.userhome)), true);
            }
        }
    }
    /**
     * The menu page carries the CURRENT child's order, so it is fetched per child (right after the child switch for the
     * timetable). Optional: failures only warn. The menus themselves are the same for all children → kept for pollCanteen.
     */
    async childLunch(s, k, today, next) {
        let week = [];
        try {
            week = await s.menuWeek(today);
            if (next && !week.some((d) => d.date === next))
                week = week.concat(await s.menuWeek(next)); // next school day in another week
        }
        catch (e) {
            this.log.warn(`${k.alias}: canteen not available (${e.message})`);
            return;
        }
        if (!this.canteenWeek.length)
            this.canteenWeek = week;
        for (const [day, date] of [['today', today], ['next', next]]) {
            const l = week.find((d) => d.date === date);
            const m = l && l.cooking && l.ordered ? l.menus.find((x) => x.code === l.ordered) : undefined;
            await this.setStateAsync(`${k.alias}.${day}.lunch`, m ? JSON.stringify({ code: m.code, label: m.label, dish: m.dish }) : '', true);
        }
    }
    /** Canteen (same for the whole school, verified live 2026-11-13): today + next school day, from the children's fetch. */
    async pollCanteen() {
        const today = ymd(new Date()), next = this.nextSchoolDay;
        const week = this.canteenWeek;
        if (!week.length)
            return;
        for (const [day, date] of [['today', today], ['next', next]]) {
            const lunch = week.find((d) => d.date === date) ?? null;
            // shared state: without the order (that is per child, in <child>.<day>.lunch)
            await this.setStateAsync(`canteen.${day}.menu`, lunch ? JSON.stringify({ ...lunch, ordered: undefined }) : '', true);
            await this.setStateAsync(`canteen.${day}.text`, (0, lessons_1.canteenText)(lunch), true);
        }
    }
    /**
     * Homework list + class register (lesson topics) for the current child. Optional: the timetable is the source of
     * truth, so any failure here only logs a warning and leaves topic/homework empty. An expired session still bubbles up.
     */
    async extras(s, k, from, to) {
        let register = [], homework = [];
        try {
            homework = await s.homeworks();
        }
        catch (e) {
            if (e instanceof edupage_1.SessionExpired)
                throw e;
            this.log.warn(`${k.alias}: homework not available (${e.message})`);
        }
        try {
            register = await s.classbook(from, to);
        }
        catch (e) {
            if (e instanceof edupage_1.SessionExpired)
                throw e;
            this.log.warn(`${k.alias}: class register not available (${e.message})`);
        }
        return { register, homework };
    }
    async onStateChange(id, state) {
        if (!state || state.ack || !id.endsWith('control.retry'))
            return;
        this.blocked = false;
        this.sessions.clear();
        for (const acc of [1, 2])
            await this.setStateAsync(`accounts.${acc}.lastLogin`, 0, true); // manual retry may log in right away
        await this.setStateAsync('info.lastError', '', true);
        await this.setStateAsync('control.retry', false, true);
        await this.poll();
    }
    onUnload(callback) {
        try {
            if (this.timer)
                this.clearTimeout(this.timer);
        }
        finally {
            callback();
        }
    }
}
exports.EdupageNg = EdupageNg;
if (require.main !== module) {
    // ioBroker loads the adapter as a factory; keep the class reachable for tests
    module.exports = Object.assign((options) => new EdupageNg(options), { EdupageNg });
}
else {
    (() => new EdupageNg())();
}
//# sourceMappingURL=main.js.map