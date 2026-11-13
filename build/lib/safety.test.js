"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Read-only guard (docs/protocol.md §6): the adapter must never order, cancel or rate meals and never send a second
// password attempt after a failed login. This test fails the build if forbidden calls show up in the source.
const node_test_1 = require("node:test");
const strict_1 = __importDefault(require("node:assert/strict"));
const node_fs_1 = require("node:fs");
const node_path_1 = require("node:path");
const SRC = (0, node_path_1.join)(__dirname, '..', '..', 'src');
const files = (dir) => (0, node_fs_1.readdirSync)(dir).flatMap((f) => ((0, node_fs_1.statSync)((0, node_path_1.join)(dir, f)).isDirectory() ? files((0, node_path_1.join)(dir, f)) : f.endsWith('.ts') && !f.endsWith('.test.ts') ? [(0, node_path_1.join)(dir, f)] : []));
(0, node_test_1.test)('no meal ordering / cancelling / rating calls in the source', () => {
    for (const f of files(SRC)) {
        const s = (0, node_fs_1.readFileSync)(f, 'utf8');
        for (const bad of ['ulozJedlaStravnika', 'ulozHodnotenia', 'edubarLogin.php']) {
            strict_1.default.ok(!s.includes(bad), `${f} contains forbidden call ${bad}`);
        }
        strict_1.default.ok(!/post[^\n]*['"`]\/menu\//i.test(s), `${f} POSTs to /menu/ (would order meals)`);
    }
});
//# sourceMappingURL=safety.test.js.map