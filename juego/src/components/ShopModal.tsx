import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Coins,
  Heart,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import {
  pickRandomUpgrades,
  SHOP_CONSUMABLES,
  type ShopConsumable,
} from '../game/upgradesAndTrivia';
import { soundEngine } from '../game/audio';
import {
  getCanonicalUpgradePrice,
  SHOP_HEAL_COST,
  SHOP_REROLL_COST,
} from '../game/security';
import type { PowerUpType, ShopMode, UpgradeDef, UpgradeId } from '../game/types';

interface ShopModalProps {
  open: boolean;
  mode: ShopMode;
  coins: number;
  lives: number;
  maxLives: number;
  nextActTitle: string;
  ownedUpgrades: Partial<Record<UpgradeId, number>>;
  onPickFreeDraft: (upgradeId: UpgradeId) => void;
  onBuyUpgrade: (upgrade: UpgradeDef) => void;
  onBuyConsumable: (powerUp: PowerUpType, cost: number) => void;
  onBuyHeal: (cost: number) => void;
  onSpendCoins: (amount: number) => boolean;
  onContinue: () => void;
}

export const ShopModal: React.FC<ShopModalProps> = React.memo(({
  open,
  mode,
  coins,
  lives,
  maxLives,
  nextActTitle,
  ownedUpgrades,
  onPickFreeDraft,
  onBuyUpgrade,
  onBuyConsumable,
  onBuyHeal,
  onSpendCoins,
  onContinue,
}) => {
  const [draftPicked, setDraftPicked] = useState(false);
  const [rerollCount, setRerollCount] = useState(0);

  const draftOptions = useMemo(
    () => (mode === 'between_acts' ? pickRandomUpgrades(ownedUpgrades, 3) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, mode]
  );

  const shopStock = useMemo(() => {
    const draftIds = draftOptions.map((d) => d.id);
    const items = pickRandomUpgrades(ownedUpgrades, 6, draftIds);
    if (items.length < 6) {
      return pickRandomUpgrades(ownedUpgrades, 6);
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rerollCount]);

  if (!open) return null;

  const healCost = SHOP_HEAL_COST;
  const rerollCost = SHOP_REROLL_COST;

  const handleSelectDraft = (id: UpgradeId) => {
    if (draftPicked) return;
    soundEngine.playPowerUp();
    setDraftPicked(true);
    onPickFreeDraft(id);
  };

  const handleReroll = () => {
    if (coins < rerollCost) return;
    if (onSpendCoins(rerollCost)) {
      soundEngine.playCoinPickup();
      setRerollCount((c) => c + 1);
    }
  };

  const handleBuyPowerUp = (item: ShopConsumable) => {
    if (coins < item.cost) return;
    soundEngine.playPowerUp();
    onBuyConsumable(item.id, item.cost);
  };

  const handleContinue = () => {
    setDraftPicked(false);
    setRerollCount(0);
    onContinue();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-950/60 p-2.5 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Tienda del Algoritmo y Mejoras Roguelike"
    >
      <div className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border-2 border-zinc-900 bg-[#FAF9F6] text-zinc-900 shadow-[6px_6px_0px_#18181B]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 border-b-2 border-zinc-950 bg-[#0D2252] px-4 py-3 text-white sm:px-6 sm:py-4">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold text-[#FACC15] sm:text-xs">
              {mode === 'between_acts'
                ? `Acto completado · Siguiente: ${nextActTitle}`
                : 'Tienda abierta · Grabación en pausa'}
            </p>
            <h2
              className="text-base font-extrabold tracking-tight text-white sm:text-xl"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Tienda y Mejoras Roguelike
            </h2>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex items-center gap-1 rounded-lg border border-white/25 bg-[#132F6E] px-2.5 py-1 font-mono text-xs font-bold tabular-nums text-white sm:px-3 sm:py-1.5 sm:text-sm">
              <Heart className="h-3.5 w-3.5 fill-red-500 text-white sm:h-4 sm:w-4" />
              <span>
                {lives}/{maxLives}
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-lg border-2 border-zinc-950 bg-[#FACC15] px-2.5 py-1 font-mono text-xs font-extrabold tabular-nums text-zinc-950 sm:px-3.5 sm:py-1.5 sm:text-sm">
              <Coins className="h-3.5 w-3.5 text-zinc-950 sm:h-4 sm:w-4" />
              <span>{coins}</span>
            </div>
            {mode === 'browse' && (
              <button
                type="button"
                onClick={handleContinue}
                aria-label="Cerrar tienda"
                className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/30 bg-[#132F6E] text-white hover:bg-[#1B4298]"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:space-y-6 sm:p-6">
          {/* Free Draft Section (only between acts) */}
          {mode === 'between_acts' && (
            <div>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="flex items-center gap-2 text-sm font-extrabold text-zinc-900">
                  <Sparkles className="h-4 w-4 text-red-600" />
                  {draftPicked
                    ? 'Mejora Gratuita Elegida'
                    : 'Elige 1 Mejora Roguelike Gratis'}
                </h3>
                <span className="text-xs font-medium text-zinc-500">
                  {draftPicked ? 'Aplicada a tu run' : 'Recompensa por completar el acto'}
                </span>
              </div>

              {draftOptions.length === 0 ? (
                <div className="rounded-lg border border-zinc-900/15 bg-white p-4 text-sm text-zinc-600">
                  Ya tienes todas las mejoras disponibles al nivel máximo.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-3">
                  {draftOptions.map((upg) => {
                    const lvl = ownedUpgrades[upg.id] || 0;
                    return (
                      <button
                        key={upg.id}
                        type="button"
                        disabled={draftPicked}
                        onClick={() => handleSelectDraft(upg.id)}
                        className={`flex flex-col justify-between rounded-lg border-2 p-4 text-left transition-transform ${
                          draftPicked
                            ? 'cursor-default border-zinc-300 bg-zinc-100 opacity-60'
                            : 'border-zinc-900 bg-white shadow-[3px_3px_0px_#18181B] hover:-translate-y-0.5 active:translate-y-0.5'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500">
                            <span>{upg.category}</span>
                            <span className="font-mono tabular-nums">
                              Nv. {lvl}/{upg.maxLevel}
                            </span>
                          </div>
                          <div
                            className="mt-1 text-base font-extrabold text-zinc-900"
                            style={{ fontFamily: 'var(--font-display)' }}
                          >
                            {upg.name}
                          </div>
                          <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">
                            {upg.description}
                          </p>
                        </div>
                        <div className="mt-3 text-xs font-bold text-emerald-700">
                          {draftPicked ? 'Cerrado' : 'Elegir Gratis →'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Section: Consumables & Quick Heal */}
          <div className={mode === 'between_acts' ? 'border-t border-zinc-900/15 pt-5' : ''}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-zinc-900">
                <Zap className="h-4 w-4 text-amber-600" />
                Consumibles Inmediatos y Curación
              </h3>
              <button
                type="button"
                disabled={coins < healCost || lives >= maxLives}
                onClick={() => {
                  soundEngine.playCoffeeSlurp();
                  onBuyHeal(healCost);
                }}
                className="flex h-9 items-center gap-1.5 rounded-lg border-2 border-zinc-900 bg-white px-3.5 text-xs font-bold text-zinc-900 transition-colors hover:bg-emerald-50 disabled:cursor-not-allowed disabled:border-zinc-300 disabled:opacity-45"
              >
                <Heart className="h-3.5 w-3.5 fill-red-600 text-zinc-900" />
                <span>Curar +1 Vida ({healCost} 🪙)</span>
              </button>
            </div>

            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {SHOP_CONSUMABLES.map((item) => {
                const canAfford = coins >= item.cost;
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={!canAfford}
                    onClick={() => handleBuyPowerUp(item)}
                    className="flex flex-col justify-between rounded-lg border border-zinc-900/20 bg-white p-3 text-left transition-colors hover:border-zinc-900 hover:bg-amber-50/50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div>
                      <div className="text-xs font-extrabold text-zinc-900">{item.name}</div>
                      <p className="mt-1 text-[11px] leading-snug text-zinc-600">
                        {item.description}
                      </p>
                    </div>
                    <div className="mt-2.5 font-mono text-xs font-bold text-amber-700">
                      Activar · {item.cost} 🪙
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section: 6-Item Permanent Roguelike Shelf */}
          <div className="border-t border-zinc-900/15 pt-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="flex items-center gap-2 text-sm font-extrabold text-zinc-900">
                <ShoppingBag className="h-4 w-4 text-zinc-800" />
                Objetos Permanentes de la Run (6 en escaparate)
              </h3>
              <button
                type="button"
                disabled={coins < rerollCost}
                onClick={handleReroll}
                className="flex h-9 items-center gap-1.5 rounded-lg border border-zinc-900 bg-white px-3 text-xs font-bold text-zinc-900 transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Refrescar ({rerollCost} 🪙)</span>
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {shopStock.map((upg) => {
                const lvl = ownedUpgrades[upg.id] || 0;
                const canonicalPrice = getCanonicalUpgradePrice(upg.id, lvl);
                const price = canonicalPrice ?? upg.cost;
                const maxed = canonicalPrice === null || lvl >= upg.maxLevel;
                const canAfford = coins >= price && !maxed;

                return (
                  <div
                    key={upg.id}
                    className="flex flex-col justify-between rounded-lg border border-zinc-900/20 bg-white p-4"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-500">
                        <span>{upg.category}</span>
                        <span className="font-mono tabular-nums">
                          Nv. {lvl}/{upg.maxLevel}
                        </span>
                      </div>
                      <div
                        className="mt-1 text-base font-extrabold text-zinc-900"
                        style={{ fontFamily: 'var(--font-display)' }}
                      >
                        {upg.name}
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-zinc-600">
                        {upg.description}
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={!canAfford}
                      onClick={() => {
                        soundEngine.playShopBuy();
                        onBuyUpgrade({ ...upg, cost: price });
                      }}
                      className="mt-4 flex h-9 w-full items-center justify-center rounded-lg border-2 border-zinc-950 bg-[#FACC15] text-xs font-extrabold text-zinc-950 transition-colors hover:bg-[#FDE047] disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-100 disabled:text-zinc-400"
                    >
                      {maxed ? 'Nivel Máximo' : `Comprar · ${price} 🪙`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer CTA */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-900/15 bg-white px-4 py-3 sm:px-6 sm:py-4">
          <p className="text-xs font-medium text-zinc-600">
            {mode === 'between_acts'
              ? draftPicked
                ? 'Todo listo para seguir grabando sin cortes.'
                : 'Elige primero tu mejora gratuita antes de continuar.'
              : 'Puedes volver a abrir la tienda cuando quieras pulsando T.'}
          </p>
          <button
            type="button"
            onClick={handleContinue}
            className="flex h-11 items-center gap-2 rounded-lg border-2 border-zinc-950 bg-[#0D2252] px-5 text-sm font-bold text-white shadow-[3px_3px_0px_#09090B] transition-transform hover:-translate-y-0.5 active:translate-y-0.5 whitespace-nowrap"
          >
            <span>
              {mode === 'between_acts' ? 'Continuar Plano Secuencia' : 'Volver al Acto'}
            </span>
            <ArrowRight className="h-4 w-4 text-[#FACC15]" />
          </button>
        </div>
      </div>
    </div>
  );
});
