
import { GameState, Player, MoveCandidate, Card } from "../types";
import { calculateValidMoves } from "./moveEngine";

interface BotDecision {
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
    // Burn logic: discard lowest rank or non-power card?
    // Simple: discard first card.
    return {
      action: 'BURN',
      cardId: botPlayer.hand[0]?.id || ''
    };
  }

  // 3. Score Moves
  const scoredMoves = allMoves.map(item => {
    return {
      ...item,
      score: evaluateMove(item.move, gameState)
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
 * Heuristic Scoring Function
 */
const evaluateMove = (move: MoveCandidate, gameState: GameState): number => {
  let score = 0;

  // PRIORITY 1: KILLING OPPONENTS
  if (move.killedMarbleIds && move.killedMarbleIds.length > 0) {
    score += 100 * move.killedMarbleIds.length;
  }

  // PRIORITY 2: EXITING BASE
  // Important early game
  if (move.type === 'base_exit') {
    score += 60;
  }

  // PRIORITY 3: ENTERING HOME / FINISHING
  if (move.targetPosition?.includes('home')) {
    const node = gameState.board[move.targetPosition];
    if (node.type === 'home') {
      score += 80; // Finishing is great
    } else {
      score += 40; // Safe zone is good
    }
  }

  // PRIORITY 4: DISTANCE / ADVANCING
  // We want to move forward generally
  // Simple heuristic: rank value
  // A bit complex to calculate actual distance on board without more lookups,
  // but we can look at the card used.
  if (move.type === 'standard') {
    score += 5; // Base value for moving
  }

  // PRIORITY 5: SAFETY (Avoid landing on unsafe spots if possible?)
  // Too complex for simple bot right now.

  return score;
};
