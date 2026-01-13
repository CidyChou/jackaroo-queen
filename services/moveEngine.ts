
import { GameState, Card, Player, Marble, BoardNode, MoveCandidate, PlayerColor, Rank, Suit } from '../types';
import { START_POSITIONS } from '../constants';

// --- Helpers ---

const isRed = (suit: Suit) => suit === 'hearts' || suit === 'diamonds';
const isBlack = (suit: Suit) => suit === 'spades' || suit === 'clubs';

interface TraversalResult {
  path: string[];
  destination: string | null;
  destinationNode: BoardNode | null;
}

export const traversePath = (
  board: Record<string, BoardNode>,
  startNodeId: string,
  steps: number,
  playerColor: PlayerColor,
  isBackward: boolean = false
): TraversalResult => {
  let currentNodeId = startNodeId;
  const path: string[] = [];

  for (let i = 0; i < steps; i++) {
    const currentNode = board[currentNodeId];
    
    // Safety check: if node doesn't exist (e.g. invalid id or 'BASE' passed by mistake), abort
    if (!currentNode) {
      return { path: [], destination: null, destinationNode: null };
    }

    let nextNodeId: string | null = null;

    if (isBackward) {
      nextNodeId = currentNode.prev;
    } else {
      if (currentNode.next.length === 1) {
        nextNodeId = currentNode.next[0];
      } else if (currentNode.next.length > 1) {
        // Home Entrance Check
        const homeBranch = currentNode.next.find(id => id.includes(`home_${playerColor}`));
        const mainBranch = currentNode.next.find(id => !id.includes('home'));
        // In Jackaroo, usually mandatory to enter home if it matches color
        nextNodeId = homeBranch || mainBranch || null;
      }
    }

    if (!nextNodeId) break;
    path.push(nextNodeId);
    currentNodeId = nextNodeId;
  }

  const validEnd = path.length === steps;

  return {
    path,
    destination: validEnd ? currentNodeId : null,
    destinationNode: validEnd ? board[currentNodeId] : null
  };
};

// --- Calculate Valid Moves ---

export const calculateValidMoves = (
  gameState: GameState,
  player: Player,
  card: Card,
  selectedMarbleId?: string | null,
  stepsOverride?: number // NEW: Allow forcing step count (for Card 7)
): MoveCandidate[] => {
  const moves: MoveCandidate[] = [];
  
  // --- 1. SPECIAL: FORCE DISCARD (Red Q or 10) ---
  // These cards can trigger an attack without selecting a marble.
  if ((card.rank === 'Q' && isRed(card.suit)) || card.rank === '10') {
      moves.push({
          type: 'force_discard',
          cardId: card.id,
          isValid: true,
          // No marble needed for the attack part
      });
  }

  // Determine which marbles to check
  let candidateMarbles: Marble[] = [];

  // Card 5 Rule: Move ANY marble on the board (except Base/Home/Safe usually?)
  // Standard Rules: 5 moves ANY marble on the track.
  if (card.rank === '5') {
     candidateMarbles = Object.values(gameState.marbles).filter(m => m.position !== 'BASE' && m.position !== 'HOME');
  } else if (selectedMarbleId) {
     const m = gameState.marbles[selectedMarbleId];
     if (m) candidateMarbles = [m];
  } else {
     candidateMarbles = player.marbles.map(id => gameState.marbles[id]);
  }

  candidateMarbles.forEach(marble => {
    // --- 2. BASE EXIT Logic (A, 2, K) ---
    // Modified: Ensure we don't fall through to standard moves if in BASE
    if (marble.position === 'BASE') {
      if (!stepsOverride) {
        // Must be own marble to exit base (cannot pull opponent out)
        if (marble.ownerId === player.id) {
            const canExit = card.rank === 'A' || card.rank === 'K' || card.rank === '2';
            
            if (canExit) {
              const startNodeId = `node_${START_POSITIONS[player.color]}`;
              const occupant = Object.values(gameState.marbles).find(m => m.position === startNodeId);
              
              // Cannot exit if own marble is there
              if (!(occupant && occupant.ownerId === player.id)) {
                  moves.push({
                    type: 'base_exit',
                    cardId: card.id,
                    marbleId: marble.id,
                    targetPosition: startNodeId,
                    killedMarbleIds: occupant && occupant.ownerId !== player.id ? [occupant.id] : [],
                    isValid: true,
                    stepsUsed: 0
                  });
              }
            }
        }
      }
      return; // Cannot do other moves from Base (Card 7 or others)
    }

    if (marble.position === 'HOME') return; 

    // --- 3. SWAP Logic (Black J) ---
    if (card.rank === 'J' && isBlack(card.suit) && !stepsOverride) {
       // Only own marbles can initiate swap? usually yes.
       if (marble.ownerId !== player.id) return;

       const targets = Object.values(gameState.marbles).filter(target => 
          target.ownerId !== player.id && // Opponent
          target.position !== 'BASE' && 
          target.position !== 'HOME' &&
          !target.isSafe // Not in safety
       );

       targets.forEach(target => {
        moves.push({
          type: 'swap',
          cardId: card.id,
          marbleId: marble.id,
          swapTargetMarbleId: target.id,
          targetPosition: target.position as string,
          isValid: true,
          stepsUsed: 0
        });
       });
       return; 
    }

    // --- 4. STANDARD MOVEMENT ---
    let steps = 0;
    let isBackward = false;
    let isKillPath = false;

    // Rank Logic Map
    switch (card.rank) {
      case 'A': steps = 1; break; // A is 1 or Base
      case '2': steps = 2; break; // 2 is 2 or Base
      case '3': steps = 3; break;
      case '4': steps = 4; isBackward = true; break;
      case '5': steps = 5; break; // Moves any (handled by candidate selection)
      case '6': steps = 6; break;
      case '7': 
         if (stepsOverride) steps = stepsOverride;
         else steps = 7; // Default for bot or fallback
         break;
      case '8': steps = 8; break;
      case '9': steps = 9; break;
      case '10': steps = 10; break; // Also Force Discard (handled above)
      case 'J': // Red J is 11
        if (isRed(card.suit)) steps = 11;
        else return; // Black J is Swap
        break;
      case 'Q': // Black Q is 12
        if (isBlack(card.suit)) steps = 12;
        else return; // Red Q is Force Discard (handled above)
        break;
      case 'K': steps = 13; isKillPath = true; break;
    }

    if (steps === 0) return;

    // Calculate Path
    const result = traversePath(gameState.board, marble.position as string, steps, marble.color, isBackward);
    
    if (result.destination) {
       // Landing Validation
       const occupant = Object.values(gameState.marbles).find(m => m.position === result.destination);
       
       // Cannot land on SELF
       if (occupant && occupant.ownerId === marble.ownerId) return;

       // Calculate Kills
       const kills: string[] = [];
       if (occupant) kills.push(occupant.id);

       // King Kill Path (Kills everything in the way except safe)
       if (isKillPath) {
          result.path.forEach(nodeId => {
            const pathOccupant = Object.values(gameState.marbles).find(m => m.position === nodeId);
            if (pathOccupant && pathOccupant.id !== marble.id && !pathOccupant.isSafe) {
               // Usually King kills OWN marbles too on path? Let's say yes for chaos, or NO for safety.
               // Rule: King kills everything in path.
               if (!kills.includes(pathOccupant.id)) kills.push(pathOccupant.id);
            }
          });
       }

       moves.push({
         type: isKillPath ? 'kill_path' : 'standard',
         cardId: card.id,
         marbleId: marble.id,
         targetPosition: result.destination,
         killedMarbleIds: kills,
         isValid: true,
         stepsUsed: steps
       });
    }
  });

  return moves;
};

// --- Execute Move ---

interface ExecutionResult {
  nextState: GameState;
  events: {
    killedOpponent: boolean;
    enteredHome: boolean;
  }
}

export const executeMove = (
  gameState: GameState,
  move: MoveCandidate
): ExecutionResult => {
  const newMarbles = { ...gameState.marbles };
  let killedOpponent = false;
  let enteredHome = false;

  // 1. Handle Force Discard (No board change yet, handled in reducer)
  if (move.type === 'force_discard') {
     return { nextState: gameState, events: { killedOpponent: false, enteredHome: false }};
  }

  // 2. Handle Kills
  if (move.killedMarbleIds && move.killedMarbleIds.length > 0) {
    move.killedMarbleIds.forEach(killId => {
       const deadMarble = newMarbles[killId];
       if (deadMarble) {
         // Check if it was an opponent
         const mover = newMarbles[move.marbleId!];
         if (mover && deadMarble.ownerId !== mover.ownerId) {
            killedOpponent = true;
         }

         newMarbles[killId] = {
           ...deadMarble,
           position: 'BASE',
           isSafe: true
         };
       }
    });
  }

  // 3. Handle Swap
  if (move.type === 'swap' && move.swapTargetMarbleId && move.targetPosition) {
    const sourceMarble = newMarbles[move.marbleId!];
    const targetMarble = newMarbles[move.swapTargetMarbleId];
    
    const sourcePos = sourceMarble.position;
    
    newMarbles[sourceMarble.id] = { ...sourceMarble, position: targetMarble.position, isSafe: targetMarble.isSafe };
    newMarbles[targetMarble.id] = { ...targetMarble, position: sourcePos, isSafe: sourceMarble.isSafe };
    
    // No home entry on swap usually
    return { 
        nextState: { ...gameState, marbles: newMarbles }, 
        events: { killedOpponent: false, enteredHome: false } 
    };
  }

  // 4. Standard Movement
  if (move.targetPosition && move.marbleId) {
    const marble = newMarbles[move.marbleId];
    
    // Check Home Entry
    const isHome = move.targetPosition.includes('home') && gameState.board[move.targetPosition].type === 'home';
    const isSafe = gameState.board[move.targetPosition].isSafe;

    if (isHome) enteredHome = true;

    newMarbles[move.marbleId] = {
      ...marble,
      position: isHome ? 'HOME' : move.targetPosition,
      isSafe: isSafe || isHome
    };
  }

  return { 
      nextState: { ...gameState, marbles: newMarbles }, 
      events: { killedOpponent, enteredHome } 
  };
};
