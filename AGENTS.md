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
- Company-domain access is enforced in three places (auth.users trigger, `is_team_member()` RLS, `_authenticated` guard); keep all three in sync when changing allowed domains.
