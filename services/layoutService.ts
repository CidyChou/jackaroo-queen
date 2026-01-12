
import { PlayerColor } from "../types";
import { TOTAL_BOARD_NODES, START_POSITIONS } from "../constants";

export interface Coordinate {
  x: number;
  y: number;
}

// Configuration for layout generation
const RADIUS_X = 42; // % of width
const RADIUS_Y = 42; // % of height
const CENTER_X = 50;
const CENTER_Y = 50;

// Helper to rotate point around center
const rotate = (x: number, y: number, angleDeg: number): Coordinate => {
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const nx = (cos * (x - CENTER_X)) + (sin * (y - CENTER_Y)) + CENTER_X;
  const ny = (cos * (y - CENTER_Y)) - (sin * (x - CENTER_X)) + CENTER_Y;
  return { x: nx, y: ny };
};

export const getNodeCoordinates = (): Record<string, Coordinate> => {
  const coords: Record<string, Coordinate> = {};

  // 1. Main Circular Track (52 nodes)
  // We want Red (Index 0) to be at bottom-right or bottom.
  // Let's place Index 0 at Angle 90 (Bottom).
  for (let i = 0; i < TOTAL_BOARD_NODES; i++) {
    const angle = 90 + (i * (360 / TOTAL_BOARD_NODES));
    const rad = (angle * Math.PI) / 180;
    
    coords[`node_${i}`] = {
      x: CENTER_X + RADIUS_X * Math.cos(rad),
      y: CENTER_Y + RADIUS_Y * Math.sin(rad),
    };
  }

  // 2. Home Paths (Radiating inwards)
  const colors: PlayerColor[] = ['red', 'blue', 'yellow', 'green'];
  
  colors.forEach(color => {
    // Determine the angle for this player's section
    // Red starts at 0 -> Angle 90.
    // Blue starts at 13 -> Angle 180.
    // Yellow starts at 26 -> Angle 270.
    // Green starts at 39 -> Angle 0/360.
    
    // The home entrance is at start_index - 1.
    // Red Start 0. Entrance 51.
    // We want the home path to go from the entrance towards the center.
    
    // Approximate angle for the player's "Quadrant"
    let baseAngle = 0;
    if (color === 'red') baseAngle = 90;
    if (color === 'blue') baseAngle = 180;
    if (color === 'yellow') baseAngle = 270;
    if (color === 'green') baseAngle = 0; // or 360

    // Adjust slightly so it aligns with the entrance node
    // Entrance node is roughly at baseAngle - (360/52).
    const entranceAngle = baseAngle - (360 / TOTAL_BOARD_NODES); 

    for (let h = 1; h <= 4; h++) {
      // Move inward from radius
      const step = 6; // % distance per step
      const currentRadius = RADIUS_X - (h * step);
      
      const rad = (entranceAngle * Math.PI) / 180;
      
      coords[`home_${color}_${h}`] = {
        x: CENTER_X + currentRadius * Math.cos(rad),
        y: CENTER_Y + currentRadius * Math.sin(rad),
      };
    }

    // 3. Bases (Clusters outside the ring)
    // Place them further out than radius, near the start position angle
    const baseRadius = RADIUS_X + 8; // Outside ring
    // Slightly offset angle to be "before" start
    const baseCenterAngle = baseAngle + 10; 
    const baseRad = (baseCenterAngle * Math.PI) / 180;
    
    const bx = CENTER_X + baseRadius * Math.cos(baseRad);
    const by = CENTER_Y + baseRadius * Math.sin(baseRad);

    // Create 4 slots in a square around this point
    const offsets = [
      { dx: -2, dy: -2 }, { dx: 2, dy: -2 },
      { dx: -2, dy: 2 }, { dx: 2, dy: 2 }
    ];

    for (let m = 0; m < 4; m++) {
      // We map base slots using the Marble ID format usually, or a special base id
      // Since marbles are "in base", we need coordinates for where they sit.
      // Let's use a convention `base_color_index`
      coords[`base_${color}_${m}`] = {
        x: bx + offsets[m].dx,
        y: by + offsets[m].dy
      };
    }
  });

  return coords;
};

// Map for quick marble color styling
export const MARBLE_COLORS: Record<PlayerColor, string> = {
  red: 'bg-red-600 border-red-800',
  blue: 'bg-blue-600 border-blue-800',
  yellow: 'bg-yellow-400 border-yellow-600',
  green: 'bg-green-600 border-green-800'
};
