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

export type GameState = 'idle' | 'playing' | 'dead';

export interface GameResult {
  score: number;
  best: number;
  medal: Medal | '';
}

export type Medal = '🥉' | '🥈' | '🥇' | '🏆';
