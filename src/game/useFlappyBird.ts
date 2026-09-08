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
  ActiveEffects,
} from './types';
import birdImgSrc from '../assets/bird.png';
import bgImgSrc from '../assets/background.png';
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
  POWERUP_SPAWN_CHANCE,
  POWERUP_SIZE,
  EFFECT_DURATION,
  BOSS_INTERVAL,
  BOSS_WARNING_FRAMES,
} from './constants';

interface GameEngine {
  bird: Bird;
  pipes: Pipe[];
  powerUps: PowerUp[];
  boss: Boss | null;
  score: number;
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

function createEngine(): GameEngine {
  return {
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
    score: 0,
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

export function useFlappyBird(canvasRef: RefObject<HTMLCanvasElement | null>) {
  const engineRef = useRef<GameEngine>(createEngine());
  const birdImageRef = useRef<HTMLImageElement | null>(null);
  const bgImageRef = useRef<HTMLImageElement | null>(null);
  const [gameState, setGameState] = useState<GameState>('idle');
  const [score, setScore] = useState(0);
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
        bird.velocity += GRAVITY;
        bird.y += bird.velocity;
        bird.rotation = Math.min(Math.max(bird.velocity * 4, -30), 90);
      } else if (engine.state === 'idle') {
        bird.y = GAME_HEIGHT / 2 - 30 + Math.sin(engine.frameCount * 0.06) * 14;
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
      if (engine.boss) return; // pause pipes during boss

      engine.frameCount++;

      // Update active effects
      if (engine.activeEffects.shield > 0) engine.activeEffects.shield--;
      if (engine.activeEffects.speed > 0) engine.activeEffects.speed--;
      if (engine.activeEffects.multiplier > 0) engine.activeEffects.multiplier--;

      const speedMult = engine.activeEffects.speed > 0 ? 1.5 : 1;

      // Scroll background and ground
      const scrollSpeed = PIPE_SPEED * speedMult;
      engine.bgScrollX = (engine.bgScrollX + scrollSpeed) % GAME_WIDTH;
      engine.groundOffset = (engine.groundOffset - scrollSpeed) % 24;

      // Spawn pipes
      if (engine.frameCount % PIPE_SPAWN_INTERVAL === 0) {
        spawnPipe(engine);
      }

      // Spawn power-ups
      if (Math.random() < POWERUP_SPAWN_CHANCE) {
        const types: PowerUp['type'][] = ['shield', 'speed', 'multiplier'];
        const weights = [0.3, 0.4, 0.3];
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

        if (!pipe.scored && pipe.x + PIPE_WIDTH < engine.bird.x) {
          pipe.scored = true;
          engine.score += engine.activeEffects.multiplier > 0 ? 2 : 1;
          setScore(engine.score);

          // Trigger boss every BOSS_INTERVAL pipes
          if (engine.score % BOSS_INTERVAL === 0 && !engine.boss) {
            engine.boss = {
              x: GAME_WIDTH + 120,
              y: GAME_HEIGHT / 2,
              width: 100,
              height: 70,
              targetY: engine.bird.y,
              moveTimer: 0,
              health: 1,
            };
          }
        }

        if (pipe.x + PIPE_WIDTH < -10) {
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

      // Phase 1: Move toward bird (first 60 frames)
      if (boss.moveTimer < 60) {
        const targetY = engine.bird.y;
        boss.y += (targetY - boss.y) * 0.04;
      }

      // Phase 2: Hold position briefly
      if (boss.moveTimer >= 60 && boss.moveTimer < 90) {
        boss.y += Math.sin(boss.moveTimer * 0.3) * 1.5;
      }

      // Phase 3: Charge!
      if (boss.moveTimer >= 90) {
        boss.x -= PIPE_SPEED * 2.5;
        boss.y += Math.sin(boss.moveTimer * 0.15) * 3;
      }

      // Collision with bird
      const dx = engine.bird.x - boss.x;
      const dy = engine.bird.y - (boss.y - boss.height / 2 + boss.height / 2);
      const bx = boss.x - boss.width / 2;
      const by = boss.y - boss.height / 2;
      const bw = boss.width;
      const bh = boss.height;

      if (
        engine.bird.x + BIRD_SIZE * 0.4 > bx &&
        engine.bird.x - BIRD_SIZE * 0.4 < bx + bw &&
        engine.bird.y + BIRD_SIZE * 0.4 > by &&
        engine.bird.y - BIRD_SIZE * 0.4 < by + bh
      ) {
        if (engine.activeEffects.shield > 0) {
          // Boss defeated by shielded bird!
          engine.score += 5;
          setScore(engine.score);
          engine.boss = null;
          return false;
        }
        return true; // signal death
      }

      // Boss leaves screen — done
      if (boss.x + boss.width / 2 < -50) {
        engine.boss = null;
      }

      return false;
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

      // Power-up collision
      for (const p of engine.powerUps) {
        if (p.collected) continue;
        const dx = bird.x - p.x;
        const dy = bird.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < BIRD_SIZE * 0.5 + p.radius) {
          p.collected = true;
          engine.activeEffects[p.type] = EFFECT_DURATION;
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
      if (img && img.complete && img.naturalWidth > 0) {
        const drawW = BIRD_SIZE * 1.35;
        const drawH = BIRD_SIZE * 1.35;
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);
      } else {
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

      // Boss health bar
      if (engine.boss) {
        const barW = 160;
        const barH = 10;
        const barX = GAME_WIDTH / 2 - barW / 2;
        const barY = 10;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX, barY, barW, barH);
        ctx.fillStyle = '#FF4444';
        ctx.fillRect(barX, barY, barW * Math.max(0, engine.boss.health), barH);
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
      updateBird(engine);
      updatePipes(engine);

      // Boss update
      if (engine.boss && engine.state === 'playing') {
        const bossDied = updateBoss(engine);
        if (bossDied) {
          die(engine);
        }
      }

      // Collision (pipes, ground, ceiling, power-ups)
      if (engine.state === 'playing' && !engine.boss) {
        if (checkCollision(engine)) {
          if (engine.activeEffects.shield > 0) {
            // Shield absorbs one hit — lose shield
            engine.activeEffects.shield = 0;
          } else {
            die(engine);
          }
        }
      } else if (engine.state === 'playing' && engine.boss) {
        // Still check power-up collection during boss
        for (const p of engine.powerUps) {
          if (p.collected) continue;
          const dx = engine.bird.x - p.x;
          const dy = engine.bird.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < BIRD_SIZE * 0.5 + p.radius) {
            p.collected = true;
            engine.activeEffects[p.type] = EFFECT_DURATION;
          }
        }
      }

      // Drawing
      drawBackground(engine);
      drawClouds(engine);

      // Boss warning
      if (engine.boss && engine.boss.moveTimer === 0) {
        drawBossWarning(engine);
      } else if (engine.boss) {
        drawBoss(engine.boss, engine.frameCount);
      }

      engine.pipes.forEach((p) => drawPipe(p.x, p.topHeight, p.bottomY));
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
