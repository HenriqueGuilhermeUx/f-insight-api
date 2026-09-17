# F-Insight Advisor Intelligence — internal roadmap

## Goal

Build a backend-only professional analytics layer for advisors and offices on top of the F-Insight Market Terminal and Quant Lab.

The engine is descriptive and educational. It does not recommend securities, rank political outcomes, execute orders, or promise returns.

## Internal capabilities

- portfolio exposure summary;
- concentration diagnostics;
- allocation by asset class, sector and currency;
- deterministic stress scenarios;
- client-book impact aggregation;
- educational report payloads for advisor/client conversations;
- future integration with persistent watchlists, alerts and Open Finance/portfolio imports.

## Output language

Use:
- exposure;
- concentration;
- scenario impact;
- estimated drawdown under assumptions;
- client portfolios affected;
- points for review;
- educational scenario.

Avoid:
- buy/sell instructions;
- recommended security;
- best trade;
- guaranteed opportunity;
- promise of return.

## Rollout

1. deterministic engine and tests;
2. guarded internal routes;
3. internal staging validation;
4. merge behind environment flag;
5. later connect professional UI.
