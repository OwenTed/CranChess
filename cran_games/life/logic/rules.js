EventBus.on('onGameStart', (payload) => {
    const { state } = payload;
    const actions = [];
    const width = state.board_state.dimensions[0];
    const height = state.board_state.dimensions[1];

    for (let x = 10; x < 30; x++) {
        for (let y = 10; y < 30; y++) {
            if (Math.random() > 0.7) {
                actions.push({
                    type: "MUTATE_STATE",
                    entity_id: `cell_${x}_${y}`,
                    x: x,
                    y: y,
                    type_id: "cell_alive",
                    animation_duration_ms: 0
                });
            }
        }
    }
    return actions;
});

EventBus.on('onTick', (draftState) => {
    const actions = globalThis.__tickActions || [];
    const board = draftState.board.occupied_nodes;
    const dimX = draftState.board.dimensions[0];
    const dimY = draftState.board.dimensions[1];

    const neighborCounts = {};
    const currentAlive = {};

    for (const key in board) {
        currentAlive[key] = board[key];
        const [xStr, yStr] = key.split(',');
        const x = parseInt(xStr, 10);
        const y = parseInt(yStr, 10);

        if (neighborCounts[key] === undefined) {
            neighborCounts[key] = 0;
        }

        for (let dx = -1; dx <= 1; dx++) {
            for (let dy = -1; dy <= 1; dy++) {
                if (dx === 0 && dy === 0) continue;
                const nx = x + dx;
                const ny = y + dy;
                if (nx >= 0 && nx < dimX && ny >= 0 && ny < dimY) {
                    const nKey = `${nx},${ny}`;
                    neighborCounts[nKey] = (neighborCounts[nKey] || 0) + 1;
                }
            }
        }
    }

    for (const key in neighborCounts) {
        const count = neighborCounts[key];
        const isAlive = currentAlive[key] !== undefined;
        const [xStr, yStr] = key.split(',');
        const x = parseInt(xStr, 10);
        const y = parseInt(yStr, 10);

        if (isAlive) {
            if (count < 2 || count > 3) {
                actions.push({
                    type: "DESTROY_ENTITY",
                    entity_id: currentAlive[key],
                    animation_duration_ms: 0
                });
            }
        } else {
            if (count === 3) {
                actions.push({
                    type: "MUTATE_STATE",
                    entity_id: `cell_${x}_${y}`,
                    x: x,
                    y: y,
                    type_id: "cell_alive",
                    animation_duration_ms: 0
                });
            }
        }
    }

    return actions;
});

EventBus.on('onMoveAttempt', (payload) => {
    const { state, targetPos } = payload;
    const [x, y] = targetPos;
    const actions = globalThis.__tickActions || [];
    const key = `${x},${y}`;

    if (!state.board_state.occupied_nodes[key]) {
        actions.push({
            type: "MUTATE_STATE",
            entity_id: `cell_${x}_${y}`,
            x: x,
            y: y,
            type_id: "cell_alive",
            animation_duration_ms: 0
        });
    } else {
        actions.push({
            type: "DESTROY_ENTITY",
            entity_id: state.board_state.occupied_nodes[key],
            animation_duration_ms: 0
        });
    }
    return actions;
});