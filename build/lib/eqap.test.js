"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_crypto_1 = require("node:crypto");
const node_zlib_1 = require("node:zlib");
const eqap_1 = require("./eqap");
(0, node_test_1.test)('eqap body: dz: prefix, sha1 checksum over eqap, eqaz=1, round trip', () => {
    const body = (0, eqap_1.encodeEqapBody)({ rpcparams: '{"username":"parent","edupage":""}' });
    const outer = Object.fromEntries(new URLSearchParams(body));
    strict_1.default.ok(outer.eqap.startsWith('dz:'));
    strict_1.default.equal(outer.eqacs, (0, node_crypto_1.createHash)('sha1').update(outer.eqap).digest('hex'));
    strict_1.default.equal(outer.eqaz, '1');
    strict_1.default.deepEqual((0, eqap_1.decodeEqapBody)(body), { rpcparams: '{"username":"parent","edupage":""}' });
});
(0, node_test_1.test)('eqap body: umlauts and special characters survive', () => {
    const args = { username: 'Jürgen+Äöü&=?', password: 'p@ss wörd%', edupage: '' };
    strict_1.default.deepEqual(JSON.parse((0, eqap_1.decodeEqapBody)((0, eqap_1.rpcBody)(args)).rpcparams), args);
});
(0, node_test_1.test)('eqap body: tampered checksum is rejected', () => {
    const body = (0, eqap_1.encodeEqapBody)({ a: '1' }).replace(/eqacs=[0-9a-f]/, 'eqacs=z');
    strict_1.default.throws(() => (0, eqap_1.decodeEqapBody)(body), /checksum/);
});
(0, node_test_1.test)('response: plain JSON passes through', () => {
    strict_1.default.equal((0, eqap_1.decodeResponse)('{"status":"OK"}'), '{"status":"OK"}');
});
(0, node_test_1.test)('response: eqz: base64 (plain and raw-deflated) is decoded', () => {
    const json = '{"token":"t-123"}';
    strict_1.default.equal((0, eqap_1.decodeResponse)('eqz:' + Buffer.from(json).toString('base64')), json);
    strict_1.default.equal((0, eqap_1.decodeResponse)('eqz:' + (0, node_zlib_1.deflateRawSync)(Buffer.from(json)).toString('base64')), json);
});
(0, node_test_1.test)('response: eqwd: is an error', () => {
    strict_1.default.throws(() => (0, eqap_1.decodeResponse)('eqwd:' + Buffer.from('bad request').toString('base64')), (e) => e instanceof eqap_1.EdupageWireError && /bad request/.test(e.message));
});
//# sourceMappingURL=eqap.test.js.map