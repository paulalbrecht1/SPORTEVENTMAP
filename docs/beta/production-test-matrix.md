# Production test matrix — closed beta

- Status date: 2026-08-04
- Intended production origin: `https://sporteventmap.com`
- Supabase production project: `fztupxyxvhvhtihhmtnk`
- Roles: two distinct normal accounts (User A and User B) and one dedicated admin
- Rule: production writes use only clearly labelled beta fixtures and are removed
  after evidence is captured. No public event is changed without a rollback path.

`NOT TESTED` means the production flow still needs a real account, mailbox,
browser or physical device. Local automated evidence is not reported as a
production pass.

| Test ID | Role | Initial state | Steps | Expected result | Actual result | Status | Evidence / screenshot | Known limitation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH-01 | User A | New address at email provider 1 | Register on production with a unique email and strong password | Confirmation email is sent; no authenticated session before confirmation | Production mailbox test not run | NOT TESTED | Save registration screen and message ID/time, not link/token | Needs real provider 1 mailbox |
| AUTH-02 | User B | New address at email provider 2 | Register on production with a unique email and strong password | Same result as AUTH-01 through an independent provider | Production mailbox test not run | NOT TESTED | Save registration screen and delivery time | Needs real provider 2 mailbox |
| AUTH-03 | User A | AUTH-01 email received | Open confirmation link exactly once | Redirect returns to the exact production callback and account becomes usable | Production callback not run | NOT TESTED | Screenshot final origin/path and success message; redact tokens | Supabase production URL allowlist is not yet independently exported |
| AUTH-04 | User A | Confirmed account, signed out | Log in with correct credentials | Session starts and protected controls appear | Production login not run | NOT TESTED | Screenshot profile control; Auth log time | Credentials intentionally absent from repository/runtime |
| AUTH-05 | User A | Signed in | Log out from profile and confirm protected controls disappear | Local session is removed; planner/favorites are not exposed | Production logout not run | NOT TESTED | Screenshot before/after | — |
| AUTH-06 | User A | Signed out after AUTH-05 | Log in again | Same user and cloud data are restored | Production re-login not run | NOT TESTED | Screenshot profile identifier and persisted fixture data | Depends on PERSIST tests |
| AUTH-07 | User A | Signed in | Reload the page | Session restores without another password prompt | Production reload not run | NOT TESTED | Short screen recording | Client uses Supabase `getSession` plus `onAuthStateChange` |
| AUTH-08 | User A | Signed in | Close browser completely, reopen production origin | Session restores according to configured refresh-token policy | Production browser-restart test not run | NOT TESTED | Record browser/version and restart evidence | Must not use private browsing |
| AUTH-09 | User A | Confirmed account, signed out | Request reset, open email, set a new strong password, log in | Exact production reset callback opens profile password form; old password fails and new password works | Production reset not run | NOT TESTED | Screenshots with URL tokens redacted | Needs real mailbox and exact redirect allowlist |
| AUTH-10 | User A | Used, expired or modified reset link | Open link | No password is changed; friendly invalid/expired message is shown | Local callback handling exists; production not run | NOT TESTED | Screenshot error message, no token | Expiry timing may require a prepared old link |
| AUTH-11 | User A | Confirmed account | Log in with incorrect password | Generic failure; no session; no credential detail leaked | Production negative login not run | NOT TESTED | Screenshot message and Auth log time | — |
| AUTH-12 | User A | Existing confirmed account | Attempt registration with same email | No second identity or profile is created; response does not leak more than intended | Production duplicate registration not run | NOT TESTED | Record UI message and Auth user count manually | Provider enumeration behaviour depends on Auth settings |
| AUTH-13 | Anonymous | Clean browser | Open profile/admin/submission/planner paths or controls without login | Protected actions require login; admin remains inaccessible | Public page inspected; authenticated action test not completed | NOT TESTED | Production browser screenshot | Static markup contains hidden protected UI and requires runtime verification |
| AUTH-14 | Admin | Confirmed admin, signed out | Log in and load admin route | Admin UI appears only after server-backed role lookup | Production admin login not run | NOT TESTED | Screenshot admin route and profile UUID suffix only | Admin role must be preassigned outside the frontend |
| REDIR-01 | Configuration | Dashboard read access | Record production Site URL | Exactly `https://sporteventmap.com`; no localhost or preview default | Repository runtime `siteUrl` is blank; Dashboard value not verified | NOT TESTED | Redacted Dashboard screenshot | Current app falls back to `window.location.origin` |
| REDIR-02 | Configuration | Dashboard read access | Export allowed redirect URLs and compare with app-generated URLs | Exact production confirmation/reset callback URLs are present | Dashboard list not available through current connector | NOT TESTED | Redacted Dashboard screenshot | Must be checked manually |
| REDIR-03 | Configuration | Redirect list visible | Review wildcards and obsolete preview URLs | No production wildcard; only justified local/preview entries remain | Not reviewed in Dashboard | NOT TESTED | Dashboard screenshot and written justification | Local config intentionally uses localhost wildcards |
| PROFILE-01 | User A | A and B signed in separately | A reads and edits display name/language | Only A's row is returned and changed | Local RLS suite passed; production credential test not run | NOT TESTED | API response row count and UI screenshot | Production policies/grants inspected read-only |
| PROFILE-02 | User B | Same | B reads and edits own profile | Only B's row is returned and changed | Local RLS suite passed; production not run | NOT TESTED | API response row count | — |
| PROFILE-03 | User A | B UUID known to test operator | Direct PostgREST select/update using B UUID | Zero rows or authorization denial; B row unchanged | Local cross-user suite passed; production not run | NOT TESTED | Redacted request/response status and row count | Never log bearer tokens |
| PROFILE-04 | Admin | A fixture profile exists | Read/update only fields needed for support; try role escalation as normal user | Admin path works; normal user cannot assign admin role | Local test 10 passed; production not run | NOT TESTED | RLS test output and production response | Admin privileges should remain minimal |
| FAV-01 | User A | Signed in; chosen event not saved | Favorite event fixture | One A-owned row is created | Local test 3 passed; production not run | NOT TESTED | UI screenshot plus own-row query | — |
| FAV-02 | User B | A favorite exists | Query A favorite directly and through UI | B sees no row | Local test 4 passed; production not run | NOT TESTED | HTTP status/empty array | — |
| FAV-03 | User B | Signed in | Favorite a different event | One B-owned row is created | Local RLS suite passed; production not run | NOT TESTED | UI screenshot plus own-row query | — |
| FAV-04 | User A | B favorite exists | Query/delete B favorite using guessed identifiers | No row is visible or deleted | Local test 4 passed; production not run | NOT TESTED | Response row count and follow-up B query | — |
| FAV-05 | User A | A favorite exists | Logout, login, reload and browser restart | Favorite remains exactly once | Production persistence not run | NOT TESTED | Before/after screenshots and own-row count | Local fallback/cloud merge needs real production proof |
| FAV-06 | User A | Local favorite exists before login | Log in, wait for sync, reload twice | No foreign or duplicate row; conflict resolves deterministically | Browser/cloud conflict test not run | NOT TESTED | Own-row query and localStorage snapshot without personal data | Current upsert is unique on `(user_id,event_id)` |
| PLAN-01 | User A | Signed in; event absent from planner | Add event and set A/B/C priority, distance, goal time, notes and status | One A-owned planner row persists all fields | Local test 5 passed for ownership; production rich-field test not run | NOT TESTED | UI screenshots and redacted row JSON | `planner_details` compatibility fallback can omit rich fields on old schema |
| PLAN-02 | User B | A planner row exists | Select/update/delete A row using direct API | No row is visible or changed | Local test 5 passed; production not run | NOT TESTED | Response status/row count | — |
| PLAN-03 | User B | Signed in | Add a different planner entry | One B-owned row is created | Local test 5 passed; production not run | NOT TESTED | UI and own-row response | — |
| PLAN-04 | User A | Saved PLAN-01 data | Logout/login, reload and browser restart | Priority, goal time, notes and status restore exactly | Production persistence not run | NOT TESTED | Before/after field comparison | Requires production account |
| PLAN-05 | User A | Two own planner rows plus B row | Update one and remove the other | Only targeted A rows change; B row remains | Local ownership suite passed; production not run | NOT TESTED | Row IDs redacted to suffixes | — |
| PLAN-06 | User A | Past event with result details | Save finisher/DNF/DNS/result metadata, reload | Result remains attached only to A and correct edition | Local planner-result E2E exists; production not run | NOT TESTED | UI archive screenshot | Physical calendar imports are out of this core gate |
| SUB-01 | User A | Signed in | Submit clearly labelled beta fixture with official test URL/data | Row is forced to pending and owned by A; not public | Local test 6 passed; production write not run | NOT TESTED | Submission success and own pending query | Requires controlled production fixture and cleanup |
| SUB-02 | User B | A submission exists | Query A pending submission | No foreign private row is returned | Local RLS coverage passed; production not run | NOT TESTED | Empty response | — |
| SUB-03 | User A | Own pending fixture exists | Attempt direct update to approved/published and call admin RPCs | Request is denied or affects zero rows | Local tests 7, 8 and protected-RPC negatives passed | NOT TESTED | HTTP status and unchanged follow-up query | New `20260814120000` hardening is not yet in production |
| SUB-04 | Admin | SUB-01 pending fixture | Review fields, approve fixture, verify public status/audit metadata | Only fixture becomes approved; reviewer/status timestamps are traceable | Local test 9 passed; production not run | NOT TESTED | Before/after response and admin screenshot | Must define rollback/delete before execution |
| SUB-05 | Admin | Second controlled pending fixture | Reject fixture and verify it disappears from public/pending queue as designed | Only fixture becomes rejected with traceable status | Local workflow coverage exists; production not run | NOT TESTED | Before/after row and UI | — |
| SUB-06 | Admin | Two fixtures plus unrelated row | Approve/reject separately and compare unrelated checksum/status | Unrelated row is unchanged | Local RLS/workflow tests passed; production not run | NOT TESTED | Redacted row comparison | No production event data may be used as the fixture |
| RPC-01 | User A | Signed in normal account | Call `run_event_validation` with a fixture event and with null scope | HTTP denial before validation/mutation | Local hardened suite passed; production remains vulnerable until migration deployment | FAILED | Local 20/20 output; production function catalog 2026-08-04 | Critical production deployment blocker |
| RPC-02 | User A | Signed in normal account | Call enqueue/reset/resolve/retry admin RPCs with random UUIDs | HTTP denial before record lookup | Local suite passed; production definitions contain internal admin checks | NOT TESTED | Local RLS output and function audit | Production credential test still required |
| RPC-03 | Anonymous | No session | Call cron-secret verifier with an invalid random value | Boolean false; no secret, hash or metadata disclosed | Local suite passed | PASSED | `tests/rls-security.test.mjs`, test 12 | Endpoint remains Advisor-visible by design |
| ANON-01 | Anonymous | No session | Query approved/pending events, profiles, favorites, planner, feedback and analytics | Approved event visible; all protected datasets empty or denied | Production read-only audit passed 2026-08-04 | PASSED | `npm.cmd run audit:anon` | Does not replace authenticated cross-user tests |

## Cleanup and evidence rules

- Prefix every writable fixture with `[BETA TEST]` plus date/test ID.
- Capture only HTTP status, row counts and redacted identifiers; never capture
  passwords, access/refresh tokens, confirmation codes or reset links.
- Remove fixture favorites/planner rows as their owning users.
- Reject or remove fixture event submissions using the documented admin path.
- Record the cleanup query/result and verify no unrelated row changed.
