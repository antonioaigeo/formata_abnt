// Configuração do backend (Supabase). Sem preencher, o app funciona
// sozinho, salvando cada biblioteca só no navegador da pessoa (sem login,
// sem sincronizar entre aparelhos) — ótimo para testar antes de configurar.
//
// Para ativar contas de verdade (login + biblioteca na nuvem), siga o
// README.md ("Configurando o Supabase") e cole aqui a URL e a chave
// "anon public" do seu projeto Supabase. Essa chave é feita para ficar no
// código do site (não é secreta) — quem protege os dados de cada pessoa é
// a Row Level Security configurada em supabase-schema.sql.
window.CATALOGO_CONFIG = {
  SUPABASE_URL: "https://nrdqrdpexskwgbzotkyt.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_ggcbwzjDoJrRSasY1jPjuQ_p0VwBMzV"
};
