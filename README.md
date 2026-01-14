<div align="center">

# 🎮 Jackaroo Queen

**一款基于扑克牌的策略棋盘游戏**

[![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite)](https://vitejs.dev/)
[![WebSocket](https://img.shields.io/badge/WebSocket-Online-green)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

</div>

---

## 📖 游戏简介

Jackaroo Queen 是一款 1v1 策略棋盘游戏，玩家通过打出扑克牌来驱动棋子移动。每位玩家拥有 4 颗棋子，目标是率先将所有棋子从基地移动到终点区域。

游戏融合了策略规划、位置博弈和运气元素，支持人机对战和在线对战两种模式。

---

## 📁 项目结构

```
jackaroo-queen/
├── package.json            # Workspace 配置
│
├── client/                 # 前端客户端
│   ├── package.json        # 客户端依赖
│   ├── vite.config.ts      # Vite 构建配置
│   ├── tsconfig.json       # TypeScript 配置
│   ├── index.html          # HTML 入口模板
│   ├── index.tsx           # React 渲染入口
│   ├── App.tsx             # 应用入口组件
│   ├── types.ts            # 客户端类型定义
│   ├── constants.ts        # 客户端常量
│   │
│   ├── components/         # UI 组件
│   │   ├── Game.tsx            # 游戏主容器（本地对战）
│   │   ├── OnlineGame.tsx      # 在线对战游戏容器
│   │   ├── MatchmakingPage.tsx # 在线匹配页面
│   │   ├── MainMenu.tsx        # 主菜单
│   │   ├── Board.tsx           # 棋盘渲染
│   │   ├── CardHand.tsx        # 手牌区域
│   │   ├── DraggableCard.tsx   # 可拖拽卡牌
│   │   ├── MarbleToken.tsx     # 棋子组件
│   │   ├── BurnZone.tsx        # 弃牌区域
│   │   ├── BurnNotification.tsx# 弃牌提示
│   │   ├── ActionLog.tsx       # 操作日志
│   │   ├── ActionChoiceModal.tsx # 行动选择弹窗
│   │   └── SplitSevenControls.tsx # 7号牌分步控制
│   │
│   └── services/           # 客户端服务
│       ├── gameLogic.ts        # 游戏逻辑
│       ├── moveEngine.ts       # 移动引擎
│       ├── boardService.ts     # 棋盘服务
│       ├── layoutService.ts    # 布局计算服务
│       ├── coordinates.ts      # 坐标系统
│       ├── BotLogic.ts         # AI 机器人逻辑
│       ├── WebSocketService.ts # WebSocket 客户端服务
│       └── __tests__/          # 客户端测试
│
├── server/                 # 后端服务器
│   ├── package.json        # 服务器依赖
│   ├── tsconfig.json       # 服务器 TS 配置
│   └── src/
│       ├── index.ts            # 服务器入口
│       ├── WebSocketServer.ts  # WebSocket 服务器
│       ├── RoomManager.ts      # 房间管理器
│       ├── Room.ts             # 房间实例
│       ├── PlayerSession.ts    # 玩家会话
│       ├── MessageHandler.ts   # 消息处理器
│       ├── RateLimiter.ts      # 速率限制器
│       ├── HealthCheckServer.ts# 健康检查服务
│       ├── Logger.ts           # 日志服务
│       ├── protocol.ts         # 服务器协议
│       └── __tests__/          # 服务器测试
│
└── shared/                 # 前后端共享代码
    ├── index.ts            # 导出入口
    ├── protocol.ts         # 消息协议定义
    ├── types.ts            # 共享类型定义
    ├── gameLogic.ts        # 核心游戏逻辑
    ├── moveEngine.ts       # 移动计算引擎
    ├── boardService.ts     # 棋盘状态管理
    └── constants.ts        # 共享常量
```

---

## 🌐 在线对战功能

### 功能特性

- **房间系统**：创建或加入游戏房间，支持 2 人对战
- **实时同步**：基于 WebSocket 的实时游戏状态同步
- **自动重连**：断线后自动重连（最多 3 次，指数退避）
- **心跳检测**：30 秒间隔的 Ping/Pong 保活机制
- **速率限制**：防止消息滥发的服务器端限流
- **健康检查**：独立的健康检查端口用于监控

### 消息协议

客户端 → 服务器：
- `CREATE_ROOM` - 创建房间
- `JOIN_ROOM` - 加入房间
- `LEAVE_ROOM` - 离开房间
- `GAME_ACTION` - 游戏操作
- `PING` - 心跳检测

服务器 → 客户端：
- `ROOM_CREATED` - 房间已创建
- `ROOM_JOINED` - 已加入房间
- `PLAYER_JOINED` / `PLAYER_LEFT` - 玩家状态变更
- `GAME_STARTED` - 游戏开始
- `STATE_UPDATE` - 状态更新
- `ERROR` - 错误消息
- `PONG` - 心跳响应

---

## 🎯 游戏规则

### 基础规则

| 项目 | 说明 |
|------|------|
| 玩家数量 | 2 人 (1v1) |
| 棋子数量 | 每人 4 颗 |
| 移动方向 | 顺时针 |
| 获胜条件 | 率先将 4 颗棋子全部移入终点 |

### 发牌机制

- 第 1-2 回合：每人发 4 张牌
- 第 3 回合：每人发 5 张牌
- 第 4-5 回合：每人发 4 张牌
- 第 6 回合：每人发 5 张牌
- 以此类推，每 3 回合重新洗牌

### 卡牌功能表

| 牌面 | 功能 |
|------|------|
| **A** | 前进 1 步 或 出新棋子 |
| **2** | 前进 2 步 或 出新棋子 |
| **3** | 前进 3 步 |
| **4** | 后退 4 步 |
| **5** | 移动任意棋子前进 5 步 |
| **6** | 前进 6 步 |
| **7** | 1-2 颗棋子总计前进 7 步（可分配） |
| **8** | 前进 8 步 |
| **9** | 前进 9 步 |
| **10** | 前进 10 步 或 强制对方弃牌 |
| **J (黑)** | 与对方棋子互换位置 |
| **J (红)** | 前进 11 步 |
| **Q (黑)** | 前进 12 步 |
| **Q (红)** | 强制对方弃一张牌 |
| **K** | 出新棋子 或 前进 13 步并吃掉路径上所有棋子 |

### 特殊机制

#### 🔥 连击机制 (Combo)
当玩家吃掉对方棋子或棋子到达终点时，可获得额外抽牌并再行动一次的机会。

#### 🌀 传送规则 (Teleport)
棋盘上存在传送点，棋子移动到传送位置时会被强制传送到对应的另一个传送点。

#### ⚔️ 捕获规则 (Kill)
- 棋子落点有其他棋子时，该棋子被送回基地
- K 牌移动时，路径上所有棋子都会被送回基地

### 移动限制

1. **起点限制**：棋子不能越过位于自己起始点上的其他棋子
2. **终点封锁**：终点前最后一格被阻挡时无法进入终点区域
3. **同色冲突**：不能越过前进范围内的同色棋子
4. **精准落点**：棋子必须点数精准才能落入终点槽位

---

## 💰 场次系统

| 场次等级 | 入场费 |
|----------|--------|
| Junior | 200 Coins |
| Medium | 1,000 Coins |
| Senior | 5,000 Coins |
| Expert | 20,000 Coins |
| Master | 1,000,000 Coins |

---

## 🚀 快速开始

### 环境要求

- Node.js 18+
- npm 或 yarn

### 安装依赖

```bash
# 根目录安装所有 workspace 依赖
npm install
```

### 客户端

```bash
# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 运行客户端测试
npm run test:client
```

### 服务器

```bash
# 启动开发服务器
npm run server:dev

# 启动生产服务器
npm run server:start

# 运行服务器测试
npm run test:server
```

### 运行所有测试

```bash
npm test
```

### 环境变量

服务器支持以下环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 8080 | WebSocket 服务端口 |
| `HEALTH_PORT` | 8081 | 健康检查端口 |
| `MAX_CONNECTIONS` | 100 | 最大连接数 |

---

## 🛠️ 技术栈

### 客户端
- **React 19** - UI 框架
- **TypeScript 5.8** - 类型安全
- **Vite 6** - 构建工具
- **Framer Motion** - 动画库
- **Vitest** - 测试框架

### 服务器
- **Node.js** - 运行时
- **TypeScript** - 类型安全
- **ws** - WebSocket 库
- **Jest** - 测试框架
- **fast-check** - 属性测试

---

## 📝 License

MIT License
