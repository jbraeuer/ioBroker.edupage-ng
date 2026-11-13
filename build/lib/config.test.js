"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const config_1 = require("./config");
const ok = {
    school: 'myschool', account1Username: 'parent1', account1Password: 'x', account2Username: '', account2Password: '',
    children: [{ alias: 'kid1', name: 'Kid One', account: 1 }], pollMinutes: 30,
};
(0, node_test_1.test)('config: a minimal valid config has no errors', () => {
    strict_1.default.deepEqual((0, config_1.validateConfig)(ok), []);
});
(0, node_test_1.test)('config: catches the usual mistakes', () => {
    const errs = (0, config_1.validateConfig)({
        ...ok, school: 'https://x.edupage.org', account2Username: 'p2', pollMinutes: 5,
        children: [{ alias: 'Kid 1', name: 'A', account: 1 }, { alias: 'b', name: 'B', account: 2 }, { alias: 'b', name: 'C', account: 1 }],
    });
    for (const want of ['school', 'account 2: username and password', 'alias must be', 'used twice', 'pollMinutes']) {
        strict_1.default.ok(errs.some((e) => e.includes(want)), `missing error "${want}" in ${JSON.stringify(errs)}`);
    }
});
//# sourceMappingURL=config.test.js.map