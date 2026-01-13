
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
    pendingAttackerIndex: null,
    repeatTurn: false,
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
      // FIX: Allow selection during OPPONENT_DISCARD phase
      const allowedPhases = ['TURN_START', 'PLAYER_INPUT', 'OPPONENT_DISCARD', 'HANDLING_SPLIT_7'];
      if (!allowedPhases.includes(state.phase)) return state;

      // FIX: Block card switching/resetting if in the middle of a Split 7 move
      if (state.phase === 'HANDLING_SPLIT_7' && state.split7State?.firstMoveUsed !== null) {
          return state;
      }

      const player = state.players[state.currentPlayerIndex];
      const card = player.hand.find(c => c.id === action.cardId);
      if (!card) return state;

      // --- HANDLING FOR OPPONENT_DISCARD PHASE ---
      if (state.phase === 'OPPONENT_DISCARD') {
         return {
            ...state,
            selectedCardId: action.cardId,
            selectedMarbleId: null,
            possibleMoves: [] 
         };
      }

      // --- INTERCEPTION FOR CARD 10 (HUMAN ONLY) ---
      if (card.rank === '10' && !player.isBot) {
        return {
          ...state,
          phase: 'DECIDING_10',
          selectedCardId: action.cardId,
          selectedMarbleId: null,
          possibleMoves: [] 
        };
      }

      // --- INTERCEPTION FOR RED QUEEN (HUMAN ONLY) ---
      const isRedQ = card.rank === 'Q' && (card.suit === 'hearts' || card.suit === 'diamonds');
      if (isRedQ && !player.isBot) {
        return {
          ...state,
          phase: 'DECIDING_RED_Q',
          selectedCardId: action.cardId,
          selectedMarbleId: null,
          possibleMoves: [] 
        };
      }

      // --- INTERCEPTION FOR CARD 7 (HUMAN ONLY) ---
      if (card.rank === '7' && !player.isBot) {
         // Fix: If already handling this card, do not reset state
         if (state.phase === 'HANDLING_SPLIT_7' && state.selectedCardId === action.cardId) {
             return state;
         }

         return {
           ...state,
           phase: 'HANDLING_SPLIT_7',
           selectedCardId: action.cardId,
           selectedMarbleId: null,
           possibleMoves: [], // No moves until steps selected
           split7State: {
             firstMoveUsed: null,
             firstMarbleId: null,
             remainingSteps: 7
           }
         };
      }

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

    case 'SELECT_STEP_COUNT': {
      if (state.phase !== 'HANDLING_SPLIT_7') return state;
      const player = state.players[state.currentPlayerIndex];
      const card = player.hand.find(c => c.id === state.selectedCardId);
      if (!card) return state;

      // Calculate moves for the specific step count
      const moves = calculateValidMoves(state, player, card, null, action.steps);

      return {
        ...state,
        possibleMoves: moves,
        selectedMarbleId: null
      };
    }

    case 'RESOLVE_10_DECISION': {
      if (state.phase !== 'DECIDING_10') return state;
      const player = state.players[state.currentPlayerIndex];
      const card = player.hand.find(c => c.id === state.selectedCardId);
      if (!card) return state;

      if (action.choice === 'MOVE') {
        const moves = calculateValidMoves(state, player, card, null);
        const standardMoves = moves.filter(m => m.type !== 'force_discard');

        return {
          ...state,
          phase: 'PLAYER_INPUT',
          possibleMoves: standardMoves
        };
      } else {
        const newHand = player.hand.filter(c => c.id !== card.id);
        const newDiscard = [...state.discardPile, card];
        const newPlayers = [...state.players];
        newPlayers[state.currentPlayerIndex] = { ...player, hand: newHand };

        const attackerIdx = state.currentPlayerIndex;
        const victimIdx = (attackerIdx + 1) % state.players.length;

        return {
          ...state,
          players: newPlayers,
          discardPile: newDiscard,
          currentPlayerIndex: victimIdx,
          pendingAttackerIndex: attackerIdx,
          phase: 'OPPONENT_DISCARD',
          selectedCardId: null,
          possibleMoves: [],
          lastActionLog: [...state.lastActionLog, `${player.color} played 10: ATTACK!`]
        };
      }
    }

    case 'RESOLVE_RED_Q_DECISION': {
      if (state.phase !== 'DECIDING_RED_Q') return state;
      const player = state.players[state.currentPlayerIndex];
      const card = player.hand.find(c => c.id === state.selectedCardId);
      if (!card) return state;

      if (action.choice === 'CANCEL') {
        return {
          ...state,
          phase: 'TURN_START',
          selectedCardId: null,
          possibleMoves: []
        };
      }

      // CHOICE: ATTACK
      const newHand = player.hand.filter(c => c.id !== card.id);
      const newDiscard = [...state.discardPile, card];
      const newPlayers = [...state.players];
      newPlayers[state.currentPlayerIndex] = { ...player, hand: newHand };

      const attackerIdx = state.currentPlayerIndex;
      const victimIdx = (attackerIdx + 1) % state.players.length;

      return {
        ...state,
        players: newPlayers,
        discardPile: newDiscard,
        currentPlayerIndex: victimIdx,
        pendingAttackerIndex: attackerIdx,
        phase: 'OPPONENT_DISCARD',
        selectedCardId: null,
        possibleMoves: [],
        lastActionLog: [...state.lastActionLog, `${player.color} played Red Q: ATTACK!`]
      };
    }

    case 'SELECT_MARBLE': {
      if (state.phase !== 'PLAYER_INPUT' && state.phase !== 'HANDLING_SPLIT_7') return state;
      if (!state.selectedCardId) return state;

      const player = state.players[state.currentPlayerIndex];
      const card = player.hand.find(c => c.id === state.selectedCardId);
      if (!card) return state;
      
      // If we are in Split 7 phase, we use the possibleMoves already filtered by Step selection
      // But we still might need to calculate valid moves if user clicked marble BEFORE filtering?
      // No, UI enforces step selection first for 7.
      // EXCEPT: If we are in the second stage of split 7, moves are already calculated.
      
      // If NOT split 7, calculate as usual
      let moves = state.possibleMoves;
      if (state.phase !== 'HANDLING_SPLIT_7') {
         moves = calculateValidMoves(state, player, card, action.marbleId);
      } else {
         // Filter already calculated moves for this marble
         moves = state.possibleMoves.filter(m => m.marbleId === action.marbleId);
      }

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

      // Special Handling for Force Discard (From Bot)
      if (move.type === 'force_discard') {
         const attacker = state.players[state.currentPlayerIndex];
         const card = attacker.hand.find(c => c.id === state.selectedCardId);
         if (!card) return state;

         const newHand = attacker.hand.filter(c => c.id !== card.id);
         const newDiscard = [...state.discardPile, card];
         const newPlayers = [...state.players];
         newPlayers[state.currentPlayerIndex] = { ...attacker, hand: newHand };

         const attackerIdx = state.currentPlayerIndex;
         const victimIdx = (attackerIdx + 1) % state.players.length;
         
         return {
            ...state,
            players: newPlayers,
            discardPile: newDiscard,
            currentPlayerIndex: victimIdx,
            pendingAttackerIndex: attackerIdx,
            phase: 'OPPONENT_DISCARD', 
            selectedCardId: null,
            possibleMoves: [],
            lastActionLog: [...state.lastActionLog, `${attacker.color} used ${card.rank}: ATTACK!`]
         };
      }

      // Normal Move Execution
      const { nextState, events } = executeMove(state, move);
      const player = state.players[state.currentPlayerIndex];
      const card = player.hand.find(c => c.id === state.selectedCardId);

      // --- HANDLE SPLIT 7 Logic ---
      if (state.phase === 'HANDLING_SPLIT_7' && card?.rank === '7') {
         const stepsTaken = move.stepsUsed || 7;
         const currentSplit = state.split7State || { firstMoveUsed: null, firstMarbleId: null, remainingSteps: 7 };
         
         if (currentSplit.firstMoveUsed === null) {
            // First leg done
            const remaining = 7 - stepsTaken;
            
            if (remaining === 0) {
               // Full 7 used at once, proceed to end turn
            } else {
               // Need second move
               // Calculate moves for remaining steps immediately
               const nextMoves = calculateValidMoves(nextState, player, card, null, remaining);
               
               if (nextMoves.length === 0) {
                   // No valid moves for the remaining steps. 
                   // We must end the turn, forfeiting the remaining steps? 
                   // Or just proceed to standard end turn logic (which commits this first move state).
                   // Yes, fall through to below.
               } else {
                   return {
                      ...nextState,
                      players: state.players, // Don't update players (hand) yet, only board updated
                      split7State: {
                         firstMoveUsed: stepsTaken,
                         firstMarbleId: move.marbleId || null,
                         remainingSteps: remaining
                      },
                      possibleMoves: nextMoves,
                      selectedMarbleId: null,
                      lastActionLog: [...state.lastActionLog, `${player.color} moved ${stepsTaken} steps with 7. Steps left: ${remaining}`]
                   };
               }
            }
         }
         // If we are here, either remaining was 0, or it was the second move (or no valid second move).
         // Proceed to standard turn resolution logic below.
      }

      let logMsg = `${player.isBot ? 'CPU' : 'Player'} (${player.color}) played ${card?.rank}`;
      if (events.killedOpponent) logMsg += ' - KILL! (+1 Card)';
      if (events.enteredHome) logMsg += ' - SCORED! (+1 Card)';

      // Apply Bonus Cards immediately
      let updatedPlayers = [...nextState.players];
      let currentDeck = [...nextState.deck];
      let currentPlayerHand = [...player.hand];
      let shouldRepeat = false;

      if (events.killedOpponent || events.enteredHome) {
         if (currentDeck.length > 0) {
            const bonusCard = currentDeck.pop();
            if (bonusCard) {
                currentPlayerHand.push(bonusCard);
                shouldRepeat = true;
            }
         }
      }

      updatedPlayers[state.currentPlayerIndex] = { ...player, hand: currentPlayerHand };

      return {
        ...nextState,
        players: updatedPlayers,
        deck: currentDeck,
        possibleMoves: [],
        phase: 'RESOLVING_MOVE',
        repeatTurn: shouldRepeat,
        split7State: null, // clear split state
        lastActionLog: [...state.lastActionLog, logMsg]
      };
    }

    case 'BURN_CARD': {
       const player = state.players[state.currentPlayerIndex];
       
       if (state.phase === 'OPPONENT_DISCARD') {
          if (!state.selectedCardId && player.hand.length > 0) return state;

          let burnedCardName = "Last Card";
          let newHand = [...player.hand];
          let cardToBurn = state.discardPile; 

          if (player.hand.length > 0) {
              const c = player.hand.find(x => x.id === state.selectedCardId);
              if (c) {
                  burnedCardName = c.rank;
                  newHand = player.hand.filter(x => x.id !== c.id);
                  cardToBurn = [...state.discardPile, c];
              }
          }

          const newPlayers = [...state.players];
          newPlayers[state.currentPlayerIndex] = { ...player, hand: newHand };
          
          const nextPlayerIdx = state.pendingAttackerIndex !== null ? state.pendingAttackerIndex : state.currentPlayerIndex;

          return {
              ...state,
              players: newPlayers,
              discardPile: cardToBurn,
              currentPlayerIndex: nextPlayerIdx,
              pendingAttackerIndex: null,
              phase: 'TURN_START',
              selectedCardId: null,
              lastActionLog: [...state.lastActionLog, `${player.color} discarded ${burnedCardName}.`, `Turn returns to Attacker!`]
          };
       }

       if (!state.selectedCardId) return state;
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
      
      let newPlayers = [...state.players];
      let newDiscardPile = [...state.discardPile];

      if (playedCardId) {
        const cardToDiscard = currentPlayer.hand.find(c => c.id === playedCardId);
        const newHand = currentPlayer.hand.filter(c => c.id !== playedCardId);
        newPlayers[currentPlayerIndex] = { ...currentPlayer, hand: newHand };
        if (cardToDiscard) newDiscardPile.push(cardToDiscard);
      }

      const allHandsEmpty = newPlayers.every(p => p.hand.length === 0);
      
      if (allHandsEmpty) {
        let deck = [...state.deck];
        let discard = [...newDiscardPile];
        
        const nextRound = state.currentRound + 1;
        
        if ((state.currentRound % 3 === 0) || deck.length < newPlayers.length * 5) {
           deck = [...deck, ...discard].sort(() => Math.random() - 0.5);
           discard = [];
        }

        const cardsToDeal = (nextRound - 1) % 3 === 2 ? 5 : 4;

        const nextRoundPlayers = newPlayers.map(p => ({
          ...p,
          hand: deck.splice(0, cardsToDeal)
        }));

        const nextStartPlayerIndex = (currentPlayerIndex + 1) % state.players.length; 

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
          repeatTurn: false,
          lastActionLog: [...state.lastActionLog, `Round ${nextRound} - Deal ${cardsToDeal}`]
        };
      }

      let nextIndex = currentPlayerIndex;
      
      if (!state.repeatTurn) {
         nextIndex = (currentPlayerIndex + 1) % state.players.length;
         
         let loopCount = 0;
         while (newPlayers[nextIndex].hand.length === 0 && loopCount < newPlayers.length) {
            nextIndex = (nextIndex + 1) % state.players.length;
            loopCount++;
         }
      }

      return {
        ...state,
        players: newPlayers,
        discardPile: newDiscardPile,
        currentPlayerIndex: nextIndex,
        selectedCardId: null,
        selectedMarbleId: null,
        possibleMoves: [],
        phase: 'TURN_START',
        repeatTurn: false
      };
    }

    case 'CANCEL_SELECTION': {
      if (state.phase === 'OPPONENT_DISCARD') {
        return {
          ...state,
          selectedCardId: null,
          possibleMoves: [] 
        };
      }

      // FIX: Block canceling if in the middle of a split move (Leg 2)
      if (state.phase === 'HANDLING_SPLIT_7' && state.split7State?.firstMoveUsed !== null) {
          return state;
      }

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
