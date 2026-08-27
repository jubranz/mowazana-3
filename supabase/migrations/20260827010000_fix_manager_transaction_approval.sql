-- The Next.js server calls this controlled RPC with the Supabase service-role
-- key, so auth.uid() is intentionally unavailable here.  Verify the supplied
-- actor against the profiles table instead, and restrict execution to that role.
create or replace function public.transition_transaction(
  p_id uuid,
  p_actor_id uuid,
  p_action text,
  p_note text
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  result public.transactions;
begin
  if not exists (
    select 1 from public.profiles
    where id = p_actor_id and active and role = 'manager'
  ) then
    raise exception 'forbidden';
  end if;

  if p_action not in ('approve', 'hold', 'reject') then
    raise exception 'invalid transition';
  end if;

  select * into result from public.transactions where id = p_id for update;
  if not found or result.status not in ('pending', 'on_hold') then
    raise exception 'invalid transition';
  end if;

  update public.transactions
  set
    status = case p_action
      when 'approve' then 'approved'::public.transaction_status
      when 'hold' then 'on_hold'::public.transaction_status
      else 'rejected'::public.transaction_status
    end,
    manager_note = p_note,
    approved_by = case when p_action = 'approve' then p_actor_id else approved_by end,
    approved_at = case when p_action = 'approve' then now() else approved_at end
  where id = p_id
  returning * into result;

  if p_action = 'approve' and result.type = 'loan_payment' then
    update public.installments
    set
      paid_amount = paid_amount + result.amount,
      remaining_amount = remaining_amount - result.amount,
      status = case when remaining_amount - result.amount = 0 then 'paid'::public.installment_status else 'partial'::public.installment_status end
    where id = result.installment_id;
    update public.loans set remaining_amount = remaining_amount - result.amount where id = result.loan_id;
  end if;

  insert into public.audit_log(actor_id, action, entity_type, entity_id, note)
  values (p_actor_id, p_action, 'transaction', p_id, p_note);
  return result;
end;
$$;

revoke all on function public.transition_transaction(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.transition_transaction(uuid, uuid, text, text) to service_role;
