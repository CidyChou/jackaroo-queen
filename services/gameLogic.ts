
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

// --- Initialization ---

export const createInitialState = (playerCount: number = 2): GameState => {
  let activeColors: PlayerColor[] = [];
  if (playerCount === 2) {
    activeColors = ['red', 'yellow'];
  } else {
    activeColors = ['red', 'blue', 'yellow', 'green'];
  }

  const players: Player[] = activeColors.map((color) => {
    return {
      id: `player_${color}`,
      color,
      team: (color === 'red' || color === 'yellow') ? 1 : 2, // 1v1 setup team logic
      hand: [],
      marbles: [],
      isFinished: false,
      isBot: color !== 'red' // P1 is Red
    };
  });

  const marbles: Record<string, Marble> = {};
  
  // NEW RULE: 1 Marble on Start, 3 in Base
  players.forEach(p => {
    const startNodeId = `node_${START_POSITIONS[p.color]}`;
    
    for (let i = 0; i < 4; i++) {
      const mId = `${p.color}_m_${i}`;
      // First marble (index 0) goes to start
      const isStarter = i === 0;
      
      marbles[mId] = {
        id: mId,
        ownerId: p.id,
        color: p.color,
        position: isStarter ? startNodeId : 'BASE',
        isSafe: true
      };
      p.marbles.push(mId);
    }
  });

  // Initial Deal: Round 1 -> 4 Cards
  let deck = createDeck();
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
    lastActionLog: ['Welcome to Jackaroo 1v1!', 'Attack Enabled!']
  };
};

export const gameReducer = (state: GameState, action: GameAction): GameState => {
  switch (action.type) {
    case 'START_GAME': {
      return createInitialState(state.players.length);
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
      if (state.phase !== 'PLAYER_INPUT') return state;
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

      // Special Handling for Force Discard (Attack)
      if (move.type === 'force_discard') {
         const attacker = state.players[state.currentPlayerIndex];
         const victimIndex = (state.currentPlayerIndex + 1) % state.players.length;
         const victim = state.players[victimIndex];
         
         // Auto-discard logic for simplicity as requested
         // Randomly pick 1 card to burn from victim
         const victimHand = [...victim.hand];
         let burnedCardName = "Nothing";
         
         if (victimHand.length > 0) {
            const ridx = Math.floor(Math.random() * victimHand.length);
            const burned = victimHand.splice(ridx, 1)[0];
            burnedCardName = burned.rank;
            
            // Update Victim Hand
            const newPlayers = [...state.players];
            newPlayers[victimIndex] = { ...victim, hand: victimHand };
            state.players = newPlayers; // Mutating clone for next step
         }

         const logMsg = `${attacker.color} ATTACK! ${victim.color} discarded ${burnedCardName}.`;
         
         // Combo Rule: Attacker plays AGAIN.
         // We consume the attacker's card used for attack
         const cardToDiscard = attacker.hand.find(c => c.id === state.selectedCardId);
         const attackerNewHand = attacker.hand.filter(c => c.id !== state.selectedCardId);
         const updatedPlayers = [...state.players];
         updatedPlayers[state.currentPlayerIndex] = { ...attacker, hand: attackerNewHand };
         
         const newDiscardPile = cardToDiscard ? [...state.discardPile, cardToDiscard] : state.discardPile;

         return {
            ...state,
            players: updatedPlayers,
            discardPile: newDiscardPile,
            selectedCardId: null,
            selectedMarbleId: null,
            possibleMoves: [],
            phase: 'TURN_START', // Immediately start turn again (no player index change)
            lastActionLog: [...state.lastActionLog, logMsg, `${attacker.color} plays again!`]
         };
      }

      // Normal Move Execution
      const { nextState, events } = executeMove(state, move);
      const player = state.players[state.currentPlayerIndex];
      const card = player.hand.find(c => c.id === state.selectedCardId);

      let logMsg = `${player.isBot ? 'CPU' : 'Player'} (${player.color}) played ${card?.rank}`;
      if (events.killedOpponent) logMsg += ' - KILL! (+1 Card)';
      if (events.enteredHome) logMsg += ' - SCORED! (+1 Card)';

      // Apply Bonus Cards immediately
      let updatedPlayers = [...nextState.players];
      let currentDeck = [...nextState.deck];
      let currentPlayerHand = [...player.hand];

      if (events.killedOpponent || events.enteredHome) {
         if (currentDeck.length > 0) {
            const bonusCard = currentDeck.pop();
            if (bonusCard) currentPlayerHand.push(bonusCard);
         }
      }

      updatedPlayers[state.currentPlayerIndex] = { ...player, hand: currentPlayerHand };

      return {
        ...nextState,
        players: updatedPlayers,
        deck: currentDeck,
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
      const currentPlayerIndex = state.currentPlayerIndex;
      const currentPlayer = state.players[currentPlayerIndex];
      const playedCardId = state.selectedCardId;
      
      // Remove played card if not already removed (Attack removes it earlier)
      let newPlayers = [...state.players];
      let newDiscardPile = [...state.discardPile];

      if (playedCardId) {
        const cardToDiscard = currentPlayer.hand.find(c => c.id === playedCardId);
        const newHand = currentPlayer.hand.filter(c => c.id !== playedCardId);
        newPlayers[currentPlayerIndex] = { ...currentPlayer, hand: newHand };
        if (cardToDiscard) newDiscardPile.push(cardToDiscard);
      }

      // Check Asymmetric Round End
      // Round ends only when ALL players have 0 cards
      const allHandsEmpty = newPlayers.every(p => p.hand.length === 0);
      
      if (allHandsEmpty) {
        // --- NEW ROUND DEALING LOGIC (4-4-5) ---
        let deck = [...state.deck];
        let discard = [...newDiscardPile];
        
        const nextRound = state.currentRound + 1;
        
        // Reshuffle after round 3 (End of 4-4-5 cycle) or if deck empty
        if ((state.currentRound % 3 === 0) || deck.length < newPlayers.length * 5) {
           deck = [...deck, ...discard].sort(() => Math.random() - 0.5);
           discard = [];
        }

        // Determine Cards to Deal (4-4-5 Pattern)
        // Round 1 (done), Round 2=4, Round 3=5, Round 4=4...
        // Pattern Index: (RoundNumber - 1) % 3
        // R1(0)=4, R2(1)=4, R3(2)=5
        const cardsToDeal = (nextRound - 1) % 3 === 2 ? 5 : 4;

        const nextRoundPlayers = newPlayers.map(p => ({
          ...p,
          hand: deck.splice(0, cardsToDeal)
        }));

        // Rotate starting player for fair advantage
        const nextStartPlayerIndex = (state.currentRound) % state.players.length; 

        return {
          ...state,
          players: nextRoundPlayers,
          deck,
          discardPile: discard,
          currentPlayerIndex: nextStartPlayerIndex,
          currentRound: nextRound,
          selectedCardId: null,
          selectedMarbleId: null,
          possibleMoves: [],
          phase: 'TURN_START',
          lastActionLog: [...state.lastActionLog, `Round ${nextRound} - Deal ${cardsToDeal}`]
        };
      }

      // --- NEXT TURN LOGIC ---
      // Skip players who have no cards (Asymmetric play)
      let nextIndex = (currentPlayerIndex + 1) % state.players.length;
      let loopCount = 0;
      
      while (newPlayers[nextIndex].hand.length === 0 && loopCount < newPlayers.length) {
         nextIndex = (nextIndex + 1) % state.players.length;
         loopCount++;
      }

      return {
        ...state,
        players: newPlayers,
        discardPile: newDiscardPile,
        currentPlayerIndex: nextIndex,
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
