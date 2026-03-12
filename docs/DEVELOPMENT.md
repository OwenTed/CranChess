# CranChess 开发者指南
本文档旨在帮助模组创作者理解 CranChess 的底层运作原理并开始编写自己的游戏模组。

## 1. 系统架构
CranChess 采用三层耦合架构：

Rust Backend (Core): 负责状态管理（StateManager）、模组加载验证（ModLoader）以及沙盒实例的生命周期管理。

JavaScript Sandbox (Logic): 逻辑运行环境，所有的 rules.js 都在此受限空间运行。通过注入 CranCore API 与 EventBus 与核心通信。

TS Frontend (Renderer): 负责补间动画推算、UI 呈现以及基于离屏缓存的高效网格渲染。

## 2. 模组结构
一个典型的模组目录如下：

Plaintext
my-cool-game/
├── manifest.json       # 模组元数据与能力声明
├── logic/
│   └── rules.js        # 核心逻辑脚本
└── assets/             # 纹理与音频资产
### 2.1 声明能力 (Manifest)
在 manifest.json 中，除了定义棋盘尺寸和资源映射，必须声明模组的能力：

JSON
"capabilities": {
    "tags": ["core_rules_override"], // 声明为核心规则，将互斥加载
    "incompatible_with": ["mod_id_x"] // 显式声明不兼容的模组
}
## 3. 逻辑开发
### 3.1 事件订阅
不要使用全局导出。通过 EventBus 监听引擎生命周期：

onGameStart: 初始化棋盘。

onMoveAttempt: 响应落子意图。

onTick: 引擎心跳，每 100ms 触发一次，用于处理自动演化逻辑。

### 3.2 确定性 API
在沙盒中，你应始终使用标准的 Math.random()。引擎已通过种子劫持确保其在所有客户端上的一致性。严禁尝试访问系统时间或外部网络。

### 3.3 状态推演 (CranCore)
利用 CranCore 接口在不破坏主状态的前提下进行多步预览：

JavaScript
EventBus.on('onMoveAttempt', (payload) => {
    // 模拟一个动作看其结果
    CranCore.simulateAction({ type: 'MOVE_ENTITY', ... });
    const target = CranCore.getPieceAt(x, y);
    // 根据模拟结果决定是否真正执行动作...
});
## 4. 渲染优化建议
静态背景: 棋盘背景图应尽可能包含固定网格，引擎会将其缓存。

动画: 为动作添加 animation_duration_ms。对于大规模剧变（如生命游戏），请将时长设为 0 以跳过补间。