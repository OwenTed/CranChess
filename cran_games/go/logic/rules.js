/**
 * CranChess 围棋规则脚本 - 纯净重构版
 * 完全拥抱 EventBus 生命周期与 Draft State 架构
 */

let lastCapturedPos = null;
let lastCapturedGroupSize = 0;

function getGroupAndLiberties(x, y, state, color) {
    const board = state.board_state.occupied_nodes;
    const group = [];
    const liberties = new Set();
    const queue = [[x, y]];
    const visited = new Set();
    const key = `${x},${y}`;

    const startId = board[key];
    if (!startId || state.entities[startId].owner !== color) {
        return { group, liberties: Array.from(liberties) };
    }

    visited.add(key);

    while (queue.length > 0) {
        const [cx, cy] = queue.shift();
        const currentKey = `${cx},${cy}`;
        group.push(board[currentKey]);

        const neighbors = [[cx+1, cy], [cx-1, cy], [cx, cy+1], [cx, cy-1]];
        for (const [nx, ny] of neighbors) {
            if (nx < 0 || nx >= state.board_state.dimensions[0] || ny < 0 || ny >= state.board_state.dimensions[1]) {
                continue;
            }

            const neighborKey = `${nx},${ny}`;
            if (visited.has(neighborKey)) continue;

            const neighborId = board[neighborKey];
            if (!neighborId) {
                liberties.add(neighborKey);
            } else if (state.entities[neighborId].owner === color) {
                visited.add(neighborKey);
                queue.push([nx, ny]);
            }
        }
    }

    return { group, liberties: Array.from(liberties) };
}

function findCapturedStones(x, y, state, playerColor) {
    const board = state.board_state.occupied_nodes;
    const enemyColor = playerColor === 'black' ? 'white' : 'black';
    const captured = [];
    const visited = new Set();

    const directions = [[1,0], [-1,0], [0,1], [0,-1]];
    for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;

        if (nx < 0 || nx >= state.board_state.dimensions[0] || ny < 0 || ny >= state.board_state.dimensions[1]) {
            continue;
        }

        const key = `${nx},${ny}`;
        const entityId = board[key];

        if (entityId && state.entities[entityId].owner === enemyColor && !visited.has(key)) {
            const { liberties } = getGroupAndLiberties(nx, ny, state, enemyColor);
            if (liberties.length === 0) {
                const { group } = getGroupAndLiberties(nx, ny, state, enemyColor);
                captured.push(...group);
                for (const stoneId of group) {
                    const stone = state.entities[stoneId];
                    visited.add(`${stone.position[0]},${stone.position[1]}`);
                }
            }
        }
    }

    return captured;
}

function simulateMove(x, y, state, playerColor) {
    const key = `${x},${y}`;
    if (state.board_state.occupied_nodes[key]) {
        return { isValid: false, captured: [], isSuicide: false };
    }

    const simulatedState = JSON.parse(JSON.stringify(state));
    const pieceId = `stone_${x}_${y}`;
    simulatedState.board_state.occupied_nodes[key] = pieceId;
    simulatedState.entities[pieceId] = {
        owner: playerColor,
        type_id: 'stone',
        position: [x, y],
        attributes: {}
    };

    const captured = findCapturedStones(x, y, simulatedState, playerColor);

    for (const entityId of captured) {
        const entity = simulatedState.entities[entityId];
        if (entity) {
            const posKey = `${entity.position[0]},${entity.position[1]}`;
            delete simulatedState.board_state.occupied_nodes[posKey];
            delete simulatedState.entities[entityId];
        }
    }

    const { liberties } = getGroupAndLiberties(x, y, simulatedState, playerColor);
    const isSuicide = liberties.length === 0;
    const isValid = !isSuicide || captured.length > 0;

    return { isValid, captured, isSuicide };
}

function isKoViolation(x, y, captured, state) {
    if (captured.length === 1 && lastCapturedPos) {
        const [lastX, lastY] = lastCapturedPos;
        const capturedEntityId = captured[0];
        const capturedEntity = state.entities[capturedEntityId];

        if (capturedEntity && capturedEntity.position[0] === x && capturedEntity.position[1] === y) {
            if (lastCapturedGroupSize === 1) {
                return true;
            }
        }
    }
    return false;
}

EventBus.on('onMoveAttempt', (payload) => {
    // 适配 EventBus 的单参数载荷解构
    const { state, selectedEntityId, targetPos } = payload;
    const [x, y] = targetPos;
    
    // 如果底层的沙盒封装已将动作收集器挂载为全局变量，可直接推入
    const actions = globalThis.__tickActions || [];

    if (selectedEntityId) return actions;

    const activePlayerIndex = state.turn_management.active_player_index;
    const playerColor = state.turn_management.players[activePlayerIndex];

    const { isValid, captured, isSuicide } = simulateMove(x, y, state, playerColor);

    if (!isValid) return actions;
    if (isKoViolation(x, y, captured, state)) return actions;

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
});

EventBus.on('onCustomAction', (payload) => {
    const { actionId, state } = payload;
    const actions = globalThis.__tickActions || [];
    
    if (actionId === "pass") {
        actions.push({ type: "END_TURN" });
    } else if (actionId === "resign") {
        actions.push({ 
            type: "MESSAGE", 
            text: `${state.turn_management.players[state.turn_management.active_player_index]} 选择了投子认输` 
        });
        actions.push({ type: "END_TURN" });
    }
    
    return actions;
});