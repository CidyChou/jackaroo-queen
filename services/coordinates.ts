
import { PlayerColor } from "../types";
import { TOTAL_BOARD_NODES } from "../constants";

export interface Coordinate {
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
}

// Configuration for layout generation
const CENTER_X = 50;
const CENTER_Y = 50;

// Slightly increased track radius (was 35, now 36.5) for better usage of space
const TRACK_RADIUS_X = 36.5; 
const TRACK_RADIUS_Y = 36.5; 

/**
 * Generates the visual coordinates for all board nodes.
 * Mapped by Node ID (e.g., 'node_0', 'base_red_0', 'home_blue_1').
 */
export const generateCoordinates = (): Record<string, Coordinate> => {
  const coords: Record<string, Coordinate> = {};

  // --- 1. Main Circular Track (Nodes 0 to 51) ---
  for (let i = 0; i < TOTAL_BOARD_NODES; i++) {
    const angleDeg = 90 + (i * (360 / TOTAL_BOARD_NODES));
    const rad = (angleDeg * Math.PI) / 180;
    
    coords[`node_${i}`] = {
      x: CENTER_X + TRACK_RADIUS_X * Math.cos(rad),
      y: CENTER_Y + TRACK_RADIUS_Y * Math.sin(rad),
    };
  }

  // --- 2. Home Paths & Bases ---
  const colors: PlayerColor[] = ['red', 'blue', 'yellow', 'green'];
  
  // Configuration per player quadrant
  const playerConfigs: Record<PlayerColor, { angle: number }> = {
    'red': { angle: 90 },
    'blue': { angle: 180 },
    'yellow': { angle: 270 },
    'green': { angle: 0 }
  };

  colors.forEach(color => {
    const config = playerConfigs[color];
    
    // -- Home Path --
    const entranceAngle = config.angle - (360 / TOTAL_BOARD_NODES); 
    const entranceRad = (entranceAngle * Math.PI) / 180;

    for (let h = 1; h <= 4; h++) {
      // Step inwards
      const dist = TRACK_RADIUS_X - (h * 5.5);
      
      coords[`home_${color}_${h}`] = {
        x: CENTER_X + dist * Math.cos(entranceRad),
        y: CENTER_Y + dist * Math.sin(entranceRad)
      };
    }

    // -- Base Slots (ARC ARRANGEMENT) --
    // We arrange them in a curve OUTSIDE the track.
    // Base Radius must be safe enough not to clip (approx 43-44%)
    const baseRadius = TRACK_RADIUS_X + 7.5; // ~44%
    
    // Start the arc slightly "before" the main angle so they line up nicely alongside the track
    // Spacing: 6 degrees per marble
    const arcStartAngle = config.angle + 10; 
    
    for (let m = 0; m < 4; m++) {
      // Calculate angle for this specific marble in the base arc
      const marbleAngle = arcStartAngle + (m * 7); // 7 degrees separation
      const marbleRad = (marbleAngle * Math.PI) / 180;
      
      coords[`base_${color}_${m}`] = {
        x: CENTER_X + baseRadius * Math.cos(marbleRad),
        y: CENTER_Y + baseRadius * Math.sin(marbleRad)
      };
    }
  });

  return coords;
};

export const COORDINATES = generateCoordinates();
