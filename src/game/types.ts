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
  targetY: number;
  moveTimer: number;
  health: number;
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
