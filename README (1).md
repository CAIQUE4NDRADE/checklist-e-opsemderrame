# Agenda Operacional BPA

Sistema web de agendamento do **checklist de caminhões** e do **Curso Operação Sem Derrame** no Terminal de Paulínia (BPA).

O motorista lê um QR code na portaria, escolhe o serviço, o dia e o horário pelo celular e recebe um código de confirmação. A equipe acompanha tudo em um painel único: fila do dia, check-in no gate, pedidos de encaixe, turmas do curso, certificados e relatórios.

- **Site do motorista:** `https://caique4ndrade.github.io/checklist-e-opsemderrame/`
- **Painel do operador:** `https://caique4ndrade.github.io/checklist-e-opsemderrame/admin.html`
- **Custo de operação:** R$ 0 (GitHub Pages + Supabase no plano gratuito)

---

## Ganho operacional

### Antes e depois

> Ajuste a coluna "Antes" com a realidade do terminal, se algum ponto for diferente.

| Processo | Antes | Com a Agenda Operacional |
|---|---|---|
| Marcar checklist | Por telefone ou WhatsApp com a portaria, um motorista por vez | O motorista agenda sozinho pelo celular, 24 horas por dia, sem ocupar a equipe |
| Ver vagas | O motorista precisava perguntar | Horários livres em verde e lotados em vermelho, em tempo real |
| Sem vaga no dia | Pedido informal, sem registro | **Pedido de encaixe** registrado, com fila de aprovação no painel e resposta pronta para WhatsApp |
| Confirmação | Combinado verbal | Código de 6 caracteres + QR code + instruções do dia na tela |
| Instruções (EPI, documentos) | Explicadas uma a uma, ou o motorista chegava sem saber | Mostradas na confirmação e na aba "Antes de vir", e vão junto no evento da agenda do celular |
| Transferência Raízen sem checklist da garagem | Descoberto só na chegada, checklist perdido | Exigência avisada antes, no ato do agendamento |
| Chegada na portaria | Busca manual em lista | **Check-in** pela câmera lendo o QR do motorista ou digitando o código |
| Desistência | O horário ficava preso | O motorista cancela pelo site e a vaga volta na hora |
| Curso Operação Sem Derrame | Lista de inscritos montada à mão | Inscrição online por terça-feira, lista de presença para imprimir e certificado em PDF |
| Relatórios | Planilha preenchida manualmente | Exportação para Excel por período, em um clique, com resumo por dia |

### Onde o ganho aparece

**Gate e portaria**
- Menos ligações e mensagens para marcar e confirmar horário.
- Chegadas distribuídas pelos horários, sem acúmulo de caminhões no mesmo período.
- Check-in em segundos: o sistema já avisa se o agendamento é de outro dia, se foi cancelado ou se a chegada já foi registrada.

**Equipe de operações**
- Agenda do dia em uma tela, com contadores de fila, concluídos e pendências, atualizada a cada 30 segundos.
- Status e observações registrados no próprio agendamento, sem papel.
- Encaixes tratados com critério e com histórico: quem pediu, quando, o motivo e quem aprovou.

**Motorista e transportadora**
- Sabe antes de sair se tem vaga.
- Chega sabendo o EPI exigido e os documentos necessários.
- Menos viagem perdida por falta de documento ou de horário.

**Segurança e conformidade**
- As orientações de EPI e de documentos chegam a todo motorista, do mesmo jeito, antes da chegada.
- O Curso Operação Sem Derrame tem controle de turma, presença e conclusão.
- Os dados pessoais seguem a LGPD: consentimento obrigatório, acesso restrito e exclusão automática após 12 meses.

**Gestão**
- Todo agendamento fica registrado com data, horário, status e horário de chegada, o que permite medir no-show, pendências e demanda por horário.
- Os números saem direto do Excel exportado, sem retrabalho.

### Como medir

O próprio sistema gera os dados. Exporte o Excel em **Painel > Relatórios** e acompanhe:

| Indicador | Como calcular | Antes | Depois |
|---|---|---|---|
| Agendamentos feitos pelo site | Total de registros no período | — | ___ |
| Ligações e mensagens evitadas | Agendamentos pelo site + cancelamentos pelo site | — | ___ |
| Tempo da equipe economizado (h/mês) | Ligações evitadas × minutos por atendimento ÷ 60 | ___ | ___ |
| Taxa de no-show | Agendados sem chegada ÷ total agendado | ___ | ___ |
| Checklists com pendência | Status PENDÊNCIA ÷ total realizado | ___ | ___ |
| Encaixes atendidos | Encaixes aprovados ÷ pedidos de encaixe | — | ___ |
| Ocupação da agenda | Agendados ÷ vagas disponíveis | ___ | ___ |
| Participação no curso | Concluíram ÷ inscritos | ___ | ___ |

**Exemplo de cálculo do tempo economizado:** se a equipe gastava em média *X* minutos por agendamento por telefone e o site recebeu *N* agendamentos no mês, a economia é **N × X ÷ 60 horas por mês**. Preencha com os números reais do terminal.

---

## Funcionalidades

### Motorista (`index.html`, sem login)

- **Checklist do caminhão:** escolhe o dia e o horário e informa **nome, placa, transportadora e telefone**.
- **Curso Operação Sem Derrame:** escolhe a terça-feira e informa **nome, CPF e transportadora**.
- Etapas numeradas: Serviço → Data e horário → Seus dados → Confirmação. No celular aparecem em versão compacta.
- Horários livres em verde e lotados em vermelho. Horários que já passaram não aparecem.
- **Solicitar encaixe** quando não há vaga: o motorista informa dia, período e motivo e acompanha a resposta.
- Confirmação com código, QR code, **instruções do dia**, "Adicionar à minha agenda" (com as instruções no evento) e "Como chegar".
- Aba **Meu agendamento**: consulta e cancela com o código + a placa (checklist) ou o CPF (curso).
- Aba **Antes de vir**: orientações completas do checklist e do curso.
- Pode ser instalado como app na tela inicial do celular.

### Operador (`admin.html`, com login)

- **Agenda do dia:** checklist ou turma do curso, com contadores, busca por código, nome, placa, CPF ou telefone, troca de status, observações, registro de chegada e **lixeira** com confirmação.
- **Encaixes:** pedidos pendentes com um contador no topo, aprovação com escolha de horário (cria o agendamento na hora), recusa e botão **Avisar no WhatsApp** com a mensagem pronta.
- **Check-in:** leitura do QR do motorista pela câmera ou pelo código digitado.
- **Horários:** geração em lote (checklist de segunda a sábado; curso toda terça por 1 ano), ajuste de vagas, abertura e fechamento de horários.
- **Relatórios:** Excel por período e limpeza manual de dados antigos (LGPD).
- **QR Code:** cartaz para imprimir (geral, só checklist ou só curso).
- **Curso:** lista de presença para imprimir e certificados em PDF de quem concluiu.

---

## Segurança e LGPD

- O motorista **não acessa as tabelas**. Ele só usa funções específicas que nunca devolvem dados de outras pessoas.
- A lista de horários mostra só a quantidade de vagas, sem nomes.
- Só usuários cadastrados como operador veem e alteram dados (Row Level Security no Postgres).
- O agendamento trava o horário na hora de gravar, então dois motoristas não pegam a mesma última vaga.
- Regras de duplicidade:
  - **Checklist:** uma placa só pode ter um agendamento ativo por dia.
  - **Curso:** um CPF só pode estar inscrito em uma próxima turma por vez.
  - **Encaixe:** um pedido pendente por placa e por dia.
- O consentimento de uso de dados é obrigatório e há uma página de política de privacidade.
- Os dados com mais de 12 meses são apagados (manual pelo painel ou automático com `3_limpeza_automatica.sql`).
- A chave publicada no `config.js` é a **publishable**, pública por design. A chave secreta nunca vai para o site.

---

## Tecnologia

| Parte | Ferramenta |
|---|---|
| Site | HTML, CSS e JavaScript puro, sem etapa de build |
| Hospedagem | GitHub Pages |
| Banco, login e regras | Supabase (PostgreSQL + Auth + RLS) |
| Bibliotecas (CDN) | supabase-js, qrcodejs, html5-qrcode (check-in), SheetJS (Excel), jsPDF (certificados) |

**Limite do plano gratuito:** o Supabase pausa o projeto depois de 7 dias **sem nenhum acesso**. Com uso diário isso não acontece. Se pausar, basta reativar no painel do Supabase.

---

## Instalação

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com).
2. **SQL Editor > New query**: cole o conteúdo de `schema.sql` e clique em **Run**. O arquivo pode ser rodado de novo em atualizações, sem apagar dados.
3. **Authentication > Sign In / Providers**: desligue **Allow new users to sign up**.
4. Crie o primeiro operador (veja "Operação do dia a dia").
5. Opcional: rode `3_limpeza_automatica.sql` para a limpeza mensal automática (LGPD).

### 2. Configuração
Em `config.js`, preencha:
- `SUPABASE_URL` e `SUPABASE_ANON_KEY` (chave **publishable**, em Project Settings > API Keys);
- nome do local, telefone do gate, endereço, orientações do checklist e do curso, carga horária e assinatura do certificado.

### 3. GitHub Pages
1. Suba **todos os arquivos na raiz** do repositório, sem pastas.
2. **Settings > Pages > Deploy from a branch > main / (root) > Save**.

### 4. Primeiro uso
1. Painel > **Horários**: gere os horários do checklist e as terças do curso.
2. Painel > **QR Code**: imprima o cartaz e coloque na portaria.
3. Faça um agendamento de teste pelo celular.

---

## Operação do dia a dia

**Adicionar um operador**
1. Supabase > **Authentication > Users > Add user > Create new user** (e-mail, senha provisória, *Auto Confirm User*).
2. No **SQL Editor**:
```sql
insert into public.operadores (user_id, nome)
select id, 'Nome do colega' from auth.users
 where lower(email) = lower('email.do.colega@raizen.com')
on conflict (user_id) do nothing;
```

**Ver quem é operador**
```sql
select o.nome, u.email from public.operadores o join auth.users u on u.id = o.user_id;
```

**Trocar a senha de um operador**
```sql
update auth.users
   set encrypted_password = extensions.crypt('NovaSenha@123', extensions.gen_salt('bf'))
 where lower(email) = lower('email.do.colega@raizen.com');
```

**Tirar o acesso de um operador**
```sql
delete from public.operadores
 where user_id = (select id from auth.users where lower(email) = lower('email.do.colega@raizen.com'));
```

**Atualizar o site:** suba no GitHub só os arquivos alterados (**Add file > Upload files > Commit changes**) e aperte Ctrl+F5. Quando houver mudança no `schema.sql`, rode o arquivo no Supabase **antes** de subir os outros.

---

## Estrutura

Todos os arquivos ficam na raiz do repositório:

```
index.html                # site do motorista
admin.html                # painel do operador
privacidade.html          # política de privacidade (LGPD)
config.js                 # chave do Supabase, contatos, orientações e regras
styles.css                # visual (cores institucionais, tema claro e escuro)
common.js                 # funções comuns, rodapé, logo, calendário
agendar.js                # lógica do motorista (agendamento, encaixe, consulta)
admin.js                  # lógica do painel (agenda, encaixes, check-in, relatórios)
manifest.webmanifest      # instalar como app no celular
sw.js                     # suporte ao modo app
icon.svg, icon-*.png      # ícones
schema.sql                # banco: tabelas, regras de segurança e funções
2_operador.sql            # libera o primeiro operador
3_limpeza_automatica.sql  # opcional: limpeza mensal de dados com mais de 12 meses
```

---

## Próximos passos

- Campo de e-mail no formulário do curso, para enviar o certificado.
- Botão "Trocar minha senha" no painel.
- Mostrar os horários que já passaram como "Encerrado".
- Aviso automático na véspera do horário.
- Logo oficial no cabeçalho, depois da aprovação da comunicação.

---

Desenvolvido por **Caique Andrade**, Operações BPA.
