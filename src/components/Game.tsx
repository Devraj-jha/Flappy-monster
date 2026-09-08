import { useEffect, useRef, useState } from 'react';
import { useFlappyBird } from '../game/useFlappyBird';
import { GAME_WIDTH, GAME_HEIGHT, type DifficultyLevel } from '../game/constants';
import './Game.css';

interface GameProps {
  onPlay?: () => void;
}

export function Game({ onPlay }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>(
    () => {
      const saved = localStorage.getItem('flappyDifficulty');
      return saved === 'easy' || saved === 'medium' || saved === 'hard' ? saved : 'easy';
    },
  );
  const { gameState, score, best, result, gameOverVisible, startGame, restartGame, flap, backToMenu } =
    useFlappyBird(canvasRef, difficulty);

  const playing = gameState === 'playing';
  const idle = gameState === 'idle';

  const handleSelect = (level: DifficultyLevel) => {
    localStorage.setItem('flappyDifficulty', level);
    setDifficulty(level);
    startGame(level);
    onPlay?.();
  };

  // Global input handling
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (gameState === 'playing') {
          flap();
        } else if (gameState === 'dead' && gameOverVisible) {
          restartGame();
          onPlay?.();
        }
      }
    };

    // On the menu, only the difficulty buttons start a game
    const handlePointer = () => {
      if (gameState === 'playing') {
        flap();
      }
    };

    window.addEventListener('keydown', handleKey);
    window.addEventListener('pointerdown', handlePointer);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('pointerdown', handlePointer);
    };
  }, [gameState, gameOverVisible, startGame, restartGame, flap, onPlay]);

  const handleRetryBtn = (e: React.MouseEvent) => {
    e.stopPropagation();
    restartGame();
    onPlay?.();
  };

  return (
    <div className="game-shell">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Flappy Monster game"
        className={playing ? 'game-canvas active' : 'game-canvas'}
        style={{ borderRadius: 0 }}
      />

      {playing && <div className="score-display">{score}</div>}

      {idle && (
        <div className="overlay">
          <h1 className="game-title">Flappy Monster</h1>
          <p className="subtitle">Choose your difficulty</p>

          <div className="menu">
            <button className="menu-btn easy" onClick={() => handleSelect('easy')}>
              <span className="menu-name">EASY</span>
              <span className="menu-desc">Slow &amp; wide gaps, no bosses</span>
            </button>
            <button className="menu-btn medium" onClick={() => handleSelect('medium')}>
              <span className="menu-name">MEDIUM</span>
              <span className="menu-desc">Classic pace, bosses every 10</span>
            </button>
            <button className="menu-btn hard" onClick={() => handleSelect('hard')}>
              <span className="menu-name">HARD</span>
              <span className="menu-desc">Fast &amp; tight, bosses every 5</span>
            </button>
          </div>

          <p className="tap-hint menu-hint">Pick a mode to start</p>
        </div>
      )}

      {gameState === 'dead' && gameOverVisible && result && (
        <div className="overlay">
          <h1 className="game-over-title">GAME OVER</h1>
          <div className="medal">{result.medal}</div>
          <div className="final-score">
            Score: <span>{result.score}</span>
          </div>
          <div className="best-score">
            Best: <span>{result.best}</span>
          </div>
          <div className="overlay-actions">
            <button className="btn" onClick={handleRetryBtn}>
              RETRY
            </button>
            <button className="btn btn-ghost" onClick={() => backToMenu()}>
              MENU
            </button>
          </div>
          <p className="tap-hint">Press SPACE or tap to retry</p>
        </div>
      )}

      <span className="sr-only">
        Screen size {GAME_WIDTH}x{GAME_HEIGHT} — best {best}
      </span>
    </div>
  );
}
