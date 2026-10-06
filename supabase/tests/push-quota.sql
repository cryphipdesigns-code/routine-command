-- Entire test is rolled back; no account is created and no push is sent.
begin;
do $test$
declare owner_id uuid; v_subscription_id uuid; accepted boolean;
begin
  select user_id into owner_id from public.routine_command_states limit 1;
  if owner_id is null then raise exception 'A Routine Command test owner is required'; end if;
  insert into public.routine_command_push_subscriptions(user_id,endpoint,p256dh,auth)
    values(owner_id, 'https://fcm.googleapis.com/routine-command-quota-test-' || gen_random_uuid(), 'test','test') returning id into v_subscription_id;
  for index in 1..4 loop
    accepted := public.routine_command_claim_push(v_subscription_id,'test-' || index,current_date);
    if not accepted then raise exception 'Daily quota rejected notification % too early', index; end if;
  end loop;
  if public.routine_command_claim_push(v_subscription_id,'test-1',current_date) then raise exception 'Duplicate delivery was accepted'; end if;
  if public.routine_command_claim_push(v_subscription_id,'test-5',current_date) then raise exception 'Daily cap was exceeded'; end if;
  update public.routine_command_push_deliveries set status='failed' where routine_command_push_deliveries.subscription_id=v_subscription_id and notification_key='test-1';
  if not public.routine_command_claim_push(v_subscription_id,'test-1',current_date) then raise exception 'Failed delivery could not retry'; end if;
  update public.routine_command_push_deliveries set status='sent' where routine_command_push_deliveries.subscription_id=v_subscription_id and notification_key='test-1';
  if public.routine_command_claim_push(v_subscription_id,'test-1',current_date) then raise exception 'Sent delivery retried'; end if;
end;
$test$;
rollback;
select 'Push quota and duplicate protection passed; all temporary rows rolled back' as result;
