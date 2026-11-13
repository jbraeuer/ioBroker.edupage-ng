"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Http = exports.CookieJar = void 0;
class CookieJar {
    jar = new Map();
    get(name) { return this.jar.get(name); }
    set(name, value) { this.jar.set(name, value); }
    header() { return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '); }
    absorb(h) {
        const list = h.getSetCookie?.() ?? [];
        for (const c of list) {
            const [pair] = c.split(';');
            const i = pair.indexOf('=');
            if (i > 0)
                this.jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
        }
    }
}
exports.CookieJar = CookieJar;
class Http {
    base;
    timeoutMs;
    jar = new CookieJar();
    requests = 0;
    constructor(base, timeoutMs = 20000) {
        this.base = base;
        this.timeoutMs = timeoutMs;
    }
    async request(method, path, body, contentType = 'application/x-www-form-urlencoded') {
        let url = new URL(path, this.base).toString();
        for (let hop = 0; hop < 6; hop++) {
            this.requests++;
            const res = await fetch(url, {
                method, redirect: 'manual', signal: AbortSignal.timeout(this.timeoutMs),
                headers: { cookie: this.jar.header(), ...(body !== undefined ? { 'content-type': contentType } : {}), 'user-agent': 'ioBroker.edupage-ng' },
                body,
            });
            this.jar.absorb(res.headers);
            const loc = res.headers.get('location');
            if (res.status >= 300 && res.status < 400 && loc) {
                url = new URL(loc, url).toString();
                method = 'GET';
                body = undefined;
                continue;
            }
            return { status: res.status, url, text: await res.text() };
        }
        throw new Error('too many redirects');
    }
}
exports.Http = Http;
//# sourceMappingURL=http.js.map