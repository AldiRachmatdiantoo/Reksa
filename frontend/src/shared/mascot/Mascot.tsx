import { motion } from 'motion/react';

/**
 * Tiga maskot REKSA, digambar sebagai SVG supaya tajam di semua ukuran dan bisa diberi ekspresi lewat kode.
 * - Risa (kertas catatan): pemandu utama, menulis, cek catatan, hasil.
 * - Rasi (pensil): timer fokus, ulang berkala, riwayat.
 * - Risu (buku berkacamata): materi, rubrik, layar kosong.
 *
 * Dekoratif (aria-hidden): teks di sekitarnya yang membawa pesan. Gerakan berhenti sendiri saat pengguna memilih
 * kurangi gerakan, karena App membungkus semuanya dengan MotionConfig reducedMotion="user".
 */
export type MascotName = 'risa' | 'rasi' | 'risu';
export type MascotMood = 'idle' | 'think' | 'happy' | 'cheer' | 'sleep';

export const MASCOT_LABEL: Record<MascotName, string> = { risa: 'Risa', rasi: 'Rasi', risu: 'Risu' };

const INK = '#0b3d3b';
/** Garis luar badan dan lengan. Terang di mode gelap supaya siluet maskot tetap terlihat di latar gelap. */
const LINE = 'var(--mascot-line)';
const TEAL = '#00827e';
const TEAL_DEEP = '#006763';
const MINT = '#cfeeea';
const EMBER = '#fe7a29';

type Point = { x: number; y: number };

type Face = {
  eyes: [Point, Point];
  eyeRx: number;
  eyeRy: number;
  /** Titik putih kecil di mata; null = tanpa kilau. */
  shine: number | null;
  mouth: Point;
  mouthHalf: number;
  mouthColor: string;
  stroke: number;
  cheeks?: [Point, Point];
  armsRest: [string, string];
  armsUp: [string, string];
  /** Posisi gelembung "..." atau "z" di kanan atas kepala. */
  extra: Point;
  viewBox: string;
};

const FACES: Record<MascotName, Face> = {
  risa: {
    eyes: [
      { x: 64, y: 98 },
      { x: 108, y: 98 },
    ],
    eyeRx: 8,
    eyeRy: 10,
    shine: 2.6,
    mouth: { x: 86, y: 122 },
    mouthHalf: 12,
    mouthColor: INK,
    stroke: 5,
    cheeks: [
      { x: 48, y: 120 },
      { x: 124, y: 120 },
    ],
    armsRest: ['M18 130 q-14 6 -10 22', 'M150 130 q14 6 10 22'],
    armsUp: ['M18 130 q-18 -6 -14 -28', 'M150 130 q18 -6 14 -28'],
    extra: { x: 156, y: 14 },
    viewBox: '-6 0 196 236',
  },
  rasi: {
    eyes: [
      { x: 58, y: 108 },
      { x: 82, y: 108 },
    ],
    eyeRx: 6,
    eyeRy: 8,
    shine: 2,
    mouth: { x: 70, y: 124 },
    mouthHalf: 8,
    mouthColor: INK,
    stroke: 4,
    armsRest: ['M32 140 q-16 4 -14 20', 'M108 140 q16 -4 18 -20'],
    armsUp: ['M32 140 q-18 -6 -12 -26', 'M108 140 q18 -6 12 -26'],
    extra: { x: 120, y: 4 },
    viewBox: '4 0 160 244',
  },
  risu: {
    eyes: [
      { x: 71, y: 86 },
      { x: 111, y: 86 },
    ],
    eyeRx: 5,
    eyeRy: 6,
    shine: null,
    mouth: { x: 91, y: 118 },
    mouthHalf: 11,
    mouthColor: '#ffffff',
    stroke: 4,
    armsRest: ['M30 120 q-16 4 -14 22', 'M154 120 q14 4 12 22'],
    armsUp: ['M30 120 q-18 -6 -12 -28', 'M154 120 q18 -6 12 -28'],
    extra: { x: 162, y: 0 },
    viewBox: '4 -4 196 228',
  },
};

/** Badan tiap maskot tanpa mata, mulut, dan lengan (bagian yang berubah per ekspresi). */
function Body({ name }: { name: MascotName }) {
  if (name === 'risa') {
    return (
      <>
        <path
          d="M30 20 h86 l34 34 v144 a12 12 0 0 1 -12 12 h-108 a12 12 0 0 1 -12 -12 v-166 a12 12 0 0 1 12 -12z"
          fill="#ffffff"
          stroke={LINE}
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <path d="M116 20 v22 a12 12 0 0 0 12 12 h22" fill={MINT} stroke={LINE} strokeWidth="5" strokeLinejoin="round" />
        <line x1="40" y1="160" x2="130" y2="160" stroke="#bfe6e1" strokeWidth="5" strokeLinecap="round" />
        <line x1="40" y1="180" x2="104" y2="180" stroke="#bfe6e1" strokeWidth="5" strokeLinecap="round" />
        <path d="M58 210 v12 M102 210 v12" stroke={LINE} strokeWidth="5" strokeLinecap="round" />
      </>
    );
  }
  if (name === 'rasi') {
    return (
      <>
        <path d="M32 196 l38 30 l38 -30z" fill="#f3d9b1" stroke={LINE} strokeWidth="5" strokeLinejoin="round" />
        <path d="M60 218 l10 8 l10 -8z" fill={INK} />
        <rect x="32" y="56" width="76" height="144" rx="10" fill={TEAL} stroke={LINE} strokeWidth="5" />
        <line x1="57" y1="60" x2="57" y2="196" stroke={TEAL_DEEP} strokeWidth="4" />
        <line x1="83" y1="60" x2="83" y2="196" stroke={TEAL_DEEP} strokeWidth="4" />
        <rect x="28" y="40" width="84" height="22" rx="4" fill={MINT} stroke={LINE} strokeWidth="5" />
        <path
          d="M32 40 v-14 a14 14 0 0 1 14 -14 h48 a14 14 0 0 1 14 14 v14z"
          fill={EMBER}
          stroke={LINE}
          strokeWidth="5"
          strokeLinejoin="round"
        />
        <ellipse cx="70" cy="112" rx="30" ry="24" fill="#ffffff" opacity="0.95" />
      </>
    );
  }
  return (
    <>
      <rect x="30" y="20" width="120" height="170" rx="14" fill={TEAL} stroke={LINE} strokeWidth="5" />
      <rect x="138" y="30" width="16" height="152" rx="4" fill="#ffffff" stroke={LINE} strokeWidth="4" />
      <line x1="44" y1="24" x2="44" y2="186" stroke={TEAL_DEEP} strokeWidth="4" />
      <path d="M118 16 v36 l9 -8 l9 8 v-36z" fill={EMBER} stroke={LINE} strokeWidth="4" strokeLinejoin="round" />
      <rect x="56" y="74" width="30" height="24" rx="6" fill="#ffffff" stroke={LINE} strokeWidth="4" />
      <rect x="96" y="74" width="30" height="24" rx="6" fill="#ffffff" stroke={LINE} strokeWidth="4" />
      <line x1="86" y1="84" x2="96" y2="84" stroke={LINE} strokeWidth="4" />
      <rect x="60" y="140" width="62" height="10" rx="5" fill={MINT} />
      <path d="M66 190 v12 M106 190 v12" stroke={LINE} strokeWidth="5" strokeLinecap="round" />
    </>
  );
}

const BLINK = { scaleY: [1, 1, 0.1, 1], transition: { duration: 4, times: [0, 0.92, 0.95, 1], repeat: Infinity } };

function Eyes({ face, mood, blinkDelay }: { face: Face; mood: MascotMood; blinkDelay: number }) {
  const { eyes, eyeRx: rx, eyeRy: ry, shine, stroke } = face;
  if (mood === 'happy' || mood === 'cheer') {
    // Mata tersenyum: lengkung terbalik.
    return (
      <>
        {eyes.map((e, i) => (
          <path
            key={i}
            d={`M${e.x - rx - 1} ${e.y + 3} q${rx + 1} ${-ry * 1.5} ${2 * rx + 2} 0`}
            fill="none"
            stroke={INK}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        ))}
      </>
    );
  }
  if (mood === 'sleep') {
    return (
      <>
        {eyes.map((e, i) => (
          <path
            key={i}
            d={`M${e.x - rx} ${e.y} q${rx} ${ry * 0.9} ${2 * rx} 0`}
            fill="none"
            stroke={INK}
            strokeWidth={stroke}
            strokeLinecap="round"
          />
        ))}
      </>
    );
  }
  // idle dan think: mata bulat yang berkedip; think melirik ke kanan atas.
  const dx = mood === 'think' ? rx * 0.35 : 0;
  const dy = mood === 'think' ? -ry * 0.3 : 0;
  return (
    <>
      {eyes.map((e, i) => (
        <motion.g
          key={i}
          style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
          animate={BLINK}
          transition={{ ...BLINK.transition, delay: blinkDelay }}
        >
          <ellipse cx={e.x + dx} cy={e.y + dy} rx={rx} ry={ry} fill={INK} />
          {shine && <circle cx={e.x + dx + rx * 0.35} cy={e.y + dy - ry * 0.4} r={shine} fill="#ffffff" />}
        </motion.g>
      ))}
    </>
  );
}

function Mouth({ face, mood }: { face: Face; mood: MascotMood }) {
  const { mouth: m, mouthHalf: w, mouthColor: c, stroke } = face;
  if (mood === 'happy' || mood === 'cheer') {
    return (
      <path d={`M${m.x - w} ${m.y - 2} q${w} ${w * 1.8} ${2 * w} 0z`} fill={c} stroke={c} strokeWidth={stroke - 1} strokeLinejoin="round" />
    );
  }
  if (mood === 'think') {
    return <circle cx={m.x + w * 0.4} cy={m.y + 2} r={w * 0.32} fill="none" stroke={c} strokeWidth={stroke - 1} />;
  }
  if (mood === 'sleep') {
    return <path d={`M${m.x - w * 0.45} ${m.y + 2} h${w * 0.9}`} stroke={c} strokeWidth={stroke - 1} strokeLinecap="round" />;
  }
  return <path d={`M${m.x - w} ${m.y} q${w} ${w} ${2 * w} 0`} fill="none" stroke={c} strokeWidth={stroke} strokeLinecap="round" />;
}

function Arms({ face, mood }: { face: Face; mood: MascotMood }) {
  const up = mood === 'cheer';
  return (
    <>
      {face.armsRest.map((rest, i) => (
        <motion.path
          key={i}
          initial={false}
          animate={{ d: up ? face.armsUp[i] : rest }}
          transition={{ type: 'spring', stiffness: 260, damping: 14 }}
          fill="none"
          stroke={LINE}
          strokeWidth="5"
          strokeLinecap="round"
        />
      ))}
    </>
  );
}

function Extra({ at, mood }: { at: Point; mood: MascotMood }) {
  if (mood === 'think') {
    return (
      <g fill={TEAL}>
        {[0, 1, 2].map((i) => (
          <motion.circle
            key={i}
            cx={at.x + i * 11}
            cy={at.y + 14 - i * 5}
            r={3.5 + i * 0.8}
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1.4, repeat: Infinity, delay: i * 0.2 }}
          />
        ))}
      </g>
    );
  }
  if (mood === 'sleep') {
    return (
      <motion.g
        fill="none"
        stroke={TEAL}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        animate={{ y: [4, -4, 4], opacity: [0.5, 1, 0.5] }}
        transition={{ duration: 3, repeat: Infinity }}
      >
        <path d={`M${at.x} ${at.y + 16} h10 l-10 11 h10`} />
        <path d={`M${at.x + 16} ${at.y + 2} h7 l-7 8 h7`} />
      </motion.g>
    );
  }
  return null;
}

type MascotProps = {
  name: MascotName;
  mood?: MascotMood;
  className?: string;
};

export function Mascot({ name, mood = 'idle', className = '' }: MascotProps) {
  const face = FACES[name];
  const blinkDelay = name === 'risa' ? 0 : name === 'rasi' ? 1.3 : 2.6;
  const bob =
    mood === 'cheer'
      ? { y: [0, -14, 0, -8, 0], transition: { duration: 1.1, times: [0, 0.3, 0.55, 0.75, 1], repeat: Infinity, repeatDelay: 0.8 } }
      : mood === 'sleep'
        ? { y: [0, 2, 0], transition: { duration: 4, repeat: Infinity, ease: 'easeInOut' as const } }
        : { y: [0, -4, 0], transition: { duration: 3, repeat: Infinity, ease: 'easeInOut' as const, delay: blinkDelay / 3 } };

  return (
    <svg
      viewBox={face.viewBox}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
      className={`[--mascot-line:#0b3d3b] dark:[--mascot-line:#9fded8] ${className}`}
    >
      <ellipse
        cx={name === 'risa' ? 80 : name === 'rasi' ? 70 : 90}
        cy={name === 'risa' ? 226 : name === 'rasi' ? 236 : 210}
        rx={name === 'rasi' ? 44 : 56}
        ry="7"
        fill={INK}
        opacity="0.15"
      />
      <motion.g animate={bob}>
        <Body name={name} />
        {face.cheeks?.map((c, i) => (
          <ellipse key={i} cx={c.x} cy={c.y} rx="9" ry="6" fill={EMBER} opacity={mood === 'happy' || mood === 'cheer' ? 0.6 : 0.4} />
        ))}
        <Eyes face={face} mood={mood} blinkDelay={blinkDelay} />
        <Mouth face={face} mood={mood} />
        <Arms face={face} mood={mood} />
        <Extra at={face.extra} mood={mood} />
      </motion.g>
    </svg>
  );
}
