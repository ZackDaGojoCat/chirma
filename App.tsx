import React, { useState, useEffect } from 'react';
import { GamePhase, GameState, Player, PlayerSkin } from './types';
import { GAME_DURATION, CANVAS_WIDTH, CANVAS_HEIGHT, MOVEMENT_SPEED } from './constants';
import { peerService } from './services/peerService';
import { generateChaosEvent } from './services/geminiService';
import GameCanvas from './components/GameCanvas';

const App: React.FC = () => {
  const [phase, setPhase] = useState<GamePhase>(GamePhase.MENU);
  const [myName, setMyName] = useState('');
  const [mySkin, setMySkin] = useState<PlayerSkin>(PlayerSkin.SANTA);
  const [hostId, setHostId] = useState('');
  const [joinId, setJoinId] = useState('');
  const [error, setError] = useState('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myId, setMyId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      peerService.cleanup();
    };
  }, []);

  const initHost = async () => {
    if (!myName) return setError("Please enter your name!");
    try {
      const id = await peerService.initialize();
      setMyId(id);
      setIsHost(true);
      setHostId(id);
      
      // Init Game State
      const initialPlayer: Player = {
        id,
        name: myName,
        skin: mySkin,
        x: CANVAS_WIDTH / 2,
        y: CANVAS_HEIGHT / 2,
        score: 0,
        isHost: true,
        vx: 0, 
        vy: 0
      };
      
      const newState: GameState = {
        players: { [id]: initialPlayer },
        presents: [],
        activeEvent: null,
        timeLeft: GAME_DURATION,
        winnerId: null
      };
      
      setGameState(newState);
      setPhase(GamePhase.LOBBY);

      // Setup Host Listener for new players
      peerService.onMessage = (msg, sourcePeerId) => {
        if (msg.type === 'JOIN_REQUEST') {
          // Add player
          setGameState(prev => {
            if (!prev) return null;
            const newPlayer: Player = {
              id: sourcePeerId,
              name: msg.payload.name,
              skin: msg.payload.skin,
              x: Math.random() * CANVAS_WIDTH,
              y: Math.random() * CANVAS_HEIGHT,
              score: 0,
              isHost: false,
              vx: 0, vy: 0
            };
            const nextState = {
              ...prev,
              players: { ...prev.players, [sourcePeerId]: newPlayer }
            };
            
            // Reply with accept
            peerService.sendToPeer(sourcePeerId, { 
               type: 'JOIN_ACCEPT', 
               payload: { gameState: nextState, playerId: sourcePeerId } 
            });
            
            return nextState;
          });
        }
        
        if (msg.type === 'INPUT') {
            // Updated in the RequestAnimationFrame loop logic in GameCanvas via Reference
            // But we need to update the state object reference here if we want to be pure
            // For performance, GameCanvas handles the live loop update on a Ref.
            // But we need to inject the input data into the loop.
            // We'll trust the GameCanvas to listen to PeerService if we pass the service or callback.
            
            // Actually, in GameCanvas, we need to handle inputs. 
            // Since `peerService` is a singleton, GameCanvas can subscribe.
            // We will let GameCanvas handle gameplay packet processing.
        }
      };

    } catch (e) {
      console.error(e);
      setError("Failed to initialize PeerJS. Make sure you are connected to the internet.");
    }
  };

  const joinGame = async () => {
    if (!myName) return setError("Please enter your name!");
    if (!joinId) return setError("Please enter a Room ID!");
    
    try {
      const id = await peerService.initialize();
      setMyId(id);
      await peerService.connectToHost(joinId);
      
      // Send Join Request
      peerService.sendToHost({ 
        type: 'JOIN_REQUEST', 
        payload: { name: myName, skin: mySkin } 
      });
      
      setPhase(GamePhase.LOBBY);
      
      // Wait for Accept
      peerService.onMessage = (msg) => {
        if (msg.type === 'JOIN_ACCEPT') {
           setGameState(msg.payload.gameState);
           setHostId(joinId); // Track who we connected to
        }
        if (msg.type === 'START_GAME') {
           setPhase(GamePhase.PLAYING);
        }
        if (msg.type === 'GAME_OVER') {
           handleGameOver(msg.payload.winnerId);
        }
      };

    } catch (e) {
      setError("Could not connect to host. Check ID.");
    }
  };

  const startGame = () => {
    if (!isHost) return;
    peerService.broadcast({ type: 'START_GAME', payload: {} });
    setPhase(GamePhase.PLAYING);
  };

  const copyId = () => {
    navigator.clipboard.writeText(hostId);
    setIsCopying(true);
    setTimeout(() => setIsCopying(false), 2000);
  };

  // Host Only: Trigger Gemini Event
  const handleTriggerGemini = async () => {
    if (!isHost) return;
    try {
       const event = await generateChaosEvent();
       // Update State
       setGameState(prev => {
          if(!prev) return null;
          return { ...prev, activeEvent: event };
       });
       // Broadcast is handled by GameCanvas loop detecting state change? 
       // No, explicit broadcast is better for events to ensure everyone gets the toast.
       // Actually, the GameLoop in GameCanvas broadcasts state snapshots frequently.
       // We just need to ensure the state ref in GameCanvas updates.
       // Since GameCanvas uses a Ref initialized from props, we need to signal it.
       // Wait, GameCanvas syncs `gameStateRef.current = initialState` on prop change.
       // So setting state here works.
    } catch (e) {
      console.error("Gemini Error", e);
    }
  };

  const handleGameOver = (winnerId: string) => {
      setGameState(prev => prev ? ({ ...prev, winnerId }) : null);
      setPhase(GamePhase.GAME_OVER);
  };

  const resetGame = () => {
      window.location.reload();
  };

  // --- RENDERING ---

  if (phase === GamePhase.MENU) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-900 text-white snow-bg">
        <h1 className="text-6xl text-red-500 mb-2 christmas-font">Santa's Sleigh Royale</h1>
        <p className="text-slate-300 mb-8">Multiplayer Christmas Chaos with AI Events</p>
        
        <div className="bg-slate-800 p-8 rounded-xl shadow-2xl border border-slate-700 w-full max-w-md">
          {error && <div className="bg-red-900/50 text-red-200 p-2 rounded mb-4 text-sm">{error}</div>}
          
          <div className="mb-6">
            <label className="block text-sm text-slate-400 mb-1">Your Name</label>
            <input 
              value={myName} onChange={e => setMyName(e.target.value)}
              className="w-full bg-slate-700 border border-slate-600 rounded p-2 text-white focus:ring-2 focus:ring-red-500 outline-none"
              placeholder="Santa Claus"
            />
          </div>

          <div className="mb-8">
            <label className="block text-sm text-slate-400 mb-2">Choose Skin</label>
            <div className="flex justify-between gap-2">
              {Object.values(PlayerSkin).map(skin => (
                <button 
                  key={skin}
                  onClick={() => setMySkin(skin)}
                  className={`text-3xl p-2 rounded-lg transition-all ${mySkin === skin ? 'bg-red-600 scale-110 shadow-lg' : 'bg-slate-700 hover:bg-slate-600'}`}
                >
                  {skin}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             <div className="col-span-2">
               <button 
                 onClick={initHost}
                 className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3 rounded-lg transition shadow-lg flex items-center justify-center gap-2"
               >
                 🎄 Host New Game
               </button>
             </div>
             
             <div className="col-span-2 flex items-center gap-2 my-2">
                <hr className="flex-grow border-slate-600" />
                <span className="text-slate-500 text-sm">OR JOIN</span>
                <hr className="flex-grow border-slate-600" />
             </div>

             <div className="col-span-2 flex gap-2">
               <input 
                 value={joinId} onChange={e => setJoinId(e.target.value)}
                 className="flex-grow bg-slate-700 border border-slate-600 rounded p-2 text-white text-sm"
                 placeholder="Paste Room ID here..."
               />
               <button 
                 onClick={joinGame}
                 className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded-lg transition"
               >
                 Join
               </button>
             </div>
          </div>
        </div>
        <p className="mt-8 text-xs text-slate-500 max-w-sm text-center">
            Requires 'peerjs' dependency. If hosting on GitHub Pages, ensure your browser allows WebRTC.
            AI Events powered by Google Gemini.
        </p>
      </div>
    );
  }

  if (phase === GamePhase.LOBBY) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 bg-slate-900 text-white snow-bg">
        <div className="bg-slate-800 p-8 rounded-xl shadow-2xl w-full max-w-2xl text-center">
           <h2 className="text-4xl christmas-font mb-4 text-green-400">Lobby</h2>
           
           {isHost ? (
             <div className="mb-8">
               <p className="text-slate-400 text-sm mb-2">Share this Room ID with friends:</p>
               <div className="flex justify-center items-center gap-2 bg-slate-900 p-4 rounded-lg border border-dashed border-slate-600">
                  <code className="text-xl text-yellow-400 font-mono tracking-wider">{hostId}</code>
                  <button onClick={copyId} className="text-slate-400 hover:text-white">
                    {isCopying ? '✅' : '📋'}
                  </button>
               </div>
             </div>
           ) : (
             <div className="mb-8 p-4 bg-slate-700/50 rounded-lg">
                <p className="animate-pulse text-yellow-300">Waiting for host to start...</p>
             </div>
           )}

           <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {gameState && Object.values(gameState.players).map((p: Player) => (
                 <div key={p.id} className="bg-slate-700 p-4 rounded flex flex-col items-center animate-fade-in">
                    <span className="text-4xl mb-2">{p.skin}</span>
                    <span className="font-bold truncate w-full">{p.name}</span>
                    {p.isHost && <span className="text-xs text-yellow-500 bg-yellow-900/30 px-2 rounded-full mt-1">HOST</span>}
                 </div>
              ))}
           </div>

           {isHost && (
             <button 
               onClick={startGame}
               className="bg-red-600 hover:bg-red-500 text-white font-bold py-4 px-12 rounded-full text-xl shadow-lg hover:scale-105 transition transform"
             >
               🎅 Start Game
             </button>
           )}
        </div>
      </div>
    );
  }

  if (phase === GamePhase.PLAYING && gameState) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center snow-bg">
         <GameCanvas 
            initialState={gameState} 
            myPlayerId={myId} 
            isHost={isHost}
            onGameOver={handleGameOver}
            triggerGeminiEvent={handleTriggerGemini}
         />
      </div>
    );
  }

  if (phase === GamePhase.GAME_OVER && gameState) {
      const winner = gameState.players[gameState.winnerId || ''];
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 text-white snow-bg z-50">
            <h1 className="text-6xl text-yellow-400 christmas-font mb-4">Game Over!</h1>
            <div className="text-center mb-8">
                <p className="text-2xl text-slate-300">The Winner is</p>
                <div className="text-6xl mt-4 animate-bounce">
                    {winner ? winner.skin : '👻'}
                </div>
                <div className="text-4xl font-bold mt-2 text-green-400">
                    {winner ? winner.name : 'Nobody'}
                </div>
                <p className="text-xl mt-2 text-slate-400">Score: {winner ? winner.score : 0}</p>
            </div>
            <button onClick={resetGame} className="bg-red-600 px-8 py-3 rounded-lg text-xl font-bold hover:bg-red-500 transition">
                Play Again
            </button>
        </div>
      );
  }

  return <div>Loading...</div>;
};

export default App;
