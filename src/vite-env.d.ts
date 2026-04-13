/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WALLETCONNECT_PROJECT_ID: string;
  readonly VITE_RPC_ETHEREUM_1: string;
  readonly VITE_RPC_ETHEREUM_2: string;
  readonly VITE_RPC_ETHEREUM_3: string;
  readonly VITE_RPC_POLYGON_1: string;
  readonly VITE_RPC_POLYGON_2: string;
  readonly VITE_RPC_POLYGON_3: string;
  readonly VITE_RPC_ARBITRUM_1: string;
  readonly VITE_RPC_ARBITRUM_2: string;
  readonly VITE_RPC_ARBITRUM_3: string;
  readonly VITE_RPC_OPTIMISM_1: string;
  readonly VITE_RPC_OPTIMISM_2: string;
  readonly VITE_RPC_OPTIMISM_3: string;
  readonly VITE_RPC_BASE_1: string;
  readonly VITE_RPC_BASE_2: string;
  readonly VITE_RPC_BASE_3: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
