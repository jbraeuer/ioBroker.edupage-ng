# ioBroker.edupage-ng

Read-only EduPage adapter for parents: **today's and the next school day's timetable incl. substitutions per child** and the
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
| `<child>.today.lessons` / `.next.lessons` | JSON list of lessons (`next` = next school day) |
| `<child>.next.date` / `.next.label` | date of the next school day, button label ("Morgen" or the weekday) |
| `debug.account1` / `debug.account2` | structure of the EduPage data (key names + counts only, no content), for development |
| `<child>.today.changes` | substitutions / cancelled lessons |
| lesson fields `topic`, `homework` | lesson topic ("Lehrstoff") from the class register; titles of homework given in that lesson |
| `<child>.today.homework` / `.next.homework` | homework given on that day (JSON) |
| `<child>.today.homeworkDue` / `.next.homeworkDue` | homework due on that day (JSON) |
| `<child>.openHomework` | all homework due today or later, soonest first (JSON: subject, title, details, given, due) |
| `<child>.today.text` / `.next.text` | timetable as text, one line per lesson (topic after " – ", homework after " · HA: ") |
| `<child>.today.lunch` / `.next.lunch` | this child's order: JSON `{code, label, dish}`, `''` if none |
| `canteen.today.menu` / `.text` (and `next`) | lunch: JSON `{date, cooking, from, to, menus: [{code, label, dish, allergens}]}`; text `S: …` per menu, `kein Mittagessen` if not cooking |

## Roadmap
M0 skeleton ✅ · M1 login + session reuse + one child's timetable · M2 two accounts, several children · M3 substitutions · M4 canteen · M5 VIS HTML, i18n, release 0.1.0

## Install (once released)
ioBroker Admin → Adapters → "Install from custom URL" → `https://github.com/<user>/ioBroker.edupage-ng`

## Changelog
### 0.0.1
- M0: skeleton, admin config (2 accounts, children table, encrypted passwords), eqap encoding + tests, read-only guard test, protocol notes.

## License
MIT © 2026 Jens Bräuer
