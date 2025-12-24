import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameState, Player, NetworkMessage, PlayerSkin } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, PLAYER_SIZE, PRESENT_SIZE, MOVEMENT_SPEED } from '../constants';
import { peerService } from '../services/peerService';

interface GameCanvasProps {
  initialState: GameState;
  myPlayerId: string;
  isHost: boolean;
  onGameOver: (winnerId: string) => void;
  // Callback for host to trigger API calls, but result is passed back via props/state update mechanism usually
  // Here we'll handle the loop mostly inside to keep it fast
  triggerGeminiEvent: () => void;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ 
  initialState, 
  myPlayerId, 
  isHost, 
  onGameOver,
  triggerGeminiEvent 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // We use a ref for state to avoid closure staleness in the requestAnimationFrame loop
  const gameStateRef = useRef<GameState>(initialState);
  // Input keys
  const keysPressed = useRef<Record<string, boolean>>({});
  
  // Local state just for UI overlays (like event text)
  const [activeEventName, setActiveEventName] = useState<string | null>(null);
  const [activeEventDesc, setActiveEventDesc] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(initialState.timeLeft);

  // Sync React state for UI with Ref state for Loop
  useEffect(() => {
    gameStateRef.current = initialState;
  }, [initialState]);

  // Input Handling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { keysPressed.current[e.code] = true; };
    const handleKeyUp = (e: KeyboardEvent) => { keysPressed.current[e.code] = false; };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Main Game Loop
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();
    let lastNetworkUpdate = 0;
    let lastEventTrigger = 0;

    const gameLoop = (time: number) => {
      const dt = (time - lastTime) / 1000;
      lastTime = time;

      const state = gameStateRef.current;
      const myPlayer = state.players[myPlayerId];

      // --- 1. HANDLE LOCAL INPUT (Client Side Prediction / Input Sending) ---
      let dx = 0;
      let dy = 0;
      
      if (myPlayer && !myPlayer.frozen) {
        if (keysPressed.current['ArrowUp'] || keysPressed.current['KeyW']) dy -= 1;
        if (keysPressed.current['ArrowDown'] || keysPressed.current['KeyS']) dy += 1;
        if (keysPressed.current['ArrowLeft'] || keysPressed.current['KeyA']) dx -= 1;
        if (keysPressed.current['ArrowRight'] || keysPressed.current['KeyD']) dx += 1;

        // Apply Event Modifiers locally for feel, but Host validates
        if (state.activeEvent?.type === 'REVERSE_CONTROLS') {
          dx = -dx;
          dy = -dy;
        }
      }

      // Send Input to Host (if not host) OR Apply Input (if host)
      if (dx !== 0 || dy !== 0) {
        if (isHost) {
          // Host applies physics directly
          let speed = MOVEMENT_SPEED;
          if (state.activeEvent?.type === 'SPEED_BOOST') speed *= 2;
          if (state.activeEvent?.type === 'SLOWNESS') speed *= 0.5;

          const p = state.players[myPlayerId];
          p.x = Math.max(0, Math.min(CANVAS_WIDTH - PLAYER_SIZE, p.x + dx * speed));
          p.y = Math.max(0, Math.min(CANVAS_HEIGHT - PLAYER_SIZE, p.y + dy * speed));
        } else {
          // Client sends input vector
          // Throttle network slightly? standard 60fps might flood PeerJS. 
          // Let's send every frame but maybe debounce if needed. For LAN/fast internet it's ok.
          peerService.sendToHost({ type: 'INPUT', payload: { dx, dy } });
        }
      }

      // --- 2. HOST LOGIC ---
      if (isHost) {
        // Decrement Time
        state.timeLeft -= dt;
        if (state.timeLeft <= 0) {
            onGameOver(getWinner(state.players));
            return; // Stop loop
        }

        // Manage Event Timer
        if (state.activeEvent && state.activeEvent.active) {
           state.activeEvent.duration -= dt;
           if (state.activeEvent.duration <= 0) {
               state.activeEvent = null; // Event over
           }
        }

        // Trigger Gemini Event periodically
        // Check if no active event and enough time has passed
        const timeSinceStart = 120 - state.timeLeft;
        // Trigger roughly every 30s
        if (!state.activeEvent && Math.floor(timeSinceStart) > 0 && Math.floor(timeSinceStart) % 30 === 0 && time - lastEventTrigger > 5000) {
             lastEventTrigger = time;
             triggerGeminiEvent();
        }

        // Collision Logic (Presents)
        Object.values(state.players).forEach((p: Player) => {
            state.presents = state.presents.filter(present => {
                const hit = 
                   p.x < present.x + PRESENT_SIZE &&
                   p.x + PLAYER_SIZE > present.x &&
                   p.y < present.y + PRESENT_SIZE &&
                   p.y + PLAYER_SIZE > present.y;
                
                if (hit) {
                    let points = present.value;
                    if (state.activeEvent?.type === 'DOUBLE_POINTS') points *= 2;
                    p.score += points;
                    return false; // remove present
                }
                return true;
            });
        });

        // Spawn Presents
        if (state.presents.length < 10) {
           if (Math.random() < 0.05) { // Spawn chance
               state.presents.push({
                   id: Math.random().toString(36).substr(2, 9),
                   x: Math.random() * (CANVAS_WIDTH - PRESENT_SIZE),
                   y: Math.random() * (CANVAS_HEIGHT - PRESENT_SIZE),
                   value: Math.random() > 0.8 ? 5 : 1
               });
           }
        }

        // Broadcast State (Throttle to ~20-30 FPS to save bandwidth)
        if (time - lastNetworkUpdate > 40) { // ~25fps
             peerService.broadcast({ type: 'GAME_UPDATE', payload: state });
             lastNetworkUpdate = time;
             
             // Update local UI state hooks
             setActiveEventName(state.activeEvent?.name || null);
             setActiveEventDesc(state.activeEvent?.description || null);
             setTimeLeft(state.timeLeft);
        }
      }

      // --- 3. RENDERING ---
      render(canvasRef.current, gameStateRef.current, myPlayerId);

      animationFrameId = requestAnimationFrame(gameLoop);
    };

    animationFrameId = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isHost, myPlayerId, onGameOver, triggerGeminiEvent]);

  // Network Listener for updates (If Client)
  useEffect(() => {
    if (isHost) return;

    peerService.onMessage = (msg) => {
      if (msg.type === 'GAME_UPDATE') {
        gameStateRef.current = msg.payload;
        // Sync UI
        setActiveEventName(msg.payload.activeEvent?.name || null);
        setActiveEventDesc(msg.payload.activeEvent?.description || null);
        setTimeLeft(msg.payload.timeLeft);
      }
      if (msg.type === 'GAME_OVER') {
         onGameOver(msg.payload.winnerId);
      }
    };
  }, [isHost]);

  return (
    <div className="relative">
      {/* UI Overlay */}
      <div className="absolute top-0 left-0 w-full p-4 flex justify-between items-start pointer-events-none">
        <div className="bg-black/50 p-2 rounded text-white christmas-font text-xl">
           ⏱️ {Math.ceil(timeLeft)}s
        </div>
        {activeEventName && (
           <div className="flex flex-col items-center animate-bounce">
              <div className="bg-red-600 border-2 border-gold text-white font-bold px-6 py-2 rounded-full shadow-lg text-2xl christmas-font">
                ⚠️ {activeEventName}
              </div>
              <div className="mt-1 text-yellow-300 font-bold text-shadow-black">
                {activeEventDesc}
              </div>
           </div>
        )}
        <div className="bg-black/50 p-2 rounded text-white text-right">
          <h3 className="christmas-font text-xl text-yellow-400">Leaderboard</h3>
          {Object.values(gameStateRef.current.players)
            .sort((a: Player, b: Player) => b.score - a.score)
            .map((p: Player) => (
              <div key={p.id} className={`${p.id === myPlayerId ? 'text-green-400 font-bold' : ''}`}>
                {p.skin} {p.name}: {p.score}
              </div>
            ))}
        </div>
      </div>

      <canvas 
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="bg-slate-800 rounded-lg shadow-2xl border-4 border-slate-600 cursor-none touch-none mx-auto"
        style={{ maxWidth: '100%', maxHeight: '80vh' }}
      />
      
      <div className="mt-2 text-center text-slate-400 text-sm">
        Use Arrow Keys or WASD to move. Collect presents 🎁!
      </div>
    </div>
  );
};

// Helper: Get winner ID
function getWinner(players: Record<string, Player>): string {
    return Object.values(players).sort((a: Player, b: Player) => b.score - a.score)[0]?.id || '';
}

// --- RENDER FUNCTION ---
function render(canvas: HTMLCanvasElement | null, state: GameState, myId: string) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Clear
  ctx.fillStyle = '#1e293b'; // Slate 800
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw Snow/Decorations (Static for perf, or simple procedural)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
  for (let i = 0; i < 20; i++) {
     ctx.beginPath();
     ctx.arc((i * 137) % canvas.width, (i * 243) % canvas.height, 3, 0, Math.PI * 2);
     ctx.fill();
  }

  // Draw Presents
  ctx.font = `${PRESENT_SIZE}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  state.presents.forEach(p => {
     ctx.fillText('🎁', p.x + PRESENT_SIZE/2, p.y + PRESENT_SIZE/2);
     // Draw value indicator for gold gifts
     if (p.value > 1) {
       ctx.beginPath();
       ctx.strokeStyle = '#fbbf24'; // Amber 400
       ctx.lineWidth = 2;
       ctx.arc(p.x + PRESENT_SIZE/2, p.y + PRESENT_SIZE/2, PRESENT_SIZE/1.5, 0, Math.PI * 2);
       ctx.stroke();
     }
  });

  // Draw Players
  Object.values(state.players).forEach((p: Player) => {
    const isMe = p.id === myId;
    const cx = p.x + PLAYER_SIZE/2;
    const cy = p.y + PLAYER_SIZE/2;

    // Highlight Me
    if (isMe) {
      ctx.beginPath();
      ctx.fillStyle = 'rgba(74, 222, 128, 0.3)'; // Green glow
      ctx.arc(cx, cy, PLAYER_SIZE * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }

    // Draw Character
    ctx.font = `${PLAYER_SIZE}px serif`;
    ctx.fillText(p.skin, cx, cy);

    // Name Tag
    ctx.font = '12px sans-serif';
    ctx.fillStyle = isMe ? '#4ade80' : 'white';
    ctx.fillText(p.name, cx, cy - PLAYER_SIZE * 0.8);
  });
  
  // Event Overlay Effect (Visual Filter)
  if (state.activeEvent) {
      if (state.activeEvent.type === 'FREEZE') {
          ctx.fillStyle = 'rgba(56, 189, 248, 0.2)'; // Light blue
          ctx.fillRect(0,0, canvas.width, canvas.height);
      }
      if (state.activeEvent.type === 'SLOWNESS') {
          ctx.fillStyle = 'rgba(100, 116, 139, 0.2)'; // Gray fog
          ctx.fillRect(0,0, canvas.width, canvas.height);
      }
      if (state.activeEvent.type === 'REVERSE_CONTROLS') {
          ctx.strokeStyle = '#ef4444'; // Red border
          ctx.lineWidth = 10;
          ctx.strokeRect(0,0,canvas.width, canvas.height);
      }
  }
}

export default GameCanvas;
