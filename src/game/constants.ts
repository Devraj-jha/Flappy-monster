// Landscape dimensions (16:9)
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export const GROUND_HEIGHT = 60;
export const BIRD_SIZE = 40;
export const PLAY_HEIGHT = GAME_HEIGHT - GROUND_HEIGHT;

export const PIPE_WIDTH = 80;
export const POWERUP_SIZE = 22;
export const EFFECT_DURATION = 360; // 6 seconds at 60fps
export const BOSS_WARNING_FRAMES = 90; // 1.5s warning

export const START_LIVES = 0;   // hearts only come from heart portions
export const MAX_LIVES = 5;
export const HEART_BONUS_SCORE = 4;   // points when at max lives
export const INVINCIBLE_FRAMES = 90;  // 1.5s post-hit protection (60fps)

export const BEST_SCORE_KEY = 'flappyBest';

export type DifficultyLevel = 'easy' | 'medium' | 'hard';

export interface DifficultyConfig {
  gravity: number;
  flapForce: number;
  pipeGap: number;
  pipeSpeed: number;
  pipeSpawnInterval: number;
  bossInterval: number;      // 0 = bosses disabled
  powerupChance: number;     // 0–1 per frame
}

const DIFFICULTY: Record<DifficultyLevel, DifficultyConfig> = {
  easy: {
    gravity:     0.30,
    flapForce:   -6.2,
    pipeGap:     190,
    pipeSpeed:   2.2,
    pipeSpawnInterval: 130,
    bossInterval:     0,      // no bosses
    powerupChance:   1 / 150,
  },
  medium: {
    gravity:     0.35,
    flapForce:   -6.7,
    pipeGap:     162,
    pipeSpeed:   2.8,
    pipeSpawnInterval: 108,
    bossInterval:     10,
    powerupChance:   1 / 250,
  },
  hard: {
    gravity:     0.42,
    flapForce:   -7.4,
    pipeGap:     132,
    pipeSpeed:   3.5,
    pipeSpawnInterval: 88,
    bossInterval:     5,
    powerupChance:   1 / 380,
  },
};

export const getDifficultyConfig = (level: DifficultyLevel): DifficultyConfig =>
  DIFFICULTY[level];
