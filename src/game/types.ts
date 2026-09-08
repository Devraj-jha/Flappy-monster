export interface Bird {
  x: number;
  y: number;
  velocity: number;
  rotation: number;
  flapFrame: number;
}

export interface Pipe {
  x: number;
  topHeight: number;
  bottomY: number;
  scored: boolean;
}

export interface Cloud {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
}

export interface PowerUp {
  x: number;
  y: number;
  radius: number;
  type: 'shield' | 'speed' | 'multiplier';
  collected: boolean;
}

export interface Boss {
  x: number;
  y: number;
  width: number;
  height: number;
  targetX: number;   // resting arena position
  targetY: number;
  moveTimer: number; // frames since boss began
  shootTimer: number;// frames until next volley
  leaving: boolean;  // final fly-away phase
}

export interface Fireball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface ActiveEffects {
  shield: number;
  speed: number;
  multiplier: number;
}

export type GameState = 'idle' | 'playing' | 'dead';

export interface GameResult {
  score: number;
  best: number;
  medal: Medal | '';
}

export type Medal = '🥉' | '🥈' | '🥇' | '🏆';
