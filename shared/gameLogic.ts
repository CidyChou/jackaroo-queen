import { 
  GameState, GameAction, Player, Card, Marble, 
  PlayerColor, BoardNode, GamePhase 
} from './types.js';
import { 
  PLAYER_COLORS, SUITS, RANKS, START_POSITIONS 
} from './constants.js';
import { generateBoard } from './boardService.js';
import { calculateValidMoves, executeMove } from './moveEngine.js';

// --- Dependency Injection Interface ---
export interface GameLogicConfig {
  generateId: () => string;
  shuffleArray: <T>(arr: T[]) => T[];
}

// Default implementations for browser/client usage
const defaultGenerateId = () => Math.random().toString(36).substr(2, 9);
const defaultShuffleArray = <T>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

const defaultConfig: GameLogicConfig = {
  generateId: defaultGenerateId,
  shuffleArray: defaultShuffleArray,
};

// --- Factory Function ---
export const createGameLogic = (config: GameLogicConfig = defaultConfig) => {
  const { generateId, shuffleArray } = config;

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
    return shuffleArray(deck);
  };

  const createInitialState = (playerCount: number = 2): GameState => {
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
        team: (color === 'red' || color === 'yellow') ? 1 : 2,
        hand: [],
        marbles: [],
        isFinished: false,
        isBot: color !== 'red'
      };
    });

    const marbles: Record<string, Marble> = {};

    // NEW RULE: 1 Marble on Start, 3 in Base
    players.forEach(p => {
      const startNodeId = `node_${START_POSITIONS[p.color]}`;
      
      for (let i = 0; i < 4; i++) {
        const mId = `${p.color}_m_${i}`;
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

  const gameReducer = (state: GameState, action: GameAction): GameState => {
    switch (action.type) {
      case 'START_GAME': {
        return createInitialState(state.players.length);
      }

      case 'SELECT_CARD': {
        const allowedPhases = ['TURN_START', 'PLAYER_INPUT', 'OPPONENT_DISCARD', 'HANDLING_SPLIT_7'];
        if (!allowedPhases.includes(state.phase)) return state;

        if (state.phase === 'HANDLING_SPLIT_7' && state.split7State?.firstMoveUsed !== null) {
            return state;
        }

        const player = state.players[state.currentPlayerIndex];
        const card = player.hand.find(c => c.id === action.cardId);
        if (!card) return state;

        if (state.phase === 'OPPONENT_DISCARD') {
           return {
              ...state,
              selectedCardId: action.cardId,
              selectedMarbleId: null,
              possibleMoves: [] 
           };
        }

        if (card.rank === '10' && !player.isBot) {
          return {
            ...state,
            phase: 'DECIDING_10',
            selectedCardId: action.cardId,
            selectedMarbleId: null,
            possibleMoves: [] 
          };
        }

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

        if (card.rank === '7' && !player.isBot) {
           if (state.phase === 'HANDLING_SPLIT_7' && state.selectedCardId === action.cardId) {
               return state;
           }

           return {
             ...state,
             phase: 'HANDLING_SPLIT_7',
             selectedCardId: action.cardId,
             selectedMarbleId: null,
             possibleMoves: [],
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
        
        let moves = state.possibleMoves;
        if (state.phase !== 'HANDLING_SPLIT_7') {
           moves = calculateValidMoves(state, player, card, action.marbleId);
        } else {
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

        const { nextState, events } = executeMove(state, move);
        const player = state.players[state.currentPlayerIndex];
        const card = player.hand.find(c => c.id === state.selectedCardId);

        if (state.phase === 'HANDLING_SPLIT_7' && card?.rank === '7') {
           const stepsTaken = move.stepsUsed || 7;
           const currentSplit = state.split7State || { firstMoveUsed: null, firstMarbleId: null, remainingSteps: 7 };
           
           if (currentSplit.firstMoveUsed === null) {
              const remaining = 7 - stepsTaken;
              
              if (remaining === 0) {
                 // Full 7 used at once, proceed to end turn
              } else {
                 const nextMoves = calculateValidMoves(nextState, player, card, null, remaining);
                 
                 if (nextMoves.length === 0) {
                     // No valid moves for the remaining steps
                 } else {
                     return {
                        ...nextState,
                        players: state.players,
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
        }

        let logMsg = `${player.isBot ? 'CPU' : 'Player'} (${player.color}) played ${card?.rank}`;
        if (events.killedOpponent) logMsg += ' - KILL! (+1 Card)';
        if (events.enteredHome) logMsg += ' - SCORED! (+1 Card)';

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
          split7State: null,
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
             deck = shuffleArray([...deck, ...discard]);
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

  const enhancedGameReducer = (state: GameState, action: GameAction): GameState => {
    if (action.type === 'SELECT_TARGET_NODE') {
       const targetMove = state.possibleMoves.find(m => m.targetPosition === action.nodeId);
       if (targetMove) {
         const nextState = { ...state, possibleMoves: [targetMove] };
         return gameReducer(nextState, { type: 'CONFIRM_MOVE' });
       }
    }
    return gameReducer(state, action);
  };

  return {
    createInitialState,
    gameReducer,
    enhancedGameReducer,
    createDeck,
  };
};

// Export default instance for backward compatibility with client
const defaultGameLogic = createGameLogic();
export const createInitialState = defaultGameLogic.createInitialState;
export const gameReducer = defaultGameLogic.gameReducer;
export const enhancedGameReducer = defaultGameLogic.enhancedGameReducer;
