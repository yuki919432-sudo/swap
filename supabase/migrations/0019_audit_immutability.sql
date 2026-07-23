-- 0019_audit_immutability.sql
-- audit_logs is append-only. Grants (0015) already revoke INSERT/UPDATE/DELETE
-- from authenticated; this trigger is defense-in-depth so that NO role (short of
-- disabling the trigger as a superuser during maintenance) can mutate history.
-- audit_logs has no FK cascades (see 0012), so this never blocks legitimate
-- deletes elsewhere.

create or replace function app.block_audit_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only: % is not permitted', tg_op
    using errcode = 'insufficient_privilege';
end;
$$;

create trigger audit_logs_no_update
  before update on audit_logs
  for each row execute function app.block_audit_mutation();

create trigger audit_logs_no_delete
  before delete on audit_logs
  for each row execute function app.block_audit_mutation();
