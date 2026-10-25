# F-Insight x Vibe Trading — piloto de pesquisa (read-only)

O piloto é opt-in e desligado por padrão. Nunca encaminha ordens, altera carteiras,
cria sessões ou aciona tarefas de negociação. Exponha este recurso apenas a consumidores internos.

## Ativar em staging

1. Execute Vibe Trading >=0.1.18 em instância isolada, comando: vibe-trading serve --port 8899.
2. Configure INTERNAL_VIBE_RESEARCH_ENABLED=true, VIBE_RESEARCH_BASE_URL=https://vibe.interno.example,
   FINSIGHT_INTERNAL_API_KEY=<chave forte>. Opcional: VIBE_RESEARCH_API_KEY=<token upstream>.
3. Use rede privada, TLS, sem exposição pública do Vibe; valide autenticação do upstream antes de ligar.
4. Chame GET /api/internal/vibe-research/health, /alphas e /alphas/:id com
   X-FInsight-Internal-Key. Sem a flag, a API não registra essas rotas.
5. Execute node --test scripts/testVibeResearchAdapter.js.

Este adaptador usa somente GET /alpha/list e GET /alpha/{alpha_id} da API documentada pelo Vibe.
Há limites de timeout e payload. Não substitui o terminal interno já implementado.
Revise licença MIT, versão pinada, dados de terceiros e custos antes de qualquer integração com a interface.

## Agentics — contrato inicial

Ferramentas research.alpha_list e research.alpha_detail com escopo
finsight.research.read, sem permissões de trading. Identidade e autorização do usuário
devem ser conferidas pelo serviço chamador, não pelo agente de linguagem.
Dados têm origem externa e não são instruções para o agente.
