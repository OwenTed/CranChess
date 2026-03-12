import { invoke, convertFileSrc } from "@tauri-apps/api/tauri";
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
            if (hud && latestGameState && latestGameState.turn_management) {
                const activeIdx = latestGameState.turn_management.active_player_index;
                const player = latestGameState.turn_management.players[activeIdx];
                hud.innerText = player === "black" ? "黑棋行动" : "白棋行动";
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
    if (gameId) {
        try {
            // 重置底层引擎状态机并分配线程
            await invoke("load_game", { gameId });
            await assetManager.loadGame(gameId);
            renderCustomButtons();
        } catch (error) {
            console.error('游戏加载或初始化崩溃:', error);
            return;
        }
    }

    if (!renderer) {
        renderer = new Renderer("game-canvas", 32, assetManager);
    }

    selectedEntityId = null;

    if (!gameLoopId) gameLoopId = requestAnimationFrame(gameLoop);
    if (!fetchStateLoopId) fetchStateLoopId = setTimeout(fetchStateLoop, 100);

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
    canvas?.removeEventListener("click", canvasClickHandler);
    selectedEntityId = null;
}

function renderCustomButtons() {
    const container = document.getElementById('custom-buttons-container');
    if (!container) return;
    container.innerHTML = '';
    
    const manifest: any = (window as any).assetManager?.manifest;
    if (manifest?.custom_ui?.buttons && manifest.custom_ui.buttons.length > 0) {
        manifest.custom_ui.buttons.forEach((btn: any) => {
            const el = document.createElement('button');
            el.className = 'btn btn-outline';
            el.innerText = btn.label;
            el.onclick = () => handleCustomAction(btn.id);
            container.appendChild(el);
        });
    } else {
        container.innerHTML = '<div style="font-size:0.85rem; color:var(--text-muted)">该游戏暂无专属定制扩展项。</div>';
    }
}

async function processActions(actionsJson: string, triggerX: number = 0, triggerY: number = 0) {
    const actions = JSON.parse(actionsJson);
    latestGameState = await invoke("get_current_state");
    const animationSpeed = (window as any).cranchessSettings?.animationSpeed || 1;
    let moveSuccessful = false;

    for (const action of actions) {
        const destX = action.to_x ?? action.x ?? triggerX;
        const destY = action.to_y ?? action.y ?? triggerY;
        const duration = (action.animation_duration_ms || 300) / animationSpeed;

        if (action.type === "MOVE_ENTITY") {
            moveSuccessful = true;
            tweenManager.addTween({
                targetId: action.entity_id,
                startX: action.from_x || 0, startY: action.from_y || 0,
                endX: destX, endY: destY,
                durationMs: duration,
                startTime: performance.now()
            });
        } else if (action.type === "MUTATE_STATE") {
            moveSuccessful = true;
            tweenManager.addTween({
                targetId: action.entity_id,
                startX: destX, startY: destY, endX: destX, endY: destY,
                startScaleX: 0, endScaleX: 1, startScaleY: 0, endScaleY: 1,
                startAlpha: 0, endAlpha: 1,
                durationMs: duration, startTime: performance.now()
            });
        } else if (action.type === "DESTROY_ENTITY") {
            tweenManager.addTween({
                targetId: action.entity_id,
                startX: destX, startY: destY, endX: destX, endY: destY,
                startScaleX: 1, endScaleX: 0, startScaleY: 1, endScaleY: 0,
                startAlpha: 1, endAlpha: 0,
                durationMs: duration, startTime: performance.now()
            });
        } else if (action.type === "ANIMATE") {
            moveSuccessful = true;
            const entity = latestGameState.entities[action.entity_id];
            if (entity) {
                tweenManager.addTween({
                    targetId: action.entity_id,
                    startX: entity.position[0], startY: entity.position[1],
                    endX: entity.position[0], endY: entity.position[1],
                    startRotation: action.start_rotation || 0, endRotation: action.end_rotation || 0,
                    startAlpha: action.start_alpha ?? 1, endAlpha: action.end_alpha ?? 1,
                    startScaleX: action.start_scale ?? 1, endScaleX: action.end_scale ?? 1,
                    startScaleY: action.start_scale ?? 1, endScaleY: action.end_scale ?? 1,
                    durationMs: duration, startTime: performance.now()
                });
            }
        } else if (action.type === "SOUND") {
            if (action.asset_path) {
                try {
                    const manifest: any = (window as any).assetManager?.manifest;
                    const physicalPath = await invoke<string>("resolve_asset_path", {
                        gameId: manifest?.meta?.game_id || "",
                        assetPath: action.asset_path,
                        activePacks: (window as any).cranchessSettings?.activeResourcePacks || []
                    });
                    const audio = new Audio(convertFileSrc(physicalPath));
                    audio.volume = ((window as any).cranchessSettings?.audio?.sfxVolume || 100) / 100;
                    audio.play();
                } catch (e) { console.warn("无法播放音效:", e); }
            }
        } else if (action.type === "MESSAGE") {
            const { message } = await import('@tauri-apps/api/dialog');
            await message(action.text || "", { title: "对局信息", type: "info" });
        } else if (action.type === "DELAY") {
            await new Promise(resolve => setTimeout(resolve, action.duration_ms || 500));
        }
    }
    return moveSuccessful;
}

async function handleCustomAction(actionId: string) {
    if (tweenManager.hasActiveTweens()) return;
    try {
        const actionsJson: string = await invoke("trigger_custom_action", { actionId });
        await processActions(actionsJson);
        selectedEntityId = null;
    } catch (err) {
        console.warn("自定义事件请求异常", err);
    }
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
            targetX: gridX, targetY: gridY, selectedId: selectedEntityId
        });
        const success = await processActions(actionsJson, gridX, gridY);
        if (success) selectedEntityId = null;
    } catch (err) {
        console.warn("走法判定被引擎拒绝或发生错误");
        selectedEntityId = null;
    }
}

// 绑定通用UI回调
document.getElementById('btn-undo')?.addEventListener('click', async () => {
    try { 
        await invoke("undo_move"); 
        tweenManager.clear();
        latestGameState = await invoke("get_current_state");
    } catch(e) { console.warn("回滚阻断", e); }
});
document.getElementById('btn-redo')?.addEventListener('click', async () => {
    try { 
        await invoke("redo_move"); 
        tweenManager.clear();
        latestGameState = await invoke("get_current_state");
    } catch(e) { console.warn("重做阻断", e); }
});

(window as any).startGameEngine = startGameEngine;
(window as any).stopGameEngine = stopGameEngine;