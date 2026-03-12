# CranChess 游戏开发指南
在 CranChess 中创造一款新游戏，不需要你具备修改底层 Rust 引擎源码的能力。所有的游戏实例都被视作独立的 Mod 数据包，完全通过声明式的配置与 JS 脚本完成对局逻辑的重塑。

## 第一步：使用脚手架初始化工程
平台内置了自动化的构建工具。你只需在根目录的终端中输入 npm run create <你的游戏ID>，引擎便会自动在 cran_games 目录下创建独立的包目录，并为你生成标准的 manifest.json 配置文件、logic/rules.js 逻辑入口文件，以及配套的 assets 资源文件夹。

## 第二步：配置游戏基因图谱 (manifest.json)
manifest.json 负责定义游戏运行时的物理与渲染环境。在 environment 节点下，你必须通过 grid_width 和 grid_height 定义物理棋盘的尺寸坐标系，并使用 render_offset 调整网格中心偏移。在 assets_mapping 节点中，你需要将 assets 文件夹下的贴图路径绑定到对应实体的键值上，并设定它们的中心锚点与背景棋盘纹理。若游戏需要特殊交互，还能在 custom_ui 节点下声明各种按钮、滑块与下拉框，引擎渲染层会自动在侧边栏生成对应控件。

## 第三步：理解全局状态机 (State)
当你的脚本被调用时，引擎会传入当前的全局状态快照。状态机内部包含负责追踪当前回合与活跃玩家的 turn_management 模块、记录坐标对应关系 occupied_nodes 的 board_state 模块，以及包含全部实体详细属性、位置、持有者的 entities 映射字典。你的业务逻辑正是依靠分析这些只读状态来推演合规性。

## 第四步：接管沙盒生命周期钩子
所有游戏的规则判断都需要编写在 logic/rules.js 中并暴露在全局作用域下。沙盒系统会在特定时机调用钩子。最核心的函数是 onMoveAttempt(selectedEntityId, targetPos, gameState)，它在玩家点击网格或实体时触发。你还可以接管 onGameStart 来布局开局阵型，监听 onPieceSelect 实现选中校验，使用 onTurnEnd 结算状态，并通过 onCustomAction 与 onControlChange 响应该游戏的专属自定义侧边栏控件事件。

## 第五步：下发状态突变指令
在完成合法性判断后，你不能直接修改传入的状态对象，而是要返回一个动作指令数组，由 Rust 状态机处理原子性事务与历史回滚。可返回的动作类型极为丰富：MOVE_ENTITY 用于棋子平移；MUTATE_STATE 用于放置新实体或变更属性；DESTROY_ENTITY 用于执行吃子移除；END_TURN 强制交还回合权。此外，你还能使用 ANIMATE 处理任意角度与透明度补间，返回 SOUND 播放独立音效，利用 MESSAGE 呼出系统弹窗，通过 DELAY 设置执行延迟，或使用 UPDATE_UI 动态改变侧边栏控件的显示和禁用状态。

## 第六步：利用 CranCore 接口优化性能
由于在 JavaScript 沙盒内进行高频寻路会导致性能瓶颈，引擎已为你挂载了底层的 CranCore 全局加速对象。你可以调用 CranCore.raycast 发射底层步进射线以探测碰撞边界，利用 CranCore.getPieceAt 快速提取精准坐标信息，通过 CranCore.queryEntities 和 CranCore.evaluateBoard 进行高性能实体过滤与盘面估值，或者使用 CranCore.getLineOfSight 和 CranCore.getThreatenedPositions 获取视线几何路径和标准威胁阵列，确保最严苛对局下的零延迟响应。