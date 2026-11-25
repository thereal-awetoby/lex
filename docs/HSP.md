# HSP Integration

## Overview

HSP (HashKey Payment) is HashKey Chain's fiat settlement gateway. Lex mandates support dual settlement rails: direct on-chain ERC-20 transfer and HSP-mediated settlement.

## Settlement Rails

```
SettlementRail.DIRECT         — ERC-20 transfer on-chain
SettlementRail.HSP            — HSP gateway settlement
SettlementRail.HSP_THEN_DIRECT — try HSP, fall back to direct
```

## How It Works

### Direct Settlement (implemented)

1. Agent calls `spend()` or `payWithEscrow()`
2. Contract transfers ERC-20 tokens to counterparty address
3. Receipt records the spend with `Decision.ALLOW`

### HSP Settlement (integration point)

HSP settlement follows the same mandate rules engine but routes the actual value transfer through HashKey's payment infrastructure:

1. Agent calls spend with HSP rail preference
2. Contract validates all mandate rules (caps, windows, denylist, etc.)
3. If ALLOW: emits `SpendDecision` with `Decision.ALLOW` and the provided `hspOrderId`
4. HSP relayer picks up the event and initiates fiat settlement
5. HSP confirms settlement back on-chain
6. Receipt updated with settlement confirmation

### HSP + Direct Fallback

For `HSP_THEN_DIRECT`:
1. Attempt HSP settlement
2. If HSP unavailable or times out, fall back to direct ERC-20 transfer
3. Receipt records which rail was actually used

## Current Status

- Direct settlement: fully implemented and tested
- HSP integration: event interface defined, awaiting HSP gateway API access on HSK mainnet
- The mandate rules engine is rail-agnostic — the same caps, windows, denylist, and exception logic apply regardless of settlement method

## Configuration

No additional configuration needed for direct settlement. HSP requires:

```env
HSP_GATEWAY_URL=       # HSP API endpoint (TBD — pending HSK team)
HSP_API_KEY=           # API credentials
HSP_WEBHOOK_SECRET=    # For settlement confirmations
```

## Security

- HSP settlement still requires the agent to pass all mandate rule checks
- HSP relayer is a separate trust boundary — it cannot initiate spends, only fulfill already-approved ones
- Denylist enforcement happens at the mandate contract level, before any rail is invoked
