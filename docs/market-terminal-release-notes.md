# F-Insight Internal Market Terminal — release notes

## Status

Validated in the isolated branch `feature/quant-market-terminal-internal` and deployed to the separate Render staging service `f-insight-quant-internal`.

The public F-Insight product does not consume these endpoints yet.

## Safety / exposure model

- The internal terminal route only mounts when `INTERNAL_MARKET_TERMINAL_ENABLED=true`.
- Every internal endpoint requires `FINSIGHT_INTERNAL_API_KEY` through `X-FInsight-Internal-Key` or a Bearer token.
- Production can receive the code with the feature remaining disabled by default.
- The engine does not execute orders and its option outputs are educational research simulations.

## CI validation

The branch CI validates:

- server and route JavaScript syntax;
- internal route module loading;
- Quant Lab deterministic test;
- Market Terminal deterministic test;
- authenticated HTTP smoke tests;
- rejection of unauthenticated internal requests;
- option-risk endpoint;
- strategy endpoint;
- live public-data test for `PETR4.SA` using the public-data fallback path.

## Current engine capabilities

- Finnhub adapter when a key is configured;
- Yahoo historical fallback for prototyping;
- OpenBB adapter when a server is configured;
- Banco Central SGS macro snapshot;
- CVM company registry search and source catalog;
- sentiment aggregation with optional external provider;
- historical volatility 20/60/120/252;
- annualized drift;
- SMA20/SMA60 and trend classification;
- maximum drawdown;
- option-chain CSV normalization;
- Black-Scholes pricing;
- implied volatility;
- risk-neutral probability approximation;
- seeded Monte Carlo;
- asymmetry scanner;
- option Greeks;
- probability-of-profit simulation;
- multi-leg options payoff simulation;
- guarded TradingView integration plan for future frontend use.

## External data still pending

Production-grade B3 option chain remains dependent on a licensed B3 data provider or contracted B3 data service. The current public-data adapters are suitable for internal research and prototype validation, not a substitute for licensed real-time B3 redistribution.
