/**
 * Unit Tests for MatchmakingPage Component
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MatchmakingPage, MatchmakingPageProps } from './MatchmakingPage';
import { webSocketService, ConnectionState, ServerMessage } from '../services/WebSocketService';
import type { GameState } from '@shared/types';

// Mock framer-motion to avoid animation issues in tests
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock WebSocketService
vi.mock('../services/WebSocketService', () => {
  const stateListeners = new Set<(state: ConnectionState) => void>();
  const messageListeners = new Set<(message: ServerMessage) => void>();
  const errorListeners = new Set<(error: string) => void>();
  let currentState: ConnectionState = 'disconnected';

  return {
    webSocketService: {
      connect: vi.fn(() => {
        currentState = 'connecting';
        stateListeners.forEach(l => l('connecting'));
      }),
      disconnect: vi.fn(() => {
        currentState = 'disconnected';
      }),
      send: vi.fn(),
      getState: vi.fn(() => currentState),
      onStateChange: vi.fn((listener: (state: ConnectionState) => void) => {
        stateListeners.add(listener);
        return () => stateListeners.delete(listener);
      }),
      onMessage: vi.fn((listener: (message: ServerMessage) => void) => {
        messageListeners.add(listener);
        return () => messageListeners.delete(listener);
      }),
      onError: vi.fn((listener: (error: string) => void) => {
        errorListeners.add(listener);
        return () => errorListeners.delete(listener);
      }),
      // Test helpers
      _simulateStateChange: (state: ConnectionState) => {
        currentState = state;
        stateListeners.forEach(l => l(state));
      },
      _simulateMessage: (message: ServerMessage) => {
        messageListeners.forEach(l => l(message));
      },
      _simulateError: (error: string) => {
        errorListeners.forEach(l => l(error));
      },
      _reset: () => {
        stateListeners.clear();
        messageListeners.clear();
        errorListeners.clear();
        currentState = 'disconnected';
      },
    },
  };
});

// Get mock helpers
const mockService = webSocketService as typeof webSocketService & {
  _simulateStateChange: (state: ConnectionState) => void;
  _simulateMessage: (message: ServerMessage) => void;
  _simulateError: (error: string) => void;
  _reset: () => void;
};

// Mock GameState for testing
const mockGameState: GameState = {
  players: [],
  marbles: {},
  board: {},
  deck: [],
  discardPile: [],
  currentPlayerIndex: 0,
  currentRound: 1,
  phase: 'IDLE',
  selectedCardId: null,
  selectedMarbleId: null,
  possibleMoves: [],
  pendingAttackerIndex: null,
  repeatTurn: false,
  split7State: null,
  lastActionLog: [],
};

describe('MatchmakingPage', () => {
  const defaultProps: MatchmakingPageProps = {
    onMatchFound: vi.fn(),
    onCancel: vi.fn(),
    onError: vi.fn(),
    serverUrl: 'ws://test:8080',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockService._reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('State Flow (Requirements 4.1, 4.2)', () => {
    it('should show connecting state initially', () => {
      render(<MatchmakingPage {...defaultProps} />);
      
      expect(screen.getByTestId('status-message')).toHaveTextContent('Connecting to server...');
    });

    it('should connect to WebSocket on mount', async () => {
      render(<MatchmakingPage {...defaultProps} />);
      
      // Wait for the delayed connect (50ms + buffer)
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      
      expect(webSocketService.connect).toHaveBeenCalledWith('ws://test:8080');
    });

    it('should send CREATE_ROOM when connected', async () => {
      render(<MatchmakingPage {...defaultProps} />);
      
      // Wait for the delayed connect
      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      
      act(() => {
        mockService._simulateStateChange('connected');
      });

      expect(webSocketService.send).toHaveBeenCalledWith({
        type: 'CREATE_ROOM',
        playerCount: 2,
      });
    });

    it('should show waiting state after room created', async () => {
      render(<MatchmakingPage {...defaultProps} />);
      
      act(() => {
        mockService._simulateStateChange('connected');
      });

      act(() => {
        mockService._simulateMessage({
          type: 'ROOM_CREATED',
          roomCode: 'ABC123',
          playerIndex: 0,
        });
      });

      expect(screen.getByTestId('status-message')).toHaveTextContent('Waiting for opponent...');
      expect(screen.getByText('ABC123')).toBeInTheDocument();
    });

    it('should show opponent found state when player joins', async () => {
      render(<MatchmakingPage {...defaultProps} />);
      
      act(() => {
        mockService._simulateStateChange('connected');
        mockService._simulateMessage({
          type: 'ROOM_CREATED',
          roomCode: 'ABC123',
          playerIndex: 0,
        });
        mockService._simulateMessage({
          type: 'PLAYER_JOINED',
          playerIndex: 1,
        });
      });

      expect(screen.getByTestId('status-message')).toHaveTextContent('Opponent found!');
    });

    it('should call onMatchFound when game starts', async () => {
      vi.useFakeTimers();
      const onMatchFound = vi.fn();
      
      render(<MatchmakingPage {...defaultProps} onMatchFound={onMatchFound} />);
      
      // First connect and create room
      act(() => {
        mockService._simulateStateChange('connected');
      });
      
      act(() => {
        mockService._simulateMessage({
          type: 'ROOM_CREATED',
          roomCode: 'ABC123',
          playerIndex: 0,
        });
      });
      
      // Then game starts
      act(() => {
        mockService._simulateMessage({
          type: 'GAME_STARTED',
          state: mockGameState,
        });
      });

      // Wait for the timeout in the component
      await act(async () => {
        vi.advanceTimersByTime(600);
      });

      expect(onMatchFound).toHaveBeenCalledWith('ABC123', 0, mockGameState);
      vi.useRealTimers();
    });
  });

  describe('Cancel Matchmaking (Requirements 4.3, 4.4)', () => {
    it('should show cancel button while waiting', () => {
      render(<MatchmakingPage {...defaultProps} />);
      
      expect(screen.getByTestId('cancel-button')).toBeInTheDocument();
    });

    it('should call onCancel and disconnect when cancel is clicked', () => {
      const onCancel = vi.fn();
      render(<MatchmakingPage {...defaultProps} onCancel={onCancel} />);
      
      // Simulate connected state
      act(() => {
        mockService._simulateStateChange('connected');
      });

      // Mock getState to return connected
      vi.mocked(webSocketService.getState).mockReturnValue('connected');

      fireEvent.click(screen.getByTestId('cancel-button'));

      expect(webSocketService.send).toHaveBeenCalledWith({ type: 'LEAVE_ROOM' });
      expect(webSocketService.disconnect).toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalled();
    });

    it('should NOT disconnect on unmount (OnlineGame takes over connection)', async () => {
      vi.mocked(webSocketService.getState).mockReturnValue('connected');
      
      const { unmount } = render(<MatchmakingPage {...defaultProps} />);
      
      act(() => {
        mockService._simulateStateChange('connected');
      });

      // Clear the send mock to only check unmount behavior
      vi.mocked(webSocketService.send).mockClear();
      vi.mocked(webSocketService.disconnect).mockClear();

      unmount();

      // Wait for any potential delayed cleanup
      await act(async () => {
        vi.advanceTimersByTime(300);
      });

      // Should NOT send LEAVE_ROOM or disconnect on unmount
      // because OnlineGame component will take over the connection
      // User must explicitly cancel to disconnect
      expect(webSocketService.send).not.toHaveBeenCalledWith({ type: 'LEAVE_ROOM' });
      expect(webSocketService.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling (Requirements 2.3, 7.3)', () => {
    it('should show error state on connection error', () => {
      render(<MatchmakingPage {...defaultProps} />);
      
      act(() => {
        mockService._simulateStateChange('error');
      });

      expect(screen.getByTestId('error-title')).toHaveTextContent('Connection Error');
    });

    it('should show error message from server', () => {
      const onError = vi.fn();
      render(<MatchmakingPage {...defaultProps} onError={onError} />);
      
      act(() => {
        mockService._simulateStateChange('connected');
        mockService._simulateMessage({
          type: 'ERROR',
          code: 'ROOM_FULL',
          message: 'Room is full',
        });
      });

      expect(screen.getByTestId('error-message')).toHaveTextContent('Room is full');
      expect(onError).toHaveBeenCalledWith('Room is full');
    });

    it('should show retry button on error', () => {
      render(<MatchmakingPage {...defaultProps} />);
      
      act(() => {
        mockService._simulateStateChange('error');
      });

      expect(screen.getByTestId('retry-button')).toBeInTheDocument();
    });

    it('should reconnect when retry is clicked', () => {
      render(<MatchmakingPage {...defaultProps} />);
      
      act(() => {
        mockService._simulateStateChange('error');
      });

      vi.mocked(webSocketService.connect).mockClear();
      
      fireEvent.click(screen.getByTestId('retry-button'));

      expect(webSocketService.connect).toHaveBeenCalledWith('ws://test:8080');
    });

    it('should show back to menu button on error', () => {
      const onCancel = vi.fn();
      render(<MatchmakingPage {...defaultProps} onCancel={onCancel} />);
      
      act(() => {
        mockService._simulateStateChange('error');
      });

      // In error state, the cancel button says "Back to Menu"
      const cancelButton = screen.getAllByTestId('cancel-button')[0];
      fireEvent.click(cancelButton);

      expect(onCancel).toHaveBeenCalled();
    });
  });
});
