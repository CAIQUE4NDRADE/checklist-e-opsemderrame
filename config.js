// =====================================================================
//  Configuração do sistema — edite aqui textos, contatos e regras.
//  A chave publishable é pública por design; a segurança está nas
//  regras do banco (schema.sql). NUNCA coloque a chave secreta aqui.
// =====================================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://nubegsgayoqqpynrkhbu.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_b7QKEbMmXBoqBqvBGWRNvw_PJIcqLyV",

  // ---------- Identidade ----------
  NOME_APP: "Agenda Operacional BPA",
  NOME_LOCAL: "Terminal Paulínia",

  // Logo oficial no topo esquerdo. Suba a imagem (PNG ou SVG) no GitHub, junto dos
  // outros arquivos, e escreva o nome dela aqui, ex.: "logo.png".
  // Deixe "" para usar o ícone do app.
  LOGO_ARQUIVO: "",

  // ---------- Contato e endereço (aparecem no rodapé e na confirmação) ----------
  // Deixe "" para esconder um item.
  TELEFONE_PORTARIA: "",            // ex.: "(19) 3333-0000"
  WHATSAPP_PORTARIA: "(19) 97163-7863",  // gate da portaria: é deste número que a equipe chama o motorista
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
    "Use EPI completo: botina, calça, capacete e óculos.",
    "Transferência Raízen: traga o checklist da garagem assinado pelo técnico de segurança da transportadora. Sem esse documento, não será possível realizar o checklist.",
    "Se não puder vir, cancele pelo site para liberar a vaga para outro motorista.",
  ],
  ORIENTACOES_CURSO: [
    "O curso acontece às terças-feiras. Chegue com {CHEGAR} minutos de antecedência.",
    "Traga documento com foto (RG ou CNH).",
    "Traga EPI completo: botina, calça, capacete e óculos.",
    "A prova é feita pelo celular do motorista. Venha com o celular carregado e com internet.",
    "Quem concluir o curso teórico recebe o certificado por e-mail.",
    "Se não puder vir, cancele pelo site para liberar a vaga.",
  ],

  // Sugestões para o campo "Companhia"
  COMPANHIAS: ["RAÍZEN", "FOB", "CIF"],
};
