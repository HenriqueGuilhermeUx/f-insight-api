# F-Insight Market Terminal — motor interno

## Status

Branch isolada: `feature/quant-market-terminal-internal`.

Nada desta camada deve ser publicado no site, app ou API pública antes de validação interna.

## Objetivo

Construir uma camada profissional de pesquisa de mercado inspirada em terminais modernos, sem copiar código de terceiros e sem depender de uma única fonte de dados.

A arquitetura separa:

- dados
- visualização
- inteligência
- sinais de pesquisa
- Quant Lab

## Componentes atuais

### Finnhub provider

Arquivo:

`src/services/marketTerminal/providers/finnhubProvider.js`

Capacidades:

- quote
- busca de símbolo
- company news

Variáveis:

```env
FINNHUB_API_KEY=
FINNHUB_BASE_URL=https://finnhub.io/api/v1
```

### OpenBB provider

Arquivo:

`src/services/marketTerminal/providers/openbbProvider.js`

Papel:

- hub de providers
- histórico de preços
- futura expansão para fundamentos, opções internacionais e macro

Variáveis:

```env
OPENBB_BASE_URL=
OPENBB_PROVIDER=yfinance
OPENBB_HISTORICAL_PATH=/api/v1/equity/price/historical
```

O endpoint é configurável para evitar acoplamento rígido à versão instalada do OpenBB.

### Sentiment Engine

Arquivo:

`src/services/marketTerminal/sentimentEngine.js`

Canais previstos:

- notícias
- Reddit
- X
- prediction markets

Pesos padrão:

- news: 45%
- Reddit: 20%
- X: 20%
- prediction: 15%

A saída é um score normalizado de -1 a +1 e um score visual de 0 a 100.

### Adanos

A integração foi preparada de forma genérica, mas permanece desabilitada até termos documentação/chave confirmada.

```env
ADANOS_BASE_URL=
ADANOS_API_KEY=
ADANOS_STOCK_SENTIMENT_PATH=
```

Não assumir endpoint sem validar a documentação oficial do fornecedor.

### Market Terminal Engine

Arquivo:

`src/services/marketTerminalEngine.js`

Funções principais:

- `providerStatus()`
- `buildAssetResearchBundle(symbol, options)`
- `buildTradingViewWidgetPlan(symbol)`
- `architecturePlan()`

O bundle agrega, quando disponíveis:

- quote
- histórico
- notícias
- sentimento
- status dos providers
- erros por provider sem derrubar o bundle inteiro

## TradingView

TradingView deve ser tratado apenas como camada de visualização no frontend, usando widgets/componentes oficiais e respeitando os termos do fornecedor.

Nenhum dado de widget deve ser proxied ou redistribuído por este backend.

Widgets planejados:

- advanced chart
- technical analysis
- symbol info
- market overview
- stock heatmap
- company profile
- financials
- top stories

## Testes

Teste offline, sem chaves:

```bash
npm run test:market-terminal
```

Teste live, usando providers configurados:

```bash
npm run test:market-terminal:live
```

Símbolo padrão do teste live: `AAPL`.

Para mudar:

```bash
TEST_SYMBOL=PETR4.SA npm run test:market-terminal:live
```

## Próximas etapas internas

1. Validar Finnhub com chave já existente.
2. Subir OpenBB localmente ou em serviço privado e validar histórico.
3. Criar cálculo de volatilidade histórica a partir do histórico normalizado.
4. Alimentar o Quant Lab com histórico real.
5. Adicionar BCB e CVM como fontes oficiais Brasil.
6. Adicionar importador CSV de option chain B3.
7. Testar Cedro/OpLab/DataWise quando houver credenciais.
8. Só depois avaliar exposição em API privada e UI.

## Guardrails

Esta camada é de pesquisa e educação.

Não deve:

- recomendar compra ou venda
- produzir sinal acionável como ordem
- executar operações
- prometer retorno
- classificar uma hipótese como garantia ou oportunidade certa

A linguagem correta é: hipótese, cenário, probabilidade estimada, risco e premissas do modelo.
