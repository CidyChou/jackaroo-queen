import { BoardNode, PlayerColor } from "./types.js";
import { TOTAL_BOARD_NODES, PLAYER_COLORS, START_POSITIONS, HOME_PATH_LENGTH } from "./constants.js";

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
      nodes[startNodeId].isSafe = true;
    }
    
    // 3. Create Home Paths
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
        next: [],
        prev: prevPathNodeId,
        isSafe: true,
      };

      // Link previous node to this one
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
       if (node.prev) {
          queue.push({ id: node.prev, stepsRemaining: current.stepsRemaining - 1 });
       }
    } else {
      // Forward
      node.next.forEach(nextId => {
        const nextNode = board[nextId];
        
        const isHomePath = nextNode.id.startsWith('home');
        
        if (isHomePath) {
           if (nextNode.id.includes(playerColor)) {
             queue.push({ id: nextId, stepsRemaining: current.stepsRemaining - 1 });
           }
        } else {
           queue.push({ id: nextId, stepsRemaining: current.stepsRemaining - 1 });
        }
      });
    }
  }

  // Deduplicate
  return Array.from(new Set(reachable));
};
