import fs from 'fs';
import path from 'path';

const gameId = process.argv[2] || 'my-new-chess';
const gamesDir = path.join(process.cwd(), 'cran_games', gameId);

if (fs.existsSync(gamesDir)) {
    console.error(`游戏目录 ${gameId} 已存在，请更换名称。`);
    process.exit(1);
}

fs.mkdirSync(path.join(gamesDir, 'logic'), { recursive: true });
fs.mkdirSync(path.join(gamesDir, 'assets'), { recursive: true });

const manifestContent = {
    protocol_version: "1.0.0",
    engine_compatibility: ">=1.0.0",
    meta: {
        game_id: `cran.user.${gameId}`,
        name: "New Custom Chess",
        version: "0.1.0",
        author: "Creator"
    },
    inheritance: {
        base_game: null,
        override_logic: false
    },
    environment: {
        grid_width: 8,
        grid_height: 8,
        valid_nodes: "all",
        render_mode: "grid_center",
        render_offset: { x: 0.5, y: 0.5 }
    },
    assets_mapping: {
        entities: {},
        board_texture: null
    },
    entry_point: "logic/rules.js",
    capabilities: {
        tags: ["core_rules_override"],
        incompatible_with: []
    },
};

fs.writeFileSync(
    path.join(gamesDir, 'manifest.json'),
    JSON.stringify(manifestContent, null, 4)
);

const rulesContent = `// CranChess 核心逻辑入口
// 使用 EventBus 监听生命周期，替代旧版的静态导出

EventBus.on('onGameStart', (state) => {
    // 初始化棋盘
});

EventBus.on('onMoveAttempt', (state) => {
    // 玩家落子判定，可使用 CranCore.simulateAction 进行沙盒内多步推演
});

EventBus.on('onTick', (state) => {
    // 引擎底层心跳，可在此处编写随时间蔓延的毒气、引力等涌现式逻辑
});
`;

fs.writeFileSync(path.join(gamesDir, 'logic', 'rules.js'), rulesContent);

console.log(`成功创建新游戏脚手架：cran_games/${gameId}`);
console.log(`请前往修改 manifest.json 并完善 rules.js 逻辑。`);