import { GameState, Card, Player, Marble, BoardNode, MoveCandidate, PlayerColor, Suit } from './types.js';
import { START_POSITIONS } from './constants.js';

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
        const homeBranch = currentNode.next.find(id => id.includes(`home_${playerColor}`));
        const mainBranch = currentNode.next.find(id => !id.includes('home'));
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
  stepsOverride?: number
): MoveCandidate[] => {
  const moves: MoveCandidate[] = [];
  
  // --- 1. SPECIAL: FORCE DISCARD (Red Q or 10) ---
  if ((card.rank === 'Q' && isRed(card.suit)) || card.rank === '10') {
      moves.push({
          type: 'force_discard',
          cardId: card.id,
          isValid: true,
      });
  }

  // Determine which marbles to check
  let candidateMarbles: Marble[] = [];

  if (card.rank === '5') {
     candidateMarbles = Object.values(gameState.marbles).filter(m => m.position !== 'BASE' && m.position !== 'HOME');
  } else if (selectedMarbleId) {
     const m = gameState.marbles[selectedMarbleId];
     if (m) candidateMarbles = [m];
  } else {
     // Filter out undefined values in case of state sync issues
     candidateMarbles = player.marbles
       .map(id => gameState.marbles[id])
       .filter((m): m is Marble => m !== undefined);
  }

  candidateMarbles.forEach(marble => {
    // --- 2. BASE EXIT Logic (A, 2, K) ---
    if (marble.position === 'BASE') {
      if (!stepsOverride) {
        if (marble.ownerId === player.id) {
            const canExit = card.rank === 'A' || card.rank === 'K' || card.rank === '2';
            
            if (canExit) {
              const startNodeId = `node_${START_POSITIONS[player.color]}`;
              const occupant = Object.values(gameState.marbles).find(m => m.position === startNodeId);
              
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
      return;
    }

    if (marble.position === 'HOME') return; 

    // --- 3. SWAP Logic (Black J) ---
    if (card.rank === 'J' && isBlack(card.suit) && !stepsOverride) {
       if (marble.ownerId !== player.id) return;

       const targets = Object.values(gameState.marbles).filter(target => {
          if (target.ownerId === player.id) return false;
          if (target.position === 'BASE' || target.position === 'HOME') return false;
          // Check if the NODE is safe, not the marble's isSafe property
          const nodeIsSafe = gameState.board[target.position as string]?.isSafe ?? false;
          return !nodeIsSafe;
       });

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

    switch (card.rank) {
      case 'A': steps = 1; break;
      case '2': steps = 2; break;
      case '3': steps = 3; break;
      case '4': steps = 4; isBackward = true; break;
      case '5': steps = 5; break;
      case '6': steps = 6; break;
      case '7': 
         if (stepsOverride) steps = stepsOverride;
         else steps = 7;
         break;
      case '8': steps = 8; break;
      case '9': steps = 9; break;
      case '10': steps = 10; break;
      case 'J':
        if (isRed(card.suit)) steps = 11;
        else return;
        break;
      case 'Q':
        if (isBlack(card.suit)) steps = 12;
        else return;
        break;
      case 'K': steps = 13; isKillPath = true; break;
    }

    if (steps === 0) return;

    const result = traversePath(gameState.board, marble.position as string, steps, marble.color, isBackward);
    
    if (result.destination) {
       const occupant = Object.values(gameState.marbles).find(m => m.position === result.destination);
       
       if (occupant && occupant.ownerId === marble.ownerId) return;

       const kills: string[] = [];
       if (occupant) kills.push(occupant.id);

       if (isKillPath) {
          result.path.forEach(nodeId => {
            const pathOccupant = Object.values(gameState.marbles).find(m => m.position === nodeId);
            // Check if the NODE is safe, not the marble's isSafe property
            // A marble on a safe node (start position, home path) cannot be killed
            const nodeIsSafe = gameState.board[nodeId]?.isSafe ?? false;
            if (pathOccupant && pathOccupant.id !== marble.id && !nodeIsSafe) {
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
    const targetPos = targetMarble.position;
    const sourceSafe = sourceMarble.isSafe;
    const targetSafe = targetMarble.isSafe;

    newMarbles[sourceMarble.id] = { ...sourceMarble, position: targetPos, isSafe: targetSafe };
    newMarbles[targetMarble.id] = { ...targetMarble, position: sourcePos, isSafe: sourceSafe };
    
    return { 
        nextState: { ...gameState, marbles: newMarbles }, 
        events: { killedOpponent: false, enteredHome: false } 
    };
  }

  // 4. Standard Movement
  if (move.targetPosition && move.marbleId) {
    const marble = newMarbles[move.marbleId];
    
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
