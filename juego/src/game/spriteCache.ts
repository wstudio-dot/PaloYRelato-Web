import type { CharacterId, Expression } from './types';

const cardCache = new Map<string, HTMLCanvasElement>();
const headCache = new Map<string, HTMLCanvasElement>();

const INK = '#18181B';

export function getItemSprite(
  kind: 'bad' | 'good' | 'note' | 'coin',
  label: string,
  w: number,
  h: number,
  lane: number
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = `${kind}|${label}|${w}x${h}|${lane}`;
  const existing = cardCache.get(key);
  if (existing) return existing;

  const pad = 6;
  const canvas = document.createElement('canvas');
  canvas.width = w + pad * 2;
  canvas.height = h + pad * 2;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const cx = canvas.width * 0.5;
  const cy = canvas.height * 0.5;
  ctx.translate(cx, cy);

  if (kind === 'coin') {
    ctx.fillStyle = '#FACC15';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#713F12';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
  } else if (kind === 'note') {
    const laneColors = ['#DF2C2C', '#2563EB', '#16A34A'];
    ctx.fillStyle = laneColors[lane] || '#DF2C2C';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);
  } else if (kind === 'good' && label === 'CAFÉ') {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.4;
    ctx.fillRect(-15, -14, 30, 28);
    ctx.strokeRect(-15, -14, 30, 28);
    ctx.beginPath();
    ctx.arc(15, 0, 6, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();
    ctx.fillStyle = '#5F6E3E';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CAFÉ', 0, 1);
  } else {
    const isBad = kind === 'bad';
    // Offset comic shadow
    ctx.fillStyle = isBad ? '#DC2626' : '#16A34A';
    ctx.fillRect(-w / 2 + 3, -h / 2 + 3, w, h);

    // Card body
    ctx.fillStyle = isBad ? '#FFFFFF' : '#ECFDF5';
    ctx.strokeStyle = isBad ? INK : '#16A34A';
    ctx.lineWidth = 2.2;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeRect(-w / 2, -h / 2, w, h);

    ctx.fillStyle = isBad ? INK : '#15803D';
    ctx.font = `bold ${w < 120 ? 11 : 12}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);
  }

  cardCache.set(key, canvas);
  return canvas;
}

export function getHeadSprite(
  character: CharacterId,
  expression: Expression,
  hit: boolean
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const key = `${character}|${expression}|${hit ? 1 : 0}`;
  const existing = headCache.get(key);
  if (existing) return existing;

  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const ink = hit ? '#DC2626' : INK;
  const headR = 19;

  ctx.translate(size * 0.5, size * 0.5 + 4);
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Head circle
  ctx.fillStyle = hit ? '#FEE2E2' : '#FFFFFF';
  ctx.beginPath();
  ctx.arc(0, 0, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Eyes & Mouth
  ctx.lineWidth = 2;
  const eyeY = -2;
  const eyeX = 6.5;

  if (expression === 'laughing') {
    ctx.beginPath();
    ctx.arc(-eyeX, eyeY + 1, 3.5, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(eyeX, eyeY + 1, 3.5, Math.PI, 0);
    ctx.stroke();
  } else {
    const eyeR = expression === 'scared' ? 4.4 : 3.8;
    for (const side of [-1, 1]) {
      const cx = side * eyeX;
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(cx, eyeY, eyeR, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(cx + 0.8, eyeY, expression === 'scared' ? 1.2 : 1.7, 0, Math.PI * 2);
      ctx.fill();

      if (expression === 'tired' || (character === 'coffee' && expression === 'neutral')) {
        ctx.fillStyle = '#E4E4E7';
        ctx.beginPath();
        ctx.arc(cx, eyeY, eyeR, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }

    ctx.beginPath();
    if (expression === 'determined') {
      ctx.moveTo(-10, -8);
      ctx.lineTo(-3, -6);
      ctx.moveTo(10, -8);
      ctx.lineTo(3, -6);
    } else if (expression === 'worried' || expression === 'scared') {
      ctx.moveTo(-10, -6);
      ctx.lineTo(-4, -9);
      ctx.moveTo(10, -6);
      ctx.lineTo(4, -9);
    }
    ctx.stroke();
  }

  ctx.beginPath();
  if (expression === 'happy' || expression === 'laughing') {
    ctx.arc(0, 6, 5.5, 0.1 * Math.PI, 0.9 * Math.PI);
  } else if (expression === 'scared' || expression === 'worried') {
    ctx.arc(0, 8.5, 3.8, 0, Math.PI * 2);
  } else if (expression === 'determined') {
    ctx.moveTo(-4, 8);
    ctx.lineTo(5, 7);
  } else {
    ctx.moveTo(-4, 8);
    ctx.lineTo(4, 8);
  }
  ctx.stroke();

  // Red Baseball Cap for Singer
  if (character === 'singer') {
    ctx.lineWidth = 2.4;
    ctx.fillStyle = '#DF2C2C';
    ctx.beginPath();
    ctx.arc(0, -4, headR + 1, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(4, -5);
    ctx.lineTo(25, -3);
    ctx.lineTo(4, -1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  // Sweat droplets for Student
  if (character === 'student') {
    ctx.lineWidth = 1.6;
    ctx.fillStyle = '#BAE6FD';
    ctx.beginPath();
    ctx.arc(-23, -8, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(23, -4, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  headCache.set(key, canvas);
  return canvas;
}
