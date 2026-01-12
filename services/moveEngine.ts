
import { GameState, Card, Player, Marble, BoardNode, MoveCandidate, PlayerColor, Rank } from '../types';
import { START_POSITIONS } from '../constants';

// --- 1. Pathfinding Helper ---

interface TraversalResult {
  path: string[];
  destination: string | null;
  destinationNode: BoardNode | null;
}

/**
 * Traverses the board graph from a start node.
 * Handles:
 * - Circular track
 * - Forking into Home Path (if color matches)
 * - Backwards movement
 */
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
    let nextNodeId: string | null = null;

    if (isBackward) {
      // Backwards movement (Card 4)
      // Usually backwards doesn't enter home, it loops the main track
      nextNodeId = currentNode.prev;
    } else {
      // Forward movement
      if (currentNode.next.length === 1) {
        nextNodeId = currentNode.next[0];
      } else if (currentNode.next.length > 1) {
        // We are at a junction (Home Entrance)
        // Check which branch belongs to this player
        const homeBranch = currentNode.next.find(id => id.includes(`home_${playerColor}`));
        const mainBranch = currentNode.next.find(id => !id.includes('home'));
        
        // If it's MY home entrance, go in. Otherwise stay on track.
        // NOTE: In Jackaroo, you usually MUST enter home if you can.
        if (homeBranch) {
          nextNodeId = homeBranch;
        } else {
          nextNodeId = mainBranch || null;
        }
      }
    }

    if (!nextNodeId) break; // Dead end (shouldn't happen on main track)
    
    path.push(nextNodeId);
    currentNodeId = nextNodeId;
  }

  // If we couldn't complete the full steps (e.g., overshoot home end?), destination is null
  // Logic: In Jackaroo, usually you must have exact steps to hit last spot, or you bounce?
  // Let's assume: If you run out of path (end of home), move is invalid.
  const validEnd = path.length === steps;

  return {
    path,
    destination: validEnd ? currentNodeId : null,
    destinationNode: validEnd ? board[currentNodeId] : null
  };
};

// --- 2. Calculate Valid Moves ---

export const calculateValidMoves = (
  gameState: GameState,
  player: Player,
  card: Card,
  selectedMarbleId?: string | null
): MoveCandidate[] => {
  const moves: MoveCandidate[] = [];
  
  // If a marble is selected, check only that one. If not, check all player's marbles.
  // Exception: Card 5 (Move ANY marble) - checks all marbles on board.
  // Exception: Jack (Swap) - checks player's marble for swap source.
  
  let candidateMarbles: Marble[] = [];

  if (card.rank === '5') {
     // 5 moves ANY marble
     candidateMarbles = Object.values(gameState.marbles).filter(m => m.position !== 'BASE' && m.position !== 'HOME');
  } else if (selectedMarbleId) {
     const m = gameState.marbles[selectedMarbleId];
     if (m) candidateMarbles = [m];
  } else {
     candidateMarbles = player.marbles.map(id => gameState.marbles[id]);
  }

  candidateMarbles.forEach(marble => {
    // A/K: Base Exit
    if (marble.position === 'BASE') {
      if (card.rank === 'A' || card.rank === 'K') {
        const startNodeId = `node_${START_POSITIONS[player.color]}`;
        const occupant = Object.values(gameState.marbles).find(m => m.position === startNodeId);
        
        // Cannot exit if own marble is there (no stacking)
        if (occupant && occupant.ownerId === player.id) return;

        moves.push({
          type: 'base_exit',
          cardId: card.id,
          marbleId: marble.id,
          targetPosition: startNodeId,
          killedMarbleIds: occupant && occupant.ownerId !== player.id ? [occupant.id] : [],
          isValid: true
        });
      }
      return; // Can't do normal moves from base
    }

    if (marble.position === 'HOME') return; // Finished

    // Jack: Swap
    if (card.rank === 'J') {
      // Logic: Swap this marble with any other marble on board (not safe)
      // Check all other marbles
      const targets = Object.values(gameState.marbles).filter(target => 
        target.id !== marble.id && 
        target.position !== 'BASE' && 
        target.position !== 'HOME' &&
        !target.isSafe // Cannot swap with safe marbles (in home path or base)
      );

      targets.forEach(target => {
        moves.push({
          type: 'swap',
          cardId: card.id,
          marbleId: marble.id,
          swapTargetMarbleId: target.id,
          targetPosition: target.position as string,
          isValid: true
        });
      });
      return;
    }

    // Standard Steps
    let steps = 0;
    let isBackward = false;
    let isKillPath = false;

    switch (card.rank) {
      case '4': steps = 4; isBackward = true; break;
      case 'Q': steps = 12; break;
      case 'K': steps = 13; isKillPath = true; break; // King Special Move
      case 'A': steps = 1; break; // Ace can be 1 or 11
      case '7': return; // handled by split state logic, not simple calculation here
      default: steps = parseInt(card.rank) || 0;
    }
    
    // Check A (1 or 11) - we add both options
    const possibleSteps = (card.rank === 'A') ? [1, 11] : [steps];

    possibleSteps.forEach(s => {
       if (s === 0) return;

       const result = traversePath(gameState.board, marble.position as string, s, marble.color, isBackward);
       
       if (result.destination) {
          // Validation: Landing
          const occupant = Object.values(gameState.marbles).find(m => m.position === result.destination);
          
          // Cannot land on self
          if (occupant && occupant.ownerId === player.id) return;

          const kills: string[] = [];
          if (occupant) kills.push(occupant.id);

          // King Kill Path Logic
          if (isKillPath) {
             // Identify marbles on the path
             result.path.forEach(nodeId => {
               const pathOccupant = Object.values(gameState.marbles).find(m => m.position === nodeId);
               if (pathOccupant && pathOccupant.id !== marble.id && !pathOccupant.isSafe) {
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
            isValid: true
          });
       }
    });
  });

  return moves;
};

// --- 3. Execute Move ---

export const executeMove = (
  gameState: GameState,
  move: MoveCandidate
): GameState => {
  const newMarbles = { ...gameState.marbles };
  
  // 1. Handle Kills (Send to Base)
  if (move.killedMarbleIds) {
    move.killedMarbleIds.forEach(killId => {
      if (newMarbles[killId]) {
        newMarbles[killId] = {
          ...newMarbles[killId],
          position: 'BASE',
          isSafe: true
        };
      }
    });
  }

  // 2. Handle Swap
  if (move.type === 'swap' && move.swapTargetMarbleId && move.targetPosition) {
    const sourceMarble = newMarbles[move.marbleId];
    const targetMarble = newMarbles[move.swapTargetMarbleId];
    
    const sourcePos = sourceMarble.position;
    
    // Swap positions
    newMarbles[sourceMarble.id] = { ...sourceMarble, position: targetMarble.position, isSafe: targetMarble.isSafe };
    newMarbles[targetMarble.id] = { ...targetMarble, position: sourcePos, isSafe: sourceMarble.isSafe };
    
    return { ...gameState, marbles: newMarbles };
  }

  // 3. Standard/Base/KillPath Movement
  if (move.targetPosition) {
    const marble = newMarbles[move.marbleId];
    
    // Check if entered Home Final
    const isHome = move.targetPosition.includes('home') && gameState.board[move.targetPosition].type === 'home';
    const isSafe = gameState.board[move.targetPosition].isSafe;

    newMarbles[move.marbleId] = {
      ...marble,
      position: isHome ? 'HOME' : move.targetPosition, // Map final node to generic HOME state if needed, or keep node id
      isSafe: isSafe || isHome
    };
  }

  return {
    ...gameState,
    marbles: newMarbles
  };
};
