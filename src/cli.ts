/**
 * Live check for one parent account (milestone tests). Run it yourself in a terminal:
 *   node build/cli.js --school <subdomain> --user <username> --child "First Last" [--child "…"]
 * The password is asked for interactively (not echoed, not stored). Exactly ONE password login.
 * Output is privacy-safe: structure and counts only, no names, no lessons, no session id.
 */
import { createInterface } from 'node:readline';
import { EdupageSession } from './lib/edupage';
import { toLessons } from './lib/lessons';

function arg(name: string): string[] {
    const out: string[] = [];
    process.argv.forEach((a, i) => { if (a === `--${name}` && process.argv[i + 1]) out.push(process.argv[i + 1]); });
    return out;
}

function askHidden(q: string): Promise<string> {
    return new Promise((resolve) => {
        const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
        const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
        out._writeToOutput = (s: string) => { if (s.includes(q)) out.output.write(s); };
        rl.question(q, (a) => { rl.close(); process.stdout.write('\n'); resolve(a); });
    });
}

const keys = (items: Record<string, unknown>[]): string => [...new Set(items.flatMap((i) => Object.keys(i)))].sort().join(', ');
const ymd = (d: Date): string => d.toISOString().slice(0, 10);

(async () => {
    const [school] = arg('school'), [user] = arg('user'), children = arg('child');
    if (!school || !user) { console.log('usage: node build/cli.js --school <subdomain> --user <username> --child "First Last" …'); process.exit(2); }
    const s = new EdupageSession(school, user);
    const password = await askHidden('EduPage password (not shown, not stored): ');
    try {
        await s.login(password);
    } catch (e) {
        console.log(`✗ login: ${(e as { code?: string }).code ?? 'error'}: ${(e as Error).message}`);
        console.log(`  requests: ${s.http.requests}, password logins: ${s.passwordLogins}`);
        process.exit(1);
    }
    console.log(`✓ login OK · parent account: ${s.isParent ? 'yes' : 'no'} · school year: ${s.userhome?.dp?.year ?? '?'} · password logins: ${s.passwordLogins}`);
    console.log(`  userhome keys: ${Object.keys(s.userhome ?? {}).sort().join(', ')}`);
    console.log(`  dbi tables: ${Object.entries(s.userhome?.dbi ?? {}).map(([k, v]) => `${k}(${Object.keys(v ?? {}).length})`).join(', ')}`);
    const st = s.students();
    console.log(`  students visible: ${st.length} · fields of one entry: ${Object.keys(Object.values(s.userhome?.dbi?.students ?? {})[0] ?? {}).sort().join(', ')}`);
    for (const [i, name] of children.entries()) {
        const kid = s.findStudent(name);
        if (!kid) { console.log(`✗ child #${i + 1}: not found by name (check spelling as shown in EduPage)`); continue; }
        try {
            if (s.isParent) await s.switchChild(kid.id);
            const items = await s.timetable(kid.id, ymd(new Date()), ymd(new Date(Date.now() + 864e5)));
            const lessons = toLessons(items, s.userhome);
            console.log(`✓ child #${i + 1}: found · switchchild ${s.isParent ? 'OK' : 'n/a'} · timetable items today+tomorrow: ${items.length}` +
                ` · cancelled: ${lessons.filter((l) => l.cancelled).length} · changed: ${lessons.filter((l) => l.changed).length}` +
                ` · without subject name: ${lessons.filter((l) => !l.subject).length}`);
            console.log(`  item fields: ${keys(items)}`);
            console.log(`  item types: ${[...new Set(items.map((x) => String(x.type)))].join(', ')}`);
        } catch (e) {
            console.log(`✗ child #${i + 1}: ${(e as { code?: string }).code ?? 'error'}: ${(e as Error).message}`);
        }
    }
    console.log(`requests total: ${s.http.requests}`);
})();
