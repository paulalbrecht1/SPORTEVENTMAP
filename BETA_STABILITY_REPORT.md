# Beta Stability Report

Date: 2026-07-25
Build: `20260725-closed-beta-gate-v77`

The current evidence and remaining operator-only gates are maintained in
`reports/closed-beta-gate-2026-07-25.md` and `BETA_READINESS.md`.

## Verified automatically

- Nine local and production Supabase migrations are aligned.
- The local 10/10 RLS/Auth suite passes from a clean database reset.
- Supabase database security and performance advisors report no findings.
- The production anonymous-access audit passes.
- Static, layout, end-to-end and event-detail suites pass against 994 events.
- The release package is generated reproducibly from the repository.

## Manual gates that remain

- Final HTTPS Auth redirects and the full email/account lifecycle.
- Dedicated production-user RLS test accounts.
- A real submission-to-admin-approval flow.
- One real iOS and one real Android device, including virtual keyboards.
- Supabase leaked-password protection in the signed-in dashboard.
- Actual operator, hosting and contact details plus legal review.

This build is ready for those final manual gate checks. It is not a claim that
the invitation gate has already been completed.
