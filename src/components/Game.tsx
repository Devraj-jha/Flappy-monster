import { useEffect, useRef, useState, useCallback } from 'react';
import { useFlappyBird } from '../game/useFlappyBird';
import { GAME_WIDTH, GAME_HEIGHT, type DifficultyLevel } from '../game/constants';
import { audio } from '../game/audio';
import heartImgSrc from '../assets/heart.png';
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
  const { gameState, score, lives, best, result, gameOverVisible, startGame, restartGame, flap, backToMenu } =
    useFlappyBird(canvasRef, difficulty);

  const playing = gameState === 'playing';
  const idle = gameState === 'idle';

  // Main-menu sub-view ('play' and 'sounds' both live inside the menu)
  const [menuView, setMenuView] = useState<'main' | 'play' | 'sounds'>('main');

  // Settings panel state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [musicVol, setMusicVol] = useState<number>(() => {
    try { return Number(localStorage.getItem('flappyMusicVol')) || 0.4; } catch { return 0.4; }
  });
  const [sfxVol, setSfxVol] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('flappySfxVol');
      const v = saved === null ? 1 : Number(saved);
      return Number.isFinite(v) ? v : 1;
    } catch { return 1; }
  });
  const [musicOn, setMusicOn] = useState<boolean>(() => {
    try { return localStorage.getItem('flappyMusicOn') !== '0'; } catch { return true; }
  });

  const handleMusicVolChange = useCallback((v: number) => {
    setMusicVol(v);
    audio.setMusicVolume(v);
  }, []);

  const handleSfxVolChange = useCallback((v: number) => {
    setSfxVol(v);
    audio.setSfxVolume(v);
  }, []);

  const handleMusicToggle = useCallback(() => {
    const next = !musicOn;
    setMusicOn(next);
    audio.setMusicEnabled(next);
  }, [musicOn]);

  const livesFull = Math.min(lives, 5);

  const handleSelect = (level: DifficultyLevel) => {
    localStorage.setItem('flappyDifficulty', level);
    setDifficulty(level);
    startGame(level);
    onPlay?.();
  };

  const handleBackToMenu = () => {
    setMenuView('main');
    backToMenu();
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

      {/* Settings gear — visible during gameplay so you can tweak sound live */}
      {!idle && (
        <button
          className="settings-toggle"
          onClick={(e) => { e.stopPropagation(); setSettingsOpen((o) => !o); }}
          aria-label="Open settings"
        >
          ⚙️
        </button>
      )}

      {/* Settings panel */}
      {settingsOpen && (
        <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
          <div className="settings-row">
            <span className="settings-label">🎵 Music</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(musicVol * 100)}
              onChange={(e) => handleMusicVolChange(Number(e.target.value) / 100)}
              className="settings-slider"
            />
            <span className="settings-val">{Math.round(musicVol * 100)}%</span>
          </div>
          <div className="settings-row">
            <span className="settings-label">🔊 SFX</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(sfxVol * 100)}
              onChange={(e) => handleSfxVolChange(Number(e.target.value) / 100)}
              className="settings-slider"
            />
            <span className="settings-val">{Math.round(sfxVol * 100)}%</span>
          </div>
          <div className="settings-row settings-row-toggle">
            <span className="settings-label">Music On/Off</span>
            <button
              className={`settings-toggle-btn ${musicOn ? 'on' : 'off'}`}
              onClick={handleMusicToggle}
            >
              {musicOn ? '🔊 ON' : '🔇 OFF'}
            </button>
          </div>
        </div>
      )}

      {playing && (
        <div className="hud">
          <div className="lives-display" aria-label={`Lives: ${lives}`}>
            {Array.from({ length: 5 }).map((_, i) => (
              <img
                key={i}
                src={heartImgSrc}
                alt=""
                className={`life-heart ${i < livesFull ? 'life-full' : 'life-empty'}`}
              />
            ))}
          </div>
          <div className="score-display">{score}</div>
        </div>
      )}

      {idle && (
        <div className="overlay">
          <h1 className="game-title">Flappy Monster</h1>

          {menuView === 'main' && (
            <>
              <p className="subtitle">Ready to play?</p>
              <div className="menu menu-main">
                <button className="menu-btn play" onClick={() => setMenuView('play')}>
                  <span className="menu-name">▶ PLAY</span>
                  <span className="menu-desc">Pick your difficulty</span>
                </button>
                <button className="menu-btn sounds" onClick={() => setMenuView('sounds')}>
                  <span className="menu-name">🔊 SOUNDS</span>
                  <span className="menu-desc">Music &amp; sound effects</span>
                </button>
              </div>
              <p className="tap-hint menu-hint">Make a selection to continue</p>
            </>
          )}

          {menuView === 'play' && (
            <>
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
              <button className="back-btn" onClick={() => setMenuView('main')}>← BACK</button>
            </>
          )}

          {menuView === 'sounds' && (
            <>
              <p className="subtitle">Sound settings</p>
              <div className="settings-panel menu-sounds">
                <div className="settings-row">
                  <span className="settings-label">🎵 Music</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(musicVol * 100)}
                    onChange={(e) => handleMusicVolChange(Number(e.target.value) / 100)}
                    className="settings-slider"
                  />
                  <span className="settings-val">{Math.round(musicVol * 100)}%</span>
                </div>
                <div className="settings-row">
                  <span className="settings-label">🔊 SFX</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(sfxVol * 100)}
                    onChange={(e) => handleSfxVolChange(Number(e.target.value) / 100)}
                    className="settings-slider"
                  />
                  <span className="settings-val">{Math.round(sfxVol * 100)}%</span>
                </div>
                <div className="settings-row settings-row-toggle">
                  <span className="settings-label">Music On/Off</span>
                  <button
                    className={`settings-toggle-btn ${musicOn ? 'on' : 'off'}`}
                    onClick={handleMusicToggle}
                  >
                    {musicOn ? '🔊 ON' : '🔇 OFF'}
                  </button>
                </div>
              </div>
              <button className="back-btn" onClick={() => setMenuView('main')}>← BACK</button>
            </>
          )}
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
            <button className="btn btn-ghost" onClick={handleBackToMenu}>
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
