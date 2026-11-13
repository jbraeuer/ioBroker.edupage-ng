/**
 * A fake EduPage server for tests (docs/protocol.md). Synthetic data only: no real school, child or teacher names.
 * Modes: ok · badpassword · captcha · twofactor. Counts requests so tests can check the login discipline.
 */
import { createServer, IncomingMessage, Server, ServerResponse } from 'node:http';
import { AddressInfo } from 'node:net';
import { decodeEqapBody } from './eqap';

export type FakeMode = 'ok' | 'badpassword' | 'captcha' | 'twofactor';

export const FAKE_HOME = {
    userid: 'Rodic-900',
    dp: { year: 2026 },
    parentStudentids: ['501', '502'],
    dbi: {
        // like the real answer: a parent sees whole classes; 503 is someone else's child with a similar name
        students: { '501': { id: '501', firstname: 'Kid', lastname: 'Alpha', classid: '71' }, '502': { id: '502', firstname: 'Kid', lastname: 'Beta', classid: '72' },
            '503': { id: '503', firstname: 'Kid', lastname: 'Alpha Other', classid: '71' } },
        subjects: { '11': { name: 'Mathematik', short: 'Ma' }, '12': { name: 'Englisch', short: 'En' }, '13': { name: 'Sport', short: 'Sp' } },
        teachers: { '21': { firstname: 'T.', lastname: 'One' }, '22': { firstname: 'T.', lastname: 'Two' } },
        classrooms: { '31': { name: 'R 101' }, '32': { name: 'Halle' } },
        classes: { '71': { name: '9x' }, '72': { name: '7y' } },
    },
};

export class FakeEdupage {
    public mode: FakeMode = 'ok';
    public log: string[] = [];
    public sessions = new Set<string>();
    public expireSessions = false;
    public currentChild = '';
    private server: Server;
    private next = 1;

    public constructor() { this.server = createServer((q, r) => void this.handle(q, r)); }

    public async start(): Promise<string> {
        await new Promise<void>((res) => this.server.listen(0, '127.0.0.1', () => res()));
        return `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
    }
    public stop(): Promise<void> { return new Promise((res) => this.server.close(() => res())); }
    public count(prefix: string): number { return this.log.filter((l) => l.startsWith(prefix)).length; }

    private page(res: ServerResponse): void {
        res.end(`<html><script>ASC.gsechash="gsh-${this.next}";</script><script>userhome(${JSON.stringify(FAKE_HOME)});</script></html>`);
    }

    private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        const body = Buffer.concat(chunks).toString('utf8');
        const url = new URL(req.url ?? '/', 'http://x');
        const key = `${req.method} ${url.pathname}${url.searchParams.get('akcia') ? '?akcia=' + url.searchParams.get('akcia') : ''}`;
        this.log.push(key);
        const sid = /PHPSESSID=([^;]+)/.exec(req.headers.cookie ?? '')?.[1];
        const valid = !!sid && this.sessions.has(sid) && !this.expireSessions;

        if (key === 'GET /login/') { res.setHeader('set-cookie', `PHPSESSID=s${this.next++}; path=/`); return void res.end('<html>login</html>'); }
        if (key === 'POST /login/?akcia=getToken') return void res.end(JSON.stringify({ token: 'tok-1' }));
        if (key === 'POST /login/?akcia=login') {
            const args = JSON.parse(decodeEqapBody(body).rpcparams);
            if (this.mode === 'badpassword' || args.password !== 'secret') return void res.end(JSON.stringify({ status: 'FAIL', err: { error_id: 'bad', error_text: 'Wrong username or password' } }));
            if (this.mode === 'captcha') return void res.end(JSON.stringify({ status: 'FAIL', needCaptcha: '1', err: { error_text: 'captcha required' } }));
            if (sid) this.sessions.add(sid);
            return void res.end(JSON.stringify({ status: 'OK', redirectUrl: this.mode === 'twofactor' ? '/login/twofactor?x=1' : '/user/' }));
        }
        if (url.pathname === '/user/') {
            if (!valid) { res.writeHead(302, { location: '/login/' }); return void res.end(); }
            return this.page(res);
        }
        if (url.pathname === '/login/twofactor') return void res.end('<html>2fa</html>');
        if (url.pathname === '/login/switchchild') {
            if (!valid) return void res.end('ERR');
            this.currentChild = url.searchParams.get('studentid') ?? '';
            return void res.end('OK');
        }
        if (url.pathname === '/timetable/server/currenttt.js') {
            if (!valid) return void res.end(JSON.stringify({ reload: true }));
            const { __args } = JSON.parse(body);
            const id = __args[1].id;
            const items = id === '501'
                ? [
                    { date: __args[1].datefrom, uniperiod: '1', starttime: '08:00', endtime: '08:45', subjectid: '11', teacherids: ['21'], classroomids: ['31'], type: 'card' },
                    { date: __args[1].datefrom, uniperiod: '2', starttime: '08:50', endtime: '09:35', subjectid: '12', teacherids: ['22'], classroomids: ['31'], type: 'card', flags: { dp0: { note_wd: 'Vertretung' } } },
                    { date: __args[1].datefrom, uniperiod: '3', starttime: '09:55', endtime: '10:40', subjectid: '13', teacherids: ['21'], classroomids: ['32'], type: 'card', removed: true },
                ]
                : [{ date: __args[1].datefrom, uniperiod: '1', starttime: '08:00', endtime: '08:45', subjectid: '11', teacherids: ['22'], classroomids: ['31'], type: 'card' }];
            return void res.end(JSON.stringify({ r: { ttitems: items } }));
        }
        res.writeHead(404); res.end('not found');
    }
}
