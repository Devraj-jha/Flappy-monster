import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Bird, GameState, Pipe, GameResult } from './types';
import birdImgSrc from '../assets/bird.png';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  GRAVITY,
  FLAP_FORCE,
  PIPE_WIDTH,
  PIPE_GAP,
  PIPE_SPEED,
  PIPE_SPAWN_INTERVAL,
  GROUND_HEIGHT,
  BIRD_SIZE,
  PLAY_HEIGHT,
  BEST_SCORE_KEY,
} from './constants';

interface GameEngine {
  bird: Bird;
  pipes: Pipe[];
  score: number;
  frameCount: number;
  groundX: number;
  state: GameState;
}

function createEngine(): GameEngine {
  return {
    bird: {
      x: 80,
      y: GAME_HEIGHT / 2 - 20,
      velocity: 0,
      rotation: 0,
      flapFrame: 0,
    },
    pipes: [],
    score: 0,
    frameCount: 0,
    groundX: 0,
    state: 'idle',
  };
}

function loadBest(): number {
  try {
    const raw = localStorage.getItem(BEST_SCORE_KEY);
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

function medalFor(score: number): GameResult['medal'] {
  if (score >= 40) return '🏆';
  if (score >= 30) return '🥇';
  if (score >= 20) return '🥈';
  if (score >= 10) return '🥉';
  return '';
}

export function useFlappyBird(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const engineRef = useRef<GameEngine>(createEngine());
  const birdImageRef = useRef<HTMLImageElement | null>(null);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [score, setScore] = useState(0);
  const [best, setBest] = useState<number>(() => loadBest());
  const [result, setResult] = useState<GameResult | null>(null);
  const [gameOverVisible, setGameOverVisible] = useState(false);

  // Keep the loop's view of the state in sync.
  const stateRef = useRef<GameState>('idle');

  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  // ---------- Canvas sizing (full-screen responsive) ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = GAME_WIDTH * dpr;
      canvas.height = GAME_HEIGHT * dpr;

      // Fit the 400x600 canvas into the viewport while keeping the ratio.
      const availW = window.innerWidth;
      const availH = window.innerHeight;
      const scale = Math.min(availW / GAME_WIDTH, availH / GAME_HEIGHT);
      canvas.style.width = `${Math.floor(GAME_WIDTH * scale)}px`;
      canvas.style.height = `${Math.floor(GAME_HEIGHT * scale)}px`;
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [canvasRef]);

  // ---------- Load bird image ----------
  useEffect(() => {
    const img = new Image();
    img.src = birdImgSrc;
    img.onload = () => {
      birdImageRef.current = img;
    };
  }, []);

  // ---------- Game loop ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;

    const updateBird = (engine: GameEngine) => {
      const bird = engine.bird;
      if (engine.state === 'playing') {
        bird.velocity += GRAVITY;
        bird.y += bird.velocity;
        bird.rotation = Math.min(Math.max(bird.velocity * 4, -30), 90);
      } else if (engine.state === 'idle') {
        bird.y = GAME_HEIGHT / 2 - 20 + Math.sin(engine.frameCount * 0.06) * 12;
      }
      if (bird.flapFrame > 0) bird.flapFrame -= 0.15;
    };

    const spawnPipe = (engine: GameEngine) => {
      const minY = 80;
      const maxY = PLAY_HEIGHT - PIPE_GAP - 80;
      const topHeight = Math.random() * (maxY - minY) + minY;
      engine.pipes.push({
        x: GAME_WIDTH + PIPE_WIDTH,
        topHeight,
        bottomY: topHeight + PIPE_GAP,
        scored: false,
      });
    };

    const updatePipes = (engine: GameEngine) => {
      if (engine.state !== 'playing') return;
      engine.frameCount++;

      if (engine.frameCount % PIPE_SPAWN_INTERVAL === 0) {
        spawnPipe(engine);
      }

      for (let i = engine.pipes.length - 1; i >= 0; i--) {
        const pipe = engine.pipes[i];
        pipe.x -= PIPE_SPEED;

        if (!pipe.scored && pipe.x + PIPE_WIDTH < engine.bird.x) {
          pipe.scored = true;
          engine.score++;
          setScore(engine.score);
        }

        if (pipe.x + PIPE_WIDTH < -10) {
          engine.pipes.splice(i, 1);
        }
      }
    };

    const checkCollision = (engine: GameEngine): boolean => {
      const bird = engine.bird;
      if (bird.y + BIRD_SIZE * 0.4 > PLAY_HEIGHT || bird.y - BIRD_SIZE * 0.4 < 0) {
        return true;
      }

      for (const pipe of engine.pipes) {
        const bw = BIRD_SIZE * 0.55;
        const bh = BIRD_SIZE * 0.4;

        if (bird.x + bw > pipe.x - 6 && bird.x - bw < pipe.x + PIPE_WIDTH + 6) {
          if (bird.y - bh < pipe.topHeight) return true;
          if (bird.y + bh > pipe.bottomY) return true;
        }
      }

      return false;
    };

    const die = (engine: GameEngine) => {
      if (engine.state === 'dead') return;
      engine.state = 'dead';
      stateRef.current = 'dead';
      setGameState('dead');

      const newBest = Math.max(loadBest(), engine.score);
      setBest(newBest);
      try {
        localStorage.setItem(BEST_SCORE_KEY, String(newBest));
      } catch {
        // storage unavailable; best still shown for this session
      }

      setResult({ score: engine.score, best: newBest, medal: medalFor(engine.score) });

      window.setTimeout(() => setGameOverVisible(true), 600);
    };

    // ---------- Drawing ----------
    const drawBackground = (engine: GameEngine) => {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const sky = ctx.createLinearGradient(0, 0, 0, PLAY_HEIGHT);
      sky.addColorStop(0, '#4EC0CA');
      sky.addColorStop(0.6, '#71C8D4');
      sky.addColorStop(1, '#A8E6CF');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, GAME_WIDTH, PLAY_HEIGHT);

      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      drawCloud(50 + ((engine.frameCount * 0.3) % (GAME_WIDTH + 200)) - 100, 60, 1);
      drawCloud(250 + ((engine.frameCount * 0.2) % (GAME_WIDTH + 300)) - 150, 120, 0.7);
      drawCloud(150 + ((engine.frameCount * 0.25) % (GAME_WIDTH + 250)) - 120, 180, 0.8);

      ctx.fillStyle = '#8BC34A';
      drawHills(PLAY_HEIGHT - 10, '#7CB342', 0.5);
      ctx.fillStyle = '#9CCC65';
      drawHills(PLAY_HEIGHT, '#8BC34A', 0.7);
    };

    const drawCloud = (x: number, y: number, scale: number) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.beginPath();
      ctx.arc(0, 0, 25, 0, Math.PI * 2);
      ctx.arc(25, -5, 20, 0, Math.PI * 2);
      ctx.arc(50, 0, 28, 0, Math.PI * 2);
      ctx.arc(25, 8, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawHills = (y: number, color: string, scale: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, y + 20);
      for (let x = 0; x <= GAME_WIDTH; x += 60) {
        ctx.quadraticCurveTo(x + 30, y - 15 * scale + Math.sin(x * 0.03) * 8, x + 60, y + 20);
      }
      ctx.lineTo(GAME_WIDTH, GAME_HEIGHT);
      ctx.lineTo(0, GAME_HEIGHT);
      ctx.closePath();
      ctx.fill();
    };

    const drawGround = (engine: GameEngine) => {
      if (engine.state === 'playing') {
        engine.groundX = (engine.groundX - PIPE_SPEED) % 24;
      }

      ctx.fillStyle = '#DEB887';
      ctx.fillRect(0, PLAY_HEIGHT, GAME_WIDTH, GROUND_HEIGHT);

      const grass = ctx.createLinearGradient(0, PLAY_HEIGHT, 0, PLAY_HEIGHT + 14);
      grass.addColorStop(0, '#5DAA30');
      grass.addColorStop(1, '#4A8C24');
      ctx.fillStyle = grass;
      ctx.fillRect(0, PLAY_HEIGHT, GAME_WIDTH, 14);

      ctx.fillStyle = '#C9A96E';
      for (let x = engine.groundX - 24; x < GAME_WIDTH + 24; x += 24) {
        ctx.fillRect(x, PLAY_HEIGHT + 18, 12, 4);
        ctx.fillRect(x + 12, PLAY_HEIGHT + 30, 12, 4);
      }
    };

    const drawPipe = (x: number, topH: number, bottomY: number) => {
      const bodyColor = '#5CB85C';
      const darkColor = '#3D8B3D';
      const lightColor = '#7ED87E';
      const capColor = '#4AA84A';
      const capDark = '#367436';
      const capH = 28;
      const capW = PIPE_WIDTH + 12;
      const capX = x - 6;

      // Top pipe
      ctx.fillStyle = bodyColor;
      ctx.fillRect(x, 0, PIPE_WIDTH, topH);
      ctx.fillStyle = lightColor;
      ctx.fillRect(x, 0, 6, topH);
      ctx.fillStyle = darkColor;
      ctx.fillRect(x + PIPE_WIDTH - 6, 0, 6, topH);

      ctx.fillStyle = capColor;
      ctx.fillRect(capX, topH - capH, capW, capH);
      ctx.fillStyle = lightColor;
      ctx.fillRect(capX, topH - capH, 6, capH);
      ctx.fillStyle = capDark;
      ctx.fillRect(capX + capW - 6, topH - capH, 6, capH);
      ctx.strokeStyle = '#2D6B2D';
      ctx.lineWidth = 2;
      ctx.strokeRect(capX, topH - capH, capW, capH);

      // Bottom pipe
      ctx.fillStyle = bodyColor;
      ctx.fillRect(x, bottomY, PIPE_WIDTH, PLAY_HEIGHT - bottomY);
      ctx.fillStyle = lightColor;
      ctx.fillRect(x, bottomY, 6, PLAY_HEIGHT - bottomY);
      ctx.fillStyle = darkColor;
      ctx.fillRect(x + PIPE_WIDTH - 6, bottomY, 6, PLAY_HEIGHT - bottomY);

      ctx.fillStyle = capColor;
      ctx.fillRect(capX, bottomY, capW, capH);
      ctx.fillStyle = lightColor;
      ctx.fillRect(capX, bottomY, 6, capH);
      ctx.fillStyle = capDark;
      ctx.fillRect(capX + capW - 6, bottomY, 6, capH);
      ctx.strokeStyle = '#2D6B2D';
      ctx.lineWidth = 2;
      ctx.strokeRect(capX, bottomY, capW, capH);
    };

    const drawBird = (engine: GameEngine) => {
      const bird = engine.bird;
      ctx.save();
      ctx.translate(bird.x, bird.y);
      ctx.rotate((bird.rotation * Math.PI) / 180);

      const img = birdImageRef.current;
      if (img && img.complete && img.naturalWidth > 0) {
        // Scale the 728x724 source to fit BIRD_SIZE (34px)
        const drawW = BIRD_SIZE * 1.2;
        const drawH = BIRD_SIZE * 1.2;
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      } else {
        // Fallback: yellow circle while image loads
        ctx.fillStyle = '#F5C842';
        ctx.beginPath();
        ctx.arc(0, 0, BIRD_SIZE * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    const frame = () => {
      const engine = engineRef.current;
      updateBird(engine);
      updatePipes(engine);

      if (engine.state === 'playing' && checkCollision(engine)) {
        die(engine);
      }

      drawBackground(engine);
      engine.pipes.forEach((p) => drawPipe(p.x, p.topHeight, p.bottomY));
      drawBird(engine);
      drawGround(engine);

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef]);

  // ---------- Public actions ----------
  const startGame = () => {
    const engine = engineRef.current;
    if (engine.state === 'idle') {
      const next = createEngine();
      next.state = 'playing';
      next.bird.flapFrame = 1;
      engineRef.current = next;
      stateRef.current = 'playing';
      setGameState('playing');
      setScore(0);
      setResult(null);
      setGameOverVisible(false);
    }
  };

  const restartGame = () => {
    const next = createEngine();
    next.state = 'playing';
    next.bird.flapFrame = 1;
    engineRef.current = next;
    stateRef.current = 'playing';
    setGameState('playing');
    setScore(0);
    setResult(null);
    setGameOverVisible(false);
  };

  const flap = () => {
    const engine = engineRef.current;
    if (engine.state === 'playing') {
      engine.bird.velocity = FLAP_FORCE;
      engine.bird.flapFrame = 1;
    }
  };

  return { gameState, score, best, result, gameOverVisible, startGame, restartGame, flap };
}
