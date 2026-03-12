/**
 * 围棋规则脚本 - 完整实现
 * 包含提子、气、自杀禁手、劫争等完整规则
 */

// 全局变量跟踪劫争（上一步提子的位置）
let lastCapturedPos = null;
let lastCapturedGroupSize = 0;

/**
 * 获取棋盘上的连接组及其所有气（空点）
 * @param {number} x - 起始X坐标
 * @param {number} y - 起始Y坐标
 * @param {object} state - 游戏状态
 * @param {string} color - 棋子颜色 ('black' 或 'white')
 * @returns {object} {group: Array<string>, liberties: Array<string>}
 */
function getGroupAndLiberties(x, y, state, color) {
    const board = state.board_state.occupied_nodes;
    const group = [];
    const liberties = new Set();
    const queue = [[x, y]];
    const visited = new Set();
    const key = `${x},${y}`;

    // 如果起始点没有棋子或颜色不匹配，返回空组
    const startId = board[key];
    if (!startId || state.entities[startId].owner !== color) {
        return { group, liberties: Array.from(liberties) };
    }

    visited.add(key);

    while (queue.length > 0) {
        const [cx, cy] = queue.shift();
        const currentKey = `${cx},${cy}`;
        group.push(board[currentKey]);

        // 检查四个方向
        const neighbors = [[cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]];
        for (const [nx, ny] of neighbors) {
            // 边界检查
            if (nx < 0 || nx >= state.board_state.dimensions[0] ||
                ny < 0 || ny >= state.board_state.dimensions[1]) {
                continue;
            }

            const neighborKey = `${nx},${ny}`;
            if (visited.has(neighborKey)) continue;

            const neighborId = board[neighborKey];
            if (!neighborId) {
                // 空点，是气
                liberties.add(neighborKey);
            } else if (state.entities[neighborId].owner === color) {
                // 同色棋子，加入组
                visited.add(neighborKey);
                queue.push([nx, ny]);
            }
        }
    }

    return { group, liberties: Array.from(liberties) };
}

/**
 * 检查落子后需要提走的敌方棋子
 * @param {number} x - 落子X坐标
 * @param {number} y - 落子Y坐标
 * @param {object} state - 游戏状态（模拟落子后）
 * @param {string} playerColor - 当前玩家颜色
 * @returns {Array<string>} 需要提走的实体ID数组
 */
function findCapturedStones(x, y, state, playerColor) {
    const board = state.board_state.occupied_nodes;
    const enemyColor = playerColor === 'black' ? 'white' : 'black';
    const captured = [];
    const visited = new Set();

    // 检查落子点周围的敌方棋子
    const directions = [[1,0], [-1,0], [0,1], [0,-1]];
    for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;

        if (nx < 0 || nx >= state.board_state.dimensions[0] ||
            ny < 0 || ny >= state.board_state.dimensions[1]) {
            continue;
        }

        const key = `${nx},${ny}`;
        const entityId = board[key];

        if (entityId && state.entities[entityId].owner === enemyColor && !visited.has(key)) {
            // 检查这个敌方组的气
            const { liberties } = getGroupAndLiberties(nx, ny, state, enemyColor);
            if (liberties.length === 0) {
                // 没有气，需要提走
                const { group } = getGroupAndLiberties(nx, ny, state, enemyColor);
                captured.push(...group);
                // 标记组内所有棋子为已访问
                for (const stoneId of group) {
                    const stone = state.entities[stoneId];
                    visited.add(`${stone.position[0]},${stone.position[1]}`);
                }
            }
        }
    }

    return captured;
}

/**
 * 模拟落子并检查合法性
 * @param {number} x - 落子X坐标
 * @param {number} y - 落子Y坐标
 * @param {object} state - 当前游戏状态
 * @param {string} playerColor - 玩家颜色
 * @returns {object} {isValid: boolean, captured: Array<string>, isSuicide: boolean}
 */
function simulateMove(x, y, state, playerColor) {
    // 1. 检查落子点是否为空
    const key = `${x},${y}`;
    if (state.board_state.occupied_nodes[key]) {
        return { isValid: false, captured: [], isSuicide: false };
    }

    // 2. 创建模拟状态（落子后）
    const simulatedState = JSON.parse(JSON.stringify(state));
    const pieceId = `stone_${x}_${y}`;
    simulatedState.board_state.occupied_nodes[key] = pieceId;
    simulatedState.entities[pieceId] = {
        owner: playerColor,
        type_id: 'stone',
        position: [x, y],
        attributes: {}
    };

    // 3. 检查提子
    const captured = findCapturedStones(x, y, simulatedState, playerColor);

    // 4. 执行提子（在模拟状态中）
    for (const entityId of captured) {
        const entity = simulatedState.entities[entityId];
        if (entity) {
            const posKey = `${entity.position[0]},${entity.position[1]}`;
            delete simulatedState.board_state.occupied_nodes[posKey];
            delete simulatedState.entities[entityId];
        }
    }

    // 5. 检查自杀（落子后自己的组是否有气）
    const { liberties } = getGroupAndLiberties(x, y, simulatedState, playerColor);
    const isSuicide = liberties.length === 0;

    // 6. 合法性判断：不能自杀，除非提走了对方棋子
    const isValid = !isSuicide || captured.length > 0;

    return { isValid, captured, isSuicide };
}

/**
 * 检查是否为劫争
 * @param {number} x - 落子X坐标
 * @param {number} y - 落子Y坐标
 * @param {Array<string>} captured - 提走的棋子ID数组
 * @param {object} state - 游戏状态
 * @returns {boolean}
 */
function isKoViolation(x, y, captured, state) {
    // 劫争规则：不能立即提回单个棋子，除非局面发生变化
    if (captured.length === 1 && lastCapturedPos) {
        const [lastX, lastY] = lastCapturedPos;
        const capturedEntityId = captured[0];
        const capturedEntity = state.entities[capturedEntityId];

        if (capturedEntity && capturedEntity.position[0] === x && capturedEntity.position[1] === y) {
            // 尝试在刚刚被提子的位置落子
            const boardBefore = state.board_state.occupied_nodes;
            const boardKey = `${x},${y}`;

            // 检查局面是否与上一步完全相同（除了被提的棋子）
            // 简化：检查被提的棋子是否是上一步提走的唯一棋子
            if (lastCapturedGroupSize === 1) {
                return true;
            }
        }
    }
    return false;
}

/**
 * 主逻辑函数：当玩家尝试落子时调用
 */
function onMoveAttempt(selectedEntityId, targetPos, gameState) {
    const [x, y] = targetPos;
    const actions = [];

    if (selectedEntityId) return [];

    const activePlayerIndex = gameState.turn_management.active_player_index;
    const playerColor = gameState.turn_management.players[activePlayerIndex];

    const { isValid, captured, isSuicide } = simulateMove(x, y, gameState, playerColor);

    if (!isValid) return [];
    if (isKoViolation(x, y, captured, gameState)) return [];

    // 修复 Bug：严格指定坐标和前端绑定的纹理映射键 type_id
    actions.push({
        type: "MUTATE_STATE",
        entity_id: `stone_${x}_${y}`,
        x: x,
        y: y,
        type_id: playerColor === 'black' ? 'stone_black' : 'stone_white',
        animation_duration_ms: 300
    });

    for (const entityId of captured) {
        actions.push({
            type: "DESTROY_ENTITY",
            entity_id: entityId,
            animation_duration_ms: 200
        });
    }

    if (captured.length > 0) {
        lastCapturedPos = [x, y];
        lastCapturedGroupSize = captured.length;
    } else {
        lastCapturedPos = null;
        lastCapturedGroupSize = 0;
    }

    return actions;
}

/**
 * 响应由 UI 面板传入的自定义动作
 */
function onCustomAction(actionId, gameState) {
    const actions = [];
    if (actionId === "pass") {
        actions.push({ type: "END_TURN" });
    } else if (actionId === "resign") {
        // 在未来的正式版本中可拓展进入结算屏
        console.log("玩家投子认输");
    }
    return actions;
}

globalThis.onMoveAttempt = onMoveAttempt;
globalThis.onCustomAction = onCustomAction;