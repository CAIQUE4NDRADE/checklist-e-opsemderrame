// =====================================================================
//  Configuração — preencha com os dados do seu projeto Supabase
//  (Supabase > Project Settings > API)
//  A anon key é pública por design; a segurança está nas regras (RLS)
//  e nas funções do schema.sql. NUNCA coloque a service_role key aqui.
// =====================================================================
window.APP_CONFIG = {
  SUPABASE_URL: "https://nubegsgayoqqpynrkhbu.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_b7QKEbMmXBoqBqvBGWRNvw_PJIcqLyV",

  // Nome que aparece no topo das páginas e no cartaz do QR code
  NOME_LOCAL: "Terminal Paulínia",

  // Destacar documentos que vencem em até X dias
  ALERTA_DIAS: 60,

  // Quantos dias à frente o motorista pode agendar
  DIAS_ANTECEDENCIA: 15,

  // Curso Operação Sem Derrame: quantas semanas à frente mostrar
  NOME_CURSO: "Curso Operação Sem Derrame",
  CURSO_SEMANAS: 12,

  // Sugestões para o campo "Companhia"
  COMPANHIAS: ["RAÍZEN", "FOB", "CIF"],
};
