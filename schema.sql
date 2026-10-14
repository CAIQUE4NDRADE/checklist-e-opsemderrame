-- =====================================================================
--  Agenda de Checklist + Curso Operação Sem Derrame — schema Supabase
--  Rode este arquivo inteiro no SQL Editor do Supabase.
--  Pode rodar de novo sem perder dados (atualiza tabelas e funções).
-- =====================================================================

-- ---------- Tabelas ----------------------------------------------------

create table if not exists public.operadores (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nome    text,
  created_at timestamptz not null default now()
);

create table if not exists public.horarios (
  id          bigint generated always as identity primary key,
  data        date    not null,
  hora_inicio time    not null,
  hora_fim    time    not null,
  vagas       int     not null default 1 check (vagas > 0),
  ativo       boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Tipo do horário: checklist do caminhão ou curso Operação Sem Derrame
alter table public.horarios
  add column if not exists tipo text not null default 'checklist'
  check (tipo in ('checklist', 'curso_osd'));

alter table public.horarios drop constraint if exists horarios_data_hora_inicio_key;
create unique index if not exists horarios_tipo_data_hora_uk
  on public.horarios (tipo, data, hora_inicio);

create table if not exists public.agendamentos (
  id              bigint generated always as identity primary key,
  horario_id      bigint not null references public.horarios(id) on delete cascade,
  codigo          text   not null,
  nome            text   not null,
  cpf             text   not null check (cpf ~ '^\d{11}$'),
  telefone        text,
  email           text,
  transportadora  text   not null,
  companhia       text   not null,
  placa_cavalo    text,               -- obrigatória só no checklist
  placa_reboque1  text,
  placa_reboque2  text,
  placa_reboque3  text,
  cnh_validade    date,
  mopp_validade   date,
  nr20_validade   date,
  nr35_validade   date,
  status          text   not null default 'fila'
                  check (status in ('fila','concluido','pendencia','cancelado')),
  obs             text,
  created_at      timestamptz not null default now()
);

alter table public.agendamentos alter column placa_cavalo drop not null;

-- v3: consentimento LGPD e check-in na portaria
alter table public.agendamentos add column if not exists consentimento_em timestamptz;
alter table public.agendamentos add column if not exists checkin_em timestamptz;

create index if not exists agendamentos_horario_idx on public.agendamentos(horario_id);
create index if not exists agendamentos_cpf_idx     on public.agendamentos(cpf);
create index if not exists horarios_data_idx        on public.horarios(data);

-- ---------- Funções auxiliares ----------------------------------------

create or replace function public.eh_operador()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.operadores where user_id = auth.uid());
$$;

create or replace function public.norm_placa(x text)
returns text language sql immutable as $$
  select nullif(upper(regexp_replace(coalesce(x, ''), '[^A-Za-z0-9]', '', 'g')), '');
$$;

create or replace function public.agora_sp()
returns timestamp language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo');
$$;

-- ---------- RLS: só operadores leem/escrevem as tabelas ---------------
-- O motorista (anon) NÃO acessa as tabelas diretamente: ele usa apenas
-- as funções RPC abaixo, que expõem somente o necessário (LGPD).

alter table public.operadores   enable row level security;
alter table public.horarios     enable row level security;
alter table public.agendamentos enable row level security;

drop policy if exists "operador ve a si mesmo" on public.operadores;
create policy "operador ve a si mesmo" on public.operadores
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "operador gerencia horarios" on public.horarios;
create policy "operador gerencia horarios" on public.horarios
  for all to authenticated using (public.eh_operador()) with check (public.eh_operador());

drop policy if exists "operador gerencia agendamentos" on public.agendamentos;
create policy "operador gerencia agendamentos" on public.agendamentos
  for all to authenticated using (public.eh_operador()) with check (public.eh_operador());

-- ---------- RPC públicas (motorista) ----------------------------------

drop function if exists public.horarios_disponiveis(date);
drop function if exists public.horarios_disponiveis(date, text);
drop function if exists public.consultar_agendamento(text, text);
drop function if exists public.gerar_horarios(date, date, time[], int, int, int[]);
drop function if exists public.gerar_horarios(date, date, time[], int, int, int[], text);
drop function if exists public.datas_disponiveis(text, date, date);

-- Horários futuros de um dia e tipo, com vagas ocupadas (sem dados pessoais)
create function public.horarios_disponiveis(p_data date, p_tipo text default 'checklist')
returns table (id bigint, hora_inicio time, hora_fim time, vagas int, ocupadas int)
language sql stable security definer set search_path = public as $$
  select h.id, h.hora_inicio, h.hora_fim, h.vagas,
         (select count(*)::int from public.agendamentos a
           where a.horario_id = h.id and a.status <> 'cancelado')
    from public.horarios h
   where h.data = p_data
     and h.tipo = p_tipo
     and h.ativo
     and (h.data + h.hora_inicio) > public.agora_sp()
   order by h.hora_inicio;
$$;

-- Datas que têm horário aberto de um tipo (usado para listar as terças do curso)
create function public.datas_disponiveis(p_tipo text, p_de date, p_ate date)
returns table (data date, vagas_livres int)
language sql stable security definer set search_path = public as $$
  select h.data,
         sum(greatest(h.vagas - (select count(*) from public.agendamentos a
                                  where a.horario_id = h.id and a.status <> 'cancelado'), 0))::int
    from public.horarios h
   where h.tipo = p_tipo
     and h.ativo
     and h.data between p_de and p_ate
     and (h.data + h.hora_inicio) > public.agora_sp()
   group by h.data
   order by h.data;
$$;

-- Cria o agendamento e devolve o código de confirmação
create or replace function public.agendar(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_h        public.horarios%rowtype;
  v_ocupadas int;
  v_check    boolean;
  v_cpf      text := regexp_replace(coalesce(p->>'cpf', ''), '\D', '', 'g');
  v_cavalo   text := public.norm_placa(p->>'placa_cavalo');
  v_r1       text := public.norm_placa(p->>'placa_reboque1');
  v_r2       text := public.norm_placa(p->>'placa_reboque2');
  v_r3       text := public.norm_placa(p->>'placa_reboque3');
  v_regex    text := '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$';
  v_codigo   text;
begin
  select * into v_h from public.horarios
   where id = (p->>'horario_id')::bigint and ativo
   for update;                                   -- trava o horário: evita 2 pegarem a última vaga
  if not found then
    raise exception 'Horário não encontrado.';
  end if;
  if (v_h.data + v_h.hora_inicio) <= public.agora_sp() then
    raise exception 'Esse horário já passou. Escolha outro.';
  end if;

  v_check := v_h.tipo = 'checklist';

  if coalesce((p->>'consentimento')::boolean, false) is not true then
    raise exception 'Para agendar, aceite o uso dos seus dados (LGPD).';
  end if;

  if length(v_cpf) <> 11 then raise exception 'CPF inválido.'; end if;
  if coalesce(trim(p->>'nome'), '') = ''
     or coalesce(trim(p->>'transportadora'), '') = ''
     or coalesce(trim(p->>'companhia'), '') = '' then
    raise exception 'Preencha todos os campos obrigatórios.';
  end if;

  if v_check then
    if v_cavalo is null then raise exception 'Informe a placa do cavalo.'; end if;
    if v_cavalo !~ v_regex
       or (v_r1 is not null and v_r1 !~ v_regex)
       or (v_r2 is not null and v_r2 !~ v_regex)
       or (v_r3 is not null and v_r3 !~ v_regex) then
      raise exception 'Placa inválida. Use o formato ABC1234 ou ABC1D23.';
    end if;
    -- documento informado já vencido na data do checklist bloqueia o agendamento
    if nullif(p->>'cnh_validade', '')::date < v_h.data then
      raise exception 'Sua CNH estará vencida na data do checklist. Renove antes de agendar.';
    end if;
    if nullif(p->>'mopp_validade', '')::date < v_h.data then
      raise exception 'Seu MOPP estará vencido na data do checklist. Renove antes de agendar.';
    end if;
    if nullif(p->>'nr20_validade', '')::date < v_h.data then
      raise exception 'Seu NR-20 estará vencido na data do checklist. Renove antes de agendar.';
    end if;
    if nullif(p->>'nr35_validade', '')::date < v_h.data then
      raise exception 'Seu NR-35 estará vencido na data do checklist. Renove antes de agendar.';
    end if;
  else
    -- curso não usa placas nem documentos do caminhão
    v_cavalo := null; v_r1 := null; v_r2 := null; v_r3 := null;
  end if;

  select count(*) into v_ocupadas from public.agendamentos
   where horario_id = v_h.id and status <> 'cancelado';
  if v_ocupadas >= v_h.vagas then
    raise exception 'Esse horário acabou de lotar. Escolha outro.';
  end if;

  if v_check then
    if exists (select 1 from public.agendamentos a
                 join public.horarios h on h.id = a.horario_id
                where a.cpf = v_cpf and h.tipo = 'checklist' and h.data = v_h.data
                  and a.status <> 'cancelado') then
      raise exception 'Já existe um checklist agendado para esse CPF nesse dia.';
    end if;
  else
    if exists (select 1 from public.agendamentos a
                 join public.horarios h on h.id = a.horario_id
                where a.cpf = v_cpf and h.tipo = v_h.tipo
                  and (h.data + h.hora_inicio) > public.agora_sp()
                  and a.status = 'fila') then
      raise exception 'Você já está inscrito numa próxima turma do curso. Cancele a inscrição atual para trocar de data.';
    end if;
  end if;

  v_codigo := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));

  insert into public.agendamentos (
    horario_id, codigo, nome, cpf, telefone, email, transportadora, companhia,
    placa_cavalo, placa_reboque1, placa_reboque2, placa_reboque3,
    cnh_validade, mopp_validade, nr20_validade, nr35_validade, consentimento_em
  ) values (
    v_h.id, v_codigo, upper(trim(p->>'nome')), v_cpf,
    nullif(regexp_replace(coalesce(p->>'telefone', ''), '\D', '', 'g'), ''),
    nullif(lower(trim(coalesce(p->>'email', ''))), ''),
    upper(trim(p->>'transportadora')), upper(trim(p->>'companhia')),
    v_cavalo, v_r1, v_r2, v_r3,
    case when v_check then nullif(p->>'cnh_validade',  '')::date end,
    case when v_check then nullif(p->>'mopp_validade', '')::date end,
    case when v_check then nullif(p->>'nr20_validade', '')::date end,
    case when v_check then nullif(p->>'nr35_validade', '')::date end,
    now()
  );

  return v_codigo;
end $$;

-- Motorista consulta o próprio agendamento (CPF + código)
create function public.consultar_agendamento(p_cpf text, p_codigo text)
returns table (tipo text, data date, hora_inicio time, hora_fim time, nome text, placa_cavalo text, status text)
language sql stable security definer set search_path = public as $$
  select h.tipo, h.data, h.hora_inicio, h.hora_fim, a.nome, a.placa_cavalo, a.status
    from public.agendamentos a
    join public.horarios h on h.id = a.horario_id
   where a.cpf = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
     and a.codigo = upper(trim(coalesce(p_codigo, '')))
   order by h.data desc
   limit 1;
$$;

-- Motorista cancela o próprio agendamento (só se ainda está na fila e não passou)
create or replace function public.cancelar_agendamento(p_cpf text, p_codigo text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_id bigint; v_status text; v_data date; v_hora time;
begin
  select a.id, a.status, h.data, h.hora_inicio
    into v_id, v_status, v_data, v_hora
    from public.agendamentos a
    join public.horarios h on h.id = a.horario_id
   where a.cpf = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g')
     and a.codigo = upper(trim(coalesce(p_codigo, '')))
   order by h.data desc
   limit 1;

  if v_id is null then raise exception 'Agendamento não encontrado.'; end if;
  if v_status <> 'fila' then raise exception 'Esse agendamento não pode mais ser cancelado.'; end if;
  if (v_data + v_hora) <= public.agora_sp() then raise exception 'O horário já passou.'; end if;

  update public.agendamentos set status = 'cancelado' where id = v_id;
end $$;

-- ---------- RPC do operador ------------------------------------------

-- Gera horários em lote. p_dias_semana: 0=dom, 1=seg, 2=ter ... 6=sáb
create function public.gerar_horarios(
  p_inicio date, p_fim date, p_horas time[],
  p_duracao_min int default 10, p_vagas int default 1,
  p_dias_semana int[] default array[1,2,3,4,5,6],
  p_tipo text default 'checklist'
) returns int language plpgsql security invoker set search_path = public as $$
declare d date; h time; n int := 0; c int;
begin
  if not public.eh_operador() then raise exception 'Acesso negado.'; end if;
  if p_fim < p_inicio then raise exception 'A data final é anterior à inicial.'; end if;
  if p_fim - p_inicio > 400 then raise exception 'Período máximo de 400 dias por vez.'; end if;
  if p_tipo not in ('checklist', 'curso_osd') then raise exception 'Tipo inválido.'; end if;

  d := p_inicio;
  while d <= p_fim loop
    if extract(dow from d)::int = any(p_dias_semana) then
      foreach h in array p_horas loop
        insert into public.horarios (tipo, data, hora_inicio, hora_fim, vagas)
        values (p_tipo, d, h, h + make_interval(mins => p_duracao_min), p_vagas)
        on conflict (tipo, data, hora_inicio) do nothing;
        get diagnostics c = row_count;
        n := n + c;
      end loop;
    end if;
    d := d + 1;
  end loop;
  return n;
end $$;

-- LGPD: apaga agendamentos e horários com mais de p_meses meses
create or replace function public.limpar_dados_antigos(p_meses int default 12)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  -- roda pelo agendador do banco (sem usuário) ou por um operador logado
  if auth.uid() is not null and not public.eh_operador() then
    raise exception 'Acesso negado.';
  end if;
  delete from public.horarios
   where data < (public.agora_sp()::date - make_interval(months => greatest(p_meses, 1)));
  get diagnostics n = row_count;   -- agendamentos saem junto (on delete cascade)
  return n;
end $$;

revoke execute on function public.limpar_dados_antigos(int) from public, anon;
grant  execute on function public.limpar_dados_antigos(int) to authenticated;

-- ---------- Permissões de execução -----------------------------------

revoke execute on function public.gerar_horarios(date, date, time[], int, int, int[], text) from public, anon;
grant  execute on function public.gerar_horarios(date, date, time[], int, int, int[], text) to authenticated;

grant execute on function public.horarios_disponiveis(date, text)   to anon, authenticated;
grant execute on function public.datas_disponiveis(text, date, date) to anon, authenticated;
grant execute on function public.agendar(jsonb)                     to anon, authenticated;
grant execute on function public.consultar_agendamento(text, text)  to anon, authenticated;
grant execute on function public.cancelar_agendamento(text, text)   to anon, authenticated;
grant execute on function public.eh_operador()                      to authenticated;
