begin;

drop policy simulation_positions_self_select on simulation_positions;

create policy simulation_positions_self_select
  on simulation_positions
  for select
  to forecast_app
  using (
    user_id = nullif(current_setting('app.user_id', true), '')::uuid
  );

commit;
