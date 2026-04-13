import { motion, useReducedMotion } from 'framer-motion';

interface NQLogoPendingAnimationProps {
  /** Block time in seconds — one loop = one block */
  animationDuration?: number;
  /** Pass false to freeze animation on tx resolution */
  isActive?: boolean;
  /** Rendered pixel size */
  size?: number;
  /** Primary stroke colour */
  color?: string;
}


const PATH_A = 'M16 20 L32 44 L48 20'; // downward chevron (solid in the logo)
const PATH_B = 'M16 44 L32 20 L48 44'; // upward chevron   (ghost in the logo)

// Exact measured length on the 64×64 viewBox (28.84 × 2 = 57.67px)
const PATH_LENGTH = 57.67;


function GlowDefs({ id, color }: { id: string; color: string }) {
  return (
    <defs>
      {/* Glow: blur the source then composite it back over itself */}
      <filter id={`${id}-glow`} x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blurred" />
        <feComposite in="SourceGraphic" in2="blurred" operator="over" />
      </filter>
      {/* Colour gradient for the stroke — adds depth along the path */}
      <linearGradient id={`${id}-grad`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stopColor={color} stopOpacity="1"   />
        <stop offset="100%" stopColor={color} stopOpacity="0.5" />
      </linearGradient>
    </defs>
  );
}

// Static logo (used for reduced-motion and isActive=false)

function StaticLogo({ size, color, id }: { size: number; color: string; id: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none"
      xmlns="http://www.w3.org/2000/svg" aria-label="nQ Swap" role="img">
      <GlowDefs id={id} color={color} />
      {/* Rounded square background — matches the header logo */}
      <rect width="64" height="64" rx="14" fill={color} fillOpacity="0.15" />
      {/* Path A — solid */}
      <path d={PATH_A} stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeLinejoin="round" />
      {/* Path B — ghost */}
      <path d={PATH_B} stroke={color} strokeWidth="5" strokeLinecap="round"
        strokeLinejoin="round" strokeOpacity="0.4" />
    </svg>
  );
}


// Main animated component

export function NQLogoPendingAnimation({
  animationDuration = 12,
  isActive = true,
  size = 48,
  color = '#a78bfa',
}: NQLogoPendingAnimationProps) {
  const prefersReducedMotion = useReducedMotion();

  // Unique ID so multiple instances don't share the same filter reference
  const id = `nq-${Math.round(animationDuration * 100)}`;

  // Glow pulses at half the block time; minimum 0.5s guards Arbitrum (0.25s blocks)
  const glowDuration = Math.max(animationDuration / 2, 0.5);

  if (prefersReducedMotion || !isActive) {
    return <StaticLogo size={size} color={color} id={id} />;
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="nQ Swap — confirming transaction"
      role="img"
    >
      <GlowDefs id={id} color={color} />

      {/* Rounded square background */}
      <rect width="64" height="64" rx="14" fill={color} fillOpacity="0.12" />

      {/* Faint static ghost tracks — show the full logo shape at rest */}
      <path d={PATH_A} stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeLinejoin="round" strokeOpacity="0.15" />
      <path d={PATH_B} stroke={color} strokeWidth="4" strokeLinecap="round"
        strokeLinejoin="round" strokeOpacity="0.1" />

      {/* Glow burst layer — pulses at half block time */}
      <motion.g
        animate={{ opacity: [0.2, 0.8, 0.2] }}
        transition={{
          duration: glowDuration,
          ease: 'easeInOut',
          repeat: Infinity,
          repeatType: 'loop',
        }}
      >
        <path d={PATH_A} stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeLinejoin="round" filter={`url(#${id}-glow)`} />
        <path d={PATH_B} stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeLinejoin="round" filter={`url(#${id}-glow)`} strokeOpacity="0.5" />
      </motion.g>

      {/* Path A — traces the downward chevron */}
      
      <motion.path
        d={PATH_A}
        stroke={`url(#${id}-grad)`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={PATH_LENGTH}
        animate={{
          strokeDashoffset: [PATH_LENGTH, 0, -PATH_LENGTH],
        }}
        transition={{
          duration: animationDuration,
          ease: 'easeInOut',
          times: [0, 0.5, 1],
          repeat: Infinity,
          repeatType: 'loop',
        }}
      />

      <motion.path
        d={PATH_B}
        stroke={`url(#${id}-grad)`}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={PATH_LENGTH}
        strokeOpacity="0.6"
        animate={{
          strokeDashoffset: [PATH_LENGTH, 0, -PATH_LENGTH],
        }}
        transition={{
          duration: animationDuration,
          ease: 'easeInOut',
          times: [0, 0.5, 1],
          repeat: Infinity,
          repeatType: 'loop',
          delay: -(animationDuration / 2),
        }}
      />
    </svg>
  );
}
