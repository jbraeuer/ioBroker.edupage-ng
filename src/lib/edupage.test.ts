import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { CaptchaRequired, EdupageSession, jsonObjectAt, LoginFailed, parseAppPage, SessionExpired, TwoFactorRequired } from './edupage';
import { FakeEdupage } from './fake-edupage';
import { canteenText, enrich, lastEnd, toLessons, toText } from './lessons';

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

test('homework + class register (read only): parsed, merged into the lessons, only loadData is sent', async () => {
    const s = session();
    await s.login('secret');
    await s.switchChild('501');
    const hws = await s.homeworks();
    assert.deepEqual(hws.map((h) => [h.id, h.subjectId, h.given, h.due]), [['h1', '11', '2026-11-13', '2026-11-16'], ['h2', '12', '2026-11-10', '2026-11-16']]);
    const reg = await s.classbook('2026-11-13', '2026-11-13');
    assert.deepEqual(reg.map((r) => [r.start, r.subjectId, r.topic, r.homeworkIds]), [['08:00', '11', 'Brüche erweitern', ['h1']], ['08:50', '12', '', []]]);
    const lessons = enrich(toLessons(await s.timetable('501', '2026-11-13', '2026-11-13'), s.userhome), reg, hws);
    assert.deepEqual(lessons.map((l) => [l.subject, l.topic, l.homework, l.cancelled]), [
        ['Mathematik', 'Brüche erweitern', ['Buch S. 12'], false], ['Englisch', '', [], false], ['Sport', '', [], true],
    ]);
    assert.deepEqual(fake.log.filter((x) => x.startsWith('gcall')), ['gcall action=loadData']);
    assert.equal(s.passwordLogins, 1);
});

test('homework / class register with an expired session → SessionExpired (no login loop)', async () => {
    const s = session();
    await s.login('secret');
    fake.expireSessions = true;
    await assert.rejects(s.homeworks(), (e: Error) => e instanceof SessionExpired);
    await assert.rejects(s.classbook('2026-11-13', '2026-11-13'), (e: Error) => e instanceof SessionExpired);
    fake.expireSessions = false;
});

test('canteen: one GET per week, S/W menus with labels, a non-cooking day, never a POST', async () => {
    const s = session();
    await s.login('secret');
    const week = await s.menuWeek('2026-11-17');
    assert.deepEqual(week.map((d) => d.date), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
    const mon = week[0];
    assert.deepEqual([mon.cooking, mon.from, mon.to], [true, '11:55', '13:30']);
    assert.deepEqual(mon.menus, [
        { code: 'S', label: 'Standard-Essen', dish: 'Nudeln 2026-11-16', allergens: '1, 3' },
        { code: 'W', label: 'Wahl-Essen (vegetarisch)', dish: 'Gemüse 2026-11-16', allergens: '' },
    ]);
    assert.equal(canteenText(mon), 'S: Nudeln 2026-11-16\nW: Gemüse 2026-11-16');
    assert.equal(canteenText(week[2]), 'kein Mittagessen');
    assert.equal(canteenText(null), '');
    assert.equal(fake.count('GET /menu/'), 1);
    assert.equal(fake.count('MENU WRITE'), 0);
});

test('canteen: expired session → SessionExpired, no login', async () => {
    const s = session();
    await s.login('secret');
    fake.expireSessions = true;
    await assert.rejects(s.menuWeek('2026-11-16'), (e: Error) => e instanceof SessionExpired);
    assert.equal(s.passwordLogins, 1);
});

test('canteen: the current child\'s order (evidencia.obj A/B → menu S/W), per child', async () => {
    const s = session();
    await s.login('secret');
    await s.switchChild('501');
    let week = await s.menuWeek('2026-11-16');
    assert.deepEqual(week.map((d) => d.ordered), ['W', 'S', '', 'S', 'S']);   // 18th: not cooking, no order
    await s.switchChild('502');
    week = await s.menuWeek('2026-11-16');
    assert.deepEqual(week.map((d) => d.ordered), ['S', 'S', '', 'S', '']);
});
