<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Leads are imported from the Google Sheet only via the `syncLeadsFromSheet` server function (dedupe on SaleUp Lead ID); never write sheet-parsing logic elsewhere — keeps imports idempotent.
- Company-domain access is enforced by `is_team_member()` RLS and the `_authenticated` guard (which signs non-company users out); no auth.users blocking trigger, since it breaks Google sign-in with a vendor error.
- Brand revenue is shared through company-scoped RLS; profit is a database-generated value with a matching client calculation for unsaved previews, so edits cannot leave profit stale.
- Personal Calendar uses authenticated server functions with encrypted per-user connector keys; provider data and credentials never enter shared caches or browser storage, to isolate each team member's calendar.
- The app shell requires a usable personal calendar connection; it reconciles that user's SaleUp reminders with stable Google event IDs on reminder changes and while open, so retries never create duplicate calls. Google owns out-of-app notification delivery; SaleUp alarms run while the app is open.
