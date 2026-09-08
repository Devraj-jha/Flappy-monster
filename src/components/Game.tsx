import { useEffect, useRef } from 'react';
import { useFlappyBird } from '../game/useFlappyBird';
import { GAME_WIDTH, GAME_HEIGHT } from '../game/constants';
import './Game.css';

interface GameProps {
  onPlay?: () => void;
}

export function Game({ onPlay }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { gameState, score, best, result, gameOverVisible, startGame, restartGame, flap } =
    useFlappyBird(canvasRef);

  const playing = gameState === 'playing';
  const idle = gameState === 'idle';

  // Global input handling
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        if (gameState === 'idle') {
          startGame();
          onPlay?.();
        } else if (gameState === 'playing') {
          flap();
        } else if (gameState === 'dead' && gameOverVisible) {
          restartGame();
          onPlay?.();
        }
      }
    };

    const handlePointer = () => {
      if (gameState === 'idle') {
        startGame();
        onPlay?.();
      } else if (gameState === 'playing') {
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

  const handleStartBtn = (e: React.MouseEvent) => {
    e.stopPropagation();
    startGame();
    onPlay?.();
  };

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
          <p className="subtitle">Classic Edition</p>
          <button className="btn" onClick={handleStartBtn}>
            PLAY
          </button>
          <p className="tap-hint">Press SPACE or tap to flap</p>
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
          <button className="btn" onClick={handleRetryBtn}>
            RETRY
          </button>
          <p className="tap-hint">Press SPACE or tap to retry</p>
        </div>
      )}

      <span className="sr-only">
        Screen size {GAME_WIDTH}x{GAME_HEIGHT} — best {best}
      </span>
    </div>
  );
}
