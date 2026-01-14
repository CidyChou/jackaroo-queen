/**
 * Unit Tests for OnlineGame Component
 * Requirements: 5.1, 5.3, 5.4, 6.1, 6.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import type { GameState, Player, Card, Marble, BoardNode } from '@shared/types';

// Mock moveEngine before importing OnlineGame
vi.mock('../services/moveEngine', () => ({
  calculateValidMoves: vi.fn(() => []),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock child components
vi.mock('./Board', () => ({
  Board: ({ onMarbleClick, onNodeClick }: any) => (
    <div data-testid="board">
      <button data-testid="marble-click" onClick={() => onMarbleClick('marble-1')}>Click Marble</button>
      <button data-testid="node-click" onClick={() => onNodeClick('node-1')}>Click Node</button>
    </div>
  ),
}));

vi.mock('./CardHand', () => ({
  CardHand: ({ onCardSelect, onBurnCard }: any) => (
    <div data-testid="card-hand">
      <button data-testid="card-select" onClick={() => onCardSelect('card-1')}>Select Card</button>
      <button data-testid="burn-card" onClick={() => onBurnCard('card-1')}>Burn Card</button>
    </div>
  ),
}));

vi.mock('./BurnNotification', () => ({ BurnNotification: () => <div data-testid="burn-notification" /> }));
vi.mock('./BurnZone', () => ({ BurnZone: () => <div data-testid="burn-zone" /> }));
vi.mock('./ActionChoiceModal', () => ({ ActionChoiceModal: () => <div data-testid="action-choice-modal" /> }));
vi.mock('./SplitSevenControls', () => ({ SplitSevenControls: () => <div data-testid="split-seven-controls" /> }));
vi.mock('./ActionLog', () => ({ ActionLog: () => <div data-testid="action-log" /> }));

// Mock WebSocketService
const mockMessageListeners = new Set<(message: any) => void>();

vi.mock('../services/WebSocketService', () => ({
  webSocketService: {
    connect: vi.fn(),
    disconnect: vi.fn(),
    send: vi.fn(),
    getState: vi.fn(() => 'connected'),
    onStateChange: vi.fn(() => () => {}),
    onMessage: vi.fn((listener: (message: any) => void) => {
      mockMessageListeners.add(listener);
      return () => mockMessageListeners.delete(listener);
    }),
    onError: vi.fn(() => () => {}),
  },
}));

// Import after mocks
import { OnlineGame, OnlineGameProps } from './OnlineGame';
import { webSocketService } from '../services/WebSocketService';

const simulateMessage = (message: any) => {
  mockMessageListeners.forEach(l => l(message));
};

const resetMocks = () => {
  mockMessageListeners.clear();
};

const createMockCard = (id: string): Card => ({
  id, suit: 'hearts', rank: 'A', value: 1,
});

const createMockPlayer = (id: string, index: number): Player => ({
  id,
  color: index === 0 ? 'red' : 'blue',
  team: index === 0 ? 1 : 2,
  hand: [createMockCard(`card-${index}-1`)],
  marbles: [`marble-${index}-1`],
  isFinished: false,
  isBot: false,
});

const createMockMarble = (id: string, ownerId: string): Marble => ({
  id, ownerId, color: 'red', position: 'BASE', isSafe: true,
});

const createMockNode = (id: string): BoardNode => ({
  id, type: 'normal', next: [], prev: null, isSafe: false,
});

const createMockGameState = (currentPlayerIndex: number = 0): GameState => ({
  players: [createMockPlayer('player-0', 0), createMockPlayer('player-1', 1)],
  marbles: {
    'marble-0-1': createMockMarble('marble-0-1', 'player-0'),
    'marble-1-1': createMockMarble('marble-1-1', 'player-1'),
  },
  board: { 'node-1': createMockNode('node-1') },
  deck: [],
  discardPile: [],
  currentPlayerIndex,
  currentRound: 1,
  phase: 'PLAYER_INPUT',
  selectedCardId: null,
  selectedMarbleId: null,
  possibleMoves: [],
  pendingAttackerIndex: null,
  repeatTurn: false,
  split7State: null,
  lastActionLog: [],
});

describe('OnlineGame', () => {
  const defaultProps: OnlineGameProps = {
    roomCode: 'ABC123',
    playerIndex: 0,
    initialState: createMockGameState(0),
    onExit: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('State Synchronization (Requirements 5.3)', () => {
    it('should update game state when STATE_UPDATE is received', () => {
      render(<OnlineGame {...defaultProps} />);
      const newState = createMockGameState(1);
      act(() => {
        simulateMessage({ type: 'STATE_UPDATE', state: newState });
      });
      expect(screen.getByTestId('turn-indicator')).toHaveTextContent("Opponent's Turn");
    });

    it('should register message listener on mount', () => {
      render(<OnlineGame {...defaultProps} />);
      expect(webSocketService.onMessage).toHaveBeenCalled();
    });
  });

  describe('Game Action Sending (Requirements 5.1)', () => {
    it('should send GAME_ACTION when card is selected on my turn', () => {
      render(<OnlineGame {...defaultProps} />);
      fireEvent.click(screen.getByTestId('card-select'));
      expect(webSocketService.send).toHaveBeenCalledWith({
        type: 'GAME_ACTION',
        action: { type: 'SELECT_CARD', cardId: 'card-1' },
      });
    });

    it('should not send GAME_ACTION when it is not my turn', () => {
      render(<OnlineGame {...defaultProps} initialState={createMockGameState(1)} />);
      fireEvent.click(screen.getByTestId('card-select'));
      expect(webSocketService.send).not.toHaveBeenCalled();
    });

    it('should send LEAVE_ROOM when exiting', () => {
      const onExit = vi.fn();
      render(<OnlineGame {...defaultProps} onExit={onExit} />);
      fireEvent.click(screen.getByText('Exit Match'));
      expect(webSocketService.send).toHaveBeenCalledWith({ type: 'LEAVE_ROOM' });
      expect(onExit).toHaveBeenCalled();
    });
  });

  describe('Turn Indicator (Requirements 6.1)', () => {
    it('should show YOUR TURN when it is my turn', () => {
      render(<OnlineGame {...defaultProps} />);
      expect(screen.getByTestId('turn-indicator')).toHaveTextContent('YOUR TURN');
    });

    it('should show Opponent Turn when it is not my turn', () => {
      render(<OnlineGame {...defaultProps} initialState={createMockGameState(1)} />);
      expect(screen.getByTestId('turn-indicator')).toHaveTextContent("Opponent's Turn");
    });
  });

  describe('Connection Status Display (Requirements 6.3)', () => {
    it('should show opponent as connected initially', () => {
      render(<OnlineGame {...defaultProps} />);
      expect(screen.getByTestId('opponent-status')).toHaveTextContent('Opponent');
    });
  });

  describe('Disconnect Handling (Requirements 6.2, 7.4)', () => {
    it('should show disconnect notification when opponent leaves', () => {
      render(<OnlineGame {...defaultProps} />);
      act(() => {
        simulateMessage({ type: 'PLAYER_LEFT', playerIndex: 1 });
      });
      expect(screen.getByTestId('disconnect-notification')).toBeInTheDocument();
      expect(screen.getByTestId('disconnect-notification')).toHaveTextContent('OPPONENT DISCONNECTED');
    });

    it('should show countdown timer when opponent disconnects', () => {
      render(<OnlineGame {...defaultProps} />);
      act(() => {
        simulateMessage({ type: 'PLAYER_LEFT', playerIndex: 1 });
      });
      expect(screen.getByTestId('disconnect-notification')).toHaveTextContent('30s remaining');
    });

    it('should declare victory after 30 second timeout', () => {
      render(<OnlineGame {...defaultProps} />);
      act(() => {
        simulateMessage({ type: 'PLAYER_LEFT', playerIndex: 1 });
      });
      act(() => {
        vi.advanceTimersByTime(31000);
      });
      expect(screen.getByText('Game Over')).toBeInTheDocument();
      expect(screen.getByText('Opponent disconnected - You win!')).toBeInTheDocument();
    });

    it('should hide disconnect notification when opponent reconnects', () => {
      render(<OnlineGame {...defaultProps} />);
      act(() => {
        simulateMessage({ type: 'PLAYER_LEFT', playerIndex: 1 });
      });
      expect(screen.getByTestId('disconnect-notification')).toBeInTheDocument();
      act(() => {
        simulateMessage({ type: 'PLAYER_JOINED', playerIndex: 1 });
      });
      expect(screen.queryByTestId('disconnect-notification')).not.toBeInTheDocument();
    });
  });

  describe('Room Code Display', () => {
    it('should display the room code', () => {
      render(<OnlineGame {...defaultProps} />);
      expect(screen.getByText('ABC123')).toBeInTheDocument();
    });
  });
});
