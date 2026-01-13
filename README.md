<div align="center">

# 🎮 Jackaroo Queen

**一款基于扑克牌的策略棋盘游戏**

[![React](https://img.shields.io/badge/React-19.x-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite)](https://vitejs.dev/)

</div>

---

## 📖 游戏简介

Jackaroo Queen  是一款 1v1 策略棋盘游戏，玩家通过打出扑克牌来驱动棋子移动。每位玩家拥有 4 颗棋子，目标是率先将所有棋子从基地移动到终点区域。

游戏融合了策略规划、位置博弈和运气元素，支持人机对战模式。

---

## 📁 项目结构

```
jackaroo-king/
├── App.tsx                 # 应用入口组件
├── index.tsx               # React 渲染入口
├── index.html              # HTML 模板
├── types.ts                # TypeScript 类型定义
├── constants.ts            # 游戏常量配置
├── vite.config.ts          # Vite 构建配置
├── tsconfig.json           # TypeScript 配置
├── package.json            # 项目依赖
│
├── components/             # UI 组件
│   ├── Game.tsx            # 游戏主容器
│   ├── Board.tsx           # 棋盘渲染
│   ├── CardHand.tsx        # 手牌区域
│   ├── DraggableCard.tsx   # 可拖拽卡牌
│   ├── MarbleToken.tsx     # 棋子组件
│   ├── BurnZone.tsx        # 弃牌区域
│   ├── BurnNotification.tsx# 弃牌提示
│   ├── ActionLog.tsx       # 操作日志
│   ├── ActionChoiceModal.tsx # 行动选择弹窗
│   ├── SplitSevenControls.tsx # 7号牌分步控制
│   └── MainMenu.tsx        # 主菜单
│
└── services/               # 游戏逻辑服务
    ├── gameLogic.ts        # 核心游戏逻辑
    ├── moveEngine.ts       # 移动计算引擎
    ├── boardService.ts     # 棋盘状态管理
    ├── layoutService.ts    # 布局计算服务
    ├── coordinates.ts      # 坐标系统
    └── BotLogic.ts         # AI 机器人逻辑
```

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

### 安装运行

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产版本
npm run preview
```

---

## 🛠️ 技术栈

- **React 19** - UI 框架
- **TypeScript 5.8** - 类型安全
- **Vite 6** - 构建工具
- **Framer Motion** - 动画库
- **UUID** - 唯一标识生成

---

## 📝 License

MIT License
