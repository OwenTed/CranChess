import { invoke } from "@tauri-apps/api/tauri";
import { Renderer } from "./renderer";
import { TweenManager } from "./tween";
import { assetManager } from "./asset-manager";

const tweenManager = new TweenManager();
let renderer: Renderer | null = null;
let latestGameState: any = null;
let gameLoopId: number | null = null;
let fetchStateLoopId: number | null = null;

async function fetchStateLoop() {
    if (!tweenManager.hasActiveTweens()) {
        try {
            console.log('获取游戏状态...');
            latestGameState = await invoke("get_current_state");
            console.log('获取到状态:', latestGameState ? '是' : '否');
            // 更新 HUD
            const hud = document.getElementById("current-player");
            if (hud && latestGameState) {
                const activeIdx = latestGameState.turn_management.active_player_index;
                const player = latestGameState.turn_management.players[activeIdx];
                hud.innerText = player === "black" ? "黑棋" : "白棋";
                hud.style.color = player === "black" ? "#ffffff" : "#cccccc";
                console.log('HUD更新为:', player);
            }
        } catch (error) {
            console.error("同步失败:", error);
        }
    } else {
        console.log('有活跃动画，跳过状态获取');
    }
    if (fetchStateLoopId) {
        setTimeout(fetchStateLoop, 100);
    }
}

function gameLoop(currentTime: number) {
    if (renderer && latestGameState) {
        renderer.renderFrame(latestGameState, tweenManager, currentTime);
    }
    if (gameLoopId) {
        requestAnimationFrame(gameLoop);
    }
}

async function startGameEngine(gameId?: string) {
    console.log('启动游戏引擎，游戏ID:', gameId);
    // 确保canvas和HUD可见
    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    const hud = document.getElementById("hud");
    if (canvas) canvas.style.display = 'block';
    if (hud) hud.style.display = 'block';

    // 加载游戏资源
    if (gameId) {
        try {
            await assetManager.loadGame(gameId);
            console.log('游戏资源加载完成');
        } catch (error) {
            console.error('游戏资源加载失败，使用默认渲染:', error);
        }
    }

    // 初始化渲染器
    if (!renderer) {
        renderer = new Renderer("game-canvas", 32, assetManager);
    }

    // 启动循环
    if (!gameLoopId) {
        gameLoopId = requestAnimationFrame(gameLoop);
    }
    if (!fetchStateLoopId) {
        fetchStateLoopId = setTimeout(fetchStateLoop, 100);
    }

    // 绑定点击事件（确保只绑定一次）
    canvas?.addEventListener("click", canvasClickHandler);
}

function stopGameEngine() {
    console.log('停止游戏引擎');
    // 停止循环
    if (gameLoopId) {
        cancelAnimationFrame(gameLoopId);
        gameLoopId = null;
    }
    if (fetchStateLoopId) {
        clearTimeout(fetchStateLoopId);
        fetchStateLoopId = null;
    }

    // 隐藏canvas和HUD
    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    const hud = document.getElementById("hud");
    if (canvas) canvas.style.display = 'none';
    if (hud) hud.style.display = 'none';

    // 移除点击事件
    canvas?.removeEventListener("click", canvasClickHandler);
}

async function canvasClickHandler(e: MouseEvent) {
    if (tweenManager.hasActiveTweens()) return;

    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const gridX = Math.round(clickX / 32);
    const gridY = Math.round(clickY / 32);

    try {
        console.log(`点击位置: 网格(${gridX}, ${gridY})`);
        const actionsJson: string = await invoke("attempt_move", { targetX: gridX, targetY: gridY });
        console.log('动作JSON:', actionsJson);
        const actions = JSON.parse(actionsJson);
        console.log('动作数组:', actions);

        latestGameState = await invoke("get_current_state");
        console.log('更新后的状态获取成功');

        // 获取动画速度因子
        const animationSpeed = (window as any).cranchessSettings?.animationSpeed || 1;

        // 按顺序处理动作队列
        for (const action of actions) {
            if (action.type === "MOVE_ENTITY") {
                // 如果是移动或新落子，可以加个渐显动画
                tweenManager.addTween({
                    targetId: action.entity_id,
                    startX: gridX, startY: gridY, // 围棋落子坐标相同，仅用于动画占位
                    endX: gridX, endY: gridY,
                    durationMs: action.animation_duration_ms / animationSpeed,
                    startTime: performance.now()
                });
            } else if (action.type === "MUTATE_STATE") {
                // 新棋子出现动画：从0放大到1
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
                // 触发提子消失动画，这里可以扩展一个 Tween 类型让它缩小消失
                console.log("提子：", action.entity_id);
            }
        }
    } catch (err) {
        console.warn("无效走法");
    }
}

// 全局函数供UI调用
(window as any).startGameEngine = startGameEngine;

// 当从游戏屏幕返回时停止引擎
document.getElementById('back-from-game')?.addEventListener('click', stopGameEngine);

// 页面加载时不自动启动游戏
window.addEventListener("DOMContentLoaded", () => {
    console.log('CranChess 页面加载完成');
    // 确保canvas和HUD初始隐藏
    const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
    const hud = document.getElementById("hud");
    if (canvas) canvas.style.display = 'none';
    if (hud) hud.style.display = 'none';
});