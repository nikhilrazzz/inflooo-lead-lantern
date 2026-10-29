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
