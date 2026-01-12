import { BoardNode, PlayerColor } from "../types";
import { TOTAL_BOARD_NODES, PLAYER_COLORS, START_POSITIONS, HOME_PATH_LENGTH } from "../constants";

export const generateBoard = (): Record<string, BoardNode> => {
  const nodes: Record<string, BoardNode> = {};

  // 1. Create Main Circular Track
  for (let i = 0; i < TOTAL_BOARD_NODES; i++) {
    const id = `node_${i}`;
    const nextId = `node_${(i + 1) % TOTAL_BOARD_NODES}`;
    // Prev logic for 4 backwards: simple reverse on circle
    const prevId = `node_${(i - 1 + TOTAL_BOARD_NODES) % TOTAL_BOARD_NODES}`;

    nodes[id] = {
      id,
      type: 'normal',
      next: [nextId],
      prev: prevId,
      isSafe: false,
    };
  }

  // 2. Assign Start Positions & Safety
  PLAYER_COLORS.forEach((color) => {
    const startIdx = START_POSITIONS[color];
    const startNodeId = `node_${startIdx}`;
    
    if (nodes[startNodeId]) {
      nodes[startNodeId].type = 'start';
      nodes[startNodeId].isStartFor = color;
      nodes[startNodeId].isSafe = true; // Usually start is safe in some variants, assuming yes for now
    }
    
    // 3. Create Home Paths
    // The entrance to home is usually the node BEFORE the start node in the circle
    const entranceIndex = (startIdx - 1 + TOTAL_BOARD_NODES) % TOTAL_BOARD_NODES;
    const entranceNodeId = `node_${entranceIndex}`;
    
    // Mark entrance
    nodes[entranceNodeId].type = 'home_entrance';
    nodes[entranceNodeId].isHomeEntranceFor = color;

    // Create the safe path nodes off the main track
    let prevPathNodeId = entranceNodeId;
    
    for (let h = 1; h <= HOME_PATH_LENGTH; h++) {
      const homeNodeId = `home_${color}_${h}`;
      
      nodes[homeNodeId] = {
        id: homeNodeId,
        type: h === HOME_PATH_LENGTH ? 'home' : 'home_path',
        next: [], // Last node has no next
        prev: prevPathNodeId,
        isSafe: true,
      };

      // Link previous node to this one
      // If it's the entrance node (on main track), it now has a branch
      nodes[prevPathNodeId].next.push(homeNodeId);
      
      prevPathNodeId = homeNodeId;
    }
  });

  return nodes;
};

// Helper to calculate moves
export const getReachableNodes = (
  board: Record<string, BoardNode>,
  startNodeId: string,
  steps: number,
  playerColor: PlayerColor,
  isMovingBackwards: boolean = false
): string[] => {
  // Simple BFS/Traversal for exact steps
  // This needs to handle the branching into HOME only for the matching playerColor
  
  if (steps === 0) return [startNodeId];

  const queue: { id: string; stepsRemaining: number }[] = [{ id: startNodeId, stepsRemaining: steps }];
  const reachable: string[] = [];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) continue;

    const node = board[current.id];

    if (current.stepsRemaining === 0) {
      reachable.push(current.id);
      continue;
    }

    if (isMovingBackwards) {
       // Backwards usually ignores home entrances and just loops the main track
       // Or usually 4 backwards is only on main track?
       // Simplification: Can move backwards to prev node
       if (node.prev) {
          queue.push({ id: node.prev, stepsRemaining: current.stepsRemaining - 1 });
       }
    } else {
      // Forward
      node.next.forEach(nextId => {
        // Logic: Can only enter home path if it matches player color
        const nextNode = board[nextId];
        
        const isHomePath = nextNode.id.startsWith('home');
        
        if (isHomePath) {
           // check ownership
           if (nextNode.id.includes(playerColor)) {
             queue.push({ id: nextId, stepsRemaining: current.stepsRemaining - 1 });
           }
        } else {
           // Main track is always okay
           queue.push({ id: nextId, stepsRemaining: current.stepsRemaining - 1 });
        }
      });
    }
  }

  // Deduplicate
  return Array.from(new Set(reachable));
};
