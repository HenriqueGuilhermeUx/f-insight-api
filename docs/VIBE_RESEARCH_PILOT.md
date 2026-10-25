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


## Additional hardening

- Strict internal API key is required even if the legacy non-production
  INTERNAL_MARKET_TERMINAL_ALLOW_UNAUTH override is set. Never expose it in JS.
- Only the supported factor catalog and metadata fields are returned.
- Python source_code, module_path and arbitrary metadata are dropped.
- Read responses still have untrusted provenance; no LLM instructions should
  ever be inferred from upstream descriptions, fields or names.
- Mock HTTP contract tests check key enforcement, invalid alpha identifiers,
  no POST actions, response redaction and no upstream calls for invalid requests.

## Consulta por mercado e tipo de fator (somente leitura)

GET /api/internal/vibe-research/alphas aceita exclusivamente filtros opcionais:
- universe: equity_us ou crypto
- zoo: alpha101, gtja191, qlib158, academic, fundamental
- limit: inteiro de 1 a 100

Outros parâmetros recebem HTTP 400 e não alcançam o serviço externo.
Os parâmetros são construídos pela API, não repassados como URL de entrada.
O Vibe Trading não fornece suporte generalizado à B3 nessa rota, portanto
não anunciar cobertura brasileira com esse piloto. A origem deve permanecer
autenticada, isolada e desabilitada em produção até homologação.
