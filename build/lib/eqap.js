"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EdupageWireError = void 0;
exports.formEncode = formEncode;
exports.encodeEqapBody = encodeEqapBody;
exports.decodeEqapBody = decodeEqapBody;
exports.decodeResponse = decodeResponse;
exports.rpcBody = rpcBody;
/**
 * EduPage request/response wrapping for the login RPC ("eqap"). Written from the observed HTTP behaviour,
 * see docs/protocol.md §2.
 *
 * Request: form-encode the params, raw-deflate (no zlib header), base64, prefix "dz:" → eqap.
 *          eqacs = SHA-1 hex of the eqap string. Body = eqap=…&eqacs=…&eqaz=1 (form-encoded).
 * Response: "eqz:" + base64 → payload (possibly raw-deflated, unverified, so both are accepted),
 *           "eqwd:" + base64 → error text, anything else → plain text (usually JSON).
 */
const node_crypto_1 = require("node:crypto");
const node_zlib_1 = require("node:zlib");
function formEncode(params) {
    return Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
}
/** Wraps form params into the eqap body. Returns the body string to POST as application/x-www-form-urlencoded. */
function encodeEqapBody(params) {
    const eqap = 'dz:' + (0, node_zlib_1.deflateRawSync)(Buffer.from(formEncode(params), 'utf8')).toString('base64');
    const eqacs = (0, node_crypto_1.createHash)('sha1').update(eqap).digest('hex');
    return formEncode({ eqap, eqacs, eqaz: '1' });
}
/** Inverse of encodeEqapBody, for tests and debugging. */
function decodeEqapBody(body) {
    const outer = Object.fromEntries(new URLSearchParams(body));
    if (!outer.eqap?.startsWith('dz:'))
        throw new Error('not an eqap body');
    if ((0, node_crypto_1.createHash)('sha1').update(outer.eqap).digest('hex') !== outer.eqacs)
        throw new Error('eqacs checksum mismatch');
    const inner = (0, node_zlib_1.inflateRawSync)(Buffer.from(outer.eqap.slice(3), 'base64')).toString('utf8');
    return Object.fromEntries(new URLSearchParams(inner));
}
class EdupageWireError extends Error {
}
exports.EdupageWireError = EdupageWireError;
/** Decodes a response body. Throws EdupageWireError for "eqwd:" error answers. */
function decodeResponse(text) {
    if (text.startsWith('eqwd:'))
        throw new EdupageWireError(Buffer.from(text.slice(5), 'base64').toString('utf8'));
    if (!text.startsWith('eqz:'))
        return text;
    const raw = Buffer.from(text.slice(4), 'base64');
    const plain = raw.toString('utf8');
    if (/^\s*[[{"]/.test(plain))
        return plain;
    try {
        return (0, node_zlib_1.inflateRawSync)(raw).toString('utf8');
    }
    catch {
        return plain;
    }
}
/** Login RPC params: rpcparams = JSON of the call arguments (docs/protocol.md §3). */
function rpcBody(args) {
    return encodeEqapBody({ rpcparams: JSON.stringify(args) });
}
//# sourceMappingURL=eqap.js.map