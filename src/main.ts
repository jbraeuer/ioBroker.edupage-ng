/**
 * ioBroker.edupage-ng: read-only EduPage for parent accounts.
 * M0: configuration, state tree, scheduling and error states. The EduPage calls come in M1–M4 (docs/protocol.md).
 *
 * Login discipline (the accounts must never get captcha-locked):
 *  - reuse the session, at most one password login per account and hour
 *  - stop at the first login error (no second attempt), set info.lastError, wait for control.retry
 *  - poll every pollMinutes (min. 15) with up to 2 min random jitter
 */
import * as utils from '@iobroker/adapter-core';

import { Config, Child, validateConfig } from './lib/config';

export class EdupageNg extends utils.Adapter {
    private timer: ioBroker.Timeout | undefined;
    private blocked = false;   // true after a login error until control.retry

    public constructor(options: Partial<utils.AdapterOptions> = {}) {
        super({ ...options, name: 'edupage-ng' });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    private get cfg(): Config { return this.config as unknown as Config; }

    private async onReady(): Promise<void> {
        await this.setStateAsync('info.connection', false, true);
        const errs = validateConfig(this.cfg);
        if (errs.length) {
            await this.setStateAsync('info.lastError', 'config: ' + errs.join('; '), true);
            this.log.error('Configuration: ' + errs.join('; '));
            return;
        }
        for (const k of this.cfg.children) await this.createChildStates(k);
        await this.createCanteenStates();
        this.subscribeStates('control.retry');
        await this.poll();
    }

    private async createChildStates(k: Child): Promise<void> {
        await this.setObjectNotExistsAsync(k.alias, { type: 'device', common: { name: k.name }, native: {} });
        for (const day of ['today', 'tomorrow']) {
            await this.setObjectNotExistsAsync(`${k.alias}.${day}`, { type: 'channel', common: { name: day }, native: {} });
            for (const [id, role, name] of [
                ['lessons', 'json', 'Lessons (JSON list)'], ['changes', 'json', 'Substitutions / changes (JSON list)'],
                ['text', 'text', 'Timetable as text'], ['html', 'html', 'Timetable as HTML (for VIS)'],
            ]) {
                await this.setObjectNotExistsAsync(`${k.alias}.${day}.${id}`, { type: 'state', common: { name, role, type: 'string', read: true, write: false, def: '' }, native: {} });
            }
        }
    }

    private async createCanteenStates(): Promise<void> {
        await this.setObjectNotExistsAsync('canteen', { type: 'channel', common: { name: 'Canteen' }, native: {} });
        for (const day of ['today', 'tomorrow']) {
            for (const [id, role, name] of [['menu', 'json', 'Menu (JSON)'], ['text', 'text', 'Menu as text'], ['html', 'html', 'Menu as HTML (for VIS)']]) {
                await this.setObjectNotExistsAsync(`canteen.${day}.${id}`, { type: 'state', common: { name: `${day}: ${name}`, role, type: 'string', read: true, write: false, def: '' }, native: {} });
            }
        }
    }

    private schedule(): void {
        if (this.timer) this.clearTimeout(this.timer);
        const jitter = Math.floor(Math.random() * 120000);
        this.timer = this.setTimeout(() => void this.poll(), this.cfg.pollMinutes * 60000 + jitter);
    }

    private async poll(): Promise<void> {
        if (this.blocked) return;
        // M1–M4: login (session reuse), timetable, substitutions, canteen.
        await this.setStateAsync('info.lastError', 'M0: EduPage access not implemented yet', true);
        this.schedule();
    }

    private async onStateChange(id: string, state: ioBroker.State | null | undefined): Promise<void> {
        if (!state || state.ack || !id.endsWith('control.retry')) return;
        this.blocked = false;
        await this.setStateAsync('info.lastError', '', true);
        await this.setStateAsync('control.retry', false, true);
        await this.poll();
    }

    private onUnload(callback: () => void): void {
        try { if (this.timer) this.clearTimeout(this.timer); } finally { callback(); }
    }
}

if (require.main !== module) {
    // ioBroker loads the adapter as a factory; keep the class reachable for tests
    module.exports = Object.assign((options: Partial<utils.AdapterOptions> | undefined) => new EdupageNg(options), { EdupageNg });
} else {
    (() => new EdupageNg())();
}
