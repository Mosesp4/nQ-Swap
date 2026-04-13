# nQ Swap Widget

A production-quality, standalone DeFi swap widget built as a React SPA from scratch — no boilerplate, no UI libraries, every decision intentional.

Built as a technical assessment for nQ-Swap Protocol.

---

## Features

- **Multi-chain support** — Ethereum, Polygon, Arbitrum, Optimism, Base
- **Wallet connection** — ConnectKit with WalletConnect + injected wallet support
- **Transaction state machine** — formally typed finite state machine with illegal transition detection
- **Request deduplication** — `useRef`-based mutex prevents duplicate wallet popups from rapid clicks
- **Transaction recovery** — IndexedDB + localStorage persistence; tab-close mid-transaction recovers on reload
- **Custom pending animation** — nQ logo SVG path-tracing synced to chain block time
- **RPC fallback** — 3 endpoints per chain with exponential backoff (100ms → 200ms → 400ms)
- **Toast notifications** — zero-dependency dismissible toasts for errors and confirmations
- **TypeScript strict mode** — zero `any` types throughout
- **Accessibility** — `prefers-reduced-motion`, `aria-*` attributes, keyboard navigation

---

## Prerequisites

- **Node.js** v18+ (v20+ recommended)
- **npm** v9+
- A browser wallet: MetaMask, Coinbase Wallet, or any WalletConnect-compatible wallet
- API keys from [Alchemy](https://alchemy.com) and/or [Infura](https://infura.io) (free tier sufficient)
- A WalletConnect Project ID from [cloud.walletconnect.com](https://cloud.walletconnect.com) (free)

---

## Environment Setup

```bash
cp .env.example .env
```

Open `.env` and fill in the following values:

### Required

```bash
VITE_WALLETCONNECT_PROJECT_ID=your_project_id
```

Get this from [cloud.walletconnect.com](https://cloud.walletconnect.com) → Create Project → copy the Project ID.

### RPC Endpoints (one set per chain)

Each chain needs up to 3 RPC endpoints. The widget tries them in order with exponential backoff. Public fallbacks are used automatically if any are left blank.

```bash
# Ethereum Mainnet
VITE_RPC_ETHEREUM_1=https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY
VITE_RPC_ETHEREUM_2=https://mainnet.infura.io/v3/YOUR_KEY
VITE_RPC_ETHEREUM_3=https://cloudflare-eth.com

# Polygon
VITE_RPC_POLYGON_1=https://polygon-mainnet.g.alchemy.com/v2/YOUR_KEY
VITE_RPC_POLYGON_2=https://polygon-mainnet.infura.io/v3/YOUR_KEY
VITE_RPC_POLYGON_3=https://polygon-rpc.com

# Arbitrum
VITE_RPC_ARBITRUM_1=https://arb-mainnet.g.alchemy.com/v2/YOUR_KEY
VITE_RPC_ARBITRUM_2=https://arbitrum-mainnet.infura.io/v3/YOUR_KEY
VITE_RPC_ARBITRUM_3=https://arb1.arbitrum.io/rpc

# Optimism
VITE_RPC_OPTIMISM_1=https://opt-mainnet.g.alchemy.com/v2/YOUR_KEY
VITE_RPC_OPTIMISM_2=https://optimism-mainnet.infura.io/v3/YOUR_KEY
VITE_RPC_OPTIMISM_3=https://mainnet.optimism.io

# Base
VITE_RPC_BASE_1=https://base-mainnet.g.alchemy.com/v2/YOUR_KEY
VITE_RPC_BASE_2=https://base-mainnet.infura.io/v3/YOUR_KEY
VITE_RPC_BASE_3=https://mainnet.base.org
```

**Minimum viable setup**: Only `VITE_WALLETCONNECT_PROJECT_ID` is strictly required. The widget falls back to public RPC nodes if Alchemy/Infura URLs are omitted, but public nodes are rate-limited and unsuitable for production use.

---

## Local Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

```bash
# Type check only (no build)
npm run typecheck

# Production build
npm run build

# Preview production build
npm run preview
```

---

## Running on Each Supported Chain

The widget automatically detects the chain your wallet is connected to. To test on a specific chain:

1. Open your wallet (e.g. MetaMask)
2. Switch to the desired network
3. The widget updates immediately — animation speed changes to reflect the chain's block time

| Chain | Chain ID | Block Time | Animation Speed |
|-------|----------|------------|-----------------|
| Ethereum | 1 | ~12s | Slow |
| Polygon | 137 | ~2s | Medium |
| Optimism | 10 | ~2s | Medium |
| Base | 8453 | ~2s | Medium |
| Arbitrum | 42161 | ~0.25s | Fast |

---

## Key Architecture Files

```
src/
├── hooks/
│   ├── useTransactionStateMachine.ts  # Formal FSM — the core of all transaction logic
│   ├── useDeduplicatedSwap.ts         # Mutex lock preventing duplicate wallet popups
│   ├── useTransactionRecovery.ts      # On-mount recovery from IndexedDB/localStorage
│   └── useBlockTime.ts               # Chain-aware block time for animation sync
├── lib/
│   ├── wagmiConfig.ts                 # Multi-chain Wagmi config with fallback transports
│   ├── transactionStorage.ts         # Dual-layer IndexedDB + localStorage persistence
│   └── rpcFallback.ts                # Fetch-level RPC fallback with exponential backoff
├── components/
│   ├── SwapWidget/
│   │   ├── SwapWidget.tsx             # Main orchestrator component
│   │   ├── TokenSelector.tsx          # Searchable token picker modal
│   │   ├── SwapButton.tsx             # State-aware CTA button
│   │   └── RecoveryBanner.tsx         # Slide-down pending tx recovery banner
│   ├── animations/
│   │   └── NQLogoPendingAnimation.tsx # SVG path-tracing logo animation
│   └── ui/
│       └── Toast.tsx                  # Zero-dependency toast notification system
└── types/
    └── transaction.ts                 # Shared discriminated union types
```

---

## Verifying Key Features

### Deduplication stress test
1. Connect wallet, select tokens, enter an amount
2. Open DevTools → Console
3. Click **Swap** 10 times as fast as possible
4. Verify: exactly 1 `Lock acquired` log, 9 `Deduplicated` logs, 1 wallet interaction

### Transaction recovery
1. Connect wallet, select tokens, enter an amount, click **Swap**
2. While the status shows "Waiting for on-chain confirmation…", hard-close the tab
3. Re-open `http://localhost:5173`
4. The Recovery Banner slides down automatically within ~1 second

### RPC error handling
1. Temporarily set an invalid RPC URL in `.env`: `VITE_RPC_ETHEREUM_1=https://invalid.rpc`
2. Restart the dev server
3. Click **Swap**
4. Observe: retry attempts logged in the console, then a persistent red error toast

### Animation speed by chain
1. Connect wallet on Ethereum — animation loops slowly (~12s)
2. Switch to Arbitrum — animation spins noticeably faster (~0.25s)

---

## Known Limitations

- **Mock swap execution**: The swap executor uses simulated delays and a fake transaction hash. A production implementation would call a DEX aggregator (1inch, 0x, Uniswap Universal Router) for real quotes and a real `writeContract` call for execution.
- **No token allowance flow**: ERC-20 approval transactions are not implemented. Real swaps require an `approve()` call before the first swap of a given token.
- **Hardcoded token list**: Only ETH, USDC, DAI, WBTC, and MATIC are supported. A production widget would fetch from a live token list.
- **Hardcoded exchange rates**: Price quotes are mocked. Real rates would come from a DEX aggregator or on-chain price oracle.
- **No error boundary**: An unhandled React error would show a blank screen. A production build should wrap the widget in an error boundary.
- **Large bundle size**: wagmi + viem + connectkit together exceed 500KB minified. Code splitting and lazy loading would be required for embedding in a production app.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript (strict) |
| Build | Vite 5 |
| Web3 | Wagmi v2 + Viem |
| Wallet UI | ConnectKit |
| Animation | Framer Motion 11 |
| Persistence | idb (IndexedDB) + localStorage |
| Styling | Tailwind CSS |
| State | useReducer (state machine) + useState |
