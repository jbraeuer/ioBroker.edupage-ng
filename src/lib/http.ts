/** Minimal HTTP client with a cookie jar (Node.js fetch). Follows redirects itself, so cookies set on the way are kept. */
export interface HttpResponse { status: number; url: string; text: string }

export class CookieJar {
    private jar = new Map<string, string>();
    public get(name: string): string | undefined { return this.jar.get(name); }
    public set(name: string, value: string): void { this.jar.set(name, value); }
    public header(): string { return [...this.jar].map(([k, v]) => `${k}=${v}`).join('; '); }
    public absorb(h: Headers): void {
        const list = (h as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
        for (const c of list) {
            const [pair] = c.split(';');
            const i = pair.indexOf('=');
            if (i > 0) this.jar.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
        }
    }
}

export class Http {
    public readonly jar = new CookieJar();
    public requests = 0;
    public constructor(private readonly base: string, private readonly timeoutMs = 20000) {}

    public async request(method: 'GET' | 'POST', path: string, body?: string, contentType = 'application/x-www-form-urlencoded'): Promise<HttpResponse> {
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
                method = 'GET'; body = undefined;
                continue;
            }
            return { status: res.status, url, text: await res.text() };
        }
        throw new Error('too many redirects');
    }
}
