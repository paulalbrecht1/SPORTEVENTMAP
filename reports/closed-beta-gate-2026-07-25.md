# Closed-Beta Gate v77

Date: 2026-07-25
Release: `20260725-closed-beta-gate-v77`
Supabase project: `fztupxyxvhvhtihhmtnk`

## Implemented

- Applied `20260725_closed_beta_gate_hardening.sql` locally and to the linked production project.
- Removed legacy public security-definer helper functions and moved update triggers to the private schema.
- Removed duplicate permissive policies and the duplicate analytics index.
- Consolidated event, profile and Event Wiki policies by role and operation.
- Changed the analytics insert policy to evaluate `auth.uid()` once per statement.
- Removed Community from primary desktop, mobile and footer navigation.
- Added a single `npm run test:gate` command for the automated beta gate.
- Extended static and local RLS tests so the hardening cannot regress silently.

## Verified

- Local database reset applies all nine migrations from an empty schema.
- Local RLS/Auth suite: 10/10 scenarios passed.
- Local Supabase database advisors: no security or performance findings.
- Linked production migration history: all nine migrations aligned.
- Linked production database advisors: no database security or performance findings.
- Anonymous production audit: approved events readable; pending events private; profiles,
  favorites, Season Planner, feedback and analytics reject anonymous reads.
- Publish dataset: 994 validated events.

## Remaining operator-only gates

1. Sign in to the Supabase dashboard and enable leaked-password protection when the project
   is on a supported plan. This is the only remaining Auth advisor finding.
2. Configure the final HTTPS Site URL and redirects, then test registration, confirmation,
   login, logout and password reset with two email providers.
3. Run `npm run test:rls` with two dedicated production users and one production admin.
4. Complete a production event submission and admin approval/rejection end to end.
5. Complete the core flows on one real iOS and one real Android device, including keyboards.
6. Replace legal placeholders with the actual operator, hosting and contact details and obtain
   legal review before inviting testers.
7. Select 20-50 testers and assign a feedback owner and review cadence.

Do not treat these manual gates as implicitly complete. They require real credentials,
devices, domain configuration or operator details that are not stored in the repository.
