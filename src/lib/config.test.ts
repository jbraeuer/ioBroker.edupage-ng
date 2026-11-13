import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from './config';

const ok = {
    school: 'myschool', account1Username: 'parent1', account1Password: 'x', account2Username: '', account2Password: '',
    children: [{ alias: 'kid1', name: 'Kid One', account: 1 as const }], pollMinutes: 30,
};

test('config: a minimal valid config has no errors', () => {
    assert.deepEqual(validateConfig(ok), []);
});

test('config: catches the usual mistakes', () => {
    const errs = validateConfig({
        ...ok, school: 'https://x.edupage.org', account2Username: 'p2', pollMinutes: 5,
        children: [{ alias: 'Kid 1', name: 'A', account: 1 }, { alias: 'b', name: 'B', account: 2 }, { alias: 'b', name: 'C', account: 1 }],
    });
    for (const want of ['school', 'account 2: username and password', 'alias must be', 'used twice', 'pollMinutes']) {
        assert.ok(errs.some((e) => e.includes(want)), `missing error "${want}" in ${JSON.stringify(errs)}`);
    }
});
