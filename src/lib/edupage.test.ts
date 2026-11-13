import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { CaptchaRequired, EdupageSession, jsonObjectAt, LoginFailed, parseAppPage, SessionExpired, TwoFactorRequired } from './edupage';
import { FakeEdupage } from './fake-edupage';
import { lastEnd, toLessons, toText } from './lessons';

const fake = new FakeEdupage();
let base = '';
before(async () => { base = await fake.start(); });
after(() => fake.stop());
beforeEach(() => { fake.mode = 'ok'; fake.log = []; fake.expireSessions = false; });

const session = () => new EdupageSession('fakeschool', 'parent', base);

test('page parser: finds userhome JSON (with braces inside strings) and gsechash', () => {
    const html = 'x userhome({"a":"}{","b":{"c":1}}); ASC.gsechash="abc";';
    assert.deepEqual(parseAppPage(html), { userhome: { a: '}{', b: { c: 1 } }, gsechash: 'abc' });
    assert.equal(parseAppPage('<html>login</html>'), null);
    assert.equal(jsonObjectAt('  {"x":"\\"}"}', 0), '{"x":"\\"}"}');
});

test('login: OK → parent account, gsechash, both students, exactly one password POST', async () => {
    const s = session();
    await s.login('secret');
    assert.ok(s.isParent);
    assert.match(s.gsechash, /^gsh-/);
    assert.deepEqual(s.students().map((x) => x.name), ['Kid Alpha', 'Kid Beta']);   // 503 (not own child) filtered out
    assert.equal(s.findStudent('Kid Alpha Other'), undefined, 'must not find a child that is not on this parent account');
    assert.equal(fake.count('POST /login/?akcia=login'), 1);
    assert.ok(s.sessionId);
});

test('login: wrong password → LoginFailed after ONE attempt, no fallback login', async () => {
    fake.mode = 'badpassword';
    await assert.rejects(session().login('wrong'), LoginFailed);
    assert.equal(fake.count('POST /login/?akcia=login'), 1);
    assert.equal(fake.log.filter((l) => l.includes('edubarLogin')).length, 0);
});

test('login: captcha and 2FA are recognised and stop', async () => {
    fake.mode = 'captcha';
    await assert.rejects(session().login('secret'), CaptchaRequired);
    fake.mode = 'twofactor';
    await assert.rejects(session().login('secret'), TwoFactorRequired);
    assert.equal(fake.count('POST /login/?akcia=login'), 2);
});

test('session reuse: restore() with a valid PHPSESSID needs no password login', async () => {
    const a = session();
    await a.login('secret');
    fake.log = [];
    const b = session();
    assert.equal(await b.restore(a.sessionId!), true);
    assert.equal(fake.count('POST /login/?akcia=login'), 0);
    assert.ok(b.gsechash);
});

test('session reuse: an expired session → restore() false, a JSON call → SessionExpired', async () => {
    const a = session();
    await a.login('secret');
    fake.expireSessions = true;
    assert.equal(await session().restore(a.sessionId!), false);
    await assert.rejects(a.timetable('501', '2026-11-13', '2026-11-14'), SessionExpired);
});

test('parent: switch child, timetable → lessons with substitution + cancelled lesson, "Schluss"', async () => {
    const s = session();
    await s.login('secret');
    const kid = s.findStudent('kid alpha')!;
    assert.equal(kid.id, '501');
    await s.switchChild(kid.id);
    assert.equal(fake.currentChild, '501');
    const lessons = toLessons(await s.timetable(kid.id, '2026-11-13', '2026-11-14'), s.userhome);
    assert.deepEqual(lessons.map((l) => [l.period, l.subject, l.room, l.cancelled, l.changed, l.note]), [
        ['1', 'Mathematik', 'R 101', false, false, ''],
        ['2', 'Englisch', 'R 101', false, true, 'Vertretung'],
        ['3', 'Sport', 'Halle', true, false, 'fällt aus'],
    ]);
    assert.equal(lessons[0].teacher, 'T. One');
    assert.equal(lastEnd(lessons), '09:35');
    assert.match(toText(lessons), /3 09:55 Sport Halle \(fällt aus\)/);
});
