import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe } from './structure';

test('describe(): shape only, no content leaks', () => {
    const secret = 'Mathe S. 12 Nr. 3 – Anna Beispiel';
    const s = describe({
        userid: 'Rodic123', dbi: { subjects: { '1': { name: 'Mathe' } }, students: { '7': { firstname: 'Anna' } } },
        items: [
            { typ: 'homework', text: secret, cas_pridania: '2026-11-12 10:00:00', data: JSON.stringify({ title: secret, predmetid: '1', popis: secret, date: '2026-11-13' }) },
            { typ: 'homework', text: secret, timestamp: '2026-11-13 09:00:00', data: {} },
            { typ: 'sprava', text: secret, timestamp: '2026-11-10 08:00:00' },
        ],
    } as never);
    const out = JSON.stringify(s);
    for (const bad of ['Mathe', 'Anna', 'Nr. 3', 'Rodic123']) assert.ok(!out.includes(bad), `leaks "${bad}"`);
    assert.deepEqual(s.items.byType, { homework: 2, sprava: 1 });
    assert.deepEqual(s.items.dataFields.homework, ['date', 'popis', 'predmetid', 'title']);
    assert.deepEqual(s.homework, [{ addedToDateDays: 1, subjectKnown: true, hasDescription: true }, { addedToDateDays: null, subjectKnown: false, hasDescription: false }]);
    assert.deepEqual(s.items.dates, { from: '2026-11-10', to: '2026-11-13' });
    assert.deepEqual(s.dbiTables, { subjects: 1, students: 1 });
    assert.equal(s.userhome.items, 'array(3)');
});

test('describe(): null userhome', () => {
    assert.equal(describe(null).items.count, 0);
});
