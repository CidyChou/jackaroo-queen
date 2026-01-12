
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

// Now accepts playerCount to configure the session
export const createInitialState = (playerCount: number = 2): GameState => {
  let activeColors: PlayerColor[] = [];

  if (playerCount === 2) {
    // 1v1: Red vs Yellow (Opposite sides)
    activeColors = ['red', 'yellow'];
  } else {
    // 4 Players: Standard Jackaroo Circle
    activeColors = ['red', 'blue', 'yellow', 'green'];
  }

  const players: Player[] = activeColors.map((color) => {
    const isHuman = color === 'red'; // P1 is always Human (Red)
    
    // Team Logic
    // 2 Players: Red vs Yellow (Team 1 vs Team 2)
    // 4 Players: Standard Cross Teams (Red/Yellow vs Blue/Green)
    let team = 0;
    if (playerCount === 2) {
      team = color === 'red' ? 1 : 2;
    } else {
      team = (color === 'red' || color === 'yellow') ? 1 : 2;
    }

    return {
      id: `player_${color}`,
      color,
      team, 
      hand: [],
      marbles: [],
      isFinished: false,
      isBot: !isHuman 
    };
  });

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

  // Initial Deal
  const deck = createDeck();
  const playersWithCards = players.map(p => {
    const hand = deck.splice(0, 4);
    return { ...p, hand };
  });

  return {
    players: playersWithCards,
    marbles,
    board: generateBoard(),
    deck,
    discardPile: [],
    currentPlayerIndex: 0,
    currentRound: 1,
    phase: 'TURN_START',
    selectedCardId: null,
    selectedMarbleId: null,
    possibleMoves: [],
    split7State: null,
    lastActionLog: ['Welcome to Jackaroo King!', `Mode: ${playerCount} Players`]
  };
};

export const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'START_GAME': {
      // Re-deal logic usually handled by re-init, but if we restart within component:
      const newDeck = createDeck(); 
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
        lastActionLog: ['Game Restarted.']
      };
    }

    case 'SELECT_CARD': {
      if (state.phase !== 'TURN_START' && state.phase !== 'PLAYER_INPUT') return state;
      const player = state.players[state.currentPlayerIndex];
      const card = player.hand.find(c => c.id === action.cardId);
      
      if (!card) return state;

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
      
      const moves = calculateValidMoves(state, player, card, action.marbleId);

      return {
        ...state,
        selectedMarbleId: action.marbleId,
        possibleMoves: moves
      };
    }

    case 'CONFIRM_MOVE': {
      if (!state.selectedCardId) return state;
      
      const move = state.possibleMoves[0];
      if (!move) return state;

      const nextState = executeMove(state, move);
      const player = state.players[state.currentPlayerIndex];
      const card = player.hand.find(c => c.id === state.selectedCardId);

      let logMsg = `${player.isBot ? 'CPU' : 'Player'} (${player.color}) played ${card?.rank}`;
      if (move.type === 'base_exit') logMsg += ' to Start';
      if (move.killedMarbleIds && move.killedMarbleIds.length > 0) logMsg += ' - KILL!';

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
         phase: 'RESOLVING_MOVE', 
         possibleMoves: [],
         lastActionLog: [...state.lastActionLog, logMsg]
       };
    }

    case 'RESOLVE_TURN': {
      const currentPlayer = state.players[state.currentPlayerIndex];
      const playedCardId = state.selectedCardId;
      
      if (!playedCardId) return state;

      const cardToDiscard = currentPlayer.hand.find(c => c.id === playedCardId);
      const newHand = currentPlayer.hand.filter(c => c.id !== playedCardId);
      
      const updatedPlayers = [...state.players];
      updatedPlayers[state.currentPlayerIndex] = { ...currentPlayer, hand: newHand };

      const newDiscardPile = cardToDiscard ? [...state.discardPile, cardToDiscard] : state.discardPile;

      const allHandsEmpty = updatedPlayers.every(p => p.hand.length === 0);
      
      if (allHandsEmpty) {
        let deck = [...state.deck];
        let discard = [...newDiscardPile];
        
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

export const enhancedGameReducer = (state: GameState, action: GameAction): GameState => {
  if (action.type === 'SELECT_TARGET_NODE') {
     const targetMove = state.possibleMoves.find(m => m.targetPosition === action.nodeId);
     if (targetMove) {
       const nextState = { ...state, possibleMoves: [targetMove] };
       return gameReducer(nextState, { type: 'CONFIRM_MOVE' });
     }
  }
  return gameReducer(state, action);
};
