import React, { useEffect, useRef } from 'react';
import {
  ACTS,
  EXAM_ANSWERS,
  IMPULSE_ADS,
  INTRUSIVE_THOUGHTS,
  RAGE_TWEETS,
} from '../game/actsConfig';
import { soundEngine } from '../game/audio';
import {
  clampSafeInt,
  isValidPowerUp,
  MAX_SAFE_GAME_COINS,
  MAX_SAFE_GAME_VIEWS,
  MAX_SAFE_LIVES,
  sanitizeOwnedUpgrades,
} from '../game/security';
import { getItemSprite } from '../game/spriteCache';
import { drawStickman } from '../game/stickmanRenderer';
import { POWERUP_INFO } from '../game/upgradesAndTrivia';
import type {
  CharacterId,
  Expression,
  GameState,
  HudSnapshot,
  Pose,
  PowerUpType,
  UpgradeId,
} from '../game/types';

export interface TriviaGrant {
  seq: number;
  correct: boolean;
  powerUp: PowerUpType | null;
}

export interface ShopAction {
  seq: number;
  ownedUpgrades: Partial<Record<UpgradeId, number>>;
  coins: number;
  lives: number;
  maxLives: number;
  powerUp?: PowerUpType | null;
}

interface GameCanvasProps {
  gameState: GameState;
  loopTrigger: number;
  restartTrigger: number;
  shopResumeTrigger: number;
  firePulseTrigger?: number;
  shopSync: ShopAction;
  triviaGrant: TriviaGrant;
  onHudUpdate: (hud: HudSnapshot) => void;
  onOpenShop: (hud: HudSnapshot) => void;
  onTriggerTrivia: (hud: HudSnapshot) => void;
  onReachVictory: (finalHud: HudSnapshot) => void;
  onGameOver: (finalHud: HudSnapshot) => void;
}

interface FallingItem {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  kind: 'bad' | 'good' | 'note' | 'coin';
  label: string;
  lane: 0 | 1 | 2;
}

interface Bullet {
  x: number;
  y: number;
  vy: number;
  radius: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
}

interface FloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

interface LaneFlash {
  lane: number;
  timer: number;
  good: boolean;
}

const MAX_PARTICLES = 55;
const MAX_TEXTS = 10;

export const GameCanvas: React.FC<GameCanvasProps> = ({
  gameState,
  loopTrigger,
  restartTrigger,
  shopResumeTrigger,
  firePulseTrigger = 0,
  shopSync,
  triviaGrant,
  onHudUpdate,
  onOpenShop,
  onTriggerTrivia,
  onReachVictory,
  onGameOver,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameStateRef = useRef<GameState>(gameState);
  gameStateRef.current = gameState;

  const callbacksRef = useRef({
    onHudUpdate,
    onOpenShop,
    onTriggerTrivia,
    onReachVictory,
    onGameOver,
  });
  callbacksRef.current = {
    onHudUpdate,
    onOpenShop,
    onTriggerTrivia,
    onReachVictory,
    onGameOver,
  };

  const simRef = useRef({
    width: 1200,
    height: 700,
    time: 0,
    actIndex: 0,
    actTimer: ACTS[0].duration,
    transitionTimer: 0,
    transitionDuration: 1.9,
    loopCount: 1,
    actsCleared: 0,

    views: 0,
    coins: 25,
    retention: 100,
    combo: 1,
    maxCombo: 1,
    lives: 3,
    maxLives: 3,

    ownedUpgrades: {} as Partial<Record<UpgradeId, number>>,
    activePowerUp: null as PowerUpType | null,
    activePowerUpTime: 0,
    blindTimer: 0,
    goldenInvulnTimer: 0,
    triviaCooldown: 9.5,
    coinRainTimer: 0,
    botZapTimer: 4.5,

    playerX: 600,
    playerY: 540,
    targetPointerX: null as number | null,
    targetPointerY: null as number | null,
    facing: 1 as 1 | -1,
    squashX: 1,
    squashY: 1,
    hitFlash: 0,
    hitstop: 0,
    shake: 0,
    expression: 'neutral' as Expression,
    expressionTimer: 0,
    strumTimer: 0,

    algoTargetX: 600,
    algoLockTimer: 0,
    algoWindup: 0,

    spawnTimer: 0.6,
    goodSpawnTimer: 1.7,
    shootCooldown: 0,
    nextEntityId: 1,

    items: [] as FallingItem[],
    bullets: [] as Bullet[],
    particles: [] as Particle[],
    texts: [] as FloatingText[],
    laneFlashes: [] as LaneFlash[],
    lastHudEmit: 0,
    hudForceDirty: true,
    pendingFirePulse: false,
  });

  const keysHeldRef = useRef<Set<string>>(new Set());

  const resetSimulation = (keepLoopScore = false) => {
    const s = simRef.current;
    const isMobile = s.width < 640;
    if (!keepLoopScore) {
      s.views = 0;
      s.coins = 25;
      s.retention = 100;
      s.combo = 1;
      s.maxCombo = 1;
      s.lives = 3;
      s.maxLives = 3;
      s.loopCount = 1;
      s.actsCleared = 0;
      s.actIndex = 0;
      s.ownedUpgrades = {};
      s.activePowerUp = null;
      s.activePowerUpTime = 0;
    } else {
      s.loopCount += 1;
      s.actIndex = 0;
      s.lives = Math.min(s.maxLives, s.lives + 1);
    }

    s.actTimer = ACTS[0].duration;
    s.transitionTimer = keepLoopScore ? s.transitionDuration : 0;
    s.blindTimer = 0;
    s.goldenInvulnTimer = (s.ownedUpgrades.golden_shield || 0) * 5;
    s.triviaCooldown = 9.5;
    s.coinRainTimer = 0;
    s.botZapTimer = 4.5;
    s.playerX = s.width * 0.5;
    s.playerY = s.height * (isMobile ? 0.52 : 0.55);
    s.targetPointerX = null;
    s.targetPointerY = null;
    s.squashX = 1;
    s.squashY = 1;
    s.hitFlash = 0;
    s.hitstop = 0;
    s.shake = 0;
    s.expression = 'determined';
    s.expressionTimer = 1.2;
    s.algoTargetX = s.width * 0.5;
    s.algoLockTimer = 1.4;
    s.algoWindup = 0;
    s.spawnTimer = 0.5;
    s.goodSpawnTimer = 1.4;
    s.items = [];
    s.bullets = [];
    s.particles = [];
    s.texts = [];
    s.laneFlashes = [];
    s.hudForceDirty = true;
    soundEngine.setMusicMode('act0');
  };

  useEffect(() => {
    if (restartTrigger > 0) {
      resetSimulation(false);
    }
  }, [restartTrigger]);

  useEffect(() => {
    if (loopTrigger > 0) {
      resetSimulation(true);
    }
  }, [loopTrigger]);

  useEffect(() => {
    if (firePulseTrigger > 0) {
      simRef.current.pendingFirePulse = true;
    }
  }, [firePulseTrigger]);

  useEffect(() => {
    if (shopSync.seq > 0) {
      const s = simRef.current;
      s.ownedUpgrades = sanitizeOwnedUpgrades(shopSync.ownedUpgrades);
      s.coins = clampSafeInt(shopSync.coins, 0, MAX_SAFE_GAME_COINS);
      s.maxLives = clampSafeInt(shopSync.maxLives, 1, MAX_SAFE_LIVES);
      s.lives = clampSafeInt(shopSync.lives, 0, s.maxLives);

      const minCombo = 1 + (s.ownedUpgrades.clickbait || 0);
      if (s.combo < minCombo) s.combo = minCombo;

      if (isValidPowerUp(shopSync.powerUp)) {
        const info = POWERUP_INFO[shopSync.powerUp];
        s.activePowerUp = shopSync.powerUp;
        s.activePowerUpTime = info.duration;
      }
      s.hudForceDirty = true;
    }
  }, [shopSync]);

  useEffect(() => {
    if (shopResumeTrigger > 0) {
      const s = simRef.current;
      if (s.actIndex < ACTS.length - 1) {
        s.actIndex += 1;
      } else {
        s.actIndex = 0;
      }
      s.actTimer = ACTS[s.actIndex].duration;
      s.transitionTimer = s.transitionDuration;
      s.blindTimer = 0;
      s.goldenInvulnTimer = (s.ownedUpgrades.golden_shield || 0) * 5;
      s.items = [];
      s.bullets = [];
      s.spawnTimer = 0.45;
      s.goodSpawnTimer = 1.2;
      s.triviaCooldown = 8.5;
      s.hudForceDirty = true;
      soundEngine.setMusicMode(`act${s.actIndex}` as 'act0' | 'act1' | 'act2' | 'act3');
      soundEngine.playActTransition();
    }
  }, [shopResumeTrigger]);

  useEffect(() => {
    if (triviaGrant.seq > 0) {
      const s = simRef.current;
      const scholarLvl = s.ownedUpgrades.trivia_scholar || 0;
      const sponsorLvl = s.ownedUpgrades.sponsor_deal || 0;

      if (sponsorLvl > 0) {
        s.coins = clampSafeInt(s.coins + sponsorLvl * 15, 0, MAX_SAFE_GAME_COINS);
      }

      if (triviaGrant.correct && isValidPowerUp(triviaGrant.powerUp)) {
        const info = POWERUP_INFO[triviaGrant.powerUp];
        s.activePowerUp = triviaGrant.powerUp;
        s.activePowerUpTime = info.duration + scholarLvl * 3;
        const coinBonus = 25 + scholarLvl * 15;
        s.coins = clampSafeInt(s.coins + coinBonus, 0, MAX_SAFE_GAME_COINS);
        s.views = clampSafeInt(s.views + 8000 * s.loopCount, 0, MAX_SAFE_GAME_VIEWS);
        s.expression = 'laughing';
        s.expressionTimer = 1.4;
        soundEngine.playPowerUp();
        s.texts.push({
          x: s.playerX,
          y: s.height * 0.45,
          vy: -45,
          text: `¡${info.title.toUpperCase()}! +${coinBonus} 🪙`,
          color: info.color,
          life: 1.4,
          maxLife: 1.4,
        });
      } else {
        s.retention = Math.max(15, s.retention - 6);
        s.blindTimer = 2.0;
        s.expression = 'scared';
        s.expressionTimer = 2.0;
        s.texts.push({
          x: s.playerX,
          y: s.height * 0.45,
          vy: -38,
          text: '¡CEGADO 2s! · OBJETOS LENTOS',
          color: '#FACC15',
          life: 1.8,
          maxLife: 1.8,
        });
      }
      s.hudForceDirty = true;
    }
  }, [triviaGrant]);

  useEffect(() => {
    const s = simRef.current;
    if (gameState === 'TITLE_MENU') {
      soundEngine.setMusicMode('title');
    } else if (gameState === 'SHOP') {
      soundEngine.setMusicMode('shop');
    } else if (gameState === 'PLAYING') {
      soundEngine.setMusicMode(`act${s.actIndex}` as 'act0' | 'act1' | 'act2' | 'act3');
    }
  }, [gameState]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    const handleResize = () => {
      const parent = canvas.parentElement;
      const w = parent ? parent.clientWidth : window.innerWidth;
      const h = parent ? parent.clientHeight : window.innerHeight;
      // Fixed 1x pixel buffer for maximum frame rate on Raspberry Pi, mobile & software Chromium
      const dpr = 1;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const prevW = simRef.current.width;
      simRef.current.width = w;
      simRef.current.height = h;
      if (prevW > 0) {
        simRef.current.playerX = Math.max(
          42,
          Math.min(w - 42, (simRef.current.playerX / prevW) * w)
        );
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    const spawnParticles = (x: number, y: number, color: string, count = 8) => {
      const s = simRef.current;
      for (let i = 0; i < count; i++) {
        if (s.particles.length >= MAX_PARTICLES) {
          s.particles.shift();
        }
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const speed = 70 + Math.random() * 175;
        s.particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 40,
          life: 0.38 + Math.random() * 0.22,
          maxLife: 0.6,
          color,
          size: 3 + Math.random() * 3.5,
        });
      }
    };

    const addFloatingText = (x: number, y: number, text: string, color: string) => {
      const s = simRef.current;
      if (s.texts.length >= MAX_TEXTS) {
        s.texts.shift();
      }
      const clampedX = Math.max(70, Math.min(s.width - 70, x));
      s.texts.push({
        x: clampedX,
        y,
        vy: -55,
        text,
        color,
        life: 0.9,
        maxLife: 0.9,
      });
    };

    const buildHud = (): HudSnapshot => {
      const s = simRef.current;
      const act = ACTS[s.actIndex];
      return {
        views: s.views,
        coins: s.coins,
        retention: Math.max(0, Math.min(100, Math.round(s.retention))),
        combo: s.combo,
        maxCombo: s.maxCombo,
        lives: s.lives,
        maxLives: s.maxLives,
        actIndex: s.actIndex,
        actId: act.id,
        actTitle: act.shortTitle,
        actSubtitle: act.videoTitle,
        actTimeLeft: Math.max(0, Math.ceil(s.actTimer)),
        actDuration: act.duration,
        loopCount: s.loopCount,
        isTransitioning: s.transitionTimer > 0,
        controlHint: act.controlHint,
        actsCleared: s.actsCleared,
        activePowerUp: s.activePowerUp,
        activePowerUpTime: Math.max(0, Math.ceil(s.activePowerUpTime)),
        blindTimeLeft: Math.max(0, Math.ceil(s.blindTimer)),
        ownedUpgrades: { ...s.ownedUpgrades },
      };
    };

    const triggerDamage = (reasonText: string) => {
      const s = simRef.current;
      if (s.hitFlash > 0.15) return;

      if (
        (s.activePowerUp === 'INVINCIBLE' && s.activePowerUpTime > 0) ||
        s.goldenInvulnTimer > 0
      ) {
        soundEngine.playShieldBlock();
        addFloatingText(s.playerX, s.height - 140, '¡ESCUDO!', '#16A34A');
        return;
      }

      const adblockerLvl = s.ownedUpgrades.adblocker || 0;
      if (adblockerLvl > 0 && Math.random() < adblockerLvl * 0.2) {
        soundEngine.playShieldBlock();
        addFloatingText(s.playerX, s.height - 140, '¡BLOQUEADO!', '#2563EB');
        return;
      }

      s.lives -= 1;
      const minCombo = 1 + (s.ownedUpgrades.clickbait || 0);
      if ((s.ownedUpgrades.combo_shield || 0) > 0) {
        s.combo = Math.max(minCombo, Math.floor(s.combo / 2));
      } else {
        s.combo = minCombo;
      }

      const armorLvl = s.ownedUpgrades.rage_armor || 0;
      if (armorLvl > 0) {
        for (let i = s.items.length - 1; i >= 0; i--) {
          if (
            s.items[i].kind === 'bad' &&
            Math.hypot(s.items[i].x - s.playerX, s.items[i].y - (s.height - 120)) < 240
          ) {
            spawnParticles(s.items[i].x, s.items[i].y, '#DC2626', 5);
            s.items.splice(i, 1);
          }
        }
      }

      s.retention = Math.max(12, s.retention - 18);
      s.hitFlash = 0.35 + armorLvl * 0.45;
      s.hitstop = 0.045;
      s.shake = 10;
      s.squashX = 1.24;
      s.squashY = 0.8;
      s.expression = 'scared';
      s.expressionTimer = 0.9;
      s.hudForceDirty = true;
      soundEngine.playImpulseHit();
      addFloatingText(s.playerX, s.height - 140, reasonText, '#DC2626');

      if (s.lives <= 0) {
        soundEngine.playGameOver();
        callbacksRef.current.onGameOver(buildHud());
      }
    };

    const triggerReward = (
      x: number,
      y: number,
      baseViews: number,
      baseCoins: number,
      label: string,
      color: string
    ) => {
      const s = simRef.current;
      const viewUpgradeMult = 1 + (s.ownedUpgrades.viral_multiplier || 0) * 0.35;
      const doublePowerMult =
        s.activePowerUp === 'DOUBLE_VIEWS' && s.activePowerUpTime > 0 ? 2 : 1;
      const gainedViews = Math.round(
        baseViews * s.combo * s.loopCount * viewUpgradeMult * doublePowerMult
      );

      const coinUpgradeMult = 1 + (s.ownedUpgrades.coin_greed || 0) * 0.45;
      const gainedCoins = Math.max(
        1,
        Math.round(baseCoins * coinUpgradeMult * doublePowerMult)
      );

      s.views += gainedViews;
      s.coins += gainedCoins;
      s.combo = Math.min(8, s.combo + 1);
      s.maxCombo = Math.max(s.maxCombo, s.combo);
      s.retention = Math.min(100, s.retention + 4);
      s.squashX = 0.88;
      s.squashY = 1.15;
      s.expression = 'happy';
      s.expressionTimer = 0.7;
      s.hudForceDirty = true;
      spawnParticles(x, y, color, 8);
      addFloatingText(
        x,
        y - 16,
        `${label} +${(gainedViews / 1000).toFixed(1)}k · +${gainedCoins}🪙`,
        color
      );
    };

    const getSingerGeometry = (w: number, h: number) => {
      const isMobile = w < 640;
      const laneW = isMobile ? Math.min(340, w - 28) : Math.min(460, w * 0.56);
      const startX = w * 0.5 - laneW * 0.5;
      const colW = laneW / 3;
      const targetY = h - (isMobile ? 120 : 135);
      const radius = isMobile ? 31 : 27;
      return { laneW, startX, colW, targetY, radius };
    };

    const strumLane = (lane: 0 | 1 | 2) => {
      const s = simRef.current;
      if (gameStateRef.current !== 'PLAYING' || s.transitionTimer > 0) return;
      if (ACTS[s.actIndex].id !== 'SINGER') return;

      soundEngine.unlock();
      const { startX, colW, targetY } = getSingerGeometry(s.width, s.height);
      const laneX = startX + colW * lane + colW * 0.5;

      let bestIdx = -1;
      let bestDist = 999;
      for (let i = 0; i < s.items.length; i++) {
        const item = s.items[i];
        if (item.kind === 'note' && item.lane === lane) {
          const dist = Math.abs(item.y - targetY);
          if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
          }
        }
      }

      s.strumTimer = 0.25;
      soundEngine.playGuitarChord(lane);

      const autoTuneLvl = s.ownedUpgrades.auto_tune || 0;
      const hitWindow = 72 + autoTuneLvl * 26;
      const noteViews = Math.round(3200 * (1 + autoTuneLvl * 0.25));

      if (bestIdx !== -1 && bestDist <= hitWindow) {
        s.items.splice(bestIdx, 1);
        s.laneFlashes.push({ lane, timer: 0.22, good: true });
        triggerReward(
          laneX,
          targetY - 12,
          noteViews,
          4,
          bestDist < 30 ? '¡TEMAZO!' : '¡BIEN!',
          '#16A34A'
        );
      } else {
        s.laneFlashes.push({ lane, timer: 0.22, good: false });
        if ((s.ownedUpgrades.combo_shield || 0) === 0) {
          s.combo = 1 + (s.ownedUpgrades.clickbait || 0);
        }
        s.hudForceDirty = true;
        addFloatingText(laneX, targetY - 18, '¡Desafinado!', '#DC2626');
      }
    };

    const fireExamFocus = () => {
      const s = simRef.current;
      if (gameStateRef.current !== 'PLAYING' || s.transitionTimer > 0) return;
      if (ACTS[s.actIndex].id !== 'EXAM') return;
      if (s.shootCooldown > 0) return;

      soundEngine.unlock();
      s.shootCooldown = 0.18;
      const doubleLvl = s.ownedUpgrades.double_shot || 0;
      const startY = s.height - (s.width < 640 ? 128 : 145);
      if (doubleLvl > 0) {
        s.bullets.push(
          { x: s.playerX - 18, y: startY, vy: -580, radius: 10 },
          { x: s.playerX + 18, y: startY, vy: -580, radius: 10 }
        );
      } else {
        s.bullets.push({
          x: s.playerX,
          y: startY,
          vy: -560,
          radius: 10,
        });
      }
      s.squashX = 1.12;
      s.squashY = 0.9;
      soundEngine.playThoughtBlast();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const code = e.code;
      const wasHeld = keysHeldRef.current.has(code);
      keysHeldRef.current.add(code);

      if (gameStateRef.current !== 'PLAYING') return;
      soundEngine.unlock();

      if (!wasHeld) {
        const actId = ACTS[simRef.current.actIndex].id;
        if (actId === 'EXAM' && (code === 'Space' || code === 'ArrowUp' || code === 'KeyW')) {
          e.preventDefault();
          fireExamFocus();
        }
        if (actId === 'SINGER') {
          if (code === 'Digit1' || code === 'KeyA' || code === 'ArrowLeft') strumLane(0);
          if (code === 'Digit2' || code === 'KeyS' || code === 'ArrowDown') strumLane(1);
          if (code === 'Digit3' || code === 'KeyD' || code === 'ArrowRight') strumLane(2);
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysHeldRef.current.delete(e.code);
    };

    const onBlur = () => {
      keysHeldRef.current.clear();
    };

    const getCanvasPos = (clientX: number, clientY: number) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: clientX - rect.left,
        y: clientY - rect.top,
      };
    };

    const onPointerDown = (e: PointerEvent) => {
      if (gameStateRef.current !== 'PLAYING') return;
      soundEngine.unlock();
      const s = simRef.current;
      const pos = getCanvasPos(e.clientX, e.clientY);
      s.targetPointerX = pos.x;
      s.targetPointerY = pos.y;

      const actId = ACTS[s.actIndex].id;
      if (actId === 'EXAM' && s.transitionTimer <= 0) {
        let popped = false;
        for (let i = s.items.length - 1; i >= 0; i--) {
          const item = s.items[i];
          if (item.kind === 'bad') {
            const dx = pos.x - item.x;
            const dy = pos.y - item.y;
            if (Math.abs(dx) <= item.w * 0.72 && Math.abs(dy) <= item.h * 0.85) {
              s.items.splice(i, 1);
              soundEngine.playThoughtBlast();
              triggerReward(item.x, item.y, 2400, 3, '¡Despejado!', '#2563EB');
              popped = true;
              break;
            }
          }
        }
        if (!popped) {
          fireExamFocus();
        }
      } else if (actId === 'SINGER' && s.transitionTimer <= 0) {
        const { laneW, startX, colW } = getSingerGeometry(s.width, s.height);
        const rel = pos.x - startX;
        if (rel >= -30 && rel <= laneW + 30) {
          const lane = Math.max(0, Math.min(2, Math.floor(rel / colW))) as 0 | 1 | 2;
          strumLane(lane);
        }
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (gameStateRef.current !== 'PLAYING') return;
      const pos = getCanvasPos(e.clientX, e.clientY);
      simRef.current.targetPointerX = pos.x;
      simRef.current.targetPointerY = pos.y;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);

    let rafId = 0;
    let lastTs = performance.now();

    const updateSimulation = (dt: number) => {
      const s = simRef.current;
      s.time += dt;

      if (s.pendingFirePulse) {
        s.pendingFirePulse = false;
        fireExamFocus();
      }

      if (s.hitstop > 0) {
        s.hitstop = Math.max(0, s.hitstop - dt);
        return;
      }

      s.shake = Math.max(0, s.shake - dt * 36);
      s.hitFlash = Math.max(0, s.hitFlash - dt);
      s.shootCooldown = Math.max(0, s.shootCooldown - dt);
      s.strumTimer = Math.max(0, s.strumTimer - dt);
      s.squashX += (1 - s.squashX) * Math.min(1, dt * 14);
      s.squashY += (1 - s.squashY) * Math.min(1, dt * 14);

      if (s.expressionTimer > 0) {
        s.expressionTimer -= dt;
        if (s.expressionTimer <= 0) s.expression = 'neutral';
      }

      for (let i = s.particles.length - 1; i >= 0; i--) {
        const p = s.particles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 320 * dt;
        p.life -= dt;
        if (p.life <= 0) s.particles.splice(i, 1);
      }

      for (let i = s.texts.length - 1; i >= 0; i--) {
        const t = s.texts[i];
        t.y += t.vy * dt;
        t.life -= dt;
        if (t.life <= 0) s.texts.splice(i, 1);
      }

      for (let i = s.laneFlashes.length - 1; i >= 0; i--) {
        s.laneFlashes[i].timer -= dt;
        if (s.laneFlashes[i].timer <= 0) s.laneFlashes.splice(i, 1);
      }

      if (gameStateRef.current !== 'PLAYING') {
        return;
      }

      if (s.activePowerUpTime > 0) {
        s.activePowerUpTime -= dt;
        if (s.activePowerUpTime <= 0) {
          s.activePowerUpTime = 0;
          s.activePowerUp = null;
          s.hudForceDirty = true;
        }
      }
      if (s.blindTimer > 0) {
        const prevSec = Math.ceil(s.blindTimer);
        s.blindTimer = Math.max(0, s.blindTimer - dt);
        if (Math.ceil(s.blindTimer) !== prevSec) {
          s.hudForceDirty = true;
        }
      }
      if (s.goldenInvulnTimer > 0) {
        s.goldenInvulnTimer = Math.max(0, s.goldenInvulnTimer - dt);
      }

      const isMobile = s.width < 640;

      if (s.transitionTimer > 0) {
        s.transitionTimer -= dt;
        if (s.transitionTimer <= 0) {
          s.transitionTimer = 0;
          const act = ACTS[s.actIndex];
          s.playerX =
            act.id === 'CANCELLED' ? (isMobile ? 54 : s.width * 0.17) : s.width * 0.5;
          s.playerY = s.height * 0.56;
          s.hudForceDirty = true;
        }
        return;
      }

      const act = ACTS[s.actIndex];

      const botLvl = s.ownedUpgrades.comment_bots || 0;
      if (botLvl > 0) {
        s.botZapTimer -= dt;
        if (s.botZapTimer <= 0) {
          s.botZapTimer = Math.max(2.2, 5.5 - botLvl * 1.1);
          const badIdx = s.items.findIndex((it) => it.kind === 'bad');
          if (badIdx !== -1) {
            const zapped = s.items[badIdx];
            s.items.splice(badIdx, 1);
            soundEngine.playThoughtBlast();
            triggerReward(zapped.x, zapped.y, 1800, 2, '¡BOT!', '#7C3AED');
          }
        }
      }

      s.triviaCooldown -= dt;
      if (s.triviaCooldown <= 0 && s.actTimer > 3.5) {
        s.triviaCooldown = 12.5;
        s.hudForceDirty = true;
        callbacksRef.current.onTriggerTrivia(buildHud());
        return;
      }

      if (s.activePowerUp === 'COIN_RAIN' && s.activePowerUpTime > 0 && act.id !== 'SINGER') {
        s.coinRainTimer -= dt;
        if (s.coinRainTimer <= 0) {
          s.coinRainTimer = 0.38;
          s.items.push({
            id: s.nextEntityId++,
            x: 50 + Math.random() * (s.width - 100),
            y: -20,
            vx: act.id === 'CANCELLED' ? -240 : 0,
            vy: act.id === 'CANCELLED' ? 40 : 210,
            w: 36,
            h: 36,
            kind: 'coin',
            label: '🪙',
            lane: 0,
          });
        }
      }

      const chronoMult = Math.max(0.45, 1 - (s.ownedUpgrades.chronometer || 0) * 0.14);
      const slowMoMult = s.activePowerUp === 'SLOW_MO' && s.activePowerUpTime > 0 ? 0.52 : 1;
      const speedMult = (1 + (s.loopCount - 1) * 0.35) * slowMoMult * chronoMult;
      // If blinded for 2s after failing/timing out Trivia, all falling/incoming items move slower
      const itemSpeedFactor = s.blindTimer > 0 ? 0.42 : 1;
      const itemDt = dt * itemSpeedFactor;

      s.actTimer -= dt;
      const clickbaitPassive = 1 + (s.ownedUpgrades.clickbait || 0) * 0.3;
      const viewPassiveMult =
        (1 + (s.ownedUpgrades.viral_multiplier || 0) * 0.35) *
        clickbaitPassive *
        (s.activePowerUp === 'DOUBLE_VIEWS' ? 2 : 1);
      s.views = clampSafeInt(
        s.views + Math.round(dt * 420 * s.combo * s.loopCount * viewPassiveMult),
        0,
        MAX_SAFE_GAME_VIEWS
      );

      if (s.actTimer <= 0) {
        s.items = [];
        s.bullets = [];
        s.actsCleared += 1;
        const sponsorBonus = (s.ownedUpgrades.sponsor_deal || 0) * 15;
        s.coins = clampSafeInt(s.coins + 20 + sponsorBonus, 0, MAX_SAFE_GAME_COINS);
        s.hudForceDirty = true;

        if (s.actIndex < ACTS.length - 1) {
          soundEngine.playShopBuy();
          callbacksRef.current.onOpenShop(buildHud());
        } else {
          soundEngine.playVictory();
          callbacksRef.current.onReachVictory(buildHud());
        }
        return;
      }

      const speedBonus = 1 + (s.ownedUpgrades.turbo_shoes || 0) * 0.24;
      const held = keysHeldRef.current;
      const moveXInput =
        (held.has('ArrowRight') || held.has('KeyD') ? 1 : 0) -
        (held.has('ArrowLeft') || held.has('KeyA') ? 1 : 0);
      const moveYInput =
        (held.has('ArrowDown') || held.has('KeyS') ? 1 : 0) -
        (held.has('ArrowUp') || held.has('KeyW') ? 1 : 0);

      if (act.id === 'ALGORITHM' || act.id === 'EXAM') {
        const moveSpeed = 520 * speedBonus;
        if (moveXInput !== 0) {
          s.targetPointerX = null;
          s.playerX += moveXInput * moveSpeed * dt;
          s.facing = moveXInput > 0 ? 1 : -1;
        } else if (s.targetPointerX !== null) {
          const diff = s.targetPointerX - s.playerX;
          if (Math.abs(diff) > 6) {
            s.playerX += Math.sign(diff) * Math.min(Math.abs(diff), moveSpeed * 1.25 * dt);
            s.facing = diff > 0 ? 1 : -1;
          }
        }
        const pad = isMobile ? 38 : 64;
        s.playerX = Math.max(pad, Math.min(s.width - pad, s.playerX));
      } else if (act.id === 'CANCELLED') {
        const moveSpeed = 460 * speedBonus;
        if (moveYInput !== 0) {
          s.targetPointerY = null;
          s.playerY += moveYInput * moveSpeed * dt;
        } else if (s.targetPointerY !== null) {
          const diff = s.targetPointerY - s.playerY;
          if (Math.abs(diff) > 6) {
            s.playerY += Math.sign(diff) * Math.min(Math.abs(diff), moveSpeed * 1.3 * dt);
          }
        }
        s.playerY = Math.max(isMobile ? 165 : 195, Math.min(s.height - 55, s.playerY));
        s.playerX = isMobile ? 54 : s.width * 0.17;
        s.facing = 1;
      } else if (act.id === 'SINGER') {
        s.playerX = s.width * 0.5;
        s.facing = 1;
      }

      const magnetLvl = s.ownedUpgrades.magnet || 0;
      const floorY = s.height - (isMobile ? 74 : 92);

      if (magnetLvl > 0) {
        const pullRadius = 150 + magnetLvl * 85;
        const pullSpeed = 240 + magnetLvl * 110;
        const targetCharY = act.id === 'CANCELLED' ? s.playerY - 58 : floorY - 62;
        for (const item of s.items) {
          if (item.kind === 'good' || item.kind === 'coin') {
            const dx = s.playerX - item.x;
            const dy = targetCharY - item.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 1 && dist < pullRadius) {
              item.x += (dx / dist) * pullSpeed * dt;
              item.y += (dy / dist) * pullSpeed * dt;
            }
          }
        }
      }

      const thermosMult = 1 + (s.ownedUpgrades.coffee_thermos || 0) * 0.35;
      const cardW = isMobile ? 114 : 134;
      const marginX = isMobile ? 62 : 90;

      if (act.id === 'ALGORITHM') {
        if (s.algoWindup > 0) {
          s.algoWindup -= itemDt;
          if (s.algoWindup <= 0) {
            const label = IMPULSE_ADS[Math.floor(Math.random() * IMPULSE_ADS.length)];
            s.items.push({
              id: s.nextEntityId++,
              x: s.algoTargetX,
              y: 96,
              vx: 0,
              vy: (290 + Math.random() * 75) * speedMult,
              w: cardW,
              h: 40,
              kind: 'bad',
              label,
              lane: 0,
            });
            s.algoLockTimer = Math.max(0.55, 1.15 / speedMult);
          }
        } else {
          s.algoTargetX += (s.playerX - s.algoTargetX) * Math.min(1, itemDt * 4.5);
          s.algoLockTimer -= itemDt;
          if (s.algoLockTimer <= 0) {
            s.algoWindup = 0.42;
          }
        }

        s.spawnTimer -= itemDt;
        if (s.spawnTimer <= 0) {
          s.spawnTimer = Math.max(0.68, 1.38 / speedMult);
          const label = IMPULSE_ADS[Math.floor(Math.random() * IMPULSE_ADS.length)];
          s.items.push({
            id: s.nextEntityId++,
            x: marginX + Math.random() * Math.max(40, s.width - marginX * 2),
            y: -24,
            vx: 0,
            vy: (205 + Math.random() * 70) * speedMult,
            w: cardW,
            h: 40,
            kind: 'bad',
            label,
            lane: 0,
          });
        }

        s.goodSpawnTimer -= itemDt;
        if (s.goodSpawnTimer <= 0) {
          s.goodSpawnTimer = 1.85 / thermosMult;
          const isCoin = Math.random() < 0.45;
          s.items.push({
            id: s.nextEntityId++,
            x: marginX + Math.random() * Math.max(40, s.width - marginX * 2),
            y: -20,
            vx: 0,
            vy: 195 * slowMoMult,
            w: isCoin ? 38 : 48,
            h: isCoin ? 38 : 48,
            kind: isCoin ? 'coin' : 'good',
            label: isCoin ? '🪙' : 'CAFÉ',
            lane: 0,
          });
        }

        for (let i = s.items.length - 1; i >= 0; i--) {
          const item = s.items[i];
          item.y += item.vy * itemDt;
          if (
            Math.abs(item.x - s.playerX) < item.w * 0.44 + 20 &&
            item.y + item.h * 0.4 > floorY - 102 &&
            item.y - item.h * 0.4 < floorY
          ) {
            s.items.splice(i, 1);
            if (item.kind === 'coin') {
              soundEngine.playCoinPickup();
              triggerReward(s.playerX, floorY - 105, 1200, 8, '+MONEDA', '#CA8A04');
            } else if (item.kind === 'good') {
              soundEngine.playCoffeeSlurp();
              triggerReward(s.playerX, floorY - 105, 3000, 5, '¡CAFÉ!', '#5F6E3E');
            } else {
              triggerDamage('¡COMPRA IMPULSIVA!');
            }
            continue;
          }
          if (item.y > s.height + 50) s.items.splice(i, 1);
        }
      } else if (act.id === 'EXAM') {
        for (let b = s.bullets.length - 1; b >= 0; b--) {
          const bullet = s.bullets[b];
          bullet.y += bullet.vy * dt;
          if (bullet.y < -20) {
            s.bullets.splice(b, 1);
            continue;
          }
          for (let i = s.items.length - 1; i >= 0; i--) {
            const item = s.items[i];
            if (
              item.kind === 'bad' &&
              Math.abs(bullet.x - item.x) < item.w * 0.56 &&
              Math.abs(bullet.y - item.y) < item.h * 0.56
            ) {
              s.bullets.splice(b, 1);
              s.items.splice(i, 1);
              soundEngine.playKnowledgeCatch();
              triggerReward(item.x, item.y, 2400, 3, '¡DESPEJADO!', '#2563EB');
              break;
            }
          }
        }

        s.spawnTimer -= itemDt;
        if (s.spawnTimer <= 0) {
          s.spawnTimer = Math.max(0.58, 1.08 / speedMult);
          const label = INTRUSIVE_THOUGHTS[Math.floor(Math.random() * INTRUSIVE_THOUGHTS.length)];
          s.items.push({
            id: s.nextEntityId++,
            x: marginX + Math.random() * Math.max(40, s.width - marginX * 2),
            y: -25,
            vx: (Math.random() - 0.5) * 40,
            vy: (145 + Math.random() * 50) * speedMult,
            w: isMobile ? 124 : 146,
            h: 42,
            kind: 'bad',
            label,
            lane: 0,
          });
        }

        s.goodSpawnTimer -= itemDt;
        if (s.goodSpawnTimer <= 0) {
          s.goodSpawnTimer = 2.0 / thermosMult;
          const isCoin = Math.random() < 0.35;
          const ans = EXAM_ANSWERS[Math.floor(Math.random() * EXAM_ANSWERS.length)];
          s.items.push({
            id: s.nextEntityId++,
            x: marginX + Math.random() * Math.max(40, s.width - marginX * 2),
            y: -25,
            vx: 0,
            vy: 165 * slowMoMult,
            w: isCoin ? 38 : 104,
            h: 38,
            kind: isCoin ? 'coin' : 'good',
            label: isCoin ? '🪙' : ans,
            lane: 0,
          });
        }

        for (let i = s.items.length - 1; i >= 0; i--) {
          const item = s.items[i];
          item.x += item.vx * itemDt;
          item.y += item.vy * itemDt;
          if (item.x < marginX || item.x > s.width - marginX) item.vx *= -1;

          if (
            Math.abs(item.x - s.playerX) < item.w * 0.44 + 22 &&
            item.y + item.h * 0.4 > floorY - 104 &&
            item.y - item.h * 0.4 < floorY
          ) {
            s.items.splice(i, 1);
            if (item.kind === 'coin') {
              soundEngine.playCoinPickup();
              triggerReward(s.playerX, floorY - 108, 1200, 8, '+MONEDA', '#CA8A04');
            } else if (item.kind === 'good') {
              soundEngine.playKnowledgeCatch();
              triggerReward(s.playerX, floorY - 108, 4200, 6, `¡${item.label}!`, '#16A34A');
            } else {
              triggerDamage('¡MENTE EN BLANCO!');
            }
            continue;
          }
          if (item.y > s.height + 50) s.items.splice(i, 1);
        }
      } else if (act.id === 'SINGER') {
        const { startX, colW, targetY } = getSingerGeometry(s.width, s.height);

        s.spawnTimer -= itemDt;
        if (s.spawnTimer <= 0) {
          s.spawnTimer = Math.max(0.46, 0.75 / speedMult);
          const lane = Math.floor(Math.random() * 3) as 0 | 1 | 2;
          const noteGlyphs = ['♪ DO', '♫ FA', '★ SOL'];
          s.items.push({
            id: s.nextEntityId++,
            x: startX + colW * lane + colW * 0.5,
            y: 84,
            vx: 0,
            vy: 270 * speedMult,
            w: 58,
            h: 58,
            kind: 'note',
            label: noteGlyphs[lane],
            lane,
          });
        }

        for (let i = s.items.length - 1; i >= 0; i--) {
          const item = s.items[i];
          item.y += item.vy * itemDt;
          if (item.y > targetY + 66) {
            s.items.splice(i, 1);
            soundEngine.playMissedNote();
            triggerDamage('¡TOMATAZO!');
          }
        }
      } else if (act.id === 'CANCELLED') {
        s.spawnTimer -= itemDt;
        if (s.spawnTimer <= 0) {
          s.spawnTimer = Math.max(0.52, 0.98 / speedMult);
          const label = RAGE_TWEETS[Math.floor(Math.random() * RAGE_TWEETS.length)];
          const minY = isMobile ? 165 : 215;
          const yPos = minY + Math.random() * Math.max(80, s.height - minY - 85);
          s.items.push({
            id: s.nextEntityId++,
            x: s.width + 70,
            y: yPos,
            vx: -(isMobile ? 270 : 340 + Math.random() * 100) * speedMult,
            vy: 0,
            w: isMobile ? 116 : 144,
            h: 40,
            kind: 'bad',
            label,
            lane: 0,
          });
        }

        s.goodSpawnTimer -= itemDt;
        if (s.goodSpawnTimer <= 0) {
          s.goodSpawnTimer = 2.0 / thermosMult;
          const isCoin = Math.random() < 0.4;
          const minY = isMobile ? 170 : 215;
          s.items.push({
            id: s.nextEntityId++,
            x: s.width + 60,
            y: minY + Math.random() * Math.max(80, s.height - minY - 90),
            vx: -(isMobile ? 215 : 260) * slowMoMult,
            vy: 0,
            w: isCoin ? 38 : 88,
            h: 36,
            kind: isCoin ? 'coin' : 'good',
            label: isCoin ? '🪙' : 'SNACKS',
            lane: 0,
          });
        }

        const shieldX = s.playerX + 38;
        const shieldY = s.playerY - 56;
        const shieldHalfHeight = 62 + (s.ownedUpgrades.double_shot || 0) * 20;

        for (let i = s.items.length - 1; i >= 0; i--) {
          const item = s.items[i];
          item.x += item.vx * itemDt;
          item.y += item.vy * itemDt;

          if (
            item.kind === 'bad' &&
            Math.abs(item.x - shieldX) < item.w * 0.44 + 18 &&
            Math.abs(item.y - shieldY) < shieldHalfHeight
          ) {
            s.items.splice(i, 1);
            s.hitstop = 0.03;
            s.shake = 5;
            soundEngine.playShieldBlock();
            triggerReward(shieldX + 18, shieldY, 3400, 4, '¡BLOQUEADO!', '#65A30D');
            continue;
          }

          if (
            (item.kind === 'good' || item.kind === 'coin') &&
            Math.abs(item.x - s.playerX) < 52 &&
            Math.abs(item.y - (s.playerY - 54)) < 68
          ) {
            s.items.splice(i, 1);
            if (item.kind === 'coin') {
              soundEngine.playCoinPickup();
              triggerReward(s.playerX, s.playerY - 95, 1400, 8, '+MONEDA', '#CA8A04');
            } else {
              soundEngine.playCoffeeSlurp();
              triggerReward(s.playerX, s.playerY - 95, 3600, 5, '+SNACKS', '#CA8A04');
            }
            continue;
          }

          if (item.x < s.playerX - 18) {
            s.items.splice(i, 1);
            if (item.kind === 'bad') {
              triggerDamage('¡SPOILER RECIBIDO!');
            }
          }
        }
      }
    };

    const drawPaperBackground = (paperTint: string, panOffset: number) => {
      const s = simRef.current;
      ctx.fillStyle = paperTint;
      ctx.fillRect(0, 0, s.width, s.height);

      // Lightweight 1px vertical drafting lines (zero pattern compositing)
      const step = 180;
      const offsetX = ((panOffset % step) + step) % step;
      ctx.fillStyle = 'rgba(24, 24, 27, 0.05)';
      for (let gx = Math.round(step - offsetX); gx < s.width; gx += step) {
        ctx.fillRect(gx, 0, 1, s.height);
      }
    };

    const drawSceneProps = (actIndex: number, offsetX: number) => {
      const s = simRef.current;
      const isMobile = s.width < 640;
      const floorY = s.height - (isMobile ? 74 : 92);
      const act = ACTS[actIndex];

      ctx.save();
      ctx.translate(offsetX, 0);

      ctx.strokeStyle = '#18181B';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, floorY);
      ctx.lineTo(s.width, floorY);
      ctx.stroke();

      ctx.strokeStyle = 'rgba(24, 24, 27, 0.16)';
      ctx.fillStyle = 'rgba(24, 24, 27, 0.04)';
      ctx.lineWidth = 2;

      if (act.id === 'ALGORITHM') {
        const deskX = isMobile ? 24 : s.width * 0.14;
        ctx.strokeRect(deskX, floorY - 72, 110, 72);
        ctx.fillRect(deskX + 20, floorY - 120, 68, 44);
        ctx.strokeRect(deskX + 20, floorY - 120, 68, 44);
        ctx.beginPath();
        ctx.ellipse(deskX + 54, floorY - 98, 16, 8, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else if (act.id === 'EXAM') {
        const boardW = isMobile ? Math.min(290, s.width - 40) : 340;
        const boardH = isMobile ? 96 : 140;
        const boardY = isMobile ? 128 : 120;
        ctx.fillRect(s.width * 0.5 - boardW * 0.5, boardY, boardW, boardH);
        ctx.strokeRect(s.width * 0.5 - boardW * 0.5, boardY, boardW, boardH);
        ctx.fillStyle = 'rgba(24, 24, 27, 0.22)';
        ctx.font = `700 ${isMobile ? 14 : 18}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('EXAMEN FINAL · 00:15', s.width * 0.5, boardY + boardH * 0.54);
      } else if (act.id === 'SINGER') {
        const { startX, colW, targetY, radius } = getSingerGeometry(s.width, s.height);

        for (let lane = 0; lane < 3; lane++) {
          const lx = startX + colW * lane + colW * 0.5;
          ctx.strokeStyle = 'rgba(24, 24, 27, 0.18)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(lx, 90);
          ctx.lineTo(lx, targetY);
          ctx.stroke();

          const flash = s.laneFlashes.find((f) => f.lane === lane);
          ctx.save();
          ctx.strokeStyle = flash ? (flash.good ? '#16A34A' : '#DC2626') : '#18181B';
          ctx.fillStyle = flash
            ? flash.good
              ? 'rgba(22, 163, 74, 0.18)'
              : 'rgba(220, 38, 38, 0.18)'
            : '#FFFFFF';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(lx, targetY, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.fillStyle = '#18181B';
          ctx.font = '700 14px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(lane + 1), lx, targetY);
          ctx.restore();
        }
      } else if (act.id === 'CANCELLED') {
        const tvW = isMobile ? 135 : 180;
        const tvH = isMobile ? 84 : 108;
        const tvX = s.width - tvW - (isMobile ? 16 : 50);
        const tvY = isMobile ? 120 : 125;
        ctx.strokeRect(tvX, tvY, tvW, tvH);
        ctx.fillStyle = 'rgba(220, 38, 38, 0.12)';
        ctx.fillRect(tvX + 6, tvY + 8, tvW - 12, 24);
        ctx.fillStyle = '#DC2626';
        ctx.font = `700 ${isMobile ? 10 : 12}px "JetBrains Mono", monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('ÚLTIMA HORA: 23:59', tvX + tvW * 0.5, tvY + 24);
        ctx.fillStyle = 'rgba(24, 24, 27, 0.35)';
        ctx.font = `600 ${isMobile ? 11 : 13}px "Plus Jakarta Sans", sans-serif`;
        ctx.fillText('GOTY CANCELADO', tvX + tvW * 0.5, tvY + tvH * 0.66);
      }

      ctx.restore();
    };

    const render = () => {
      const s = simRef.current;
      const gs = gameStateRef.current;
      const isMobile = s.width < 640;
      const floorY = s.height - (isMobile ? 74 : 92);
      const charScale = isMobile ? 0.92 : 1.18;

      ctx.save();
      if (s.shake > 0.2) {
        ctx.translate((Math.random() - 0.5) * s.shake, (Math.random() - 0.5) * s.shake);
      }

      if (gs === 'TITLE_MENU') {
        // Palo y Relato signature night-sky navy + crisp parchment stage (zero gradients/blur)
        ctx.fillStyle = '#0D2252';
        ctx.fillRect(0, 0, s.width, floorY);

        ctx.fillStyle = '#132F6E';
        ctx.fillRect(0, Math.round(floorY * 0.58), s.width, floorY - Math.round(floorY * 0.58));

        // 16 lightweight geometric stars
        const stars: Array<[number, number, number, string]> = [
          [0.08, 0.14, 3, '#FACC15'],
          [0.16, 0.28, 2, '#93C5FD'],
          [0.24, 0.11, 3, '#FDE047'],
          [0.33, 0.22, 2, '#FFFFFF'],
          [0.42, 0.09, 2, '#93C5FD'],
          [0.56, 0.12, 3, '#FACC15'],
          [0.65, 0.24, 2, '#FFFFFF'],
          [0.74, 0.1, 3, '#FDE047'],
          [0.83, 0.19, 2, '#93C5FD'],
          [0.91, 0.13, 3, '#FACC15'],
          [0.12, 0.44, 2, '#FFFFFF'],
          [0.29, 0.39, 2, '#FACC15'],
          [0.48, 0.45, 2, '#93C5FD'],
          [0.69, 0.41, 2, '#FACC15'],
          [0.88, 0.37, 2, '#FFFFFF'],
          [0.95, 0.48, 2, '#93C5FD'],
        ];
        for (let i = 0; i < stars.length; i++) {
          const [rx, ry, sz, col] = stars[i];
          ctx.fillStyle = col;
          ctx.fillRect(Math.round(s.width * rx), Math.round(floorY * ry), sz, sz);
        }

        // Golden parchment stage below floor line so stickman outlines stay ultra crisp
        ctx.fillStyle = '#FAF6E8';
        ctx.fillRect(0, floorY, s.width, s.height - floorY);

        ctx.fillStyle = '#FACC15';
        ctx.fillRect(0, floorY - 2, s.width, 4);

        const chars: CharacterId[] = ['coffee', 'student', 'singer', 'gamer'];
        const titleScale = Math.max(0.68, Math.min(1.08, s.width / 760));
        const spacing = isMobile
          ? Math.min(82, (s.width - 36) / 3.5)
          : Math.min(180, s.width * 0.16);
        const startX = s.width * 0.5 - spacing * 1.5;

        chars.forEach((charId, idx) => {
          const cx = startX + idx * spacing;
          const pose: Pose =
            charId === 'singer'
              ? 'guitar'
              : charId === 'coffee'
                ? 'coffee'
                : idx % 2 === 0
                  ? 'walk'
                  : 'idle';
          const expr: Expression =
            charId === 'student'
              ? 'worried'
              : charId === 'singer'
                ? 'happy'
                : charId === 'coffee'
                  ? 'tired'
                  : 'determined';
          drawStickman({
            ctx,
            x: cx,
            y: floorY,
            scale: titleScale,
            character: charId,
            pose,
            expression: expr,
            time: s.time + idx * 0.8,
            facing: 1,
          });
        });

        ctx.restore();
        return;
      }

      const act = ACTS[s.actIndex];
      const panProgress =
        s.transitionTimer > 0 ? 1 - s.transitionTimer / s.transitionDuration : 1;
      const smoothPan = panProgress < 1 ? 1 - Math.pow(1 - panProgress, 3) : 1;

      drawPaperBackground(
        act.paperTint,
        s.actIndex * s.width + smoothPan * 180 + s.time * 18
      );

      if (s.transitionTimer > 0 && s.actIndex > 0) {
        const prevIdx = s.actIndex - 1;
        drawSceneProps(prevIdx, -smoothPan * s.width);
        drawSceneProps(s.actIndex, (1 - smoothPan) * s.width);

        const targetX = act.id === 'CANCELLED' ? (isMobile ? 54 : s.width * 0.17) : s.width * 0.5;
        const charX = (1 - smoothPan) * (s.width + 120) + smoothPan * targetX;
        drawStickman({
          ctx,
          x: charX,
          y: floorY,
          scale: charScale,
          character: act.character,
          pose: 'run',
          expression: 'determined',
          time: s.time,
          facing: -1,
        });
      } else {
        drawSceneProps(s.actIndex, 0);

        if (act.id === 'ALGORITHM') {
          const isLocked = s.algoWindup > 0;
          ctx.save();
          ctx.strokeStyle = isLocked ? '#DC2626' : 'rgba(220, 38, 38, 0.45)';
          ctx.lineWidth = isLocked ? 2.5 : 1.5;
          ctx.setLineDash([6, 6]);
          ctx.beginPath();
          ctx.moveTo(s.algoTargetX, 92);
          ctx.lineTo(s.algoTargetX, floorY);
          ctx.stroke();
          ctx.setLineDash([]);

          ctx.fillStyle = isLocked ? '#DC2626' : '#18181B';
          ctx.font = '700 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'center';
          ctx.fillText(
            isLocked ? '¡COMPRA DETECTADA!' : 'ANALIZANDO...',
            Math.max(70, Math.min(s.width - 70, s.algoTargetX)),
            isMobile ? 102 : 84
          );
          ctx.restore();
        }

        for (const b of s.bullets) {
          const bx = Math.round(b.x);
          const by = Math.round(b.y);
          ctx.fillStyle = '#18181B';
          ctx.fillRect(bx - 7, by - 7, 14, 14);
          ctx.fillStyle = '#2563EB';
          ctx.fillRect(bx - 5, by - 5, 10, 10);
        }

        for (const item of s.items) {
          const sprite = getItemSprite(item.kind, item.label, item.w, item.h, item.lane);
          if (sprite) {
            ctx.drawImage(
              sprite,
              Math.round(item.x - sprite.width * 0.5),
              Math.round(item.y - sprite.height * 0.5)
            );
          } else {
            ctx.fillStyle = item.kind === 'bad' ? '#DC2626' : '#16A34A';
            ctx.fillRect(
              Math.round(item.x - item.w * 0.5),
              Math.round(item.y - item.h * 0.5),
              item.w,
              item.h
            );
          }
        }

        const held = keysHeldRef.current;
        const movingHoriz =
          (act.id === 'ALGORITHM' || act.id === 'EXAM') &&
          (held.has('ArrowLeft') ||
            held.has('ArrowRight') ||
            held.has('KeyA') ||
            held.has('KeyD') ||
            (s.targetPointerX !== null && Math.abs(s.targetPointerX - s.playerX) > 10));

        let charPose: Pose = movingHoriz ? 'walk' : 'idle';
        if (act.id === 'SINGER') charPose = s.strumTimer > 0 ? 'guitar' : 'idle';
        if (act.id === 'CANCELLED') charPose = 'shield';

        const charY = act.id === 'CANCELLED' ? s.playerY : floorY;

        if (
          (s.activePowerUp === 'INVINCIBLE' && s.activePowerUpTime > 0) ||
          s.goldenInvulnTimer > 0
        ) {
          ctx.save();
          ctx.strokeStyle = '#16A34A';
          ctx.lineWidth = 3;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.ellipse(s.playerX, charY - 60 * (charScale / 1.18), 38, 66, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }

        if (act.id === 'CANCELLED') {
          const shieldArcRadius = 40 + (s.ownedUpgrades.double_shot || 0) * 14;
          ctx.save();
          ctx.strokeStyle = '#65A30D';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(s.playerX + 24, charY - 54, shieldArcRadius, -0.95, 0.95);
          ctx.stroke();
          ctx.restore();
        }

        drawStickman({
          ctx,
          x: s.playerX,
          y: charY,
          scale: charScale,
          character: act.character,
          pose: charPose,
          expression: s.expression,
          time: s.time,
          facing: s.facing,
          squashX: s.squashX,
          squashY: s.squashY,
          hitFlash: s.hitFlash,
        });
      }

      for (const p of s.particles) {
        ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      ctx.globalAlpha = 1;

      if (s.blindTimer > 0 && gs === 'PLAYING') {
        ctx.fillStyle = 'rgba(6, 10, 26, 0.72)';
        ctx.fillRect(0, 0, s.width, s.height);
      }

      ctx.font = `800 ${isMobile ? 13 : 15}px "Bricolage Grotesque", sans-serif`;
      ctx.textAlign = 'center';
      for (const t of s.texts) {
        ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
      }
      ctx.globalAlpha = 1;

      ctx.restore();
    };

    let lastTitleRenderTs = 0;

    const tick = (now: number) => {
      if (typeof document !== 'undefined' && document.hidden) {
        lastTs = now;
        rafId = requestAnimationFrame(tick);
        return;
      }

      const gs = gameStateRef.current;

      // Throttle idle title-screen animation to ~20fps so menus consume minimal CPU/GPU
      if (gs === 'TITLE_MENU' && now - lastTitleRenderTs < 48) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      const rawDt = (now - lastTs) / 1000;
      lastTs = now;
      const dt = Math.min(rawDt, 0.05);

      const s = simRef.current;

      // Skip simulation & redraw completely when paused or covered by a modal (once particles settle)
      if (
        gs !== 'PLAYING' &&
        gs !== 'TITLE_MENU' &&
        s.particles.length === 0 &&
        s.texts.length === 0
      ) {
        rafId = requestAnimationFrame(tick);
        return;
      }

      updateSimulation(dt);
      render();

      if (gs === 'TITLE_MENU') {
        lastTitleRenderTs = now;
      }

      if (
        gs === 'PLAYING' &&
        (s.hudForceDirty || now - s.lastHudEmit > 250)
      ) {
        s.lastHudEmit = now;
        s.hudForceDirty = false;
        callbacksRef.current.onHudUpdate(buildHud());
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
    };
  }, []);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="block h-full w-full touch-none cursor-crosshair" />
    </div>
  );
};
