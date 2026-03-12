import { TweenManager } from "./tween";
import { assetManager, AssetManager } from "./asset-manager";

export class Renderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private tileSize: number;
    private assetManager: AssetManager;

    constructor(canvasId: string, tileSize: number, assetManager?: AssetManager) {
        console.log('创建Renderer，canvasId:', canvasId, 'tileSize:', tileSize);
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        console.log('canvas元素:', this.canvas);
        this.ctx = this.canvas.getContext("2d")!;
        console.log('canvas上下文:', this.ctx);
        this.tileSize = tileSize;
        console.log('设置tileSize为:', this.tileSize);
        this.assetManager = assetManager || (window as any).assetManager;
    }

    public renderFrame(gameState: any, tweenManager: TweenManager, currentTime: number) {
        console.log('渲染帧，初始tileSize:', this.tileSize, 'canvas尺寸:', this.canvas.width, this.canvas.height);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (!gameState || !gameState.board_state) {
            console.log('无游戏状态或棋盘状态');
            return;
        }

        const width = gameState.board_state.dimensions[0];
        const height = gameState.board_state.dimensions[1];
        console.log('棋盘维度:', width, 'x', height, '棋子数量:', Object.keys(gameState.entities || {}).length);

        // 动态计算tileSize以适应画布
        const effectiveWidth = Math.max(1, width - 1);
        const effectiveHeight = Math.max(1, height - 1);
        const tileSizeX = this.canvas.width / effectiveWidth;
        const tileSizeY = this.canvas.height / effectiveHeight;
        this.tileSize = Math.min(tileSizeX, tileSizeY);
        console.log('计算后tileSize:', this.tileSize);

        // 绘制棋盘背景（如果有棋盘纹理）
        this.drawBoardBackground(width, height);

        // 绘制网格线
        this.drawGrid([width, height]);

        const entities = gameState.entities || {};
        console.log('实体数量:', Object.keys(entities).length);
        for (const entityId in entities) {
            const entity = entities[entityId];
            let logicX = entity.position[0];
            let logicY = entity.position[1];
            console.log(`实体 ${entityId}: 逻辑位置 (${logicX}, ${logicY}), 类型: ${entity.type_id}, 所有者: ${entity.owner}`);

            // 处理动画插值
            const tweenPos = tweenManager.getInterpolatedPosition(entityId, currentTime);
            if (tweenPos) {
                logicX = tweenPos.x;
                logicY = tweenPos.y;
                console.log(`  动画位置: (${logicX}, ${logicY})`);
            }

            // 使用动态计算的像素位置，应用渲染偏移
            // 公式：$$screen = (logic + renderOffset) \times tileSize$$
            const renderOffset = this.assetManager.getRenderOffset();
            const screenX = (logicX + renderOffset.x) * this.tileSize;
            const screenY = (logicY + renderOffset.y) * this.tileSize;
            console.log(`  屏幕位置: (${screenX}, ${screenY}), 偏移: (${renderOffset.x}, ${renderOffset.y})`);

            // 尝试使用图片绘制实体，否则回退到圆形棋子
            const typeId = entity.type_id || (entity.owner === "black" ? "stone_black" : "stone_white");
            this.drawEntity(screenX, screenY, typeId);
        }
    }

    private drawBoardBackground(width: number, height: number) {
        const boardImg = this.assetManager.getBoardImage();
        if (boardImg) {
            // 拉伸图片以覆盖整个棋盘
            this.ctx.drawImage(boardImg, 0, 0, width * this.tileSize, height * this.tileSize);
            console.log('绘制棋盘背景');
        }
    }

    private drawGrid(dims: [number, number]) {
        console.log(`绘制网格: 维度 ${dims[0]}x${dims[1]}, tileSize: ${this.tileSize}`);
        this.ctx.strokeStyle = "#334155";
        this.ctx.lineWidth = 1;
        for (let i = 0; i < dims[0]; i++) {
            // 纵线
            this.ctx.beginPath();
            this.ctx.moveTo(i * this.tileSize, 0);
            this.ctx.lineTo(i * this.tileSize, dims[1] * this.tileSize);
            this.ctx.stroke();
            // 横线
            this.ctx.beginPath();
            this.ctx.moveTo(0, i * this.tileSize);
            this.ctx.lineTo(dims[0] * this.tileSize, i * this.tileSize);
            this.ctx.stroke();
        }
        console.log('网格绘制完成');
    }

    private drawEntity(x: number, y: number, typeId: string) {
        const img = this.assetManager.getEntityImage(typeId);
        if (img) {
            // 获取锚点
            const anchor = this.assetManager.getEntityAnchor(typeId);
            const drawX = x - img.width * anchor[0];
            const drawY = y - img.height * anchor[1];
            this.ctx.drawImage(img, drawX, drawY);
            console.log(`绘制实体图片: ${typeId} 于位置(${drawX}, ${drawY})`);
        } else {
            // 回退到圆形棋子
            this.drawStone(x, y, typeId.includes('black') ? 'black' : 'white');
        }
    }

    private drawStone(x: number, y: number, owner: string) {
        console.log(`绘制棋子: 位置(${x}, ${y}), 颜色: ${owner}, 半径: ${this.tileSize * 0.4}`);
        this.ctx.fillStyle = owner === "black" ? "#000000" : "#ffffff";
        this.ctx.beginPath();
        this.ctx.arc(x, y, this.tileSize * 0.4, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.strokeStyle = "#475569";
        this.ctx.stroke();
    }
}