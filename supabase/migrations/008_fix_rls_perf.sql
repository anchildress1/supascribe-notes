begin;

drop policy if exists "Service role can manage cards" on public.cards;
create policy "Service role can insert cards"
  on public.cards
  for insert
  to public
  with check ((select auth.role()) = 'service_role');
create policy "Service role can update cards"
  on public.cards
  for update
  to public
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');
create policy "Service role can delete cards"
  on public.cards
  for delete
  to public
  using ((select auth.role()) = 'service_role');

drop policy if exists "Service role can manage revisions" on public.card_revisions;
create policy "Service role can insert revisions"
  on public.card_revisions
  for insert
  to public
  with check ((select auth.role()) = 'service_role');
create policy "Service role can update revisions"
  on public.card_revisions
  for update
  to public
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');
create policy "Service role can delete revisions"
  on public.card_revisions
  for delete
  to public
  using ((select auth.role()) = 'service_role');

drop policy if exists "Service role can manage runs" on public.generation_runs;
create policy "Service role can insert runs"
  on public.generation_runs
  for insert
  to public
  with check ((select auth.role()) = 'service_role');
create policy "Service role can update runs"
  on public.generation_runs
  for update
  to public
  using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');
create policy "Service role can delete runs"
  on public.generation_runs
  for delete
  to public
  using ((select auth.role()) = 'service_role');

commit;
