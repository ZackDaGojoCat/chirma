import { ChaosEvent } from './types';

export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;
export const PLAYER_SIZE = 40;
export const PRESENT_SIZE = 30;
export const GAME_DURATION = 120; // 2 minutes per round
export const EVENT_INTERVAL = 30; // Event every 30 seconds

export const INITIAL_EVENT: ChaosEvent = {
  name: "Silent Night",
  description: "Peaceful collecting...",
  type: 'NORMAL',
  duration: 0,
  active: false
};

export const MOVEMENT_SPEED = 5;

// Mock peerjs for Type Safety if package isn't installed in environment,
// though in a real app you'd npm install peerjs.
// We assume 'peerjs' is available via import. 
// If using a bundler without npm, one might need a script tag workaround, 
// but standard React setup assumes npm.
