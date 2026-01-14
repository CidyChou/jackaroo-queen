# Design Document: Online 1v1 Matchmaking

## Overview

本设计为 Jackaroo Queen 游戏添加在线1v1匹配功能。设计遵循以下原则：
- 最小化改动现有代码
- 复用现有的服务器协议和房间管理逻辑
- 客户端通过 WebSocket 与服务器通信，服务器作为权威状态源
- 在线模式禁用本地 Bot 逻辑，完全依赖服务器状态同步

## Architecture

系统采用客户端-服务器架构：

```
┌─────────────────┐         WebSocket          ┌─────────────────┐
│   Client A      │◄─────────────────────────►│                 │
│  (Browser)      │                            │   Game Server   │
└─────────────────┘                            │   (Node.js)     │
                                               │                 │
┌─────────────────┐         WebSocket          │  - RoomManager  │
│   Client B      │◄─────────────────────────►│  - GameLogic    │
│  (Browser)      │                            │                 │
└─────────────────┘                            └─────────────────┘
```

### 状态流转

```
MainMenu → MatchmakingPage → OnlineGame → MainMenu
              ↓                  ↓
         [WebSocket]        [WebSocket]
              ↓                  ↓
         CREATE_ROOM        GAME_ACTION
         ROOM_CREATED       STATE_UPDATE
         PLAYER_JOINED      
         GAME_STARTED       
```

## Components and Interfaces

### 1. WebSocketService (新增)

负责管理 WebSocket 连接的单例服务。

```typescript
// services/WebSocketService.ts

type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

interface WebSocketServiceEvents {
  onStateChange: (state: ConnectionState) => void;
  onMessage: (message: ServerMessage) => void;
  onError: (error: string) => void;
}

class WebSocketService {
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private listeners: WebSocketServiceEvents;
  private pingInterval: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;

  connect(serverUrl: string): void;
  disconnect(): void;
  send(message: ClientMessage): void;
  getState(): ConnectionState;
  
  private startPingPong(): void;
  private stopPingPong(): void;
  private handleReconnect(): void;
}

export const webSocketService = new WebSocketService();
```

### 2. MatchmakingPage (新增)

匹配等待页面组件。

```typescript
// components/MatchmakingPage.tsx

interface MatchmakingPageProps {
  onMatchFound: (roomCode: string, playerIndex: number, initialState: GameState) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}

type MatchmakingState = 
  | 'connecting'      // 正在连接服务器
  | 'creating_room'   // 正在创建房间
  | 'waiting'         // 等待对手
  | 'opponent_found'  // 对手已加入
  | 'starting'        // 游戏即将开始
  | 'error';          // 发生错误

const MatchmakingPage: React.FC<MatchmakingPageProps>;
```

### 3. OnlineGame (新增)

在线游戏组件，基于现有 Game 组件修改。

```typescript
// components/OnlineGame.tsx

interface OnlineGameProps {
  roomCode: string;
  playerIndex: number;  // 0 或 1，表示玩家在房间中的位置
  initialState: GameState;
  onExit: () => void;
}

const OnlineGame: React.FC<OnlineGameProps>;
```

### 4. MainMenu 修改

添加在线匹配按钮。

```typescript
// components/MainMenu.tsx (修改)

interface MainMenuProps {
  onStartGame: (players: 2 | 4) => void;
  onStartOnlineMatch: () => void;  // 新增
}
```

### 5. App 状态扩展

```typescript
// App.tsx (修改)

type AppMode = 'MENU' | 'GAME' | 'MATCHMAKING' | 'ONLINE_GAME';

interface OnlineGameContext {
  roomCode: string;
  playerIndex: number;
  initialState: GameState;
}
```

## Data Models

### 客户端状态

```typescript
// types/online.ts (新增)

interface MatchmakingContext {
  state: MatchmakingState;
  roomCode: string | null;
  playerIndex: number | null;
  error: string | null;
}

interface OnlineGameState {
  roomCode: string;
  playerIndex: number;
  gameState: GameState;
  opponentConnected: boolean;
  isMyTurn: boolean;
}
```

### 消息类型 (复用服务器协议)

客户端直接使用 `server/src/protocol.ts` 中定义的消息类型：
- ClientMessage: CREATE_ROOM, JOIN_ROOM, LEAVE_ROOM, GAME_ACTION, PING
- ServerMessage: ROOM_CREATED, ROOM_JOINED, PLAYER_JOINED, PLAYER_LEFT, GAME_STARTED, STATE_UPDATE, ERROR, PONG



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


基于需求分析，以下是可测试的正确性属性：

### Property 1: Ping/Pong Connection Maintenance

*For any* active WebSocket connection, the Matchmaking_Service SHALL send PING messages at regular intervals (every 30 seconds) to maintain the connection.

**Validates: Requirements 2.2**

### Property 2: Game Action Transmission

*For any* game action performed by the player in online mode, the Client SHALL send a correctly formatted GAME_ACTION message to the server containing the action details.

**Validates: Requirements 5.1**

### Property 3: State Synchronization

*For any* STATE_UPDATE message received from the server, the Client SHALL update its local GameState to exactly match the state contained in the message.

**Validates: Requirements 5.3**

### Property 4: Automatic Reconnection

*For any* unexpected WebSocket disconnection during an active game, the Client SHALL attempt to reconnect automatically up to 3 times before showing an error.

**Validates: Requirements 7.1, 7.2**

### Property 5: Error Message Display

*For any* ERROR message received from the server, the Client SHALL display the error message to the user in a visible notification.

**Validates: Requirements 7.3**

## Error Handling

### 连接错误

| 错误场景 | 处理方式 |
|---------|---------|
| 初始连接失败 | 显示错误提示，提供重试按钮 |
| 匹配中断线 | 自动重连，最多3次 |
| 游戏中断线 | 自动重连，保持游戏状态 |
| 重连失败 | 显示错误，返回主菜单选项 |

### 服务器错误

| 错误码 | 含义 | 客户端处理 |
|-------|------|-----------|
| ROOM_NOT_FOUND | 房间不存在 | 返回主菜单 |
| ROOM_FULL | 房间已满 | 显示提示，返回匹配 |
| NOT_YOUR_TURN | 非当前玩家回合 | 忽略操作 |
| INVALID_MOVE | 无效移动 | 显示提示，重新选择 |

### 对手断线

- 对手断线时显示 "Opponent disconnected" 提示
- 等待30秒，期间对手可重连
- 超时后宣布胜利，返回主菜单

## Testing Strategy

### 单元测试

使用 Vitest 进行单元测试：

1. **WebSocketService 测试**
   - 连接建立和断开
   - 消息发送和接收
   - 重连逻辑

2. **MatchmakingPage 测试**
   - 状态流转
   - UI 渲染
   - 取消匹配

3. **OnlineGame 测试**
   - 状态同步
   - 动作发送
   - 断线处理

### 属性测试

使用 fast-check 进行属性测试：

1. **Property 1**: 验证 ping 消息定期发送
2. **Property 2**: 验证所有游戏动作正确发送
3. **Property 3**: 验证状态同步的一致性
4. **Property 4**: 验证重连逻辑
5. **Property 5**: 验证错误消息显示

### 集成测试

1. 完整匹配流程测试
2. 游戏状态同步测试
3. 断线重连测试

## Implementation Notes

### WebSocket 服务器地址

开发环境: `ws://localhost:8080`
生产环境: 通过环境变量配置 `VITE_WS_SERVER_URL`

### 状态管理

- 使用 React Context 管理 WebSocket 连接状态
- 使用 useReducer 管理匹配状态
- 在线游戏状态完全由服务器控制

### 代码复用

- 复用现有 Board、CardHand 等 UI 组件
- 复用 shared/ 目录下的类型定义
- 复用服务器 protocol.ts 中的消息类型
