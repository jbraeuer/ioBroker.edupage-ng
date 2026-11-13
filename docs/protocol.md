# EduPage web protocol: what this adapter relies on

Own notes on how the EduPage web app talks to its server, as observed and as described publicly by other
open-source clients. **No code is copied** from other projects (the Python `edupage-api` is GPL-3.0, this adapter is MIT).
Everything here is undocumented by EduPage and can change. Items marked *(unverified)* still need one live check.

## 1. Basics
- Host: `https://<school>.edupage.org`. A session is a `PHPSESSID` cookie.
- After login, the app page contains two things we need:
  - `userhome({...});`: a JSON object with the user, the school year (`dp.year`) and the lookup tables (`dbi`: subjects, teachers, classes, rooms, students).
  - `ASC.gsechash="…"`: a per-session token. JSON calls send it as `__gsh`.

## 2. Login request wrapping ("eqap")
Login calls don't send plain form data:
1. Form-encode the parameters (`rpcparams=<JSON>`), raw-deflate, base64, prefix `dz:` → `eqap`.
2. `eqacs` = SHA-1 (hex) of the `eqap` string.
3. POST body: `eqap=…&eqacs=…&eqaz=1`.

Answers: `eqz:` + base64 = payload, `eqwd:` + base64 = error text, otherwise plain JSON.
Implemented in `src/lib/eqap.ts`, with tests.

## 3. Login (once, then reuse the session)
| Step | Request | We use |
|---|---|---|
| 1 | GET `/login/?cmd=MainLogin` | cookies |
| 2 | POST `/login/?cmd=MainLogin&akcia=getToken`, wrapped `{username, edupage: ""}` | `token` |
| 3 | POST `/login/?cmd=MainLogin&akcia=login`, wrapped `{username, password, userToken, edupage: "", ctxt: "", tu: null, gu: null, au: null}` | `status`, `redirectUrl`, `err` |
| 4 | GET `redirectUrl` | page with `userhome(` and `gsechash` |

- `redirectUrl` containing `twofactor` → 2FA is on → state `twofactor`, stop.
- `err` → state `login_failed` (wrong password) or `captcha`, **stop**. No second attempt with another login method. The account must not get locked.
- **Reuse:** with a stored `PHPSESSID`, GET `/user` returns the same page. Only if that fails do we log in again, at most once per hour and account.

## 4. Parent accounts *(partly unverified)*
- Parent: the user id contains `Rodic`.
- Switch to a child: GET `/login/switchchild?studentid=<id>`, answer `OK`. The child ids come from `userhome` *(which field exactly: unverified)*.

## 5. Timetable of a child
POST `/timetable/server/currenttt.js?__func=curentttGetData` (sic), JSON:
`{"__args": [null, {"year", "datefrom", "dateto", "table": "students", "id": "<childId>", "showColors": true, "showIgroupsInClasses": true, "showOrig": true, "log_module": "CurrentTTView"}], "__gsh": "<gsechash>"}`
- Answer `r.ttitems[]`: `uniperiod`, `starttime`, `endtime`, `subjectid`, `teacherids`, `classroomids`, `classids`, `groupnames`, `removed`, `type`, `flags`, `name`. Names come from `dbi`.
- One request for today + tomorrow (`datefrom`…`dateto`).
- `{"reload": …}` = session expired → re-login once.

## 6. Substitutions *(compare with the ttitems flags once, live)*
POST `/substitution/server/viewer.js?__func=getSubstViewerDayDataHtml`, JSON `{"__args": [null, {"date": "YYYY-MM-DD", "mode": "classes"}], "__gsh": …}` → `r` = an HTML string, per class. We keep only the child's class.

## 7. Canteen (read-only)
- **Only** GET `/menu/?date=YYYYMMDD`. The page contains a JS literal `edupageData: {…}`; menus per date and meal (1 snack, 2 lunch, 3 afternoon).
- **Never POST to `/menu/`**: that path orders, cancels and rates meals. `src/lib/safety.test.ts` fails the build if such calls show up.

## 8. Politeness
Poll every 30 min (min. 15) with jitter, one request per thing, no parallel logins, no retries in tight loops.
