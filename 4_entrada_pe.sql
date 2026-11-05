-- =====================================================================
--  v7: Agendamento de ENTRADA A PÉ (monitor e motoristas da transportadora)
--  Rode este arquivo uma vez no SQL Editor do Supabase, DEPOIS do schema.sql.
--  Pode rodar de novo sem perder dados.
--
--  Regras: segunda a sexta, entrada entre 08:00 e 17:00 (sem horário marcado).
--  A transportadora faz UM pedido com a lista de pessoas (nome + CPF) e
--  recebe UM código para apresentar na portaria.
-- =====================================================================

create table if not exists public.entradas_pe (
  id               bigint generated always as identity primary key,
  codigo           text   not null,
  data             date   not null,
  transportadora   text   not null,
  responsavel      text   not null,
  telefone         text   not null,
  status           text   not null default 'agendado' check (status in ('agendado', 'cancelado')),
  obs              text,
  consentimento_em timestamptz,
  created_at       timestamptz not null default now()
);
create unique index if not exists entradas_pe_codigo_uk on public.entradas_pe(codigo);
create index if not exists entradas_pe_data_idx on public.entradas_pe(data);

create table if not exists public.entradas_pe_pessoas (
  id          bigint generated always as identity primary key,
  entrada_id  bigint not null references public.entradas_pe(id) on delete cascade,
  funcao      text   not null check (funcao in ('monitor', 'motorista')),
  nome        text   not null,
  cpf         text   not null check (cpf ~ '^\d{11}$'),
  checkin_em  timestamptz
);
create index if not exists entradas_pe_pessoas_entrada_idx on public.entradas_pe_pessoas(entrada_id);
create index if not exists entradas_pe_pessoas_cpf_idx     on public.entradas_pe_pessoas(cpf);

-- Só operadores leem/escrevem as tabelas; o público usa apenas as funções abaixo
alter table public.entradas_pe         enable row level security;
alter table public.entradas_pe_pessoas enable row level security;
drop policy if exists "operador gerencia entradas_pe" on public.entradas_pe;
create policy "operador gerencia entradas_pe" on public.entradas_pe
  for all to authenticated using (public.eh_operador()) with check (public.eh_operador());
drop policy if exists "operador gerencia entradas_pe_pessoas" on public.entradas_pe_pessoas;
create policy "operador gerencia entradas_pe_pessoas" on public.entradas_pe_pessoas
  for all to authenticated using (public.eh_operador()) with check (public.eh_operador());

-- CPF com dígitos verificadores corretos
create or replace function public.cpf_valido(p text)
returns boolean language plpgsql immutable set search_path = public as $$
declare c text := regexp_replace(coalesce(p, ''), '\D', '', 'g'); s int; dv int; t int; i int;
begin
  if length(c) <> 11 or c ~ '^(\d)\1{10}$' then return false; end if;
  for t in 9..10 loop
    s := 0;
    for i in 1..t loop s := s + substr(c, i, 1)::int * (t + 2 - i); end loop;
    dv := ((s * 10) % 11) % 10;
    if dv <> substr(c, t + 1, 1)::int then return false; end if;
  end loop;
  return true;
end $$;

-- Transportadora agenda a entrada a pé
--   p = { data, transportadora, responsavel, telefone, consentimento,
--         pessoas: [ { funcao: 'monitor'|'motorista', nome, cpf }, ... ] }
create or replace function public.agendar_entrada_pe(p jsonb)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_data    date;
  v_transp  text := upper(trim(coalesce(p->>'transportadora', '')));
  v_resp    text := upper(trim(coalesce(p->>'responsavel', '')));
  v_tel     text := regexp_replace(coalesce(p->>'telefone', ''), '\D', '', 'g');
  v_pessoas jsonb := coalesce(p->'pessoas', '[]'::jsonb);
  v_hoje    date := public.agora_sp()::date;
  v_pess    jsonb;
  v_cpf     text;
  v_nome    text;
  v_func    text;
  v_cpfs    text[] := '{}';
  v_id      bigint;
  v_codigo  text;
  v_dup     text;
begin
  if coalesce((p->>'consentimento')::boolean, false) is not true then
    raise exception 'Para agendar, aceite o uso dos dados (LGPD).';
  end if;

  begin v_data := (p->>'data')::date;
  exception when others then raise exception 'Data inválida.'; end;
  if v_data is null then raise exception 'Escolha o dia.'; end if;
  if extract(isodow from v_data) > 5 then raise exception 'A entrada a pé é só de segunda a sexta.'; end if;
  if v_data < v_hoje then raise exception 'Esse dia já passou.'; end if;
  if v_data = v_hoje and public.agora_sp()::time >= time '17:00' then
    raise exception 'A entrada a pé de hoje já encerrou (até 17:00). Escolha outro dia.';
  end if;
  if v_data > v_hoje + 30 then raise exception 'Agende com no máximo 30 dias de antecedência.'; end if;

  if v_transp = '' then raise exception 'Informe a transportadora.'; end if;
  if v_resp = '' then raise exception 'Informe o nome do responsável pelo agendamento.'; end if;
  if length(v_tel) not between 10 and 11 then raise exception 'Telefone inválido. Informe com DDD.'; end if;

  if jsonb_typeof(v_pessoas) <> 'array' or jsonb_array_length(v_pessoas) = 0 then
    raise exception 'Adicione pelo menos uma pessoa.';
  end if;
  if jsonb_array_length(v_pessoas) > 30 then raise exception 'Máximo de 30 pessoas por agendamento.'; end if;

  for v_pess in select * from jsonb_array_elements(v_pessoas) loop
    v_nome := upper(trim(coalesce(v_pess->>'nome', '')));
    v_cpf  := regexp_replace(coalesce(v_pess->>'cpf', ''), '\D', '', 'g');
    v_func := lower(trim(coalesce(v_pess->>'funcao', '')));
    if v_nome = '' then raise exception 'Preencha o nome de todas as pessoas.'; end if;
    if v_func not in ('monitor', 'motorista') then raise exception 'Função inválida para %.', v_nome; end if;
    if not public.cpf_valido(v_cpf) then raise exception 'CPF inválido para %.', v_nome; end if;
    if v_cpf = any(v_cpfs) then raise exception 'O CPF de % aparece duas vezes na lista.', v_nome; end if;
    v_cpfs := v_cpfs || v_cpf;
  end loop;

  -- A mesma pessoa não pode ter duas entradas a pé no mesmo dia
  select pp.nome into v_dup
    from public.entradas_pe_pessoas pp
    join public.entradas_pe e on e.id = pp.entrada_id
   where e.data = v_data and e.status = 'agendado' and pp.cpf = any(v_cpfs)
   limit 1;
  if v_dup is not null then
    raise exception '% já tem entrada a pé agendada nesse dia.', v_dup;
  end if;

  loop
    v_codigo := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.entradas_pe where codigo = v_codigo)
          and not exists (select 1 from public.agendamentos where codigo = v_codigo);
  end loop;

  insert into public.entradas_pe (codigo, data, transportadora, responsavel, telefone, consentimento_em)
  values (v_codigo, v_data, v_transp, v_resp, v_tel, now())
  returning id into v_id;

  insert into public.entradas_pe_pessoas (entrada_id, funcao, nome, cpf)
  select v_id, lower(trim(x->>'funcao')), upper(trim(x->>'nome')), regexp_replace(x->>'cpf', '\D', '', 'g')
    from jsonb_array_elements(v_pessoas) x;

  return v_codigo;
end $$;

-- Consulta pelo código + CPF de qualquer pessoa da lista (não devolve CPFs)
create or replace function public.consultar_entrada_pe(p_cpf text, p_codigo text)
returns table (data date, transportadora text, responsavel text, status text, pessoas jsonb)
language sql stable security definer set search_path = public as $$
  select e.data, e.transportadora, e.responsavel, e.status,
         (select jsonb_agg(jsonb_build_object('funcao', pp.funcao, 'nome', pp.nome,
                                              'chegou', pp.checkin_em is not null)
                           order by pp.funcao desc, pp.nome)
            from public.entradas_pe_pessoas pp where pp.entrada_id = e.id)
    from public.entradas_pe e
   where e.codigo = upper(trim(coalesce(p_codigo, '')))
     and exists (select 1 from public.entradas_pe_pessoas pp
                  where pp.entrada_id = e.id
                    and pp.cpf = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'))
   limit 1;
$$;

-- Transportadora cancela (só antes do dia acabar e se ninguém entrou ainda)
create or replace function public.cancelar_entrada_pe(p_cpf text, p_codigo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_id bigint; v_status text; v_data date;
begin
  select e.id, e.status, e.data into v_id, v_status, v_data
    from public.entradas_pe e
   where e.codigo = upper(trim(coalesce(p_codigo, '')))
     and exists (select 1 from public.entradas_pe_pessoas pp
                  where pp.entrada_id = e.id
                    and pp.cpf = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g'));
  if v_id is null then raise exception 'Agendamento não encontrado.'; end if;
  if v_status <> 'agendado' then raise exception 'Esse agendamento já foi cancelado.'; end if;
  if v_data < public.agora_sp()::date then raise exception 'O dia já passou.'; end if;
  if exists (select 1 from public.entradas_pe_pessoas where entrada_id = v_id and checkin_em is not null) then
    raise exception 'Alguém dessa lista já entrou. Fale com a portaria.';
  end if;
  update public.entradas_pe set status = 'cancelado' where id = v_id;
end $$;

-- LGPD: a limpeza mensal passa a apagar também as entradas a pé antigas
create or replace function public.limpar_dados_antigos(p_meses int default 12)
returns int language plpgsql security definer set search_path = public as $$
declare n int; m int;
begin
  if auth.uid() is not null and not public.eh_operador() then
    raise exception 'Acesso negado.';
  end if;
  delete from public.horarios
   where data < (public.agora_sp()::date - make_interval(months => greatest(p_meses, 1)));
  get diagnostics n = row_count;
  delete from public.entradas_pe
   where data < (public.agora_sp()::date - make_interval(months => greatest(p_meses, 1)));
  get diagnostics m = row_count;
  return n + m;
end $$;
revoke execute on function public.limpar_dados_antigos(int) from public, anon;
grant  execute on function public.limpar_dados_antigos(int) to authenticated;

revoke execute on function public.agendar_entrada_pe(jsonb)          from public;
revoke execute on function public.consultar_entrada_pe(text, text)   from public;
revoke execute on function public.cancelar_entrada_pe(text, text)    from public;
grant  execute on function public.agendar_entrada_pe(jsonb)          to anon, authenticated;
grant  execute on function public.consultar_entrada_pe(text, text)   to anon, authenticated;
grant  execute on function public.cancelar_entrada_pe(text, text)    to anon, authenticated;
grant  execute on function public.cpf_valido(text)                   to anon, authenticated;
