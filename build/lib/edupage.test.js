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
//# sourceMappingURL=edupage.test.js.map