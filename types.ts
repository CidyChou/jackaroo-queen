
export type PlayerColor = 'red' | 'blue' | 'yellow' | 'green';

export type Suit = 'hearts' | 'diamonds' | 'clubs' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  value: number; // For simple moves
}

export interface Player {
  id: string;
  color: PlayerColor;
  team: number; // 1 or 2
  hand: Card[];
  marbles: string[]; // IDs of marbles owned by this player
  isFinished: boolean; // True if all marbles are home
  isBot: boolean; // New flag for AI
}

export type MarbleLocation = 'BASE' | 'HOME' | string; // string = NodeId

export interface Marble {
  id: string;
  ownerId: string;
  color: PlayerColor;
  position: MarbleLocation; // 'BASE', 'HOME' (generic finished state), or Node ID
  isSafe: boolean; // If in base or home or protected node
}

export type NodeType = 'normal' | 'start' | 'home_entrance' | 'home_path' | 'home';

export interface BoardNode {
  id: string;
  type: NodeType;
  next: string[]; // Adjacency list for forward movement
  prev: string | null; // For moving backwards (4)
  isSafe: boolean; // Cannot be killed here
  isStartFor?: PlayerColor; // Base -> Start jump point
  isHomeEntranceFor?: PlayerColor; // Entry to safe zone
}

export type MoveType = 'standard' | 'base_exit' | 'swap' | 'kill_path' | 'split_move';

export interface MoveCandidate {
  type: MoveType;
  cardId: string;
  marbleId: string;
  targetPosition?: string; // Destination Node ID
  swapTargetMarbleId?: string; // For Jack
  stepsUsed?: number; // For 7
  killedMarbleIds?: string[]; // Calculated side effects
  isValid: boolean;
}

// FSM States
export type GamePhase =
  | 'IDLE' // Before game starts
  | 'TURN_START' // Draw cards if needed, check can play
  | 'PLAYER_INPUT' // Waiting for user to select card or marble
  | 'HANDLING_SPLIT_7' // Special state for 7: choosing 2nd marble/steps
  | 'HANDLING_JACK_SWAP' // Special state for Jack: choosing target
  | 'RESOLVING_MOVE' // Calculating effects, kills, animations (conceptually)
  | 'CHECK_WIN' // Check if player finished
  | 'NEXT_TURN' // Pass turn to next player
  | 'GAME_OVER';

export interface GameState {
  players: Player[];
  marbles: Record<string, Marble>;
  board: Record<string, BoardNode>;
  deck: Card[];
  discardPile: Card[];
  
  currentPlayerIndex: number;
  currentRound: number; // 1-5 (deal rounds)
  
  phase: GamePhase;
  
  // Selection Context
  selectedCardId: string | null;
  selectedMarbleId: string | null;
  possibleMoves: MoveCandidate[]; // Calculated valid moves for current context
  
  // Complex Move Context
  split7State: {
    firstMoveUsed: number | null; // How many steps used for first marble
    firstMarbleId: string | null;
    remainingSteps: number;
  } | null;
  
  lastActionLog: string[];
}

// Action Types for Reducer
export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'SELECT_CARD'; cardId: string }
  | { type: 'DESELECT_CARD' }
  | { type: 'SELECT_MARBLE'; marbleId: string }
  | { type: 'SELECT_TARGET_NODE'; nodeId: string } 
  | { type: 'CONFIRM_MOVE' }
  | { type: 'BURN_CARD' }
  | { type: 'CANCEL_SELECTION' }
  | { type: 'RESOLVE_TURN' };
