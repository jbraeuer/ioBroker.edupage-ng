import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { deflateRawSync } from 'node:zlib';
import { decodeEqapBody, decodeResponse, EdupageWireError, encodeEqapBody, rpcBody } from './eqap';

test('eqap body: dz: prefix, sha1 checksum over eqap, eqaz=1, round trip', () => {
    const body = encodeEqapBody({ rpcparams: '{"username":"parent","edupage":""}' });
    const outer = Object.fromEntries(new URLSearchParams(body));
    assert.ok(outer.eqap.startsWith('dz:'));
    assert.equal(outer.eqacs, createHash('sha1').update(outer.eqap).digest('hex'));
    assert.equal(outer.eqaz, '1');
    assert.deepEqual(decodeEqapBody(body), { rpcparams: '{"username":"parent","edupage":""}' });
});

test('eqap body: umlauts and special characters survive', () => {
    const args = { username: 'Jürgen+Äöü&=?', password: 'p@ss wörd%', edupage: '' };
    assert.deepEqual(JSON.parse(decodeEqapBody(rpcBody(args)).rpcparams), args);
});

test('eqap body: tampered checksum is rejected', () => {
    const body = encodeEqapBody({ a: '1' }).replace(/eqacs=[0-9a-f]/, 'eqacs=z');
    assert.throws(() => decodeEqapBody(body), /checksum/);
});

test('response: plain JSON passes through', () => {
    assert.equal(decodeResponse('{"status":"OK"}'), '{"status":"OK"}');
});

test('response: eqz: base64 (plain and raw-deflated) is decoded', () => {
    const json = '{"token":"t-123"}';
    assert.equal(decodeResponse('eqz:' + Buffer.from(json).toString('base64')), json);
    assert.equal(decodeResponse('eqz:' + deflateRawSync(Buffer.from(json)).toString('base64')), json);
});

test('response: eqwd: is an error', () => {
    assert.throws(() => decodeResponse('eqwd:' + Buffer.from('bad request').toString('base64')), (e: unknown) => e instanceof EdupageWireError && /bad request/.test((e as Error).message));
});
