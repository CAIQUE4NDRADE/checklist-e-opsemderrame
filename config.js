// =====================================================================
//  Configuração do sistema — edite aqui textos, contatos e regras.
//  A chave publishable é pública por design; a segurança está nas
//  regras do banco (schema.sql). NUNCA coloque a chave secreta aqui.
// =====================================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://nubegsgayoqqpynrkhbu.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_b7QKEbMmXBoqBqvBGWRNvw_PJIcqLyV",

  // ---------- Identidade ----------
  NOME_APP: "Agenda BPA",
  NOME_LOCAL: "Terminal Paulínia",

  // ---------- Contato e endereço (aparecem no rodapé e na confirmação) ----------
  // Deixe "" para esconder um item.
  TELEFONE_PORTARIA: "",            // ex.: "(19) 3333-0000"
  WHATSAPP_PORTARIA: "",            // ex.: "(19) 99999-0000"
  HORARIO_ATENDIMENTO: "Segunda a sábado",
  ENDERECO: "Av. Sidney Cardon de Oliveira, 2365 — Paulínia/SP",
  MAPS_URL: "https://www.google.com/maps/search/?api=1&query=Av.+Sidney+Cardon+de+Oliveira+2365+Paulinia+SP",

  // ---------- Regras ----------
  ALERTA_DIAS: 60,          // destacar documentos que vencem em até X dias
  DIAS_ANTECEDENCIA: 15,    // quantos dias à frente pode agendar o checklist
  CHEGAR_ANTES_MIN: 15,     // orientação de chegada

  // ---------- Curso ----------
  NOME_CURSO: "Curso Operação Sem Derrame",
  CURSO_SEMANAS: 12,        // quantas terças à frente mostrar
  CURSO_CARGA_HORARIA: "4 horas",
  CERTIFICADO_RESPONSAVEL: "Coordenação de Operações",   // assinatura no certificado

  // ---------- Orientações (página "Antes de vir") ----------
  ORIENTACOES_CHECKLIST: [
    "Chegue com {CHEGAR} minutos de antecedência e apresente o código de confirmação na portaria.",
    "Tenha em mãos: CNH, MOPP, certificados NR-20 e NR-35 válidos.",
    "Use EPI completo: botina, calça e camisa de manga longa, capacete e óculos.",
    "O conjunto precisa estar limpo, com extintores dentro da validade e sem vazamentos.",
    "Se não puder vir, cancele pelo site para liberar a vaga para outro motorista.",
  ],
  ORIENTACOES_CURSO: [
    "O curso acontece às terças-feiras. Chegue com {CHEGAR} minutos de antecedência.",
    "Traga documento com foto (RG ou CNH).",
    "Venha com calça comprida e calçado fechado.",
    "Quem concluir o curso recebe certificado.",
    "Se não puder vir, cancele pelo site para liberar a vaga.",
  ],

  // Sugestões para o campo "Companhia"
  COMPANHIAS: ["RAÍZEN", "FOB", "CIF"],
};
