/**
 * EduPage request/response wrapping for the login RPC ("eqap"). Written from the observed HTTP behaviour,
 * see docs/protocol.md §2.
 *
 * Request: form-encode the params, raw-deflate (no zlib header), base64, prefix "dz:" → eqap.
 *          eqacs = SHA-1 hex of the eqap string. Body = eqap=…&eqacs=…&eqaz=1 (form-encoded).
 * Response: "eqz:" + base64 → payload (possibly raw-deflated, unverified, so both are accepted),
 *           "eqwd:" + base64 → error text, anything else → plain text (usually JSON).
 */
import { createHash } from 'node:crypto';
import { deflateRawSync, inflateRawSync } from 'node:zlib';

export function formEncode(params: Record<string, string>): string {
    return Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
}

/** Wraps form params into the eqap body. Returns the body string to POST as application/x-www-form-urlencoded. */
export function encodeEqapBody(params: Record<string, string>): string {
    const eqap = 'dz:' + deflateRawSync(Buffer.from(formEncode(params), 'utf8')).toString('base64');
    const eqacs = createHash('sha1').update(eqap).digest('hex');
    return formEncode({ eqap, eqacs, eqaz: '1' });
}

/** Inverse of encodeEqapBody, for tests and debugging. */
export function decodeEqapBody(body: string): Record<string, string> {
    const outer = Object.fromEntries(new URLSearchParams(body));
    if (!outer.eqap?.startsWith('dz:')) throw new Error('not an eqap body');
    if (createHash('sha1').update(outer.eqap).digest('hex') !== outer.eqacs) throw new Error('eqacs checksum mismatch');
    const inner = inflateRawSync(Buffer.from(outer.eqap.slice(3), 'base64')).toString('utf8');
    return Object.fromEntries(new URLSearchParams(inner));
}

export class EdupageWireError extends Error {}

/** Decodes a response body. Throws EdupageWireError for "eqwd:" error answers. */
export function decodeResponse(text: string): string {
    if (text.startsWith('eqwd:')) throw new EdupageWireError(Buffer.from(text.slice(5), 'base64').toString('utf8'));
    if (!text.startsWith('eqz:')) return text;
    const raw = Buffer.from(text.slice(4), 'base64');
    const plain = raw.toString('utf8');
    if (/^\s*[[{"]/.test(plain)) return plain;
    try {
        return inflateRawSync(raw).toString('utf8');
    } catch {
        return plain;
    }
}

/** Login RPC params: rpcparams = JSON of the call arguments (docs/protocol.md §3). */
export function rpcBody(args: Record<string, unknown>): string {
    return encodeEqapBody({ rpcparams: JSON.stringify(args) });
}
