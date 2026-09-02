# F-Insight Quant Lab — fontes e motor interno

## Objetivo

Criar o motor interno do Quant Lab para estudar assimetrias em opções com probabilidade, volatilidade, Monte Carlo e leitura educativa.

O produto não deve publicar recomendações, não deve executar ordens e não deve prometer rentabilidade. A saída correta é: **hipóteses de assimetria para estudo**.

## Fontes prioritárias

### 1. Market Data B3 via distribuidores licenciados

Uso desejado:
- cotações de ações e ETFs
- book/último preço
- cadeia de opções
- volume
- negócios
- bid/ask
- dados com tempo real ou delay conforme contrato

Caminho comercial:
- localizar distribuidores licenciados no site da B3
- pedir orçamento para Ações e Opções
- confirmar licença de redistribuição/display para app e dashboard
- confirmar se pode exibir dados em ambiente fechado Premium

Provedores a consultar primeiro:
- Cedro Technologies
- CMA
- Nelogica
- OpLab
- Refinitiv/LSEG
- Bloomberg
- Morningstar Real-Time Data
- TradingView
- ADVFN
- Agência Estado/Broadcast
- BTG Solutions
- dxFeed
- Avelacom
- Beyond Soluções
- FIS Global Trading

### 2. DataWise+

Uso desejado:
- dados analíticos de negociação
- alocação
- posição em aberto
- custódia
- comportamento por categoria de investidor
- dados de mercado à vista, termo, opções, futuro e empréstimo de ativos

Observação:
DataWise+ é excelente para inteligência e análise, mas não substitui necessariamente uma cadeia de opções em tempo real para scanner intradiário.

### 3. UP2DATA

Uso desejado:
- arquivos e dados para marcação a mercado
- risco
- preços de referência
- posições em aberto
- dados corporativos/listadas conforme pacotes
- rotinas de risco e pricing

Observação:
UP2DATA é mais próximo de infraestrutura de dados/arquivos. Bom para motor institucional, risco, fechamento e consolidação.

### 4. Banco Central / CVM / dados abertos

Uso desejado:
- Selic
- CDI quando disponível por fonte apropriada
- IPCA
- dólar
- séries macro
- documentos regulatórios
- fatos relevantes
- dados de emissores

### 5. OpenBB

Uso desejado:
- adapter de pesquisa e protótipo
- histórico de preços
- fundamentos e dados internacionais
- opções dos EUA dependendo do provider
- integração com yfinance, Polygon, FRED, Tradier, Intrinio e outros

Papel correto:
OpenBB deve ser adapter/ferramenta de aceleração, não fonte única para opções B3.

## Roadmap do motor

### Fase 0 — já iniciada

Arquivos criados:
- `src/services/quantLabEngine.js`
- `src/routes/quantLab.js`
- `scripts/testQuantLab.js`

Funcionalidades:
- Black-Scholes educativo
- volatilidade implícita por bisseção
- probabilidade risk-neutral aproximada
- Monte Carlo determinístico para teste
- scanner manual de opções
- score de assimetria
- aviso de risco

### Fase 1 — teste interno

Rodar:

```bash
node scripts/testQuantLab.js
```

Saída esperada:
- ranking de opções para estudo
- probabilidade de mercado
- probabilidade do modelo
- edge
- score
- aviso de risco

### Fase 2 — API interna

A rota `src/routes/quantLab.js` existe, mas só deve ser plugada no `server.js` quando o motor estiver validado.

Quando aprovado:

```js
const quantLabRoutes = require('./routes/quantLab');
app.use('/api/quant-lab', quantLabRoutes);
```

### Fase 3 — dados automáticos

Criar adapters:
- `b3MarketDataAdapter`
- `datawiseAdapter`
- `up2dataAdapter`
- `openbbAdapter`
- `bcbAdapter`
- `cvmAdapter`

### Fase 4 — cadeia real de opções

Normalizar os dados para o formato interno:

```json
{
  "symbol": "PETR4C450",
  "underlying": "PETR4",
  "type": "call",
  "strike": 45,
  "premium": 1.2,
  "bid": 1.1,
  "ask": 1.3,
  "volume": 18000,
  "openInterest": 120000,
  "daysToExpiry": 90
}
```

## Linguagem de produto permitida

Permitido:
- hipótese de assimetria
- para estudo
- cenário educacional
- probabilidade estimada
- premissas do modelo
- risco máximo
- simulação

Evitar:
- compre
- venda
- melhor operação
- oportunidade garantida
- sinal de compra
- recomendação
- retorno esperado como promessa
