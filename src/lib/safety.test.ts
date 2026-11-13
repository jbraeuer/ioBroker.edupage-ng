// Read-only guard (docs/protocol.md §6): the adapter must never order, cancel or rate meals and never send a second
// password attempt after a failed login. This test fails the build if forbidden calls show up in the source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..', 'src');
const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith('.ts') && !f.endsWith('.test.ts') ? [join(dir, f)] : []));

test('no meal ordering / cancelling / rating calls in the source', () => {
    for (const f of files(SRC)) {
        const s = readFileSync(f, 'utf8');
        for (const bad of ['ulozJedlaStravnika', 'ulozHodnotenia', 'edubarLogin.php']) {
            assert.ok(!s.includes(bad), `${f} contains forbidden call ${bad}`);
        }
        assert.ok(!/post[^\n]*['"`]\/menu\//i.test(s), `${f} POSTs to /menu/ (would order meals)`);
    }
});

// The lockfile must only point at the public npm registry. A dev machine behind a corporate registry proxy writes
// the proxy host into "resolved", and installs on ioBroker (git dep preparation uses the lockfile) then time out.
test('package-lock.json resolves only from registry.npmjs.org', () => {
    const lock = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package-lock.json'), 'utf8'));
    for (const [name, pkg] of Object.entries<{ resolved?: string }>(lock.packages ?? {})) {
        if (pkg.resolved) assert.ok(pkg.resolved.startsWith('https://registry.npmjs.org/'), `${name || 'root'} resolves from ${pkg.resolved}`);
    }
});
