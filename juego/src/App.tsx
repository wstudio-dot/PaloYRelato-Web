import { Component, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import {
  Coins,
  Crosshair,
  Heart,
  Music,
  Pause,
  Play,
  RotateCcw,
  ShoppingBag,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { GameCanvas, type ShopAction, type TriviaGrant } from './components/GameCanvas';
import { ShopModal } from './components/ShopModal';
import { TriviaOverlay } from './components/TriviaOverlay';
import { ACTS } from './game/actsConfig';
import { soundEngine } from './game/audio';
import {
  clampSafeInt,
  getCanonicalConsumableCost,
  getCanonicalUpgrade,
  getCanonicalUpgradePrice,
  isValidPowerUp,
  MAX_SAFE_GAME_COINS,
  MAX_SAFE_LIVES,
  SHOP_HEAL_COST,
  SHOP_REROLL_COST,
} from './game/security';
import { POWERUP_INFO, TRIVIA_BANK, UPGRADES } from './game/upgradesAndTrivia';
import type {
  GameState,
  HudSnapshot,
  PowerUpType,
  ShopMode,
  TriviaQuestion,
  UpgradeDef,
  UpgradeId,
} from './game/types';

const INITIAL_HUD: HudSnapshot = {
  views: 0,
  coins: 25,
  retention: 100,
  combo: 1,
  maxCombo: 1,
  lives: 3,
  maxLives: 3,
  actIndex: 0,
  actId: ACTS[0].id,
  actTitle: ACTS[0].shortTitle,
  actSubtitle: ACTS[0].videoTitle,
  actTimeLeft: ACTS[0].duration,
  actDuration: ACTS[0].duration,
  loopCount: 1,
  isTransitioning: false,
  controlHint: ACTS[0].controlHint,
  actsCleared: 0,
  activePowerUp: null,
  activePowerUpTime: 0,
  blindTimeLeft: 0,
  ownedUpgrades: {},
};

function getViralRank(views: number): string {
  if (views >= 350000) return 'Tendencia Mundial #1';
  if (views >= 150000) return 'Algoritmo Conquistado';
  if (views >= 60000) return 'En Para Ti (Viral)';
  if (views >= 20000) return 'Retención Estable';
  return 'Shadowbanned';
}

function formatCompactViews(views: number): string {
  if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
  if (views >= 10000) return `${Math.round(views / 1000)}k`;
  return views.toLocaleString('es-ES');
}

class GameErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-[100dvh] w-screen items-center justify-center bg-[#0D2252] p-6 text-center text-white">
          <div className="max-w-sm rounded-xl border-2 border-zinc-950 bg-[#FAF9F6] p-6 text-zinc-900 shadow-[6px_6px_0px_#09090B]">
            <h2
              className="text-xl font-extrabold text-[#0D2252]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Corte inesperado en la grabación
            </h2>
            <p className="mt-2 text-xs text-zinc-600">
              Esta versión Beta encontró un fallo temporal en el navegador. Pulsa para reiniciar de forma segura.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 flex h-11 w-full items-center justify-center rounded-lg border-2 border-zinc-950 bg-[#FACC15] text-sm font-extrabold text-zinc-950 shadow-[3px_3px_0px_#09090B]"
            >
              Recargar Juego
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [shopMode, setShopMode] = useState<ShopMode>('browse');
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [muted, setMuted] = useState(false);
  const [musicOn, setMusicOn] = useState(true);

  const [restartTrigger, setRestartTrigger] = useState(0);
  const [loopTrigger, setLoopTrigger] = useState(0);
  const [shopResumeTrigger, setShopResumeTrigger] = useState(0);
  const [firePulseTrigger, setFirePulseTrigger] = useState(0);

  const [shopSync, setShopSync] = useState<ShopAction>({
    seq: 0,
    ownedUpgrades: {},
    coins: 25,
    lives: 3,
    maxLives: 3,
    powerUp: null,
  });

  const [activeTrivia, setActiveTrivia] = useState<TriviaQuestion | null>(null);
  const [triviaGrant, setTriviaGrant] = useState<TriviaGrant>({
    seq: 0,
    correct: false,
    powerUp: null,
  });
  const usedTriviaIdsRef = useRef<Set<string>>(new Set());
  const draftAvailableRef = useRef<boolean>(false);

  const startFreshGame = useCallback(() => {
    soundEngine.unlock();
    soundEngine.startMusic();
    soundEngine.playActTransition();
    usedTriviaIdsRef.current.clear();
    draftAvailableRef.current = false;
    setRestartTrigger((n) => n + 1);
    setHud(INITIAL_HUD);
    setGameState('PLAYING');
  }, []);

  const continueEndlessLoop = useCallback(() => {
    soundEngine.unlock();
    soundEngine.playActTransition();
    setLoopTrigger((n) => n + 1);
    setGameState('PLAYING');
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const toggleMusic = useCallback(() => {
    soundEngine.unlock();
    setMusicOn((prev) => {
      const next = !prev;
      soundEngine.setMusicEnabled(next);
      return next;
    });
  }, []);

  const togglePause = useCallback(() => {
    setGameState((prev) => {
      if (prev === 'PLAYING') return 'PAUSED';
      if (prev === 'PAUSED') return 'PLAYING';
      return prev;
    });
  }, []);

  const handleOpenBetweenActShop = useCallback((snapshot: HudSnapshot) => {
    setHud(snapshot);
    draftAvailableRef.current = true;
    setShopMode('between_acts');
    setShopSync((prev) => ({
      seq: prev.seq,
      ownedUpgrades: snapshot.ownedUpgrades,
      coins: snapshot.coins,
      lives: snapshot.lives,
      maxLives: snapshot.maxLives,
      powerUp: null,
    }));
    setGameState('SHOP');
  }, []);

  const openShopAnytime = useCallback(() => {
    soundEngine.unlock();
    draftAvailableRef.current = false;
    setShopMode('browse');
    setShopSync((prev) => ({
      seq: prev.seq,
      ownedUpgrades: hud.ownedUpgrades,
      coins: hud.coins,
      lives: hud.lives,
      maxLives: hud.maxLives,
      powerUp: null,
    }));
    setGameState('SHOP');
  }, [hud.coins, hud.lives, hud.maxLives, hud.ownedUpgrades]);

  const handlePickFreeDraft = useCallback((upgradeId: UpgradeId) => {
    if (!draftAvailableRef.current) return;
    const def = getCanonicalUpgrade(upgradeId);
    if (!def) return;

    draftAvailableRef.current = false;
    setHud((prev) => {
      const currentLvl = prev.ownedUpgrades[upgradeId] || 0;
      if (currentLvl >= def.maxLevel) return prev;

      const nextOwned = { ...prev.ownedUpgrades, [upgradeId]: currentLvl + 1 };
      let nextLives = prev.lives;
      let nextMaxLives = prev.maxLives;
      if (upgradeId === 'extra_heart') {
        nextMaxLives = clampSafeInt(nextMaxLives + 1, 1, MAX_SAFE_LIVES);
        nextLives = clampSafeInt(nextLives + 1, 0, nextMaxLives);
      }
      setShopSync((s) => ({
        seq: s.seq + 1,
        ownedUpgrades: nextOwned,
        coins: prev.coins,
        lives: nextLives,
        maxLives: nextMaxLives,
        powerUp: null,
      }));
      return {
        ...prev,
        ownedUpgrades: nextOwned,
        lives: nextLives,
        maxLives: nextMaxLives,
      };
    });
  }, []);

  const handleBuyUpgrade = useCallback((upgrade: UpgradeDef) => {
    const def = getCanonicalUpgrade(upgrade.id);
    if (!def) return;

    setHud((prev) => {
      const currentLvl = prev.ownedUpgrades[def.id] || 0;
      const canonicalPrice = getCanonicalUpgradePrice(def.id, currentLvl);
      if (canonicalPrice === null || prev.coins < canonicalPrice) return prev;

      const nextCoins = clampSafeInt(prev.coins - canonicalPrice, 0, MAX_SAFE_GAME_COINS);
      const nextOwned = { ...prev.ownedUpgrades, [def.id]: currentLvl + 1 };
      let nextLives = prev.lives;
      let nextMaxLives = prev.maxLives;
      if (def.id === 'extra_heart') {
        nextMaxLives = clampSafeInt(nextMaxLives + 1, 1, MAX_SAFE_LIVES);
        nextLives = clampSafeInt(nextLives + 1, 0, nextMaxLives);
      }

      setShopSync((s) => ({
        seq: s.seq + 1,
        ownedUpgrades: nextOwned,
        coins: nextCoins,
        lives: nextLives,
        maxLives: nextMaxLives,
        powerUp: null,
      }));
      return {
        ...prev,
        coins: nextCoins,
        ownedUpgrades: nextOwned,
        lives: nextLives,
        maxLives: nextMaxLives,
      };
    });
  }, []);

  const handleBuyConsumable = useCallback((powerUp: PowerUpType, _cost: number) => {
    if (!isValidPowerUp(powerUp)) return;
    const canonicalCost = getCanonicalConsumableCost(powerUp);
    if (canonicalCost === null) return;

    setHud((prev) => {
      if (prev.coins < canonicalCost) return prev;
      const nextCoins = clampSafeInt(prev.coins - canonicalCost, 0, MAX_SAFE_GAME_COINS);
      const info = POWERUP_INFO[powerUp];
      setShopSync((s) => ({
        seq: s.seq + 1,
        ownedUpgrades: prev.ownedUpgrades,
        coins: nextCoins,
        lives: prev.lives,
        maxLives: prev.maxLives,
        powerUp,
      }));
      return {
        ...prev,
        coins: nextCoins,
        activePowerUp: powerUp,
        activePowerUpTime: info.duration,
      };
    });
  }, []);

  const handleBuyHeal = useCallback((_cost: number) => {
    setHud((prev) => {
      if (prev.coins < SHOP_HEAL_COST || prev.lives >= prev.maxLives) return prev;
      const nextCoins = clampSafeInt(prev.coins - SHOP_HEAL_COST, 0, MAX_SAFE_GAME_COINS);
      const nextLives = clampSafeInt(prev.lives + 1, 0, prev.maxLives);
      setShopSync((s) => ({
        seq: s.seq + 1,
        ownedUpgrades: prev.ownedUpgrades,
        coins: nextCoins,
        lives: nextLives,
        maxLives: prev.maxLives,
        powerUp: null,
      }));
      return {
        ...prev,
        coins: nextCoins,
        lives: nextLives,
      };
    });
  }, []);

  const handleSpendCoins = useCallback(
    (amount: number) => {
      const validCost = amount === SHOP_REROLL_COST ? SHOP_REROLL_COST : clampSafeInt(amount, 1, MAX_SAFE_GAME_COINS);
      if (!Number.isFinite(amount) || amount <= 0 || hud.coins < validCost) return false;
      const nextCoins = clampSafeInt(hud.coins - validCost, 0, MAX_SAFE_GAME_COINS);
      setHud((prev) => ({
        ...prev,
        coins: clampSafeInt(prev.coins - validCost, 0, MAX_SAFE_GAME_COINS),
      }));
      setShopSync((s) => ({
        seq: s.seq + 1,
        ownedUpgrades: hud.ownedUpgrades,
        coins: nextCoins,
        lives: hud.lives,
        maxLives: hud.maxLives,
        powerUp: null,
      }));
      return true;
    },
    [hud.coins, hud.lives, hud.maxLives, hud.ownedUpgrades]
  );

  const handleContinueFromShop = useCallback(() => {
    draftAvailableRef.current = false;
    if (shopMode === 'between_acts') {
      setShopResumeTrigger((n) => n + 1);
    }
    setGameState('PLAYING');
  }, [shopMode]);

  const handleTriggerTrivia = useCallback((snapshot: HudSnapshot) => {
    setHud(snapshot);
    let available = TRIVIA_BANK.filter((q) => !usedTriviaIdsRef.current.has(q.id));
    if (available.length === 0) {
      usedTriviaIdsRef.current.clear();
      available = TRIVIA_BANK;
    }
    const picked = available[Math.floor(Math.random() * available.length)];
    usedTriviaIdsRef.current.add(picked.id);
    setActiveTrivia(picked);
    setGameState('TRIVIA');
  }, []);

  const handleResolveTrivia = useCallback((correct: boolean, powerUp: PowerUpType | null) => {
    if (correct) {
      soundEngine.playTriviaCorrect();
    } else {
      soundEngine.playTriviaWrong();
    }
    setActiveTrivia(null);
    setTriviaGrant((prev) => ({
      seq: prev.seq + 1,
      correct,
      powerUp,
    }));
    setGameState('PLAYING');
  }, []);

  const handleReachVictory = useCallback((finalHud: HudSnapshot) => {
    setHud(finalHud);
    setGameState('VICTORY');
  }, []);

  const handleGameOver = useCallback((finalHud: HudSnapshot) => {
    setHud(finalHud);
    setGameState('GAME_OVER');
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {

      if (e.code === 'KeyT' && (gameState === 'PLAYING' || gameState === 'PAUSED')) {
        e.preventDefault();
        openShopAnytime();
        return;
      }

      if (e.code === 'Escape') {
        if (gameState === 'SHOP' && shopMode === 'browse') {
          e.preventDefault();
          handleContinueFromShop();
        } else if (gameState === 'PLAYING' || gameState === 'PAUSED') {
          e.preventDefault();
          togglePause();
        }
      } else if (
        (e.code === 'Enter' || e.code === 'Space') &&
        gameState === 'TITLE_MENU'
      ) {
        e.preventDefault();
        startFreshGame();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    gameState,
    handleContinueFromShop,
    openShopAnytime,
    shopMode,
    startFreshGame,
    togglePause,
  ]);

  const progressPct = Math.max(
    0,
    Math.min(100, ((hud.actDuration - hud.actTimeLeft) / hud.actDuration) * 100)
  );

  const ownedList = UPGRADES.filter((u) => (hud.ownedUpgrades[u.id] || 0) > 0);
  const nextActTitle = ACTS[Math.min(ACTS.length - 1, hud.actIndex + 1)].shortTitle;
  const activePowerInfo = hud.activePowerUp ? POWERUP_INFO[hud.activePowerUp] : null;

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-[#FAF9F6] text-zinc-900 select-none">
      {/* Isolated 60fps Canvas */}
      <GameCanvas
        gameState={gameState}
        loopTrigger={loopTrigger}
        restartTrigger={restartTrigger}
        shopResumeTrigger={shopResumeTrigger}
        firePulseTrigger={firePulseTrigger}
        shopSync={shopSync}
        triviaGrant={triviaGrant}
        onHudUpdate={setHud}
        onOpenShop={handleOpenBetweenActShop}
        onTriggerTrivia={handleTriggerTrivia}
        onReachVictory={handleReachVictory}
        onGameOver={handleGameOver}
      />

      {/* TITLE SCREEN OVERLAY */}
      {gameState === 'TITLE_MENU' && (
        <div className="pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-between px-4 py-4 sm:px-6 sm:py-7">
          <div className="flex w-full max-w-6xl items-center justify-between gap-3">
            <div className="pointer-events-auto flex items-center gap-2.5">
              <img
                src="./assets/aistudio/logo.png"
                alt="Logo de Palo y Relato"
                decoding="async"
                referrerPolicy="no-referrer"
                className="h-10 w-10 rounded-full border-2 border-[#FACC15] object-cover shadow-[2px_2px_0px_#09090B] sm:h-11 sm:w-11"
              />
              <span
                className="text-sm font-extrabold tracking-tight text-white sm:text-base"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                Palo <span className="text-[#FACC15]">y Relato</span>
              </span>
            </div>

            <div className="pointer-events-auto flex items-center gap-2">
              <button
                type="button"
                onClick={toggleMusic}
                aria-label={musicOn ? 'Desactivar música' : 'Activar música'}
                className="flex h-10 items-center gap-1.5 rounded-lg border-2 border-zinc-950 bg-[#132F6E] px-3 text-xs font-bold text-white shadow-[2px_2px_0px_#09090B] transition-transform hover:bg-[#1B4298] active:translate-y-0.5"
              >
                <Music className="h-3.5 w-3.5 text-[#FACC15]" />
                <span>{musicOn ? 'Música Sí' : 'Música No'}</span>
              </button>
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? 'Activar sonido' : 'Silenciar sonido'}
                className="flex h-10 w-10 items-center justify-center rounded-lg border-2 border-zinc-950 bg-[#132F6E] text-white shadow-[2px_2px_0px_#09090B] transition-transform hover:bg-[#1B4298] active:translate-y-0.5"
              >
                {muted ? <VolumeX className="h-4 w-4 text-red-400" /> : <Volume2 className="h-4 w-4 text-[#FACC15]" />}
              </button>
            </div>
          </div>

          <div className="pointer-events-auto mb-20 flex max-w-xl flex-col items-center text-center sm:mb-32">
            <img
              src="./assets/aistudio/logo.png"
              alt="Emblema oficial de Palo y Relato"
              decoding="async"
              referrerPolicy="no-referrer"
              className="mb-3 h-20 w-20 rounded-full border-[3px] border-[#FACC15] object-cover shadow-[0_0_0_2px_#09090B,4px_4px_0px_#09090B] sm:h-24 sm:w-24"
            />

            <h1
              className="text-3xl font-extrabold tracking-tight text-white sm:text-5xl"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Sin <span className="text-[#FACC15]">Pausas</span>
            </h1>
            <p className="mt-1 font-mono text-xs font-bold tracking-wide text-amber-200 sm:text-sm">
              VERSIÓN BETA · LA MENTE VIRAL · PALO Y RELATO
            </p>

            <p className="mt-2.5 max-w-md text-xs font-medium text-blue-100 sm:max-w-lg sm:text-base">
              4 crisis sin cortes, tienda roguelike abierta en cualquier momento y preguntas de
              cultura general con power-ups en directo.
            </p>

            <div className="mt-4 flex w-full max-w-xs justify-center sm:mt-6 sm:w-auto sm:max-w-none">
              <button
                type="button"
                onClick={startFreshGame}
                className="flex h-12 items-center justify-center gap-2.5 rounded-lg border-2 border-zinc-950 bg-[#FACC15] px-8 text-sm font-extrabold text-zinc-950 shadow-[4px_4px_0px_#09090B] transition-transform hover:-translate-y-0.5 hover:bg-[#FDE047] active:translate-y-0.5 whitespace-nowrap"
              >
                <Play className="h-4 w-4 fill-current" />
                Jugar
              </button>
            </div>
          </div>

          <p className="text-center text-[11px] font-semibold text-zinc-800 sm:text-xs">
            <span className="sm:hidden">Desliza o toca para jugar · Botón Tienda arriba</span>
            <span className="hidden sm:inline">
              A/D o Ratón Mover · Espacio Acción · 1/2/3 Acordes y Trivia · T Tienda · Esc Pausa
            </span>
          </p>
        </div>
      )}

      {/* ACTIVE PLAYING PERIMETER HUD */}
      {(gameState === 'PLAYING' || gameState === 'PAUSED' || gameState === 'TRIVIA') && (
        <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-2.5 sm:p-5">
          {/* Compact Responsive Top HUD */}
          <div className="flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              {/* Top-Left: Act & Timer */}
              <div className="min-w-0 max-w-[175px] rounded-lg border-2 border-zinc-900 bg-[#FAF9F6]/95 px-2.5 py-1.5 shadow-[2px_2px_0px_#18181B] sm:max-w-md sm:px-3.5 sm:py-2.5 sm:shadow-[3px_3px_0px_#18181B]">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-900 sm:gap-2 sm:text-xs">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-sm bg-red-600 sm:h-2.5 sm:w-2.5"
                    aria-hidden="true"
                  />
                  <span className="truncate">{hud.actTitle}</span>
                  <span aria-hidden="true" className="text-zinc-400">·</span>
                  <span className="shrink-0 font-mono tabular-nums text-zinc-700">
                    {hud.actTimeLeft}s
                  </span>
                  {hud.loopCount > 1 && (
                    <>
                      <span aria-hidden="true" className="hidden text-zinc-400 sm:inline">·</span>
                      <span className="hidden font-mono text-red-600 sm:inline">
                        x{hud.loopCount}
                      </span>
                    </>
                  )}
                </div>
                <p className="mt-0.5 hidden truncate text-xs font-medium text-zinc-600 sm:block">
                  {hud.actSubtitle}
                </p>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-sm bg-zinc-200 sm:mt-1.5 sm:h-1.5">
                  <div
                    className="h-full bg-zinc-900 transition-[width] duration-150"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Top-Right: Telemetry + Action Controls */}
              <div className="flex items-center gap-1.5 sm:gap-2">
                <div className="flex items-center gap-2 rounded-lg border-2 border-zinc-900 bg-[#FAF9F6]/95 px-2.5 py-1.5 shadow-[2px_2px_0px_#18181B] sm:gap-3.5 sm:px-3.5 sm:py-2 sm:shadow-[3px_3px_0px_#18181B]">
                  <div className="text-right">
                    <div className="hidden text-[11px] font-medium text-zinc-500 sm:block">
                      Vistas
                    </div>
                    <div className="font-mono text-xs font-bold tabular-nums text-zinc-900 sm:text-sm">
                      <span className="sm:hidden">{formatCompactViews(hud.views)}</span>
                      <span className="hidden sm:inline">
                        {hud.views.toLocaleString('es-ES')}
                      </span>
                    </div>
                  </div>
                  <div className="h-5 w-px bg-zinc-300 sm:h-6" aria-hidden="true" />
                  <div className="flex items-center gap-0.5 font-mono text-xs font-bold tabular-nums text-amber-700 sm:text-sm">
                    <Coins className="h-3.5 w-3.5" />
                    <span>{hud.coins}</span>
                  </div>
                  <div className="hidden h-6 w-px bg-zinc-300 sm:block" aria-hidden="true" />
                  <div className="hidden text-right sm:block">
                    <div className="text-[11px] font-medium text-zinc-500">Combo</div>
                    <div className="font-mono text-sm font-bold tabular-nums text-red-600">
                      x{hud.combo}
                    </div>
                  </div>
                  <div className="h-5 w-px bg-zinc-300 sm:h-6" aria-hidden="true" />
                  <div
                    className="flex items-center gap-0.5 sm:gap-1"
                    aria-label={`Atención: ${hud.lives} de ${hud.maxLives}`}
                  >
                    <Heart className="h-3.5 w-3.5 fill-red-600 text-zinc-900 sm:hidden" />
                    <div className="hidden items-center gap-1 sm:flex">
                      {Array.from({ length: hud.maxLives }).map((_, i) => (
                        <Heart
                          key={i}
                          className={`h-4 w-4 ${
                            i < hud.lives
                              ? 'fill-red-600 text-zinc-900'
                              : 'fill-zinc-200 text-zinc-400'
                          }`}
                        />
                      ))}
                    </div>
                    <span className="font-mono text-xs font-bold tabular-nums text-zinc-700">
                      {hud.lives}/{hud.maxLives}
                    </span>
                  </div>
                </div>

                {/* Anytime Shop Button */}
                <button
                  type="button"
                  onClick={openShopAnytime}
                  aria-label="Abrir Tienda (Tecla T)"
                  className="pointer-events-auto flex h-10 items-center gap-1.5 rounded-lg border-2 border-zinc-950 bg-[#FACC15] px-2.5 text-xs font-extrabold text-zinc-950 shadow-[2px_2px_0px_#18181B] transition-transform hover:bg-[#FDE047] active:translate-y-0.5 sm:h-11 sm:px-3.5 sm:shadow-[3px_3px_0px_#18181B] whitespace-nowrap"
                >
                  <ShoppingBag className="h-4 w-4" />
                  <span className="hidden sm:inline">Tienda (T)</span>
                </button>

                <button
                  type="button"
                  onClick={toggleMusic}
                  aria-label={musicOn ? 'Silenciar música' : 'Activar música'}
                  className={`pointer-events-auto hidden h-11 w-11 items-center justify-center rounded-lg border-2 border-zinc-900 shadow-[3px_3px_0px_#18181B] transition-transform active:translate-y-0.5 sm:flex ${
                    musicOn ? 'bg-white text-zinc-900' : 'bg-zinc-200 text-zinc-500'
                  }`}
                >
                  <Music className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={toggleMute}
                  aria-label={muted ? 'Activar sonido' : 'Silenciar todo'}
                  className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-lg border-2 border-zinc-900 bg-white text-zinc-900 shadow-[2px_2px_0px_#18181B] transition-transform active:translate-y-0.5 sm:h-11 sm:w-11 sm:shadow-[3px_3px_0px_#18181B]"
                >
                  {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </button>

                <button
                  type="button"
                  onClick={togglePause}
                  aria-label={gameState === 'PAUSED' ? 'Reanudar partida' : 'Pausar partida'}
                  className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-lg border-2 border-zinc-900 bg-white text-zinc-900 shadow-[2px_2px_0px_#18181B] transition-transform active:translate-y-0.5 sm:h-11 sm:w-11 sm:shadow-[3px_3px_0px_#18181B]"
                >
                  {gameState === 'PAUSED' ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {activePowerInfo && hud.activePowerUpTime > 0 && (
                <div
                  className="flex w-fit items-center gap-1.5 rounded-lg border-2 border-zinc-900 bg-white px-2.5 py-1 text-[11px] font-extrabold shadow-[2px_2px_0px_#18181B] sm:px-3 sm:py-1.5 sm:text-xs"
                  style={{ color: activePowerInfo.color }}
                >
                  <Zap className="h-3.5 w-3.5" />
                  <span>{activePowerInfo.title}</span>
                  <span className="font-mono tabular-nums text-zinc-900">
                    {hud.activePowerUpTime}s
                  </span>
                </div>
              )}

              {hud.blindTimeLeft > 0 && (
                <div className="flex w-fit items-center gap-1.5 rounded-lg border-2 border-zinc-950 bg-[#0D2252] px-2.5 py-1 text-[11px] font-extrabold text-[#FACC15] shadow-[2px_2px_0px_#09090B] sm:px-3 sm:py-1.5 sm:text-xs">
                  <span>Cegado · Objetos lentos</span>
                  <span className="font-mono tabular-nums text-white">
                    {hud.blindTimeLeft}s
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Controls / Hint Row */}
          <div className="flex items-end justify-between gap-2 sm:flex-col sm:items-center sm:gap-1.5">
            {ownedList.length > 0 && (
              <div className="hidden text-[11px] font-semibold text-zinc-600 sm:block">
                Mejoras activas:{' '}
                {ownedList
                  .map((u) => `${u.name} Nv.${hud.ownedUpgrades[u.id]}`)
                  .join(' · ')}
              </div>
            )}

            <div className="rounded-lg border border-zinc-900/20 bg-[#FAF9F6]/90 px-3 py-1 text-[11px] font-medium text-zinc-700 sm:px-3.5 sm:py-1.5 sm:text-xs">
              <span className="sm:hidden">
                {hud.actId === 'SINGER'
                  ? 'Toca los 3 círculos al ritmo'
                  : hud.actId === 'EXAM'
                    ? 'Arrastra para mover · Toca ideas o Disparar'
                    : hud.actId === 'CANCELLED'
                      ? 'Desliza arriba/abajo para bloquear'
                      : 'Desliza izquierda/derecha para esquivar'}
              </span>
              <span className="hidden sm:inline">{hud.controlHint} · T Tienda</span>
            </div>

            {/* Mobile Thumb Fire Button during Exam Act */}
            {hud.actId === 'EXAM' && gameState === 'PLAYING' && (
              <button
                type="button"
                onClick={() => setFirePulseTrigger((n) => n + 1)}
                className="pointer-events-auto flex h-12 items-center gap-1.5 rounded-lg border-2 border-zinc-900 bg-blue-600 px-3.5 text-xs font-extrabold text-white shadow-[3px_3px_0px_#18181B] active:translate-y-0.5 sm:hidden"
              >
                <Crosshair className="h-4 w-4" />
                <span>Foco</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* PAUSE MODAL */}
      {gameState === 'PAUSED' && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#091638]/60 p-4">
          <div className="w-full max-w-sm rounded-xl border-2 border-zinc-950 bg-[#FAF9F6] p-5 text-center shadow-[6px_6px_0px_#09090B] sm:p-6">
            <h2
              className="text-2xl font-extrabold text-[#0D2252]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Corte Técnico
            </h2>
            <p className="mt-1 text-sm text-zinc-600">
              Versión Beta · Retención: {hud.retention}% · Monedas: {hud.coins} 🪙
            </p>
            <div className="mt-5 flex flex-col gap-2.5 sm:mt-6">
              <button
                type="button"
                onClick={togglePause}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border-2 border-zinc-950 bg-[#0D2252] text-sm font-bold text-white shadow-[3px_3px_0px_#09090B]"
              >
                <Play className="h-4 w-4 fill-current text-[#FACC15]" />
                Reanudar
              </button>
              <button
                type="button"
                onClick={openShopAnytime}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border-2 border-zinc-950 bg-[#FACC15] text-sm font-extrabold text-zinc-950 shadow-[3px_3px_0px_#09090B]"
              >
                <ShoppingBag className="h-4 w-4" />
                Abrir Tienda
              </button>
              <button
                type="button"
                onClick={toggleMusic}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border-2 border-zinc-900 bg-white text-sm font-bold text-zinc-900 shadow-[3px_3px_0px_#18181B] sm:hidden"
              >
                <Music className="h-4 w-4" />
                {musicOn ? 'Desactivar Música' : 'Activar Música'}
              </button>
              <button
                type="button"
                onClick={startFreshGame}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border-2 border-zinc-900 bg-white text-sm font-bold text-zinc-900 shadow-[3px_3px_0px_#18181B]"
              >
                <RotateCcw className="h-4 w-4" />
                Reiniciar
              </button>
              <button
                type="button"
                onClick={() => setGameState('TITLE_MENU')}
                className="h-10 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
              >
                Volver al Título
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ROGUELIKE DRAFT & ALGORITHM SHOP MODAL */}
      <ShopModal
        open={gameState === 'SHOP'}
        mode={shopMode}
        coins={hud.coins}
        lives={hud.lives}
        maxLives={hud.maxLives}
        nextActTitle={nextActTitle}
        ownedUpgrades={hud.ownedUpgrades}
        onPickFreeDraft={handlePickFreeDraft}
        onBuyUpgrade={handleBuyUpgrade}
        onBuyConsumable={handleBuyConsumable}
        onBuyHeal={handleBuyHeal}
        onSpendCoins={handleSpendCoins}
        onContinue={handleContinueFromShop}
      />

      {/* GENERAL KNOWLEDGE TRIVIA OVERLAY */}
      {gameState === 'TRIVIA' && (
        <TriviaOverlay question={activeTrivia} onResolve={handleResolveTrivia} />
      )}

      {/* VICTORY OR GAME OVER MODAL */}
      {(gameState === 'VICTORY' || gameState === 'GAME_OVER') && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-[#091638]/65 p-4">
          <div className="w-full max-w-md rounded-xl border-2 border-zinc-950 bg-[#FAF9F6] p-5 shadow-[6px_6px_0px_#09090B] sm:p-6">
            <p className="text-xs font-bold text-[#0D2252]">
              {gameState === 'VICTORY'
                ? 'Palo y Relato · Plano Secuencia Completado'
                : 'Fin de la Retención · Algoritmo Desconectado'}
            </p>
            <h2
              className="mt-1 text-xl font-extrabold text-zinc-900 sm:text-2xl"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {gameState === 'VICTORY'
                ? '¡Vídeo Viral Publicado!'
                : 'La Audiencia Hizo Scroll'}
            </h2>
            <p className="mt-1.5 text-xs text-zinc-600 sm:text-sm">
              {gameState === 'VICTORY'
                ? 'Sobreviviste los 4 actos con tus mejoras roguelike. ¿Listo para acelerar el bucle?'
                : 'Te atrapó una crisis en directo. Vuelve a intentarlo con otra build.'}
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2.5 rounded-lg border border-zinc-900/15 bg-white p-3 text-center sm:mt-5 sm:gap-3 sm:p-3.5">
              <div>
                <div className="text-[11px] font-medium text-zinc-500">Vistas</div>
                <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-zinc-900 sm:text-base">
                  {hud.views.toLocaleString('es-ES')}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-zinc-500">Combo Máx</div>
                <div className="mt-0.5 font-mono text-sm font-bold tabular-nums text-[#0D2252] sm:text-base">
                  x{hud.maxCombo}
                </div>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-xs font-medium text-zinc-600">
              <span>Rango: {getViralRank(hud.views)}</span>
              <span>Monedas: {hud.coins} 🪙</span>
            </div>

            <div className="mt-5 flex flex-col gap-2.5 sm:mt-6">
              {gameState === 'VICTORY' && (
                <button
                  type="button"
                  onClick={continueEndlessLoop}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border-2 border-zinc-950 bg-[#FACC15] text-sm font-extrabold text-zinc-950 shadow-[3px_3px_0px_#09090B] transition-transform hover:-translate-y-0.5"
                >
                  <Play className="h-4 w-4 fill-current" />
                  Seguir en Bucle x{hud.loopCount + 1} (Conservas Mejoras)
                </button>
              )}

              <button
                type="button"
                onClick={startFreshGame}
                className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border-2 border-zinc-950 bg-[#0D2252] text-sm font-bold text-white shadow-[3px_3px_0px_#09090B] transition-transform hover:-translate-y-0.5"
              >
                <RotateCcw className="h-4 w-4 text-[#FACC15]" />
                Jugar de Nuevo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <GameErrorBoundary>
      <AppContent />
    </GameErrorBoundary>
  );
}
