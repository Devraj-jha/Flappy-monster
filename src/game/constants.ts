// Landscape dimensions (16:9)
export const GAME_WIDTH = 960;
export const GAME_HEIGHT = 540;

export const GRAVITY = 0.38;
export const FLAP_FORCE = -7.0;

export const PIPE_WIDTH = 80;
export const PIPE_GAP = 155;
export const PIPE_SPEED = 3.0;
export const PIPE_SPAWN_INTERVAL = 100;

export const GROUND_HEIGHT = 60;
export const BIRD_SIZE = 40;
export const PLAY_HEIGHT = GAME_HEIGHT - GROUND_HEIGHT;

export const POWERUP_SPAWN_CHANCE = 1 / 250;
export const POWERUP_SIZE = 22;
export const EFFECT_DURATION = 360; // 6 seconds at 60fps

export const BOSS_INTERVAL = 10; // every 10 pipes
export const BOSS_WARNING_FRAMES = 90; // 1.5s warning

export const BEST_SCORE_KEY = 'flappyBest';
