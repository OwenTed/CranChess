# CranChess - 解放棋类创造力的轻量级引擎

![CranChess Logo](https://img.shields.io/badge/CranChess-V1.0-blue)
![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-green)
![License](https://img.shields.io/badge/license-MIT-orange)

CranChess 是一个旨在彻底解放桌面棋类创造力的轻量级 2D 游戏引擎与社区平台。通过极简的声明式接口，任何人都能创造出从古典变种到极具颠覆性的全新棋类游戏。

## ✨ 核心特性

### 🎮 声明式游戏创建
- **JSON 配置定义**：使用简单的 JSON 文件定义棋盘物理属性和美术资源映射
- **JavaScript 规则脚本**：编写 JavaScript 脚本接管规则判定，实现自定义游戏逻辑
- **零硬编码依赖**：完全摆脱传统重度硬编码开发模式

### 🔧 架构优势
- **逻辑与渲染彻底分离**：底层状态机与前端渲染器完全解耦，确保规则确定性
- **安全的沙盒执行**：用户脚本在独立沙盒中运行，避免客户端崩溃
- **跨平台原生支持**：基于 Tauri 构建，原生支持 macOS 和 Windows
- **去中心化分发**：天然契合 GitHub 等开源平台，支持游戏派生与二次魔改

### 🌳 生态理念
- **棋类生命树**：所有游戏都可以被自由下载、拆解与二次创作
- **版本兼容保障**：严格的接口版本隔离机制，保护历史游戏分支
- **社区驱动进化**：汇聚全球玩家的创造力，构建生生不息的棋类生态系统

## 🚀 快速开始

### 环境要求
- Node.js 18+ 和 npm
- Rust 工具链（用于 Tauri 后端）
- macOS 或 Windows 系统

### 安装与运行
```bash
# 克隆仓库
git clone <repository-url>
cd CranChess

# 安装依赖
npm install

# 启动开发模式
npm run tauri dev
```

### 体验示例游戏
启动应用后，您可以选择：
- **围棋 (Go)**：位于 `cran_games/go/` 
- 更多游戏正在火速开发中...

## 🏗️ 项目架构

### 整体结构
```
CranChess/
├── src-tauri/                 # 核心底层引擎 (Rust)
│   ├── src/
│   │   ├── main.rs            # 引擎入口与视窗管理
│   │   ├── state_manager.rs   # 全局状态机
│   │   ├── mod_loader.rs      # 整合包解析器
│   │   ├── sandbox.rs         # JS 沙盒隔离环境
│   │   └── raycast.rs         # 射线投射算法
│   └── Cargo.toml
├── src/                       # 前端渲染管线 (TypeScript)
│   ├── main.ts                # 渲染器入口
│   ├── renderer.ts            # 画面绘制逻辑
│   ├── tween.ts               # 平滑动画过渡
│   └── asset-manager.ts       # 资源管理
├── cran_games/                # 游戏仓库目录
│   ├── go/                    # 围棋示例
│   ├── quantum-go@0.8.0/      # 量子围棋示例
│   └── ...                    # 用户创建的游戏
└── scripts/                   # 工具脚本
    └── create-game.js         # 游戏脚手架生成器
```

### 核心技术栈
- **后端引擎**：Rust + Tauri，提供系统级安全和性能
- **前端渲染**：TypeScript + Canvas，纯粹的视觉观察者
- **脚本沙盒**：Boa JavaScript 引擎，安全的规则执行环境
- **数据协议**：JSON 配置与状态快照，确保跨版本兼容性

## 🎨 创建自定义游戏

### 1. 生成游戏脚手架
```bash
npm run create <游戏名称>
```
这将在 `cran_games/<游戏名称>/` 下创建基本的目录结构和模板文件。

### 2. 配置游戏清单 (manifest.json)
游戏清单定义了游戏的基本属性和资源映射：

```json
{
  "protocol_version": "1.0.0",
  "engine_compatibility": ">=1.0.0",
  "meta": {
    "game_id": "cran.user.my_game",
    "name": "我的自定义棋类",
    "version": "0.1.0",
    "author": "你的名字"
  },
  "environment": {
    "grid_width": 8,
    "grid_height": 8,
    "valid_nodes": "all",
    "render_mode": "grid_center",
    "render_offset": { "x": 0.5, "y": 0.5 }
  },
  "assets_mapping": {
    "entities": {
      "piece_type": { "path": "assets/piece.png", "anchor": [0.5, 0.5] }
    },
    "board_texture": "assets/board.png"
  },
  "entry_point": "logic/rules.js"
}
```

### 3. 编写游戏逻辑 (rules.js)
实现生命周期钩子函数来定义游戏规则：

```javascript
// 当玩家尝试移动时触发
export function onMoveAttempt(pieceId, targetPos, gameState) {
  const [x, y] = targetPos;
  const actions = [];

  // 检查移动合法性
  if (isValidMove(pieceId, targetPos, gameState)) {
    // 创建移动动作
    actions.push({
      type: "MOVE_ENTITY",
      entity_id: pieceId,
      target_position: [x, y],
      animation_duration_ms: 300
    });

    // 检查是否需要吃子
    const captured = findCapturedPieces(pieceId, targetPos, gameState);
    for (const entityId of captured) {
      actions.push({
        type: "DESTROY_ENTITY",
        entity_id: entityId,
        animation_duration_ms: 200
      });
    }
  }

  return actions;
}

// 其他生命周期钩子
export function onGameStart(state) { /* ... */ }
export function onPieceSelect(pieceId, state) { /* ... */ }
export function onTurnEnd(player, state) { /* ... */ }
```

### 4. 添加美术资源
将图片资源放置在 `assets/` 目录下，并在 `manifest.json` 中配置映射关系。

### 5. 测试与调试
启动 CranChess 客户端，选择您创建的游戏进行测试。

## 📚 核心协议

### 游戏清单配置 (manifest.json)
- **protocol_version**：协议版本号
- **engine_compatibility**：最低引擎版本要求
- **environment**：物理环境定义（网格大小、渲染偏移等）
- **assets_mapping**：美术资源映射
- **entry_point**：逻辑脚本入口

### 运行时状态快照 (state.json)
引擎在内存中维护的唯一逻辑状态树：
```json
{
  "instance_id": "唯一对局标识",
  "game_id": "对应游戏ID",
  "turn_management": {
    "current_turn": 1,
    "active_player_index": 0,
    "players": ["white", "black"],
    "phase": "main_action",
    "game_status": "ongoing",
    "winner": null
  },
  "board_state": {
    "dimensions": [8, 8],
    "occupied_nodes": {
      "0,1": "piece_w_pawn_1"
    }
  },
  "entities": {
    "piece_w_pawn_1": {
      "owner": "white",
      "type_id": "pawn_white",
      "position": [0, 1],
      "attributes": {
        "has_moved": false
      }
    }
  }
}
```

## 🔌 API 参考

### 生命周期钩子
- **onGameStart(state)**：游戏初始化时触发
- **onPieceSelect(pieceId, state)**：选中棋子时触发
- **onMoveAttempt(pieceId, targetPos, state)**：尝试移动时触发
- **onTurnEnd(player, state)**：回合结束时触发

### 沙盒环境 API (CranCore)
脚本可通过全局 `CranCore` 对象访问引擎功能：
- `CranCore.getPieceAt(x, y)`：获取指定坐标的实体
- `CranCore.castRay(startX, startY, dirX, dirY, maxSteps)`：射线投射检测
- `CranCore.queryEntities(filterCondition)`：筛选符合条件的实体

### 动作指令类型
- **MOVE_ENTITY**：移动实体到目标位置
- **MUTATE_STATE**：创建新实体或修改实体属性
- **DESTROY_ENTITY**：移除实体
- **PLAY_VFX**：播放视觉特效

## 🛠️ 开发指南

### 本地开发
```bash
# 前端开发服务器
npm run dev

# Tauri 开发模式
npm run tauri dev

# 构建生产版本
npm run tauri build
```

### 项目配置
- **package.json**：前端依赖和脚本
- **src-tauri/Cargo.toml**：Rust 后端配置
- **src-tauri/tauri.conf.json**：Tauri 应用配置

### 调试技巧
1. 浏览器开发者工具：调试前端渲染逻辑
2. Rust 日志输出：查看后端引擎状态
3. 脚本控制台：沙盒中 JavaScript 的执行日志

## 🤝 贡献指南

### 如何贡献
1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 开启 Pull Request

### 贡献方向
- **新游戏示例**：创建有趣的棋类变种
- **引擎功能**：改进核心引擎功能
- **文档完善**：补充 API 文档和使用教程
- **bug 修复**：报告和修复问题

### 代码规范
- **Rust 代码**：遵循 Rust 官方编码规范
- **TypeScript 代码**：使用 TypeScript 严格模式
- **JavaScript 游戏脚本**：保持简洁和可读性

## 📄 许可证

本项目采用 MIT 许可证。详细信息请参考项目根目录的许可证文件（如有）或联系项目维护者。

## 🌟 示例游戏

### 围棋 (Go)
- **位置**：`cran_games/go/`
- **特性**：完整的围棋规则实现，包含提子、气、自杀禁手、劫争
- **代码示例**：展示了复杂的棋盘状态分析和规则判定


## 🔮 未来展望

### 短期计划
- [ ] 完善游戏创建工具链
- [ ] 增加更多内置游戏示例
- [ ] 优化渲染性能和用户体验

### 长期愿景
- [ ] 集成 GitHub 游戏仓库发现功能
- [ ] 支持在线异步对弈
- [ ] 建立游戏评分和社区排行榜
- [ ] 开发可视化规则编辑器

## 📞 支持与反馈

- **问题报告**：请使用 GitHub Issues
- **功能建议**：欢迎提交 Pull Request 或讨论
- **社区讨论**：即将建立 Discord/论坛社区

---

**CranChess** - 让每一个棋类创意都能生根发芽，构建属于全人类的棋类生命树。 🌳