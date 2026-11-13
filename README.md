# ioBroker.edupage-ng

Read-only EduPage adapter for parents: **today's and tomorrow's timetable incl. substitutions per child** and the
**canteen menu**, for one or two EduPage parent accounts. Made for a family kitchen panel (VIS-2).

> Status: **0.0.1 / M0**. Skeleton, configuration and request encoding only. It doesn't talk to EduPage yet.

## Principles
- **Read-only.** It never orders, cancels or rates meals (enforced by a test).
- **Gentle with your account.** It reuses the session, does at most one password login per account and hour, and stops at the first login error (wrong password, captcha, 2FA). Then it waits for you: solve it in the browser, then press `control.retry`.
- Unofficial: EduPage has no public API for parents. The web endpoints used are described in [docs/protocol.md](docs/protocol.md) and can change at any time.

## States (planned)
| State | Content |
|---|---|
| `info.connection`, `info.lastError`, `info.lastSuccess` | health |
| `control.retry` | button: try again after a blocked login |
| `<child>.today.lessons` / `.tomorrow.lessons` | JSON list of lessons |
| `<child>.today.changes` | substitutions / cancelled lessons |
| `<child>.today.text` / `.html` | ready to show (VIS) |
| `canteen.today.menu` / `.text` / `.html` (and `tomorrow`) | canteen |

## Roadmap
M0 skeleton ✅ · M1 login + session reuse + one child's timetable · M2 two accounts, several children · M3 substitutions · M4 canteen · M5 VIS HTML, i18n, release 0.1.0

## Install (once released)
ioBroker Admin → Adapters → "Install from custom URL" → `https://github.com/<user>/ioBroker.edupage-ng`

## Changelog
### 0.0.1
- M0: skeleton, admin config (2 accounts, children table, encrypted passwords), eqap encoding + tests, read-only guard test, protocol notes.

## License
MIT © 2026 Jens Bräuer
