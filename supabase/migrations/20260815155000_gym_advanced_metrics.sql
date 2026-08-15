-- IronHealth · Modificação do modelo de dados para métricas avançadas de Ginásio (Volume Total e 1RM)

alter table workout_sessions
  add column if not exists volume_kg numeric;

alter table workout_session_sets
  add column if not exists one_rep_max_est numeric;
