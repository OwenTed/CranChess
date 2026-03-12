/**
 * CranChess 井字棋规则脚本
 * 完全基于 EventBus 与新版沙盒架构
 */

EventBus.on('onMoveAttempt', (payload) => {
    const { state, selectedEntityId, targetPos } = payload;
    const [x, y] = targetPos;
    const actions = globalThis.__tickActions || [];

    if (selectedEntityId) return actions;

    const key = `${x},${y}`;
    if (state.board_state.occupied_nodes[key]) return actions;

    const activePlayerIndex = state.turn_management.active_player_index;
    const playerColor = state.turn_management.players[activePlayerIndex];
    const typeId = playerColor === 'black' ? 'piece_x' : 'piece_o';

    actions.push({
        type: "MUTATE_STATE",
        entity_id: `piece_${x}_${y}`,
        x: x,
        y: y,
        type_id: typeId,
        animation_duration_ms: 200
    });

    const simulatedBoard = {};
    for (const nodeKey in state.board_state.occupied_nodes) {
        const entityId = state.board_state.occupied_nodes[nodeKey];
        simulatedBoard[nodeKey] = state.entities[entityId].owner;
    }
    simulatedBoard[key] = playerColor;

    const checkLine = (a, b, c) => {
        return simulatedBoard[a] && simulatedBoard[a] === simulatedBoard[b] && simulatedBoard[a] === simulatedBoard[c];
    };

    let isWin = false;
    for (let i = 0; i < 3; i++) {
        if (checkLine(`${i},0`, `${i},1`, `${i},2`)) isWin = true;
        if (checkLine(`0,${i}`, `1,${i}`, `2,${i}`)) isWin = true;
    }
    if (checkLine('0,0', '1,1', '2,2')) isWin = true;
    if (checkLine('0,2', '1,1', '2,0')) isWin = true;

    if (isWin) {
        const winnerName = playerColor === 'black' ? '先手(X)' : '后手(O)';
        actions.push({
            type: "MESSAGE",
            text: `游戏结束，${winnerName} 获胜！`
        });
    } else {
        let isDraw = true;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (!simulatedBoard[`${i},${j}`]) isDraw = false;
            }
        }
        
        if (isDraw) {
            actions.push({
                type: "MESSAGE",
                text: `盘面已满，双方平局！`
            });
        } else {
            actions.push({ type: "END_TURN" });
        }
    }

    return actions;
});