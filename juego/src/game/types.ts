export type GameState =
  | 'TITLE_MENU'
  | 'PLAYING'
  | 'PAUSED'
  | 'SHOP'
  | 'TRIVIA'
  | 'VICTORY'
  | 'GAME_OVER';

export type ShopMode = 'browse' | 'between_acts';

export type ActId = 'ALGORITHM' | 'EXAM' | 'SINGER' | 'CANCELLED';

export type CharacterId = 'coffee' | 'student' | 'singer' | 'gamer';

export type Expression =
  | 'neutral'
  | 'happy'
  | 'worried'
  | 'scared'
  | 'determined'
  | 'tired'
  | 'laughing';

export type Pose = 'idle' | 'walk' | 'run' | 'dramatic' | 'guitar' | 'shield' | 'coffee';

export type UpgradeId =
  | 'magnet'
  | 'double_shot'
  | 'turbo_shoes'
  | 'adblocker'
  | 'auto_tune'
  | 'extra_heart'
  | 'coin_greed'
  | 'combo_shield'
  | 'golden_shield'
  | 'viral_multiplier'
  | 'clickbait'
  | 'comment_bots'
  | 'coffee_thermos'
  | 'chronometer'
  | 'trivia_scholar'
  | 'sponsor_deal'
  | 'rage_armor';

export type PowerUpType = 'INVINCIBLE' | 'SLOW_MO' | 'DOUBLE_VIEWS' | 'COIN_RAIN';

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  description: string;
  cost: number;
  maxLevel: number;
  category: 'Ofensiva' | 'Movilidad' | 'Economía' | 'Defensa';
}

export interface TriviaQuestion {
  id: string;
  category: string;
  question: string;
  options: [string, string, string];
  correctIndex: 0 | 1 | 2;
  rewardPowerUp: PowerUpType;
  rewardLabel: string;
}

export interface HudSnapshot {
  views: number;
  coins: number;
  retention: number;
  combo: number;
  maxCombo: number;
  lives: number;
  maxLives: number;
  actIndex: number;
  actId: ActId;
  actTitle: string;
  actSubtitle: string;
  actTimeLeft: number;
  actDuration: number;
  loopCount: number;
  isTransitioning: boolean;
  controlHint: string;
  actsCleared: number;
  activePowerUp: PowerUpType | null;
  activePowerUpTime: number;
  blindTimeLeft: number;
  ownedUpgrades: Partial<Record<UpgradeId, number>>;
}

export interface ActDefinition {
  id: ActId;
  index: number;
  character: CharacterId;
  videoTitle: string;
  shortTitle: string;
  instruction: string;
  controlHint: string;
  accentColor: string;
  paperTint: string;
  duration: number;
}
