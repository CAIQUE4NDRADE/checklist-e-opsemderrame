# Agenda de Checklist

Sistema de agendamento do **checklist de caminhões** e do **Curso Operação Sem Derrame** (turma toda terça). O motorista lê um **QR code**, escolhe o que quer agendar, o dia e o horário no celular e preenche os dados. A equipe acompanha tudo num **painel do operador**.

- **Frontend:** HTML + JavaScript puro (sem build), hospedado no **GitHub Pages**
- **Backend:** **Supabase** (Postgres + Auth + regras de segurança)

## Como funciona

| Página | Quem usa | O que faz |
|---|---|---|
| `index.html` | Motorista (via QR code) | Escolhe **checklist** ou **curso**. No checklist: dia/horário, preenche nome, CPF, placas e validades (CNH, MOPP, NR-20, NR-35), recebe um **código de 6 caracteres** + QR. No curso: escolhe a terça e informa só os dados pessoais. Pode consultar e cancelar depois. Links diretos: `index.html#curso` e `index.html#checklist`. |
| `admin.html` | Operador (login) | Agenda do dia por tipo (checklist ou turma do curso), troca de status (FILA / CONCLUÍDO / PENDÊNCIA / CANCELADO), observações, alertas de documentos vencidos ou vencendo, busca por código/placa/CPF, geração de horários em lote e cartaz do QR code para imprimir. |

### Segurança e LGPD

- O motorista **não tem acesso às tabelas**. Ele só chama funções específicas (`horarios_disponiveis`, `agendar`, `consultar_agendamento`, `cancelar_agendamento`) que nunca devolvem dados de outros motoristas.
- A lista de horários mostra só a quantidade de vagas, sem nomes.
- Só usuários cadastrados na tabela `operadores` veem os dados no painel (Row Level Security).
- O agendamento trava o horário na hora de gravar, então dois motoristas não conseguem pegar a mesma última vaga.
- No checklist, um CPF só pode ter um agendamento ativo por dia.
- No curso, um CPF só pode estar inscrito numa próxima turma por vez (para trocar de data, cancela e inscreve de novo).
- No curso, o status fica INSCRITO, CONCLUÍDO ou FALTOU.

## Passo a passo

### 1. Supabase

> Já rodou uma versão anterior do `schema.sql`? Rode o novo por cima: ele atualiza tabelas e funções sem apagar dados.

1. Crie um projeto em [supabase.com](https://supabase.com) (o plano gratuito atende).
2. Vá em **SQL Editor**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run**.
3. Vá em **Authentication > Providers > Email** e **desative "Allow new users to sign up"**. Assim ninguém cria conta sozinho.
4. Crie o usuário do operador em **Authentication > Users > Add user** (marque *Auto Confirm User*).
5. Libere esse usuário como operador. No **SQL Editor**:
   ```sql
   insert into public.operadores (user_id, nome)
   select id, 'Operador 1' from auth.users where email = 'operador@exemplo.com';
   ```
6. Copie a **Project URL** e a **anon public key** em **Project Settings > API**.

### 2. Configuração

Edite `config.js`:

```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJhbGciOi...",
NOME_LOCAL: "Terminal Paulínia",
```

A anon key pode ficar no código público: quem garante a segurança são as regras do banco. **Nunca** use a `service_role` key aqui.

### 3. GitHub Pages

```bash
git init
git add .
git commit -m "Agenda de checklist"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/agenda-checklist.git
git push -u origin main
```

No GitHub: **Settings > Pages > Source: Deploy from a branch > main / (root)**. Em 1 ou 2 minutos o site fica em:

- Motorista: `https://SEU-USUARIO.github.io/agenda-checklist/`
- Painel: `https://SEU-USUARIO.github.io/agenda-checklist/admin.html`

### 4. Primeiro uso

1. Entre no painel e, na aba **Horários**, gere os horários:
   - **Checklist:** já vem preenchido com 04:00, 05:00, 08:00, 09:00, 10:00, 16:00 e 17:00, de segunda a sábado.
   - **Curso Operação Sem Derrame:** escolha o tipo e o formulário se preenche com toda terça, 08:00 às 12:00, 20 vagas, por 1 ano. Ajuste horário e vagas antes de gerar. Repita no ano seguinte.
2. Na aba **QR Code**, escolha se o cartaz é para tudo, só curso ou só checklist, imprima e cole na portaria.
3. Na aba **Checklist do dia**, acompanhe a fila. A página se atualiza sozinha a cada 30 segundos.

## Testando localmente

Os arquivos são estáticos, então basta um servidor simples:

```bash
python -m http.server 8000
```

E abra `http://localhost:8000`.

## Estrutura

```
agenda-checklist/
├── index.html          # página do motorista
├── admin.html          # painel do operador
├── config.js           # URL e chave do Supabase
├── css/styles.css
├── js/
│   ├── common.js       # cliente Supabase e funções comuns
│   ├── agendar.js      # lógica do motorista
│   └── admin.js        # lógica do painel
└── supabase/
    └── schema.sql      # tabelas, regras de segurança e funções
```

## Ideias para depois

- Leitor de QR no painel (câmera) para dar check-in pelo código do motorista
- Aviso por WhatsApp ou e-mail na véspera do horário
- Bloqueio automático do agendamento se o MOPP já estiver vencido
- Relatório mensal em Excel
