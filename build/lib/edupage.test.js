"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const edupage_1 = require("./edupage");
const fake_edupage_1 = require("./fake-edupage");
const lessons_1 = require("./lessons");
const fake = new fake_edupage_1.FakeEdupage();
let base = '';
(0, node_test_1.before)(async () => { base = await fake.start(); });
(0, node_test_1.after)(() => fake.stop());
(0, node_test_1.beforeEach)(() => { fake.mode = 'ok'; fake.log = []; fake.expireSessions = false; });
const session = () => new edupage_1.EdupageSession('fakeschool', 'parent', base);
(0, node_test_1.test)('page parser: finds userhome JSON (with braces inside strings) and gsechash', () => {
    const html = 'x userhome({"a":"}{","b":{"c":1}}); ASC.gsechash="abc";';
    strict_1.default.deepEqual((0, edupage_1.parseAppPage)(html), { userhome: { a: '}{', b: { c: 1 } }, gsechash: 'abc' });
    strict_1.default.equal((0, edupage_1.parseAppPage)('<html>login</html>'), null);
    strict_1.default.equal((0, edupage_1.jsonObjectAt)('  {"x":"\\"}"}', 0), '{"x":"\\"}"}');
});
(0, node_test_1.test)('login: OK → parent account, gsechash, both students, exactly one password POST', async () => {
    const s = session();
    await s.login('secret');
    strict_1.default.ok(s.isParent);
    strict_1.default.match(s.gsechash, /^gsh-/);
    strict_1.default.deepEqual(s.students().map((x) => x.name), ['Kid Alpha', 'Kid Beta']); // 503 (not own child) filtered out
    strict_1.default.equal(s.findStudent('Kid Alpha Other'), undefined, 'must not find a child that is not on this parent account');
    strict_1.default.equal(fake.count('POST /login/?akcia=login'), 1);
    strict_1.default.ok(s.sessionId);
});
(0, node_test_1.test)('login: wrong password → LoginFailed after ONE attempt, no fallback login', async () => {
    fake.mode = 'badpassword';
    await strict_1.default.rejects(session().login('wrong'), edupage_1.LoginFailed);
    strict_1.default.equal(fake.count('POST /login/?akcia=login'), 1);
    strict_1.default.equal(fake.log.filter((l) => l.includes('edubarLogin')).length, 0);
});
(0, node_test_1.test)('login: captcha and 2FA are recognised and stop', async () => {
    fake.mode = 'captcha';
    await strict_1.default.rejects(session().login('secret'), edupage_1.CaptchaRequired);
    fake.mode = 'twofactor';
    await strict_1.default.rejects(session().login('secret'), edupage_1.TwoFactorRequired);
    strict_1.default.equal(fake.count('POST /login/?akcia=login'), 2);
});
(0, node_test_1.test)('session reuse: restore() with a valid PHPSESSID needs no password login', async () => {
    const a = session();
    await a.login('secret');
    fake.log = [];
    const b = session();
    strict_1.default.equal(await b.restore(a.sessionId), true);
    strict_1.default.equal(fake.count('POST /login/?akcia=login'), 0);
    strict_1.default.ok(b.gsechash);
});
(0, node_test_1.test)('session reuse: an expired session → restore() false, a JSON call → SessionExpired', async () => {
    const a = session();
    await a.login('secret');
    fake.expireSessions = true;
    strict_1.default.equal(await session().restore(a.sessionId), false);
    await strict_1.default.rejects(a.timetable('501', '2026-11-13', '2026-11-14'), edupage_1.SessionExpired);
});
(0, node_test_1.test)('parent: switch child, timetable → lessons with substitution + cancelled lesson, "Schluss"', async () => {
    const s = session();
    await s.login('secret');
    const kid = s.findStudent('kid alpha');
    strict_1.default.equal(kid.id, '501');
    await s.switchChild(kid.id);
    strict_1.default.equal(fake.currentChild, '501');
    const lessons = (0, lessons_1.toLessons)(await s.timetable(kid.id, '2026-11-13', '2026-11-14'), s.userhome);
    strict_1.default.deepEqual(lessons.map((l) => [l.period, l.subject, l.room, l.cancelled, l.changed, l.note]), [
        ['1', 'Mathematik', 'R 101', false, false, ''],
        ['2', 'Englisch', 'R 101', false, true, 'Vertretung'],
        ['3', 'Sport', 'Halle', true, false, 'fällt aus'],
    ]);
    strict_1.default.equal(lessons[0].teacher, 'T. One');
    strict_1.default.equal((0, lessons_1.lastEnd)(lessons), '09:35');
    strict_1.default.match((0, lessons_1.toText)(lessons), /3 09:55 Sport Halle \(fällt aus\)/);
});
(0, node_test_1.test)('homework + class register (read only): parsed, merged into the lessons, only loadData is sent', async () => {
    const s = session();
    await s.login('secret');
    await s.switchChild('501');
    const hws = await s.homeworks();
    strict_1.default.deepEqual(hws.map((h) => [h.id, h.subjectId, h.given, h.due]), [['h1', '11', '2026-11-13', '2026-11-16'], ['h2', '12', '2026-11-10', '2026-11-16']]);
    const reg = await s.classbook('2026-11-13', '2026-11-13');
    strict_1.default.deepEqual(reg.map((r) => [r.start, r.subjectId, r.topic, r.homeworkIds]), [['08:00', '11', 'Brüche erweitern', ['h1']], ['08:50', '12', '', []]]);
    const lessons = (0, lessons_1.enrich)((0, lessons_1.toLessons)(await s.timetable('501', '2026-11-13', '2026-11-13'), s.userhome), reg, hws);
    strict_1.default.deepEqual(lessons.map((l) => [l.subject, l.topic, l.homework, l.cancelled]), [
        ['Mathematik', 'Brüche erweitern', ['Buch S. 12'], false], ['Englisch', '', [], false], ['Sport', '', [], true],
    ]);
    strict_1.default.deepEqual(fake.log.filter((x) => x.startsWith('gcall')), ['gcall action=loadData']);
    strict_1.default.equal(s.passwordLogins, 1);
});
(0, node_test_1.test)('homework / class register with an expired session → SessionExpired (no login loop)', async () => {
    const s = session();
    await s.login('secret');
    fake.expireSessions = true;
    await strict_1.default.rejects(s.homeworks(), (e) => e instanceof edupage_1.SessionExpired);
    await strict_1.default.rejects(s.classbook('2026-11-13', '2026-11-13'), (e) => e instanceof edupage_1.SessionExpired);
    fake.expireSessions = false;
});
(0, node_test_1.test)('canteen: one GET per week, S/W menus with labels, a non-cooking day, never a POST', async () => {
    const s = session();
    await s.login('secret');
    const week = await s.menuWeek('2026-11-17');
    strict_1.default.deepEqual(week.map((d) => d.date), ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
    const mon = week[0];
    strict_1.default.deepEqual([mon.cooking, mon.from, mon.to], [true, '11:55', '13:30']);
    strict_1.default.deepEqual(mon.menus, [
        { code: 'S', label: 'Standard-Essen', dish: 'Nudeln 2026-11-16', allergens: '1, 3' },
        { code: 'W', label: 'Wahl-Essen (vegetarisch)', dish: 'Gemüse 2026-11-16', allergens: '' },
    ]);
    strict_1.default.equal((0, lessons_1.canteenText)(mon), 'S: Nudeln 2026-11-16\nW: Gemüse 2026-11-16');
    strict_1.default.equal((0, lessons_1.canteenText)(week[2]), 'kein Mittagessen');
    strict_1.default.equal((0, lessons_1.canteenText)(null), '');
    strict_1.default.equal(fake.count('GET /menu/'), 1);
    strict_1.default.equal(fake.count('MENU WRITE'), 0);
});
(0, node_test_1.test)('canteen: expired session → SessionExpired, no login', async () => {
    const s = session();
    await s.login('secret');
    fake.expireSessions = true;
    await strict_1.default.rejects(s.menuWeek('2026-11-16'), (e) => e instanceof edupage_1.SessionExpired);
    strict_1.default.equal(s.passwordLogins, 1);
});
(0, node_test_1.test)('canteen: the current child\'s order (evidencia.obj A/B → menu S/W), per child', async () => {
    const s = session();
    await s.login('secret');
    await s.switchChild('501');
    let week = await s.menuWeek('2026-11-16');
    strict_1.default.deepEqual(week.map((d) => d.ordered), ['W', 'S', '', 'S', 'S']); // 18th: not cooking, no order
    await s.switchChild('502');
    week = await s.menuWeek('2026-11-16');
    strict_1.default.deepEqual(week.map((d) => d.ordered), ['S', 'S', '', 'S', '']);
});
//# sourceMappingURL=edupage.test.js.map