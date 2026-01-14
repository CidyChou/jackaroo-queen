import { PlayerColor, Rank, Suit } from "./types.js";

export const BOARD_SEGMENT_LENGTH = 13; // Standard jackaroo is often 13 per player section
export const TOTAL_BOARD_NODES = BOARD_SEGMENT_LENGTH * 4;
export const HOME_PATH_LENGTH = 4;

export const PLAYER_COLORS: PlayerColor[] = ['red', 'blue', 'yellow', 'green'];

export const SUITS: Suit[] = ['hearts', 'diamonds', 'clubs', 'spades'];
export const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export const CARD_VALUES: Record<Rank, number> = {
  'A': 1, // Or 11, or Base->Start
  '2': 2,
  '3': 3,
  '4': -4,
  '5': 5,
  '6': 6,
  '7': 7, // Split
  '8': 8,
  '9': 9,
  '10': 10,
  'J': 0, // Swap
  'Q': 12,
  'K': 13 // Or Base->Start
};

// Map each player to their start index on the main circular track (0 to 51)
export const START_POSITIONS: Record<PlayerColor, number> = {
  'red': 0,
  'blue': 13,
  'yellow': 26,
  'green': 39
};
