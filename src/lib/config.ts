/** Adapter configuration (io-package.json native) and its validation. No ioBroker dependency, so it is testable. */
export interface Child { alias: string; name: string; account: 1 | 2 }
export interface Config {
    school: string;
    account1Username: string; account1Password: string;
    account2Username: string; account2Password: string;
    children: Child[];
    pollMinutes: number;
}

const ALIAS = /^[a-z0-9_]{1,32}$/;

/** Returns a list of config problems (empty = fine). */
export function validateConfig(c: Config): string[] {
    const errs: string[] = [];
    if (!/^[a-z0-9-]+$/.test(c.school || '')) errs.push('school: EduPage subdomain missing or invalid');
    if (!c.account1Username || !c.account1Password) errs.push('account 1: username and password required');
    if (!!c.account2Username !== !!c.account2Password) errs.push('account 2: username and password must both be set or both be empty');
    const kids = c.children || [];
    if (!kids.length) errs.push('children: at least one child');
    const seen = new Set<string>();
    for (const k of kids) {
        if (!ALIAS.test(k.alias || '')) errs.push(`child "${k.name}": alias must be a–z, 0–9, _`);
        if (seen.has(k.alias)) errs.push(`child alias "${k.alias}" used twice`);
        seen.add(k.alias);
        if (k.account === 2 && !c.account2Username) errs.push(`child "${k.alias}": account 2 is not configured`);
    }
    if (!(c.pollMinutes >= 15)) errs.push('pollMinutes: at least 15');
    return errs;
}
