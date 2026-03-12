// 黑白棋的八个方向射线向量
const DIRECTIONS = [
    [-1, -1], [0, -1], [1, -1],
    [-1,  0],          [1,  0],
    [-1,  1], [0,  1], [1,  1]
];

// 获取指定坐标的棋子归属方
function getOwnerAt(x, y, state) {
    const key = `${x},${y}`;
    const entityId = state.board_state.occupied_nodes[key];
    if (!entityId) return null;
    return state.entities[entityId].owner;
}

// 检查某个方向上可以翻转的棋子坐标
function getFlipsInDirection(startX, startY, dx, dy, playerColor, state) {
    const flips = [];
    let x = startX + dx;
    let y = startY + dy;
    let foundOpponent = false;

    while (x >= 0 && x < 8 && y >= 0 && y < 8) {
        const owner = getOwnerAt(x, y, state);
        if (!owner) {
            return []; // 遇到空位，无法形成闭合，直接返回
        } else if (owner !== playerColor) {
            foundOpponent = true;
            flips.push([x, y]); // 记录途经的敌方棋子
        } else if (owner === playerColor) {
            return foundOpponent ? flips : []; // 遇到己方棋子，如果中间有敌方棋子则闭合成功
        }
        x += dx;
        y += dy;
    }
    return []; // 触碰边界未闭合
}

EventBus.on('onGameStart', (payload) => {
    // 游戏开始时在中央放置四枚初始棋子
    const actions = [];
    const initialSetup = [
        { x: 3, y: 3, type: "piece_white" },
        { x: 4, y: 4, type: "piece_white" },
        { x: 3, y: 4, type: "piece_black" },
        { x: 4, y: 3, type: "piece_black" }
    ];

    initialSetup.forEach(piece => {
        actions.push({
            type: "MUTATE_STATE",
            entity_id: `piece_${piece.x}_${piece.y}`,
            x: piece.x,
            y: piece.y,
            type_id: piece.type,
            animation_duration_ms: 0
        });
    });

    return actions;
});

EventBus.on('onMoveAttempt', (payload) => {
    const { state, selectedEntityId, targetPos } = payload;
    const [x, y] = targetPos;
    const actions = globalThis.__tickActions || [];

    // 黑白棋无需选中实体，且目标位置必须为空
    if (selectedEntityId || getOwnerAt(x, y, state)) {
        return actions;
    }

    const activePlayerIndex = state.turn_management.active_player_index;
    const playerColor = state.turn_management.players[activePlayerIndex];
    const typeId = playerColor === 'black' ? 'piece_black' : 'piece_white';

    let allFlips = [];
    for (const [dx, dy] of DIRECTIONS) {
        const flips = getFlipsInDirection(x, y, dx, dy, playerColor, state);
        allFlips = allFlips.concat(flips);
    }

    // 必须至少能翻转一枚棋子才算合法落子
    if (allFlips.length === 0) {
        return actions;
    }

    // 放置当前玩家的棋子
    actions.push({
        type: "MUTATE_STATE",
        entity_id: `piece_${x}_${y}_${Date.now()}`,
        x: x,
        y: y,
        type_id: typeId,
        animation_duration_ms: 200
    });

    // 翻转所有被夹击的敌方棋子
    for (const [fx, fy] of allFlips) {
        const oldKey = `${fx},${fy}`;
        const oldEntityId = state.board_state.occupied_nodes[oldKey];
        
        // 先销毁原有棋子，再在原地生成当前玩家颜色的新棋子以实现翻转效果
        actions.push({
            type: "DESTROY_ENTITY",
            entity_id: oldEntityId,
            animation_duration_ms: 100
        });
        
        actions.push({
            type: "MUTATE_STATE",
            entity_id: `piece_${fx}_${fy}_${Date.now()}`,
            x: fx,
            y: fy,
            type_id: typeId,
            animation_duration_ms: 300
        });
    }

    // 落子结束，流转回合
    actions.push({ type: "END_TURN" });
    return actions;
});

EventBus.on('onCustomAction', (payload) => {
    const { actionId } = payload;
    const actions = globalThis.__tickActions || [];
    
    // 玩家在真正无步可走时可以点击 UI 按钮主动跳过回合
    if (actionId === "pass") {
        actions.push({ type: "END_TURN" });
    }
    
    return actions;
});