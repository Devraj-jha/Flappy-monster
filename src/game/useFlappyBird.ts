import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type {
  Bird,
  GameState,
  Pipe,
  GameResult,
  Cloud,
  PowerUp,
  Boss,
  Fireball,
  ActiveEffects,
} from './types';
import birdImgSrc from '../assets/bird.png';
import bgImgSrc from '../assets/background.png';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  PIPE_WIDTH,
  GROUND_HEIGHT,
  BIRD_SIZE,
  PLAY_HEIGHT,
  BEST_SCORE_KEY,
  POWERUP_SIZE,
  EFFECT_DURATION,
  START_LIVES,
  MAX_LIVES,
  HEART_BONUS_SCORE,
  INVINCIBLE_FRAMES,
  getDifficultyConfig,
  type DifficultyLevel,
  type DifficultyConfig,
} from './constants';

interface GameEngine {
  difficulty: DifficultyLevel;
  config: DifficultyConfig;
  bird: Bird;
  pipes: Pipe[];
  powerUps: PowerUp[];
  boss: Boss | null;
  fireballs: Fireball[];
  score: number;
  lives: number;
  invincible: number;
  frameCount: number;
  groundOffset: number;
  bgScrollX: number;
  clouds: Cloud[];
  activeEffects: ActiveEffects;
  state: GameState;
}

function createClouds(): Cloud[] {
  return Array.from({ length: 6 }, (_, i) => ({
    x: Math.random() * GAME_WIDTH,
    y: 30 + Math.random() * 160,
    width: 80 + Math.random() * 100,
    height: 30 + Math.random() * 30,
    speed: 0.3 + Math.random() * 0.5,
  }));
}

// Pipe color variants (body, dark, light, cap, capDark, stroke)
const PIPE_PALETTES = [
  { body: '#5CB85C', dark: '#3D8B3D', light: '#7ED87E', cap: '#4AA84A', capDark: '#367436', stroke: '#2D6B2D' }, // green
  { body: '#8A9BA8', dark: '#5F6E79', light: '#AFC1CC', cap: '#7B8B96', capDark: '#55646E', stroke: '#46535B' }, // steel
  { body: '#9A6BB8', dark: '#6F4690', light: '#BB8FD6', cap: '#895FA8', capDark: '#643F80', stroke: '#4F3165' }, // purple
  { body: '#C29A63', dark: '#97703F', light: '#DDBC8C', cap: '#B08850', capDark: '#86683B', stroke: '#6A4F2C' }, // wood
];

function createEngine(difficulty: DifficultyLevel): GameEngine {
  return {
    difficulty,
    config: getDifficultyConfig(difficulty),
    bird: {
      x: 120,
      y: GAME_HEIGHT / 2 - 30,
      velocity: 0,
      rotation: 0,
      flapFrame: 0,
    },
    pipes: [],
    powerUps: [],
    boss: null,
    fireballs: [],
    score: 0,
    lives: START_LIVES,
    invincible: 0,
    frameCount: 0,
    groundOffset: 0,
    bgScrollX: 0,
    clouds: createClouds(),
    activeEffects: { shield: 0, speed: 0, multiplier: 0 },
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

export function useFlappyBird(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  difficulty: DifficultyLevel,
) {
  const engineRef = useRef<GameEngine>(createEngine(difficulty));
  const birdImageRef = useRef<HTMLImageElement | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(START_LIVES);
  const [best, setBest] = useState<number>(() => loadBest());
  const [result, setResult] = useState<GameResult | null>(null);
  const [gameOverVisible, setGameOverVisible] = useState(false);

  const stateRef = useRef<GameState>('idle');

  useEffect(() => {
    stateRef.current = gameState;
  }, [gameState]);

  // ---------- Canvas sizing (fullscreen landscape) ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = GAME_WIDTH * dpr;
      canvas.height = GAME_HEIGHT * dpr;

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

  // ---------- Load images ----------
  useEffect(() => {
    const birdImg = new Image();
    birdImg.src = birdImgSrc;
    birdImg.onload = () => { birdImageRef.current = birdImg; };

    const bgImg = new Image();
    bgImg.src = bgImgSrc;
    bgImg.onload = () => { bgImageRef.current = bgImg; };
  }, []);

  // ---------- Game loop ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;

    // ---------- Update functions ----------

    const updateBird = (engine: GameEngine) => {
      const bird = engine.bird;
      if (engine.state === 'playing') {
        bird.velocity += engine.config.gravity;
        bird.y += bird.velocity;
        bird.rotation = Math.min(Math.max(bird.velocity * 4, -30), 90);
      } else if (engine.state === 'idle') {
        bird.y = GAME_HEIGHT / 2 - 30 + Math.sin(engine.frameCount * 0.06) * 14;
      }
      if (bird.flapFrame > 0) bird.flapFrame -= 0.15;
    };

    const spawnPipe = (engine: GameEngine) => {
      const minY = 80;
      const maxY = PLAY_HEIGHT - engine.config.pipeGap - 80;
      const topHeight = Math.random() * (maxY - minY) + minY;

      // Variety: random width, random color, and some pipes drift vertically
      const roll = Math.random();
      const width = roll < 0.12 ? PIPE_WIDTH + 26
        : roll < 0.30 ? PIPE_WIDTH - 14
        : PIPE_WIDTH;
      const palette = Math.floor(Math.random() * PIPE_PALETTES.length);
      const moveAmp = Math.random() < 0.26 ? 26 + Math.random() * 26 : 0;
      const moveFreq = (Math.random() < 0.5 ? -1 : 1) * (0.012 + Math.random() * 0.02);
      const movePhase = Math.random() * Math.PI * 2;

      engine.pipes.push({
        x: GAME_WIDTH + width,
        topHeight,
        bottomY: topHeight + engine.config.pipeGap,
        width,
        palette,
        moveAmp,
        moveFreq,
        movePhase,
        offset: 0,
        scored: false,
      });
    };

    const updatePipes = (engine: GameEngine) => {
      if (engine.state !== 'playing') return;
      if (engine.boss) return; // pause pipes during boss

      engine.frameCount++;

      // Update active effects
      if (engine.activeEffects.shield > 0) engine.activeEffects.shield--;
      if (engine.activeEffects.speed > 0) engine.activeEffects.speed--;
      if (engine.activeEffects.multiplier > 0) engine.activeEffects.multiplier--;

      const speedMult = engine.activeEffects.speed > 0 ? 1.5 : 1;

      // Scroll background and ground
      const scrollSpeed = engine.config.pipeSpeed * speedMult;
      engine.bgScrollX = (engine.bgScrollX + scrollSpeed) % GAME_WIDTH;
      engine.groundOffset = (engine.groundOffset - scrollSpeed) % 24;

      // Spawn pipes
      if (engine.frameCount % engine.config.pipeSpawnInterval === 0) {
        spawnPipe(engine);
      }

      // Spawn power-ups
      if (Math.random() < engine.config.powerupChance) {
        const types: PowerUp['type'][] = ['heart', 'shield', 'speed', 'multiplier'];
        const weights = [0.25, 0.25, 0.3, 0.2];
        const r = Math.random();
        let cum = 0;
        let chosen: PowerUp['type'] = 'shield';
        for (let i = 0; i < types.length; i++) {
          cum += weights[i];
          if (r < cum) { chosen = types[i]; break; }
        }
        engine.powerUps.push({
          x: GAME_WIDTH + POWERUP_SIZE,
          y: 60 + Math.random() * (PLAY_HEIGHT - 120),
          radius: POWERUP_SIZE,
          type: chosen,
          collected: false,
        });
      }

      // Update pipes
      for (let i = engine.pipes.length - 1; i >= 0; i--) {
        const pipe = engine.pipes[i];
        pipe.x -= scrollSpeed;

        // Vertical drift for moving pipes (kept inside the play area)
        if (pipe.moveAmp > 0) {
          const off = pipe.moveAmp * Math.sin(engine.frameCount * pipe.moveFreq + pipe.movePhase);
          pipe.offset = Math.max(-pipe.topHeight, Math.min(off, PLAY_HEIGHT - pipe.bottomY));
        } else {
          pipe.offset = 0;
        }

        if (!pipe.scored && pipe.x + pipe.width < engine.bird.x) {
          pipe.scored = true;
          engine.score += engine.activeEffects.multiplier > 0 ? 2 : 1;
          setScore(engine.score);

          // Trigger boss on the interval (0 = bosses disabled)
          if (
            engine.config.bossInterval > 0 &&
            engine.score % engine.config.bossInterval === 0 &&
            !engine.boss
          ) {
            // Clear all obstacles -> boss fights in an empty arena
            engine.pipes = [];
            engine.powerUps = [];
            engine.fireballs = [];
            engine.boss = {
              x: GAME_WIDTH + 180,
              y: GAME_HEIGHT / 2 - 40,
              width: 110,
              height: 80,
              targetX: GAME_WIDTH * 0.68,
              targetY: GAME_HEIGHT * 0.3,
              moveTimer: 0,
              shootTimer: 70,
              leaving: false,
            };
          }
        }

        if (pipe.x + pipe.width < -10) {
          engine.pipes.splice(i, 1);
        }
      }

      // Update power-ups
      for (let i = engine.powerUps.length - 1; i >= 0; i--) {
        const p = engine.powerUps[i];
        p.x -= scrollSpeed;
        if (p.x + POWERUP_SIZE < -10) {
          engine.powerUps.splice(i, 1);
        }
      }

      // Update clouds
      for (const cloud of engine.clouds) {
        cloud.x -= cloud.speed;
        if (cloud.x + cloud.width < -20) {
          cloud.x = GAME_WIDTH + 20 + Math.random() * 100;
          cloud.y = 30 + Math.random() * 160;
          cloud.width = 80 + Math.random() * 100;
          cloud.height = 30 + Math.random() * 30;
        }
      }
    };

    const updateBoss = (engine: GameEngine): boolean => {
      const boss = engine.boss;
      if (!boss || engine.state !== 'playing') return false;

      boss.moveTimer++;

      // ENTER: fly in from the right to the arena slot
      if (!boss.leaving && boss.moveTimer < 80) {
        boss.x += (boss.targetX - boss.x) * 0.045;
        if (Math.abs(boss.x - boss.targetX) < 2) boss.x = boss.targetX;
      }

      // FIGHT: stationary at the arena slot, bobbing, throwing fireballs
      if (!boss.leaving && boss.moveTimer >= 80 && boss.moveTimer < 330) {
        boss.y = boss.targetY + Math.sin(boss.moveTimer * 0.05) * 14;

        boss.shootTimer--;
        if (boss.shootTimer <= 0) {
          const count = Math.random() < 0.5 ? 1 : 2; // 1-2 fireballs per burst
          for (let i = 0; i < count; i++) {
            const spread = (i - (count - 1) / 2) * 0.18;
            const ang = Math.atan2(
              engine.bird.y - boss.y,
              engine.bird.x - boss.x,
            ) + spread;
            engine.fireballs.push({
              x: boss.x,
              y: boss.y,
              vx: Math.cos(ang) * 4.4,
              vy: Math.sin(ang) * 4.4,
              radius: 13,
            });
          }
          boss.shootTimer = 58 + Math.floor(Math.random() * 28);
        }
      }

      // LEAVE: fly off to the left when the fight ends
      if (boss.moveTimer >= 330) {
        boss.leaving = true;
        boss.x -= engine.config.pipeSpeed * 3.2;
        boss.y += Math.sin(boss.moveTimer * 0.1) * 2;
      }

      // Boss body collision (the resting body is still dangerous)
      if (engine.invincible <= 0) {
        const bx = boss.x - boss.width / 2;
        const by = boss.y - boss.height / 2;
        if (
          engine.bird.x + BIRD_SIZE * 0.38 > bx &&
          engine.bird.x - BIRD_SIZE * 0.38 < bx + boss.width &&
          engine.bird.y + BIRD_SIZE * 0.38 > by &&
          engine.bird.y - BIRD_SIZE * 0.38 < by + boss.height
        ) {
          if (registerHit(engine)) return true;
        }
      }

      // Boss fully off-screen -> fight over
      if (boss.x + boss.width < -60) {
        engine.boss = null;
      }

      return false;
    };

    const updateFireballs = (engine: GameEngine): boolean => {
      if (engine.state !== 'playing') return false;

      for (let i = engine.fireballs.length - 1; i >= 0; i--) {
        const fb = engine.fireballs[i];
        fb.x += fb.vx;
        fb.y += fb.vy;

        // Remove off-screen projectiles
        if (
          fb.x - fb.radius > GAME_WIDTH + 30 ||
          fb.x + fb.radius < -30 ||
          fb.y - fb.radius > GAME_HEIGHT ||
          fb.y + fb.radius < -30
        ) {
          engine.fireballs.splice(i, 1);
          continue;
        }

        // Fireball vs bird
        const dist = Math.hypot(engine.bird.x - fb.x, engine.bird.y - fb.y);
        if (dist < BIRD_SIZE * 0.42 + fb.radius) {
          engine.fireballs.splice(i, 1);
          if (engine.invincible > 0) continue; // ghost through while invincible
          if (registerHit(engine)) return true;
        }
      }
      return false;
    };

    const grantHeart = (engine: GameEngine) => {
      if (engine.lives < MAX_LIVES) {
        engine.lives += 1;
      } else {
        engine.score += HEART_BONUS_SCORE;
        setScore(engine.score);
      }
      setLives(engine.lives);
    };

    // A single hit: shield absorbs it, else lose a life (with brief invincibility),
    // else the last life is gone -> game over.
    const registerHit = (engine: GameEngine): boolean => {
      if (engine.activeEffects.shield > 0) {
        engine.activeEffects.shield = 0;
        return false;
      }
      if (engine.lives > 1) {
        engine.lives -= 1;
        engine.invincible = INVINCIBLE_FRAMES;
        setLives(engine.lives);
        return false;
      }
      die(engine);
      return true;
    };

    const checkCollision = (engine: GameEngine): boolean => {
      const bird = engine.bird;

      // Power-up collection always works (even while invincible)
      for (const p of engine.powerUps) {
        if (p.collected) continue;
        const dx = bird.x - p.x;
        const dy = bird.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < BIRD_SIZE * 0.5 + p.radius) {
          p.collected = true;
          if (p.type === 'heart') {
            grantHeart(engine);
          } else {
            engine.activeEffects[p.type] = EFFECT_DURATION;
          }
        }
      }

      // Ghost through obstacles while invincible (post-hit protection)
      if (engine.invincible > 0) return false;

      const bw = BIRD_SIZE * 0.38;
      const bh = BIRD_SIZE * 0.32;

      // Ground / ceiling
      if (bird.y + bh > PLAY_HEIGHT || bird.y - bh < 0) {
        return true;
      }

      for (const pipe of engine.pipes) {
        if (bird.x + bw > pipe.x && bird.x - bw < pipe.x + pipe.width) {
          if (bird.y - bh < pipe.topHeight + pipe.offset) return true;
          if (bird.y + bh > pipe.bottomY + pipe.offset) return true;
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
        // storage unavailable
      }

      setResult({ score: engine.score, best: newBest, medal: medalFor(engine.score) });

      window.setTimeout(() => setGameOverVisible(true), 600);
    };

    // ---------- Drawing ----------

    const drawBackground = (engine: GameEngine) => {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const bgImg = bgImageRef.current;
      if (bgImg && bgImg.complete && bgImg.naturalWidth > 0) {
        // Tiled scrolling background
        const imgW = bgImg.naturalWidth;
        const imgH = bgImg.naturalHeight;
        const scaleX = GAME_WIDTH / imgW;
        const scaleY = GAME_HEIGHT / imgH;
        const scale = Math.max(scaleX, scaleY);
        const drawW = imgW * scale;
        const drawH = imgH * scale;

        const scrollX = engine.bgScrollX;
        for (let i = 0; i < 3; i++) {
          const x = -scrollX + i * drawW;
          ctx.drawImage(bgImg, x, 0, drawW, drawH);
        }
      } else {
        // Fallback: gradient sky
        const sky = ctx.createLinearGradient(0, 0, 0, PLAY_HEIGHT);
        sky.addColorStop(0, '#56CCF2');
        sky.addColorStop(0.6, '#71C8D4');
        sky.addColorStop(1, '#A8E6CF');
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, GAME_WIDTH, PLAY_HEIGHT);

        ctx.fillStyle = '#8BC34A';
        drawHills(PLAY_HEIGHT - 10, '#7CB342', 0.5);
        ctx.fillStyle = '#9CCC65';
        drawHills(PLAY_HEIGHT, '#8BC34A', 0.7);
      }
    };

    const drawHills = (y: number, color: string, scale: number) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, y + 20);
      for (let x = 0; x <= GAME_WIDTH; x += 80) {
        ctx.quadraticCurveTo(x + 40, y - 12 * scale + Math.sin(x * 0.025) * 7, x + 80, y + 20);
      }
      ctx.lineTo(GAME_WIDTH, GAME_HEIGHT);
      ctx.lineTo(0, GAME_HEIGHT);
      ctx.closePath();
      ctx.fill();
    };

    const drawClouds = (engine: GameEngine) => {
      ctx.save();
      for (const cloud of engine.clouds) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.beginPath();
        const cx = cloud.x + cloud.width / 2;
        const cy = cloud.y + cloud.height / 2;
        // Soft blob cloud
        ctx.ellipse(cx, cy, cloud.width * 0.5, cloud.height * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx - cloud.width * 0.3, cy + 3, cloud.width * 0.35, cloud.height * 0.38, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(cx + cloud.width * 0.25, cy + 2, cloud.width * 0.38, cloud.height * 0.42, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    };

    const drawGround = (engine: GameEngine) => {
      ctx.fillStyle = '#C9A05A';
      ctx.fillRect(0, PLAY_HEIGHT, GAME_WIDTH, GROUND_HEIGHT);

      const grass = ctx.createLinearGradient(0, PLAY_HEIGHT, 0, PLAY_HEIGHT + 12);
      grass.addColorStop(0, '#5DAA30');
      grass.addColorStop(1, '#4A8C24');
      ctx.fillStyle = grass;
      ctx.fillRect(0, PLAY_HEIGHT, GAME_WIDTH, 12);

      ctx.fillStyle = '#B89450';
      for (let x = engine.groundOffset - 24; x < GAME_WIDTH + 24; x += 24) {
        ctx.fillRect(x, PLAY_HEIGHT + 16, 12, 4);
        ctx.fillRect(x + 12, PLAY_HEIGHT + 28, 12, 4);
      }
    };

    const drawPipe = (x: number, topH: number, bottomY: number, width: number, paletteIdx: number) => {
      const pal = PIPE_PALETTES[paletteIdx % PIPE_PALETTES.length];
      const capH = 28;
      const capW = width + 12;
      const capX = x - 6;

      // Top pipe
      ctx.fillStyle = pal.body;
      ctx.fillRect(x, 0, width, topH);
      ctx.fillStyle = pal.light;
      ctx.fillRect(x, 0, 6, topH);
      ctx.fillStyle = pal.dark;
      ctx.fillRect(x + width - 6, 0, 6, topH);

      ctx.fillStyle = pal.cap;
      ctx.fillRect(capX, topH - capH, capW, capH);
      ctx.fillStyle = pal.light;
      ctx.fillRect(capX, topH - capH, 6, capH);
      ctx.fillStyle = pal.capDark;
      ctx.fillRect(capX + capW - 6, topH - capH, 6, capH);
      ctx.strokeStyle = pal.stroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(capX, topH - capH, capW, capH);

      // Bottom pipe
      ctx.fillStyle = pal.body;
      ctx.fillRect(x, bottomY, width, PLAY_HEIGHT - bottomY);
      ctx.fillStyle = pal.light;
      ctx.fillRect(x, bottomY, 6, PLAY_HEIGHT - bottomY);
      ctx.fillStyle = pal.dark;
      ctx.fillRect(x + width - 6, bottomY, 6, PLAY_HEIGHT - bottomY);

      ctx.fillStyle = pal.cap;
      ctx.fillRect(capX, bottomY, capW, capH);
      ctx.fillStyle = pal.light;
      ctx.fillRect(capX, bottomY, 6, capH);
      ctx.fillStyle = pal.capDark;
      ctx.fillRect(capX + capW - 6, bottomY, 6, capH);
      ctx.strokeStyle = pal.stroke;
      ctx.lineWidth = 2;
      ctx.strokeRect(capX, bottomY, capW, capH);
    };

    const drawBird = (engine: GameEngine) => {
      const bird = engine.bird;
      ctx.save();
      ctx.translate(bird.x, bird.y);
      ctx.rotate((bird.rotation * Math.PI) / 180);

      // Shield aura
      if (engine.activeEffects.shield > 0) {
        ctx.save();
        ctx.rotate(-(bird.rotation * Math.PI) / 180); // undo rotation for aura
        const pulse = Math.sin(engine.frameCount * 0.15) * 4 + 24;
        ctx.fillStyle = `rgba(100, 180, 255, ${0.25 + Math.sin(engine.frameCount * 0.1) * 0.1})`;
        ctx.beginPath();
        ctx.arc(0, 0, pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(140, 210, 255, ${0.5 + Math.sin(engine.frameCount * 0.12) * 0.2})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();
        ctx.rotate((bird.rotation * Math.PI) / 180); // re-apply rotation
      }

      // Speed trail
      if (engine.activeEffects.speed > 0) {
        ctx.save();
        ctx.rotate(-(bird.rotation * Math.PI) / 180);
        ctx.fillStyle = 'rgba(255, 200, 50, 0.2)';
        for (let i = 1; i <= 3; i++) {
          const trailX = -i * 10;
          const trailScale = 0.8 - i * 0.15;
          ctx.beginPath();
          ctx.ellipse(trailX, 0, BIRD_SIZE * trailScale * 0.35, BIRD_SIZE * trailScale * 0.25, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      const img = birdImageRef.current;
      // Blink while invincible (flash effect after taking a hit)
      const flicker = engine.invincible > 0 && Math.floor(engine.frameCount / 4) % 2 === 0;
      if (!flicker && img && img.complete && img.naturalWidth > 0) {
        const drawW = BIRD_SIZE * 1.35;
        const drawH = BIRD_SIZE * 1.35;
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      } else if (!flicker) {
        ctx.fillStyle = '#F5C842';
        ctx.beginPath();
        ctx.arc(0, 0, BIRD_SIZE * 0.45, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    const drawPowerUp = (p: PowerUp, frameCount: number) => {
      if (p.collected) return;

      const floatY = Math.sin(frameCount * 0.08 + p.x * 0.02) * 6;

      ctx.save();
      ctx.translate(p.x, p.y + floatY);

      const colors: Record<PowerUp['type'], { main: string; glow: string; label: string }> = {
        shield: { main: '#64B5F6', glow: 'rgba(100,181,246,', label: '🛡️' },
        speed: { main: '#FFD54F', glow: 'rgba(255,213,79,', label: '⚡' },
        multiplier: { main: '#CE93D8', glow: 'rgba(206,147,216,', label: '✨' },
        heart: { main: '#F06292', glow: 'rgba(240,98,146,', label: '💗' },
      };
      const c = colors[p.type];

      // Glow
      ctx.shadowColor = c.main;
      ctx.shadowBlur = 14 + Math.sin(frameCount * 0.1) * 4;

      // Outer ring
      ctx.fillStyle = `${c.glow}0.4)`;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius + 4, 0, Math.PI * 2);
      ctx.fill();

      // Main orb
      ctx.fillStyle = c.main;
      ctx.beginPath();
      ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
      ctx.fill();

      // Bright center highlight
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.beginPath();
      ctx.arc(-3, -4, p.radius * 0.35, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.shadowBlur = 0;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(c.label, 0, 0);

      ctx.restore();
    };

    const drawBoss = (boss: Boss, frameCount: number) => {
      const bx = boss.x - boss.width / 2;
      const by = boss.y - boss.height / 2;

      ctx.save();

      // Spiky outline
      ctx.fillStyle = '#8B1A1A';
      const spikes = 8;
      ctx.beginPath();
      for (let i = 0; i < spikes; i++) {
        const angle = (i / spikes) * Math.PI * 2;
        const outerR = boss.width * 0.55 + Math.sin(frameCount * 0.1 + i) * 5;
        const innerR = boss.width * 0.35;
        const ox = boss.x + Math.cos(angle) * outerR;
        const oy = boss.y + Math.sin(angle) * outerR * 0.7;
        const ix = boss.x + Math.cos(angle + Math.PI / spikes) * innerR;
        const iy = boss.y + Math.sin(angle + Math.PI / spikes) * innerR * 0.7;
        ctx.lineTo(ox, oy);
        ctx.lineTo(ix, iy);
      }
      ctx.closePath();
      ctx.fill();

      // Main body
      ctx.fillStyle = '#C62828';
      ctx.beginPath();
      ctx.ellipse(boss.x, boss.y, boss.width * 0.45, boss.height * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();

      // Darker body detail
      ctx.fillStyle = '#8B1A1A';
      ctx.beginPath();
      ctx.ellipse(boss.x, boss.y + 8, boss.width * 0.35, boss.height * 0.28, 0, 0, Math.PI * 2);
      ctx.fill();

      // Mouth
      ctx.fillStyle = '#1A0000';
      ctx.beginPath();
      ctx.ellipse(boss.x, boss.y + 14, boss.width * 0.22, boss.height * 0.12, 0, 0, Math.PI * 2);
      ctx.fill();

      // Teeth
      ctx.fillStyle = '#FFF';
      const teethCount = 6;
      for (let i = 0; i < teethCount; i++) {
        const tx = boss.x - boss.width * 0.18 + (i / (teethCount - 1)) * boss.width * 0.36;
        ctx.beginPath();
        ctx.moveTo(tx - 3, boss.y + 10);
        ctx.lineTo(tx + 3, boss.y + 10);
        ctx.lineTo(tx, boss.y + 16);
        ctx.closePath();
        ctx.fill();
      }

      // Eyes
      const eyeSpread = boss.width * 0.18;
      const eyeY = boss.y - 10;
      const eyeW = 12;
      const eyeH = 14;

      // Eye whites
      ctx.fillStyle = '#FFF';
      ctx.beginPath();
      ctx.ellipse(boss.x - eyeSpread, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(boss.x + eyeSpread, eyeY, eyeW, eyeH, 0, 0, Math.PI * 2);
      ctx.fill();

      // Pupils (follow bird slightly)
      ctx.fillStyle = '#FF0000';
      ctx.shadowColor = '#FF0000';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(boss.x - eyeSpread + 2, eyeY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(boss.x + eyeSpread + 2, eyeY, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.restore();
    };

    const drawFireball = (fb: Fireball, frameCount: number) => {
      ctx.save();

      // Flame glow
      ctx.shadowColor = '#FF4500';
      ctx.shadowBlur = 16 + Math.sin(frameCount * 0.4) * 6;

      // Ball
      ctx.fillStyle = '#FF5A1F';
      ctx.beginPath();
      ctx.arc(fb.x, fb.y, fb.radius, 0, Math.PI * 2);
      ctx.fill();

      // Hot core
      ctx.fillStyle = '#FFE033';
      ctx.beginPath();
      ctx.arc(fb.x, fb.y, fb.radius * 0.55, 0, Math.PI * 2);
      ctx.fill();

      // Flickering tail opposite the direction of travel
      ctx.shadowBlur = 8;
      ctx.fillStyle = 'rgba(255, 90, 31, 0.55)';
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.arc(fb.x - fb.vx * i * 1.6, fb.y - fb.vy * i * 1.6, fb.radius * (1 - i * 0.22), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
    };

    const drawBossWarning = (engine: GameEngine) => {
      const flash = Math.sin(engine.frameCount * 0.25) > 0;
      if (!flash) return;

      ctx.save();
      ctx.strokeStyle = '#FF0000';
      ctx.lineWidth = 4;
      ctx.setLineDash([16, 12]);
      ctx.lineDashOffset = -engine.frameCount * 2;
      ctx.strokeRect(4, 4, GAME_WIDTH - 8, PLAY_HEIGHT - 8);

      ctx.fillStyle = '#FF0000';
      ctx.font = 'bold 42px "Press Start 2P", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = '#FF0000';
      ctx.shadowBlur = 16;
      ctx.fillText('⚠ BOSS INCOMING ⚠', GAME_WIDTH / 2, PLAY_HEIGHT / 2 - 30);

      ctx.shadowBlur = 0;
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#FFF';
      ctx.fillText('GET READY!', GAME_WIDTH / 2, PLAY_HEIGHT / 2 + 10);

      ctx.restore();
    };

    const drawHUD = (engine: GameEngine) => {
      // Power-up indicators
      let indicatorY = 10;
      const indicatorX = 10;

      if (engine.activeEffects.shield > 0) {
        const secs = Math.ceil(engine.activeEffects.shield / 60);
        ctx.fillStyle = 'rgba(100, 181, 246, 0.7)';
        ctx.fillRect(indicatorX, indicatorY, 60, 22);
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`🛡 ${secs}s`, indicatorX + 4, indicatorY + 11);
        indicatorY += 26;
      }

      if (engine.activeEffects.speed > 0) {
        const secs = Math.ceil(engine.activeEffects.speed / 60);
        ctx.fillStyle = 'rgba(255, 213, 79, 0.7)';
        ctx.fillRect(indicatorX, indicatorY, 60, 22);
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`⚡ ${secs}s`, indicatorX + 4, indicatorY + 11);
        indicatorY += 26;
      }

      if (engine.activeEffects.multiplier > 0) {
        const secs = Math.ceil(engine.activeEffects.multiplier / 60);
        ctx.fillStyle = 'rgba(206, 147, 216, 0.7)';
        ctx.fillRect(indicatorX, indicatorY, 70, 22);
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`✨x2 ${secs}s`, indicatorX + 4, indicatorY + 11);
        indicatorY += 26;
      }

      // Boss fight timer bar
      if (engine.boss) {
        const total = 330;
        const remaining = Math.max(0, Math.min(1, (total - engine.boss.moveTimer) / total));
        const barW = 160;
        const barH = 10;
        const barX = GAME_WIDTH / 2 - barW / 2;
        const barY = 10;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#FF4444';
        ctx.fillRect(barX, barY, barW * remaining, barH);
        ctx.strokeStyle = '#FFF';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barW, barH);
        ctx.fillStyle = '#FFF';
        ctx.font = 'bold 9px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('BOSS', GAME_WIDTH / 2, barY + barH / 2);
      }
    };

    // ---------- Main frame ----------

    const frame = () => {
      const engine = engineRef.current;
      if (engine.state === 'playing' && engine.invincible > 0) engine.invincible--;
      updateBird(engine);
      updatePipes(engine);

      // Boss update (movement + fireball spawning)
      if (engine.boss && engine.state === 'playing') {
        const bossDied = updateBoss(engine);
        if (bossDied) {
          die(engine);
        }
      }

      // Fireball update + collision
      if (engine.state === 'playing') {
        const fireballHit = updateFireballs(engine);
        if (fireballHit) {
          die(engine);
        }
      }

      // Pipes, ground, ceiling, power-up collisions
      // (pipes/power-ups are cleared during the boss, so this just checks ground/ceiling then)
      if (engine.state === 'playing') {
        if (checkCollision(engine)) {
          registerHit(engine);
        }
      }

      // Drawing
      drawBackground(engine);
      drawClouds(engine);

      // Boss + warning banner while it flies in
      if (engine.boss) {
        if (engine.boss.moveTimer < 80) {
          drawBossWarning(engine);
        }
        drawBoss(engine.boss, engine.frameCount);
      }

      engine.pipes.forEach((p) =>
        drawPipe(p.x, p.topHeight + p.offset, p.bottomY + p.offset, p.width, p.palette),
      );
      engine.fireballs.forEach((fb) => drawFireball(fb, engine.frameCount));
      engine.powerUps.forEach((p) => drawPowerUp(p, engine.frameCount));

      drawBird(engine);
      drawGround(engine);

      if (engine.state === 'playing' || engine.state === 'dead') {
        drawHUD(engine);
      }

      rafId = requestAnimationFrame(frame);
    };

    rafId = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasRef]);

  // ---------- Public actions ----------
  const startGame = (level: DifficultyLevel = difficulty) => {
    const engine = engineRef.current;
    if (engine.state === 'idle') {
      const next = createEngine(level);
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
    const next = createEngine(difficulty);
    next.state = 'playing';
    next.bird.flapFrame = 1;
    engineRef.current = next;
    stateRef.current = 'playing';
    setGameState('playing');
    setScore(0);
    setLives(START_LIVES);
    setResult(null);
    setGameOverVisible(false);
  };

  const flap = () => {
    const engine = engineRef.current;
    if (engine.state === 'playing') {
      engine.bird.velocity = engine.config.flapForce;
      engine.bird.flapFrame = 1;
    }
  };

  const backToMenu = () => {
    const next = createEngine(difficulty);
    next.state = 'idle';
    engineRef.current = next;
    stateRef.current = 'idle';
    setGameState('idle');
    setScore(0);
    setLives(START_LIVES);
    setResult(null);
    setGameOverVisible(false);
  };

  return {
    gameState,
    score,
    lives,
    best,
    result,
    gameOverVisible,
    startGame,
    restartGame,
    flap,
    backToMenu,
  };
}
