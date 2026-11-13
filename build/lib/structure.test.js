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
//# sourceMappingURL=structure.test.js.map