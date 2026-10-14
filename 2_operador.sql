-- =====================================================================
--  Passo 2: liberar o operador
--  Rode DEPOIS de:
--    1) rodar o schema.sql
--    2) criar o usuário em Authentication > Users > Add user
--  Troque o e-mail abaixo se você criou o usuário com outro.
-- =====================================================================

insert into public.operadores (user_id, nome)
select id, 'Caique'
  from auth.users
 where lower(email) = lower('caique.andrade@raizen.com')
on conflict (user_id) do nothing;

-- Conferência: deve aparecer uma linha com seu nome e e-mail
select o.nome, u.email
  from public.operadores o
  join auth.users u on u.id = o.user_id;
