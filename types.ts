export enum GamePhase {
  MENU = 'MENU',
  LOBBY = 'LOBBY',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export enum PlayerSkin {
  SANTA = '🎅',
  ELF = '🧝',
  REINDEER = '🦌',
  SNOWMAN = '⛄',
  COOKIE = '🍪'
}

export interface Player {
  id: string;
  x: number;
  y: number;
  score: number;
  skin: PlayerSkin;
  name: string;
  isHost: boolean;
  vx: number;
  vy: number;
  frozen?: boolean;
  inverted?: boolean;
}

export interface Present {
  id: string;
  x: number;
  y: number;
  value: number; // 1, 2, or 5 points
}

export interface ChaosEvent {
  name: string;
  description: string;
  type: 'SPEED_BOOST' | 'SLOWNESS' | 'FREEZE' | 'REVERSE_CONTROLS' | 'DOUBLE_POINTS' | 'NORMAL';
  duration: number; // seconds
  active: boolean;
}

export interface GameState {
  players: Record<string, Player>;
  presents: Present[];
  activeEvent: ChaosEvent | null;
  timeLeft: number;
  winnerId: string | null;
}

// Network Payloads
export type NetworkMessage = 
  | { type: 'JOIN_REQUEST'; payload: { name: string; skin: PlayerSkin } }
  | { type: 'JOIN_ACCEPT'; payload: { gameState: GameState; playerId: string } }
  | { type: 'INPUT'; payload: { dx: number; dy: number } }
  | { type: 'GAME_UPDATE'; payload: GameState }
  | { type: 'START_GAME'; payload: {} }
  | { type: 'GAME_OVER'; payload: { winnerId: string } };
