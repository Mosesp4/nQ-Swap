import { ConnectKitButton } from 'connectkit';
import { SwapWidget } from '@/components/SwapWidget/SwapWidget';

export function App() {
  return (
    <div className="min-h-screen bg-nq-bg flex flex-col">
      <header className="w-full border-b border-nq-border/50 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2.5">
            <svg
              width="28"
              height="28"
              viewBox="0 0 32 32"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <rect width="32" height="32" rx="8" fill="#7c3aed" />
              <path
                d="M8 10 L16 22 L24 10"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M8 22 L16 10 L24 22"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.5"
              />
            </svg>
            <span className="text-nq-text font-semibold text-lg tracking-tight">
              nQ<span className="text-nq-accent">Swap</span>
            </span>
          </div>

          {/* Wallet connect button */}
          <ConnectKitButton />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[460px]">
          {/* Ambient glow behind widget */}
          <div
            className="absolute pointer-events-none -translate-x-1/2 -translate-y-1/2"
            style={{
              width: '500px',
              height: '300px',
              background:
                'radial-gradient(ellipse at center, rgba(124,58,237,0.12) 0%, transparent 70%)',
              left: '50%',
              top: '50%',
            }}
            aria-hidden="true"
          />

          <SwapWidget />
        </div>
      </main>

      {/* Footer  */}

      <footer className="w-full border-t border-nq-border/30 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <p className="text-nq-muted text-xs">
            © 2026 nQ Protocol. All rights reserved.
          </p>
          <p className="text-nq-muted text-xs font-mono">v1.0.0</p>
        </div>
      </footer>
    </div>
  );
}
