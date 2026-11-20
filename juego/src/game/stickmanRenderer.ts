import { getHeadSprite } from './spriteCache';
import type { CharacterId, Expression, Pose } from './types';

export interface DrawStickmanOpts {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  scale?: number;
  character: CharacterId;
  pose?: Pose;
  expression?: Expression;
  time?: number;
  facing?: 1 | -1;
  squashX?: number;
  squashY?: number;
  hitFlash?: number;
}

const INK = '#18181B';

export function drawStickman({
  ctx,
  x,
  y,
  scale = 1,
  character,
  pose = 'idle',
  expression = 'neutral',
  time = 0,
  facing = 1,
  squashX = 1,
  squashY = 1,
  hitFlash = 0,
}: DrawStickmanOpts) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing * scale * squashX, scale * squashY);

  const isHit = hitFlash > 0;
  const inkColor = isHit ? '#DC2626' : INK;
  ctx.strokeStyle = inkColor;
  ctx.lineWidth = 2.6;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const walkCycle = pose === 'walk' ? Math.sin(time * 8) : pose === 'run' ? Math.sin(time * 14) : 0;
  const bob =
    pose === 'walk'
      ? Math.abs(Math.sin(time * 8)) * 3
      : pose === 'run'
        ? Math.abs(Math.sin(time * 14)) * 5
        : Math.sin(time * 3.2) * 1.5;

  const legSwing = walkCycle * (pose === 'run' ? 22 : 13);
  const armSwing = -walkCycle * (pose === 'run' ? 20 : 11);

  // Fast flat shadow bar
  ctx.fillStyle = 'rgba(24, 24, 27, 0.12)';
  ctx.fillRect(-16, 0, 32, 4);

  const hipY = -36 - bob;
  const shoulderY = -74 - bob;
  const headY = -98 - bob;

  // --- LEGS & TROUSERS ---
  if (character === 'singer') {
    drawStickLeg(ctx, -6, hipY, -7 - legSwing * 0.65, 0, inkColor);
    drawStickLeg(ctx, 6, hipY, 7 + legSwing * 0.65, 0, inkColor);
  } else {
    const pantColor =
      character === 'coffee' ? '#6C4A33' : character === 'gamer' ? '#2A2D34' : '#2E3138';
    drawTrouserLeg(ctx, -6, hipY, -8 - legSwing * 0.7, 0, pantColor, inkColor);
    drawTrouserLeg(ctx, 6, hipY, 8 + legSwing * 0.7, 0, pantColor, inkColor);
  }

  // --- BACK ARM ---
  const backArmAngle =
    pose === 'dramatic'
      ? -2.4
      : pose === 'guitar'
        ? 0.45
        : pose === 'shield'
          ? -0.8
          : 0.25 + armSwing * 0.03;
  drawArm(ctx, -11, shoulderY + 4, backArmAngle, character, inkColor);

  // --- TORSO & OUTFIT (fast fillRect/strokeRect instead of roundRect) ---
  if (character === 'coffee') {
    ctx.fillStyle = '#FAF9F6';
    ctx.fillRect(-13, shoulderY, 26, 39);
    ctx.strokeRect(-13, shoulderY, 26, 39);

    ctx.fillStyle = '#65723F';
    ctx.fillRect(-15, shoulderY - 1, 11, 40);
    ctx.strokeRect(-15, shoulderY - 1, 11, 40);

    ctx.fillRect(4, shoulderY - 1, 11, 40);
    ctx.strokeRect(4, shoulderY - 1, 11, 40);
  } else if (character === 'student') {
    ctx.fillStyle = '#7CB0D9';
    ctx.fillRect(-14, shoulderY, 28, 39);
    ctx.strokeRect(-14, shoulderY, 28, 39);

    ctx.beginPath();
    ctx.moveTo(0, shoulderY + 4);
    ctx.lineTo(0, shoulderY + 38);
    ctx.stroke();
  } else if (character === 'singer') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(-10, shoulderY + 2, 20, 34);

    ctx.fillStyle = '#4B4E54';
    ctx.fillRect(-11, shoulderY + 1, 22, 48);
    ctx.strokeRect(-11, shoulderY + 1, 22, 48);
    ctx.strokeRect(-5, shoulderY + 18, 10, 9);
  } else if (character === 'gamer') {
    ctx.fillStyle = '#6C1D2E';
    ctx.fillRect(-15, shoulderY - 1, 30, 41);
    ctx.strokeRect(-15, shoulderY - 1, 30, 41);
    ctx.strokeRect(-10, shoulderY + 24, 20, 12);
  }

  // --- FRONT ARM & PROPS ---
  if (character === 'coffee') {
    const frontArmAngle =
      pose === 'coffee' ? -1.4 : pose === 'dramatic' ? -2.2 : -0.25 - armSwing * 0.03;
    const hand = drawArm(ctx, 11, shoulderY + 4, frontArmAngle, character, inkColor);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(hand.x - 2, hand.y - 6, 10, 11);
    ctx.strokeRect(hand.x - 2, hand.y - 6, 10, 11);
  } else if (character === 'student') {
    const frontArmAngle = pose === 'dramatic' ? -2.2 : -0.35 - armSwing * 0.03;
    const hand = drawArm(ctx, 11, shoulderY + 4, frontArmAngle, character, inkColor);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(hand.x - 2, hand.y - 8, 11, 14);
    ctx.strokeRect(hand.x - 2, hand.y - 8, 11, 14);
  } else if (character === 'singer') {
    drawArm(
      ctx,
      10,
      shoulderY + 4,
      pose === 'guitar' ? 0.55 : -0.3 - armSwing * 0.03,
      character,
      inkColor
    );
    ctx.save();
    ctx.translate(2, shoulderY + 22);
    ctx.rotate(pose === 'guitar' ? -0.28 + Math.sin(time * 18) * 0.06 : -0.22);
    ctx.fillStyle = '#DF9E59';
    ctx.beginPath();
    ctx.arc(-4, 1, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#3B2818';
    ctx.fillRect(-5, -1, 5, 5);
    ctx.fillStyle = '#5C3A21';
    ctx.fillRect(6, -2, 20, 4);
    ctx.strokeRect(6, -2, 20, 4);
    ctx.restore();
  } else if (character === 'gamer') {
    const frontArmAngle = pose === 'shield' ? -0.95 : -0.45 - armSwing * 0.03;
    const hand = drawArm(ctx, 12, shoulderY + 4, frontArmAngle, character, inkColor);
    ctx.fillStyle = '#C7EC2E';
    ctx.fillRect(hand.x - 3, hand.y - 6, 16, 10);
    ctx.strokeRect(hand.x - 3, hand.y - 6, 16, 10);
  }

  // --- CACHED HEAD SPRITE (1 drawImage instead of 18+ paths!) ---
  const headSprite = getHeadSprite(character, expression, isHit);
  if (headSprite) {
    ctx.drawImage(headSprite, -32, headY - 36);
  }

  ctx.restore();
}

function drawTrouserLeg(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  footX: number,
  footY: number,
  color: string,
  ink: string
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(hipX, hipY + 2);
  ctx.lineTo(footX, footY - 4);
  ctx.stroke();

  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(hipX, hipY + 2);
  ctx.lineTo(footX, footY - 4);
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(footX - 3, footY - 4, 12, 5);
  ctx.strokeRect(footX - 3, footY - 4, 12, 5);
}

function drawStickLeg(
  ctx: CanvasRenderingContext2D,
  hipX: number,
  hipY: number,
  footX: number,
  footY: number,
  ink: string
) {
  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(hipX, hipY + 12);
  ctx.lineTo(footX, footY - 3);
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(footX - 3, footY - 4, 11, 5);
  ctx.strokeRect(footX - 3, footY - 4, 11, 5);
}

function drawArm(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  angle: number,
  character: CharacterId,
  ink: string
): { x: number; y: number } {
  const len = 25;
  const ex = sx + Math.sin(angle) * len;
  const ey = sy + Math.cos(angle) * len;

  if (character !== 'singer') {
    const sleeveColor =
      character === 'coffee' ? '#65723F' : character === 'student' ? '#7CB0D9' : '#6C1D2E';
    ctx.strokeStyle = sleeveColor;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  ctx.strokeStyle = ink;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(ex - 3, ey - 3, 6, 6);
  ctx.strokeRect(ex - 3, ey - 3, 6, 6);

  return { x: ex, y: ey };
}
