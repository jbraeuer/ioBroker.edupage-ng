"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const structure_1 = require("./structure");
(0, node_test_1.test)('describe(): shape only, no content leaks', () => {
    const secret = 'Mathe S. 12 Nr. 3 – Anna Beispiel';
    const s = (0, structure_1.describe)({
        userid: 'Rodic123', dbi: { subjects: { '1': { name: 'Mathe' } }, students: { '7': { firstname: 'Anna' } } },
        items: [
            { typ: 'homework', text: secret, cas_pridania: '2026-11-12 10:00:00', data: JSON.stringify({ title: secret, predmetid: '1', popis: secret, date: '2026-11-13' }) },
            { typ: 'homework', text: secret, timestamp: '2026-11-13 09:00:00', data: {} },
            { typ: 'sprava', text: secret, timestamp: '2026-11-10 08:00:00' },
        ],
    });
    const out = JSON.stringify(s);
    for (const bad of ['Mathe', 'Anna', 'Nr. 3', 'Rodic123'])
        strict_1.default.ok(!out.includes(bad), `leaks "${bad}"`);
    strict_1.default.deepEqual(s.items.byType, { homework: 2, sprava: 1 });
    strict_1.default.deepEqual(s.items.dataFields.homework, ['date', 'popis', 'predmetid', 'title']);
    strict_1.default.deepEqual(s.homework, [{ addedToDateDays: 1, subjectKnown: true, hasDescription: true }, { addedToDateDays: null, subjectKnown: false, hasDescription: false }]);
    strict_1.default.deepEqual(s.items.dates, { from: '2026-11-10', to: '2026-11-13' });
    strict_1.default.deepEqual(s.dbiTables, { subjects: 1, students: 1 });
    strict_1.default.equal(s.userhome.items, 'array(3)');
});
(0, node_test_1.test)('describe(): null userhome', () => {
    strict_1.default.equal((0, structure_1.describe)(null).items.count, 0);
});
(0, node_test_1.test)('F-0035: substitution items and changed lessons: shape only, masked text, no names or codes', () => {
    const s = (0, structure_1.describe)({
        dbi: { teachers: { '22': { firstname: 'Felix', lastname: 'Beyer', short: 'FB', id: '22' } } },
        items: [{ typ: 'substitution', text: '3. Std WAT: RB ➔ FB', user: 'Ucitel22', data: JSON.stringify({ '2026-11-16': [{ period: '4', teacherids: ['22'], text: 'RB ➔ FB' }] }) }],
    });
    const out = JSON.stringify(s);
    for (const bad of ['RB', 'FB', 'WAT', 'Felix', 'Beyer', 'Ucitel22'])
        strict_1.default.ok(!out.includes(bad), `leaks "${bad}"`);
    strict_1.default.deepEqual(s.substitution[0], {
        text: 'str:9. Aaa AAA: AA ➔ AA', user: 'str:Aaaaaa99', target_user: 'undefined',
        data: { DATE: { 'array(1)': [{ period: 'str:9', teacherids: { 'array(1)': ['str:99'] }, text: 'str:AA ➔ AA' }] } },
    });
    strict_1.default.deepEqual(s.teacherKeys, ['firstname', 'id', 'lastname', 'short']);
    const c = JSON.stringify((0, structure_1.describeChanged)([{ subjectid: '12', teacherids: ['22'], changed: true, flags: {} }, { subjectid: '1' }]));
    strict_1.default.ok(!c.includes('"12"') && c.includes('teacherids') && c.includes('changed'), c);
    strict_1.default.equal((0, structure_1.mask)('\u00c4 \u00f6 9:x'), 'A a 9:a');
});
(0, node_test_1.test)('F-0035: skeleton keeps tags and classes, masks every text', () => {
    const k = (0, structure_1.skeleton)('<div class="section print-nobreak"><div class="header"><span>6b Anna</span></div><a href="x?u=Anna">Mehr</a></div>');
    strict_1.default.equal(k, '<div.section.print-nobreak><div.header><span>9a Aaaa</span></div><a>Aaaa</a></div>');
    strict_1.default.ok(!k.includes('Anna'));
});
(0, node_test_1.test)('F-0035: siblings of a changed lesson and the daily plan: shapes only', () => {
    const items = [
        { date: '2026-11-16', uniperiod: '4', subjectid: '9', teacherids: ['22'], changed: true },
        { date: '2026-11-16', uniperiod: '4', subjectid: '9', teacherids: ['11'], removed: true },
        { date: '2026-11-16', uniperiod: '5', subjectid: '3', teacherids: ['33'] },
    ];
    const sib = (0, structure_1.describeSiblings)(items);
    strict_1.default.equal(sib[0].count, 2);
    strict_1.default.ok(!JSON.stringify(sib).includes('"22"') && JSON.stringify(sib).includes('removed'));
    const dp = (0, structure_1.describeDailyPlan)({ dp: { year: 2026, dates: { '2026-11-16': { plan: [{ txt: 'x', header: [] }, { header: [{ text: 'RB FB' }] }] } } } });
    strict_1.default.deepEqual([dp.perDate[0].entries, dp.perDate[0].busy], [2, 1]);
    strict_1.default.deepEqual(dp.top, { year: 'number', dates: 'object(1)' });
    strict_1.default.ok(!JSON.stringify(dp).includes('RB'));
    strict_1.default.equal((0, structure_1.describeDailyPlan)(null), null);
});
//# sourceMappingURL=structure.test.js.map