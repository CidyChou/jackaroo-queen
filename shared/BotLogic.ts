/**
 * BotLogic - AI decision making for automatic play
 * Shared between client (local game) and server (auto-mode)
 */

import { GameState, Player, MoveCandidate, Card } from './types.js';
import { calculateValidMoves } from './moveEngine.js';
import { TOTAL_BOARD_NODES, START_POSITIONS } from './constants.js';

export interface BotDecision {
  action: 'MOVE' | 'BURN';
  cardId: string;
  move?: MoveCandidate;
}

/**
 * Evaluates the board and returns the best move for the bot.
 */
export const getBestMove = (gameState: GameState, botPlayer: Player): BotDecision => {
  const allMoves: { card: Card, move: MoveCandidate }[] = [];

  // 1. Calculate ALL valid moves for ALL cards in hand
  botPlayer.hand.forEach(card => {
    // We pass null for marbleId to get moves for ALL marbles for this card
    const movesForCard = calculateValidMoves(gameState, botPlayer, card, null);
    movesForCard.forEach(move => {
      if (move.isValid) {
        allMoves.push({ card, move });
      }
    });
  });

  // 2. If no moves, Burn a card
  if (allMoves.length === 0) {
    // Burn logic: discard lowest rank or non-power card
    // Prefer burning non-special cards if possible
    const sortedHand = [...botPlayer.hand].sort((a, b) => a.value - b.value);
    return {
      action: 'BURN',
      cardId: sortedHand[0]?.id || ''
    };
  }

  // 3. Score Moves
  const scoredMoves = allMoves.map(item => {
    return {
      ...item,
      score: evaluateMove(item.move, gameState, botPlayer)
    };
  });

  // 4. Sort by score descending
  scoredMoves.sort((a, b) => b.score - a.score);

  // 5. Pick the winner
  const best = scoredMoves[0];

  return {
    action: 'MOVE',
    cardId: best.card.id,
    move: best.move
  };
};

/**
 * Estimate progress of a marble (0 to 100 roughly)
 * Simple heuristic based on node index relative to start.
 */
const getProgress = (position: string, color: string): number => {
  if (position === 'BASE') return 0;
  if (position === 'HOME') return 100;
  if (position.includes('home_path')) return 95; // In home path
  if (position.includes('home_')) return 90; // Just entered home
  
  if (position.startsWith('node_')) {
     const idx = parseInt(position.split('_')[1]);
     const start = START_POSITIONS[color as keyof typeof START_POSITIONS];
     
     // Calculate distance from start
     let dist = (idx - start + TOTAL_BOARD_NODES) % TOTAL_BOARD_NODES;
     return (dist / TOTAL_BOARD_NODES) * 90; // 0 to 90
  }
  return 0;
};

/**
 * Heuristic Scoring Function
 */
const evaluateMove = (move: MoveCandidate, gameState: GameState, player: Player): number => {
  let score = 0;

  // PRIORITY 1: ATTACKING (Force Discard)
  // High priority to disrupt opponent
  if (move.type === 'force_discard') {
    score += 70;
  }

  // PRIORITY 2: KILLING OPPONENTS
  if (move.killedMarbleIds && move.killedMarbleIds.length > 0) {
    score += 100 * move.killedMarbleIds.length;
  }

  // PRIORITY 3: SWAPPING (Black Jack)
  if (move.type === 'swap' && move.swapTargetMarbleId && move.marbleId) {
     const myMarble = gameState.marbles[move.marbleId];
     const theirMarble = gameState.marbles[move.swapTargetMarbleId];
     
     if (myMarble && theirMarble) {
        const myProg = getProgress(myMarble.position, myMarble.color);
        const theirProg = getProgress(theirMarble.position, theirMarble.color);
        
        // Huge bonus if I am behind and they are ahead
        const benefit = theirProg - myProg;
        
        if (benefit > 0) {
           score += 50 + benefit; // Base 50 + delta
        } else {
           score -= 50; // Don't swap if it hurts me
        }
     }
  }

  // PRIORITY 4: EXITING BASE
  // Important early game
  if (move.type === 'base_exit') {
    score += 60;
  }

  // PRIORITY 5: ENTERING HOME / FINISHING
  if (move.targetPosition?.includes('home')) {
    const node = gameState.board[move.targetPosition];
    if (node?.type === 'home') {
      score += 150; // Finishing is top priority
    } else {
      score += 40; // Safe zone is good
    }
  }

  // PRIORITY 6: DISTANCE / ADVANCING
  if (move.type === 'standard') {
    score += 5; 
    // Add bonus for moving 11 (Red J) or 13 (K) if it covers distance
    if (move.stepsUsed && move.stepsUsed > 10) score += 5;
  }

  return score;
};

/**
 * Execute auto-play for a player in trusteeship mode
 * Returns the sequence of actions to perform
 */
export interface AutoPlayAction {
  type: 'SELECT_CARD' | 'SELECT_MARBLE' | 'SELECT_TARGET_NODE' | 'CONFIRM_MOVE' | 'BURN_CARD';
  cardId?: string;
  marbleId?: string;
  nodeId?: string;
}

export const getAutoPlayActions = (gameState: GameState, playerIndex: number): AutoPlayAction[] => {
  const player = gameState.players[playerIndex];
  if (!player || player.hand.length === 0) {
    return [];
  }

  const actions: AutoPlayAction[] = [];

  // Handle OPPONENT_DISCARD phase - just burn a random card
  if (gameState.phase === 'OPPONENT_DISCARD') {
    const randomCard = player.hand[Math.floor(Math.random() * player.hand.length)];
    actions.push({ type: 'SELECT_CARD', cardId: randomCard.id });
    actions.push({ type: 'BURN_CARD' });
    return actions;
  }

  // Normal turn - use bot decision logic
  const decision = getBestMove(gameState, player);

  if (decision.action === 'BURN') {
    actions.push({ type: 'SELECT_CARD', cardId: decision.cardId });
    actions.push({ type: 'BURN_CARD' });
  } else if (decision.action === 'MOVE' && decision.move) {
    actions.push({ type: 'SELECT_CARD', cardId: decision.cardId });
    
    if (decision.move.type === 'force_discard') {
      actions.push({ type: 'CONFIRM_MOVE' });
    } else {
      // Standard Move or Swap
      if (decision.move.marbleId) {
        actions.push({ type: 'SELECT_MARBLE', marbleId: decision.move.marbleId });
      }
      
      if (decision.move.targetPosition) {
        actions.push({ type: 'SELECT_TARGET_NODE', nodeId: decision.move.targetPosition });
      } else {
        actions.push({ type: 'CONFIRM_MOVE' });
      }
    }
  }

  return actions;
};
