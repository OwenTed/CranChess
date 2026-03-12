import { invoke } from "@tauri-apps/api/tauri";
import { Renderer } from "./renderer";
import { TweenManager } from "./tween";
import { assetManager } from "./asset-manager";

const tweenManager = new TweenManager();
let renderer: Renderer | null = null;
let latestGameState: any = null;
let gameLoopId: number | null = null;
let fetchStateLoopId: number | null = null;
let selectedEntityId: string | null = null;

async function fetchStateLoop() {
    if (!tweenManager.hasActiveTweens()) {
        try {
            latestGameState = await invoke("get_current_state");
            const hud = document.getElementById("current-player");
            if (hud && latestGameState) {
                const activeIdx = latestGameState.turn_management.active_player_index;
                const player = latestGameState.turn_management.players[activeIdx];
                hud.innerText = player === "black" ? "黑棋" : "白棋";
                hud.style.color = player === "black" ? "#ffffff" : "#cccccc";
            }
        } catch (error) {
            console.error("同步状态失败:", error);
        }
    }
    if (fetchStateLoopId) {
        setTimeout(fetchStateLoop, 100);
    }
}

function gameLoop(currentTime: number) {
    if (renderer && latestGameState) {
        renderer.renderFrame(latestGameState, tweenManager, currentTime, selectedEntityId);
    }
    if (gameLoopId) {
        requestAnimationFrame(gameLoop);
    }
}

async function startGameEngine(gameId?: string) {
    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    const hud = document.getElementById("hud");
    if (canvas) canvas.style.display = 'block';
    if (hud) hud.style.display = 'block';

    if (gameId) {
        try {
            await assetManager.loadGame(gameId);
        } catch (error) {
            console.error('游戏资源加载失败:', error);
        }
    }

    if (!renderer) {
        renderer = new Renderer("game-canvas", 32, assetManager);
    }

    selectedEntityId = null;

    if (!gameLoopId) {
        gameLoopId = requestAnimationFrame(gameLoop);
    }
    if (!fetchStateLoopId) {
        fetchStateLoopId = setTimeout(fetchStateLoop, 100);
    }

    canvas?.removeEventListener("click", canvasClickHandler);
    canvas?.addEventListener("click", canvasClickHandler);
}

function stopGameEngine() {
    if (gameLoopId) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }
    if (fetchStateLoopId) {
        clearTimeout(fetchStateLoopId);
        fetchStateLoopId = null;
    }

    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    const hud = document.getElementById("hud");
    if (canvas) canvas.style.display = 'none';
    if (hud) hud.style.display = 'none';

    canvas?.removeEventListener("click", canvasClickHandler);
    selectedEntityId = null;
}

async function canvasClickHandler(e: MouseEvent) {
    if (tweenManager.hasActiveTweens()) return;

    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const tileSize = renderer?.getTileSize() || 32;
    const renderOffset = assetManager.getRenderOffset();
    
    const gridX = Math.round(clickX / tileSize - renderOffset.x);
    const gridY = Math.round(clickY / tileSize - renderOffset.y);

    const coordKey = `${gridX},${gridY}`;
    const clickedEntityId = latestGameState?.board_state.occupied_nodes[coordKey];

    if (!selectedEntityId && clickedEntityId) {
        const entity = latestGameState.entities[clickedEntityId];
        const activePlayer = latestGameState.turn_management.players[latestGameState.turn_management.active_player_index];
        if (entity && entity.owner === activePlayer) {
            selectedEntityId = clickedEntityId;
            return;
        }
    }

    if (selectedEntityId && clickedEntityId === selectedEntityId) {
        selectedEntityId = null;
        return;
    }

    try {
        const actionsJson: string = await invoke("attempt_move", { 
            targetX: gridX, 
            targetY: gridY,
            selectedId: selectedEntityId
        });
        
        const actions = JSON.parse(actionsJson);
        latestGameState = await invoke("get_current_state");
        
        const animationSpeed = (window as any).cranchessSettings?.animationSpeed || 1;
        let moveSuccessful = false;

        for (const action of actions) {
            if (action.type === "MOVE_ENTITY") {
                moveSuccessful = true;
                tweenManager.addTween({
                    targetId: action.entity_id,
                    startX: action.from_x || 0, 
                    startY: action.from_y || 0,
                    endX: action.to_x || gridX, 
                    endY: action.to_y || gridY,
                    durationMs: (action.animation_duration_ms || 300) / animationSpeed,
                    startTime: performance.now()
                });
            } else if (action.type === "MUTATE_STATE") {
                moveSuccessful = true;
                tweenManager.addTween({
                    targetId: action.entity_id,
                    startX: gridX, startY: gridY,
                    endX: gridX, endY: gridY,
                    startScaleX: 0, endScaleX: 1,
                    startScaleY: 0, endScaleY: 1,
                    startAlpha: 0, endAlpha: 1,
                    durationMs: (action.animation_duration_ms || 300) / animationSpeed,
                    startTime: performance.now()
                });
            } else if (action.type === "DESTROY_ENTITY") {
                tweenManager.addTween({
                    targetId: action.entity_id,
                    startX: gridX, startY: gridY,
                    endX: gridX, endY: gridY,
                    startScaleX: 1, endScaleX: 0,
                    startScaleY: 1, endScaleY: 0,
                    startAlpha: 1, endAlpha: 0,
                    durationMs: (action.animation_duration_ms || 200) / animationSpeed,
                    startTime: performance.now()
                });
            }
        }

        if (moveSuccessful) {
            selectedEntityId = null;
        }

    } catch (err) {
        console.warn("走法判定被引擎拒绝或发生错误");
        selectedEntityId = null;
    }
}

(window as any).startGameEngine = startGameEngine;
document.getElementById('back-from-game')?.addEventListener('click', stopGameEngine);

window.addEventListener("DOMContentLoaded", () => {
    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    const hud = document.getElementById("hud");
    if (canvas) canvas.style.display = 'none';
    if (hud) hud.style.display = 'none';
});