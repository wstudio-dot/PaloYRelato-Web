import type { PowerUpType, UpgradeId } from './types';
import { POWERUP_INFO, SHOP_CONSUMABLES, UPGRADES } from './upgradesAndTrivia';

export const SHOP_HEAL_COST = 28;
export const SHOP_REROLL_COST = 15;
export const MAX_SAFE_GAME_VIEWS = 999_999_999;
export const MAX_SAFE_GAME_COINS = 999_999;
export const MAX_SAFE_LIVES = 10;

const UPGRADE_BY_ID = new Map(UPGRADES.map((u) => [u.id, u]));
const CONSUMABLE_BY_ID = new Map(SHOP_CONSUMABLES.map((c) => [c.id, c]));

export function clampSafeInt(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return min;
  const floored = Math.floor(value);
  if (floored < min) return min;
  if (floored > max) return max;
  return floored;
}

export function isValidPowerUp(powerUp: unknown): powerUp is PowerUpType {
  return typeof powerUp === 'string' && Object.prototype.hasOwnProperty.call(POWERUP_INFO, powerUp);
}

export function getCanonicalUpgrade(id: UpgradeId) {
  return UPGRADE_BY_ID.get(id) ?? null;
}

export function getCanonicalUpgradePrice(id: UpgradeId, currentLevel: number): number | null {
  const def = UPGRADE_BY_ID.get(id);
  if (!def) return null;
  const lvl = clampSafeInt(currentLevel, 0, def.maxLevel);
  if (lvl >= def.maxLevel) return null;
  return def.cost + lvl * 12;
}

export function getCanonicalConsumableCost(powerUp: PowerUpType): number | null {
  const def = CONSUMABLE_BY_ID.get(powerUp);
  return def ? def.cost : null;
}

export function sanitizeOwnedUpgrades(
  raw: unknown
): Partial<Record<UpgradeId, number>> {
  const clean: Partial<Record<UpgradeId, number>> = {};
  if (!raw || typeof raw !== 'object') return clean;

  for (const def of UPGRADES) {
    const val = (raw as Record<string, unknown>)[def.id];
    const lvl = clampSafeInt(val, 0, def.maxLevel);
    if (lvl > 0) {
      clean[def.id] = lvl;
    }
  }
  return clean;
}
