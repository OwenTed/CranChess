# CranChess (青弈)
CranChess 是一个高性能、可高度扩展的通用棋类与回合制策略游戏沙盒引擎。它通过 Rust 后端提供严苛的逻辑验证与沙盒隔离，并利用 TypeScript 前端实现流畅的跨平台渲染，旨在为创作者提供“一次编写，处处运行”的模组化开发生态。

## 核心特性
高性能沙盒 (High-Performance Sandbox): 采用 Boa 引擎并引入 Draft State（草稿状态机）机制，支持写时复制（COW）与级联推演，大幅降低了大型棋盘（如 100x100）下的序列化开销。

- 确定性保障 (Determinism): 引擎劫持并重写了 Math.random 与 Date.now，提供基于固定种子的伪随机数生成器。无论在联机同步还是录像回放中，同一序列的输入永远产生绝对一致的结果。

- 事件总线架构 (Event Bus): 放弃了死板的函数导出，全面拥抱事件驱动。开发者可以订阅 onTick、onMoveAttempt、onEntityCollision 等底层事件，轻松实现如“毒气蔓延”或“引力触发”等涌现式逻辑。

- 复合模组架构 (Multi-Mod Registry): 引入 Registry 模式与标签（Tags）系统。支持多个模组叠加加载，并通过 capabilities 声明自动处理核心规则冲突与依赖校验。

- 优化的渲染管线 (Optimized Rendering): 采用离屏 Canvas 缓存机制。静态背景（棋盘、网格）一次性预渲染，主循环仅负责具有补间动画（Tweening）的动态实体，确保在实体密集场景下的满帧表现。

## 快速开始
### 运行环境
- Rust (latest stable)

- Node.js & npm/pnpm

- Tauri 开发环境

### 安装与启动
- 克隆仓库：git clone https://github.com/owented/cranchess.git

- 安装依赖：pnpm install

- 启动开发环境：pnpm tauri dev

## 贡献
CranChess 欢迎所有关于引擎底层优化或新游戏模组的贡献。请参考 docs/DEVELOPMENT.md 获取更多技术细节。