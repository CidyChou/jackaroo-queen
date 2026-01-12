
import { 
  GameState, GameAction, Player, Card, Marble, 
  PlayerColor, Rank, BoardNode, GamePhase 
} from '../types';
import { 
  PLAYER_COLORS, SUITS, RANKS, START_POSITIONS 
} from '../constants';
import { generateBoard } from './boardService';
import { calculateValidMoves, executeMove } from './moveEngine';

const generateId = () => Math.random().toString(36).substr(2, 9);

const createDeck = (): Card[] => {
  const deck: Card[] = [];
  SUITS.forEach(suit => {
    RANKS.forEach(rank => {
      deck.push({
        id: generateId(),
        suit,
        rank,
        value: 0
      });
    });
  });
  return deck.sort(() => Math.random() - 0.5);
};

export const createInitialState = (): GameState => {
  // 1v1 Setup: Red (Human) vs Yellow (Bot)
  // We pick Yellow because it's usually opposite or nicely spaced (index 0 and 2 in standard colors)
  const activeColors: PlayerColor[] = ['red', 'yellow']; 

  const players: Player[] = activeColors.map((color, index) => ({
    id: `player_${color}`,
    color,
    team: index + 1, // Individual teams for 1v1
    hand: [],
    marbles: [],
    isFinished: false,
    isBot: index === 1 // Player 2 (Yellow) is Bot
  }));

  const marbles: Record<string, Marble> = {};
  players.forEach(p => {
    for (let i = 0; i < 4; i++) {
      const mId = `${p.color}_m_${i}`;
      marbles[mId] = {
        id: mId,
        ownerId: p.id,
        color: p.color,
        position: 'BASE',
        isSafe: true
      };
      p.marbles.push(mId);
    }
  });

  return {
    players,
    marbles,
    board: generateBoard(),
    deck: createDeck(),
    discardPile: [],
    currentPlayerIndex: 0,
    currentRound: 1,
    phase: 'IDLE',
    selectedCardId: null,
    selectedMarbleId: null,
    possibleMoves: [],
    split7State: null,
    lastActionLog: ['Welcome to Jackaroo King!']
  };
};

export const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'START_GAME': {
      const newDeck = createDeck(); // Fresh deck
      const newPlayers = state.players.map(p => {
        const hand = newDeck.splice(0, 4);
        return { ...p, hand };
      });

      return {
        ...state,
        phase: 'TURN_START',
        deck: newDeck,
        players: newPlayers,
        currentRound: 1,
        currentPlayerIndex: 0,
        lastActionLog: ['Game Started. You are RED.']
      };
    }

    case 'SELECT_CARD': {
      if (state.phase !== 'TURN_START' && state.phase !== 'PLAYER_INPUT') return state;
      const player = state.players[state.currentPlayerIndex];
      const card = player.hand.find(c => c.id === action.cardId);
      
      if (!card) return state;

      // Calculate moves for ALL marbles to see what's possible
      const moves = calculateValidMoves(state, player, card, null);

      return {
        ...state,
        phase: 'PLAYER_INPUT',
        selectedCardId: action.cardId,
        selectedMarbleId: null,
        possibleMoves: moves,
        split7State: null
      };
    }

    case 'SELECT_MARBLE': {
      if (state.phase !== 'PLAYER_INPUT' && state.phase !== 'HANDLING_SPLIT_7') return state;
      if (!state.selectedCardId) return state;

      const player = state.players[state.currentPlayerIndex];
      const card = player.hand.find(c => c.id === state.selectedCardId);
      if (!card) return state;
      
      // Calculate moves specifically for this marble
      const moves = calculateValidMoves(state, player, card, action.marbleId);

      return {
        ...state,
        selectedMarbleId: action.marbleId,
        possibleMoves: moves
      };
    }

    case 'CONFIRM_MOVE': {
      if (!state.selectedCardId) return state;
      
      // Logic for selecting move from 'possibleMoves'
      // Default to first valid move if specific target logic wasn't fully filtered in interaction layer
      const move = state.possibleMoves[0];
      if (!move) return state;

      const nextState = executeMove(state, move);
      const player = state.players[state.currentPlayerIndex];
      const card = player.hand.find(c => c.id === state.selectedCardId);

      let logMsg = `${player.isBot ? 'CPU' : 'Player'} (${player.color}) played ${card?.rank}`;
      if (move.type === 'base_exit') logMsg += ' to Start';
      if (move.killedMarbleIds && move.killedMarbleIds.length > 0) logMsg += ' - KILL!';

      // IMPORTANT: We do NOT advance player yet. 
      // We switch phase to RESOLVING_MOVE to let animations play in the UI.
      // The UI will trigger RESOLVE_TURN after a timeout.
      
      return {
        ...nextState,
        possibleMoves: [],
        phase: 'RESOLVING_MOVE',
        lastActionLog: [...state.lastActionLog, logMsg]
      };
    }

    case 'BURN_CARD': {
       if (!state.selectedCardId) return state;
       const player = state.players[state.currentPlayerIndex];
       const card = player.hand.find(c => c.id === state.selectedCardId);
       
       const logMsg = `${player.isBot ? 'CPU' : 'Player'} burned ${card?.rank}`;

       return {
         ...state,
         phase: 'RESOLVING_MOVE', // Short delay for visual feedback
         possibleMoves: [],
         lastActionLog: [...state.lastActionLog, logMsg]
       };
    }

    case 'RESOLVE_TURN': {
      // 1. Remove Card from Hand
      const currentPlayer = state.players[state.currentPlayerIndex];
      const playedCardId = state.selectedCardId;
      
      if (!playedCardId) return state; // Should not happen

      const cardToDiscard = currentPlayer.hand.find(c => c.id === playedCardId);
      const newHand = currentPlayer.hand.filter(c => c.id !== playedCardId);
      
      const updatedPlayers = [...state.players];
      updatedPlayers[state.currentPlayerIndex] = { ...currentPlayer, hand: newHand };

      const newDiscardPile = cardToDiscard ? [...state.discardPile, cardToDiscard] : state.discardPile;

      // 2. Check Round End (All hands empty)
      const allHandsEmpty = updatedPlayers.every(p => p.hand.length === 0);
      
      if (allHandsEmpty) {
        // Start New Round
        let deck = [...state.deck];
        let discard = [...newDiscardPile];
        
        // Reshuffle if needed (shouldn't be for standard jackaroo until late game, but good safety)
        if (deck.length < updatedPlayers.length * 4) {
           deck = [...deck, ...discard].sort(() => Math.random() - 0.5);
           discard = [];
        }

        const nextRoundPlayers = updatedPlayers.map(p => ({
          ...p,
          hand: deck.splice(0, 4)
        }));

        const nextRoundIndex = (state.currentPlayerIndex + 1) % state.players.length; 

        return {
          ...state,
          players: nextRoundPlayers,
          deck,
          discardPile: discard,
          currentPlayerIndex: nextRoundIndex,
          currentRound: state.currentRound + 1,
          selectedCardId: null,
          selectedMarbleId: null,
          possibleMoves: [],
          phase: 'TURN_START',
          lastActionLog: [...state.lastActionLog, `Round ${state.currentRound + 1} Started`]
        };
      }

      // 3. Normal Turn Switch
      const nextPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;

      return {
        ...state,
        players: updatedPlayers,
        discardPile: newDiscardPile,
        currentPlayerIndex: nextPlayerIndex,
        selectedCardId: null,
        selectedMarbleId: null,
        possibleMoves: [],
        phase: 'TURN_START'
      };
    }

    case 'CANCEL_SELECTION': {
      return {
        ...state,
        selectedCardId: null,
        selectedMarbleId: null,
        possibleMoves: [],
        phase: 'PLAYER_INPUT'
      };
    }

    default:
      return state;
  }
};

// Override the reducer locally to fix the recursion issue cleaner
export const enhancedGameReducer = (state: GameState, action: GameAction): GameState => {
  if (action.type === 'SELECT_TARGET_NODE') {
     // Pre-processing: Filter possible moves to the one matching target
     const targetMove = state.possibleMoves.find(m => m.targetPosition === action.nodeId);
     if (targetMove) {
       const nextState = { ...state, possibleMoves: [targetMove] };
       // Now confirm
       return gameReducer(nextState, { type: 'CONFIRM_MOVE' });
     }
  }
  return gameReducer(state, action);
};
