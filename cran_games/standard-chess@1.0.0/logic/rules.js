/**
 * 国际象棋规则脚本示例（简化版）
 * 仅实现基本的棋子移动逻辑，不包含将军、王车易位等高级规则
 */

/**
 * 当玩家尝试移动棋子时调用
 * @param {string|null} selectedEntityId - 当前选中的实体ID（点击棋子时传入）
 * @param {[number, number]} targetPos - 目标位置 [x, y]
 * @param {object} gameState - 完整的游戏状态对象
 * @returns {Array} 动作数组，描述状态变更
 */
function onMoveAttempt(selectedEntityId, targetPos, gameState) {
    const [x, y] = targetPos;
    const actions = [];

    // 如果未选中任何棋子，则尝试选择该位置的棋子
    if (!selectedEntityId) {
        const coordKey = `${x},${y}`;
        const entityId = gameState.board_state.occupied_nodes[coordKey];
        if (entityId && gameState.entities[entityId]?.owner === gameState.turn_management.players[gameState.turn_management.active_player_index]) {
            // 选中己方棋子，返回空数组表示仅选中（前端可高亮）
            return [];
        }
        // 点击空白处且未选中棋子，无效
        return [];
    }

    // 已有选中棋子，尝试移动
    const entity = gameState.entities[selectedEntityId];
    if (!entity) return [];

    const [fromX, fromY] = entity.position;
    const targetKey = `${x},${y}`;
    const targetEntityId = gameState.board_state.occupied_nodes[targetKey];

    // 简化规则：根据棋子类型检查移动合法性
    const dx = x - fromX;
    const dy = y - fromY;
    const pieceType = entity.type_id;

    // 通用检查：目标位置是否有己方棋子
    if (targetEntityId && gameState.entities[targetEntityId]?.owner === entity.owner) {
        return []; // 不能吃己方
    }

    let isValid = false;
    switch (pieceType) {
        case "pawn_white":
            isValid = (dx === 0 && dy === 1) || (Math.abs(dx) === 1 && dy === 1 && targetEntityId);
            break;
        case "pawn_black":
            isValid = (dx === 0 && dy === -1) || (Math.abs(dx) === 1 && dy === -1 && targetEntityId);
            break;
        case "rook":
            isValid = (dx === 0 || dy === 0);
            break;
        case "knight":
            isValid = (Math.abs(dx) === 2 && Math.abs(dy) === 1) || (Math.abs(dx) === 1 && Math.abs(dy) === 2);
            break;
        case "bishop":
            isValid = Math.abs(dx) === Math.abs(dy);
            break;
        case "queen":
            isValid = (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy));
            break;
        case "king":
            isValid = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
            break;
        default:
            isValid = true; // 未知类型允许移动（演示用）
    }

    if (!isValid) {
        return [];
    }

    // 移动动作
    actions.push({
        type: "MOVE_ENTITY",
        entity_id: selectedEntityId,
        from_x: fromX,
        from_y: fromY,
        to_x: x,
        to_y: y,
        animation_duration_ms: 500
    });

    // 如果有目标棋子，则提子
    if (targetEntityId) {
        actions.push({
            type: "DESTROY_ENTITY",
            entity_id: targetEntityId,
            animation_duration_ms: 300
        });
    }

    return actions;
}

globalThis.onMoveAttempt = onMoveAttempt;
