-- =====================================================================
--  Opcional (LGPD): apagar automaticamente dados com mais de 12 meses
--  Rode uma vez no SQL Editor, DEPOIS do schema.sql.
--  Se der erro em "create extension", ative o Cron em:
--  Supabase > Integrations > Cron > Enable, e rode de novo.
-- =====================================================================

create extension if not exists pg_cron;

-- remove o agendamento antigo, se existir, para não duplicar
select cron.unschedule(jobid) from cron.job where jobname = 'limpeza-lgpd-agenda';

-- todo dia 1º do mês, às 03:00 (horário UTC = 00:00 em Brasília)
select cron.schedule(
  'limpeza-lgpd-agenda',
  '0 3 1 * *',
  $$ select public.limpar_dados_antigos(12); $$
);

-- conferência
select jobname, schedule, command from cron.job where jobname = 'limpeza-lgpd-agenda';
