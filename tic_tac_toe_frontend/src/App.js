import React, { useState, useEffect } from 'react';
import './App.css';

// Utils
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:8000";

// --- Helper Components ---
// PUBLIC_INTERFACE
function Board({ board, onCellClick, isMyTurn, disabled }) {
  return (
    <div className="ttt-board">
      {board.map((cell, i) => (
        <button
          key={i}
          className="ttt-cell"
          onClick={() => onCellClick(i)}
          disabled={disabled || !!cell}
          tabIndex={0}
          aria-label={`Cell ${i} ${cell ? cell : ''}`}
        >
          {cell}
        </button>
      ))}
    </div>
  );
}

// PUBLIC_INTERFACE
function GameHistory({ history, onView }) {
  return (
    <aside className="ttt-history-panel">
      <h3>Game History</h3>
      {history.length === 0 && <div className="ttt-empty">No finished games</div>}
      <ul>
        {history.map(game => (
          <li
            key={game.id}
            className="ttt-history-item"
            tabIndex={0}
            onClick={() => onView(game)}
            aria-label={`View game ID: ${game.id}`}
          >
            <div className="ttt-hist-meta">
              <span>ID: {game.id}</span>
              <span>{game.result === "draw" ? "Draw" : `Winner: ${game.result}`}</span>
            </div>
            <div className="ttt-hist-date">{(new Date(game.finished_at)).toLocaleString()}</div>
          </li>
        ))}
      </ul>
    </aside>
  );
}

// PUBLIC_INTERFACE
function SessionBar({ sessionId, onLeave, onCopy }) {
  return (
    <div className="ttt-sessionbar">
      <span>
        Session: <strong>{sessionId}</strong>
      </span>
      <button className="btn btn-session" onClick={onCopy} title="Copy session link">🔗 Copy Link</button>
      <button className="btn btn-session" onClick={onLeave}>Leave</button>
    </div>
  );
}

// --- Main Component ---
// PUBLIC_INTERFACE
function App() {
  // Theming
  const [theme, setTheme] = useState('light');
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Auth/user (optional: anonymous session)
  const [user, setUser] = useState(() => {
    let u = localStorage.getItem('ttt_user');
    if (!u) {
      u = 'player_' + Math.random().toString(36).substring(2, 8);
      localStorage.setItem('ttt_user', u);
    }
    return u;
  });

  // Session and game state
  const [sessionId, setSessionId] = useState('');
  const [gameState, setGameState] = useState(null);
  const [isJoining, setIsJoining] = useState(false);
  const [error, setError] = useState('');
  const [joiningId, setJoiningId] = useState('');
  const [waiting, setWaiting] = useState(false);

  // Game history (for sidebar)
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  // Load game history once logged in or on refresh
  useEffect(() => {
    fetch(`${API_BASE}/games/history`)
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => setHistory(data.games || []))
      .catch(() => setHistory([]));
  }, [gameState && gameState.status === "finished"]);

  // Listen for sessionId in URL
  useEffect(() => {
    const url = new URL(window.location.href);
    const sid = url.searchParams.get("sessionId");
    if (sid && !sessionId) {
      joinSession(sid);
    }
    // eslint-disable-next-line
  }, []);

  // Start new session
  const createSession = async () => {
    setError('');
    setWaiting(true);
    try {
      const resp = await fetch(`${API_BASE}/sessions/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user }),
      });
      if (!resp.ok) throw new Error("Failed to create session");
      const data = await resp.json();
      setSessionId(data.session_id);
      // Join this session as player X by default
      setGameState(data.state);
      window.history.replaceState(null, '', `?sessionId=${data.session_id}`);
    } catch (e) {
      setError("Could not create session.");
    }
    setWaiting(false);
  };

  // Join session
  const joinSession = async (sid) => {
    setError('');
    setIsJoining(true);
    try {
      const resp = await fetch(`${API_BASE}/sessions/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user, session_id: sid }),
      });
      if (!resp.ok) throw new Error("Session not found");
      const data = await resp.json();
      setSessionId(sid);
      setGameState(data.state);
      window.history.replaceState(null, '', `?sessionId=${sid}`);
    } catch (e) {
      setError("Invalid session ID.");
    }
    setIsJoining(false);
  };

  // Leave session
  const leaveSession = () => {
    setSessionId('');
    setGameState(null);
    setError('');
    window.history.replaceState(null, '', window.location.pathname);
  };

  // Handle cell click (make a move)
  const playMove = async (index) => {
    if (!sessionId) return;
    setError('');
    try {
      const resp = await fetch(`${API_BASE}/game/play`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, user, cell: index }),
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        setError(errData.detail || "Failed to make move");
        return;
      }
      const data = await resp.json();
      setGameState(data.state);
      if (data.state.status === "finished") {
        // fetch new history list
        fetch(`${API_BASE}/games/history`)
          .then(r => r.ok ? r.json() : Promise.reject())
          .then(data => setHistory(data.games || []))
          .catch(() => {});
      }
    } catch (e) {
      setError("Could not play the move.");
    }
  };

  // (Optional) Poll for game state if in a session and game ongoing
  useEffect(() => {
    if (sessionId) {
      // polling
      const interval = setInterval(async () => {
        try {
          const resp = await fetch(`${API_BASE}/game/state?session_id=${sessionId}`);
          if (resp.ok) {
            const data = await resp.json();
            setGameState(data.state);
          }
        } catch {
          // ignore error
        }
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [sessionId]);

  // Copy session link
  const handleCopySession = () => {
    const url = window.location.origin + window.location.pathname + "?sessionId=" + sessionId;
    navigator.clipboard.writeText(url);
  };

  // History viewer (view finished game)
  const handleHistoryView = (game) => {
    setShowHistory(game);
  };

  // Layout: header/topbar, left main, right sidebar for history
  return (
    <div className="App">
      <header className="ttt-header">
        <div className="ttt-brand">
          <span className="ttt-logo">◻️</span> <span className="ttt-title">Tic Tac Toe</span>
        </div>
        <div className="ttt-user">
          <span>User: <b>{user}</b></span>
          <button className="theme-toggle" onClick={() => setTheme(t => (t === "light" ? "dark" : "light"))}>
            {theme === "light" ? "🌙" : "☀️"}
          </button>
        </div>
      </header>
      <main className="ttt-layout">
        {/* Left/Main Area */}
        <section className="ttt-main">
          {!sessionId && (
            <div className="ttt-pre">
              <button className="btn btn-large ttt-mb" onClick={createSession} disabled={waiting}>
                {waiting ? "Creating..." : "Create New Game"}
              </button>
              <div className="ttt-or">or</div>
              <form
                className="ttt-join-form"
                onSubmit={e => {
                  e.preventDefault();
                  if (joiningId) joinSession(joiningId);
                }}>
                <input
                  className="ttt-input"
                  type="text"
                  placeholder="Session ID"
                  value={joiningId}
                  autoComplete="off"
                  onChange={e => setJoiningId(e.target.value.trim())}
                  disabled={isJoining}
                  maxLength={10}
                />
                <button className="btn" type="submit" disabled={isJoining || !joiningId}>
                  {isJoining ? "Joining..." : "Join Game"}
                </button>
              </form>
              {error && <div className="ttt-error">{error}</div>}
            </div>
          )}
          {/* IN GAME UI */}
          {sessionId && gameState && (
            <div className="ttt-ingame">
              <SessionBar
                sessionId={sessionId}
                onLeave={leaveSession}
                onCopy={handleCopySession}
              />
              <div className="ttt-status">
                <span>
                  {gameState.status === "active"
                    ? (
                      gameState.turn === user
                        ? "Your move"
                        : `Waiting for opponent (${gameState.turn})`
                    )
                    : (
                      gameState.status === "finished"
                        ? (
                          gameState.winner === "draw"
                            ? "It's a draw!"
                            : (
                              gameState.winner === user
                                ? "You win! 🎉"
                                : `Winner: ${gameState.winner}`
                            )
                        )
                        : "Game not started"
                    )
                  }
                </span>
              </div>
              <Board
                board={gameState.board}
                onCellClick={playMove}
                isMyTurn={gameState.turn === user && gameState.status === "active"}
                disabled={gameState.status !== "active" || gameState.turn !== user}
              />
              <div className="ttt-footer">
                <span className="ttt-player-you">
                  You: <b>{gameState.players && gameState.players[user] ? gameState.players[user] : '?'}</b>
                </span>
                <span className="ttt-player-them">
                  Opponent: <b>{
                    Object.entries(gameState.players || {})
                      .filter(([u]) => u !== user)
                      .map(([u, v]) => v)
                      .join(" ") || 'Waiting...'
                  }</b>
                </span>
              </div>
              {gameState.status === "finished" && (
                <button className="btn btn-large" onClick={leaveSession}>Back to Lobby</button>
              )}
              {error && <div className="ttt-error">{error}</div>}
            </div>
          )}
          {/* GAME HISTORY VIEWER */}
          {showHistory && (
            <div className="ttt-history-viewer">
              <div className="ttt-hist-title">
                Viewing: Game ID {showHistory.id}
                <button className="btn btn-sm" onClick={() => setShowHistory(false)}>Close</button>
              </div>
              <Board
                board={showHistory.board}
                onCellClick={() => { }}
                disabled
              />
              <div>
                <span className="ttt-hist-meta">Winner: {showHistory.result}</span>
                <span className="ttt-hist-meta">Ended: {(new Date(showHistory.finished_at)).toLocaleString()}</span>
              </div>
            </div>
          )}
        </section>
        {/* Sidebar HISTORY */}
        <GameHistory history={history} onView={handleHistoryView} />
      </main>
      <footer className="ttt-footer-main">
        &copy; {new Date().getFullYear()} Tic Tac Toe &middot; Modern Minimalist UI
      </footer>
    </div>
  );
}

export default App;
