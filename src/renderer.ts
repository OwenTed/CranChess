import { TweenManager } from "./tween";
import { assetManager, AssetManager } from "./asset-manager";

export class Renderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private tileSize: number;
    private assetManager: AssetManager;

    // 离屏渲染缓存层
    private bgCanvas: HTMLCanvasElement;
    private bgCtx: CanvasRenderingContext2D;
    private lastBgWidth: number = -1;
    private lastBgHeight: number = -1;
    private lastTileSize: number = -1;

    constructor(canvasId: string, tileSize: number, assetManager?: AssetManager) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext("2d")!;
        this.tileSize = tileSize;
        this.assetManager = assetManager || (window as any).assetManager;
        this.bgCanvas = document.createElement("canvas");
        this.bgCtx = this.bgCanvas.getContext("2d")!;
    }

    public getTileSize(): number {
        return this.tileSize;
    }

    public renderFrame(gameState: any, tweenManager: TweenManager, currentTime: number, selectedEntityId: string | null) {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (!gameState || !gameState.board_state) return;

        const width = gameState.board_state.dimensions[0];
        const height = gameState.board_state.dimensions[1];

        const effectiveWidth = Math.max(1, width - 1);
        const effectiveHeight = Math.max(1, height - 1);
        const tileSizeX = this.canvas.width / effectiveWidth;
        const tileSizeY = this.canvas.height / effectiveHeight;
        this.tileSize = Math.min(tileSizeX, tileSizeY);

        // 离屏层缓存校验与重建
        if (this.lastBgWidth !== width || this.lastBgHeight !== height || 
            this.lastTileSize !== this.tileSize || this.bgCanvas.width !== this.canvas.width) {
            
            this.bgCanvas.width = this.canvas.width;
            this.bgCanvas.height = this.canvas.height;
            this.bgCtx.clearRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
            
            const boardImg = this.assetManager.getBoardImage();
            if (boardImg) {
                this.bgCtx.drawImage(boardImg, 0, 0, width * this.tileSize, height * this.tileSize);
            }
            
            this.bgCtx.strokeStyle = "#334155";
            this.bgCtx.lineWidth = 1;
            for (let i = 0; i < width; i++) {
                this.bgCtx.beginPath();
                this.bgCtx.moveTo(i * this.tileSize, 0);
                this.bgCtx.lineTo(i * this.tileSize, height * this.tileSize);
                this.bgCtx.stroke();
            }
            for (let i = 0; i < height; i++) {
                this.bgCtx.beginPath();
                this.bgCtx.moveTo(0, i * this.tileSize);
                this.bgCtx.lineTo(width * this.tileSize, i * this.tileSize);
                this.bgCtx.stroke();
            }
            
            this.lastBgWidth = width;
            this.lastBgHeight = height;
            this.lastTileSize = this.tileSize;
        }

        // 呈现静态缓存层
        this.ctx.drawImage(this.bgCanvas, 0, 0);

        const renderOffset = this.assetManager.getRenderOffset();

        // 选中高亮与动态实体渲染逻辑保持不变...
        if (selectedEntityId && gameState.entities[selectedEntityId]) {
            const entity = gameState.entities[selectedEntityId];
            const screenX = (entity.position[0] + renderOffset.x) * this.tileSize;
            const screenY = (entity.position[1] + renderOffset.y) * this.tileSize;
            
            this.ctx.save();
            this.ctx.fillStyle = "rgba(96, 165, 250, 0.4)";
            this.ctx.beginPath();
            this.ctx.arc(screenX, screenY, this.tileSize * 0.45, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }

        const entities = gameState.entities || {};
        
        for (const entityId in entities) {
            const entity = entities[entityId];
            let logicX = entity.position[0];
            let logicY = entity.position[1];
            let scaleX = 1;
            let scaleY = 1;
            let alpha = 1;
            let rotation = 0;

            const tweenState = tweenManager.getInterpolatedState(entityId, currentTime);
            if (tweenState) {
                logicX = tweenState.x;
                logicY = tweenState.y;
                scaleX = tweenState.scaleX;
                scaleY = tweenState.scaleY;
                alpha = tweenState.alpha;
                rotation = tweenState.rotation;
            }

            const screenX = (logicX + renderOffset.x) * this.tileSize;
            const screenY = (logicY + renderOffset.y) * this.tileSize;

            const typeId = entity.type_id || (entity.owner === "black" ? "stone_black" : "stone_white");
            
            this.ctx.save();
            this.ctx.globalAlpha = alpha;
            this.drawEntity(screenX, screenY, typeId, scaleX, scaleY, rotation);
            this.ctx.restore();
        }
    }

    private drawBoardBackground(width: number, height: number) {
        const boardImg = this.assetManager.getBoardImage();
        if (boardImg) {
            this.ctx.drawImage(boardImg, 0, 0, width * this.tileSize, height * this.tileSize);
        }
    }

    private drawGrid(dims: [number, number]) {
        this.ctx.strokeStyle = "#334155";
        this.ctx.lineWidth = 1;
        for (let i = 0; i < dims[0]; i++) {
            this.ctx.beginPath();
            this.ctx.moveTo(i * this.tileSize, 0);
            this.ctx.lineTo(i * this.tileSize, dims[1] * this.tileSize);
            this.ctx.stroke();
            
            this.ctx.beginPath();
            this.ctx.moveTo(0, i * this.tileSize);
            this.ctx.lineTo(dims[0] * this.tileSize, i * this.tileSize);
            this.ctx.stroke();
        }
    }

    private drawEntity(x: number, y: number, typeId: string, scaleX: number, scaleY: number, rotation: number = 0) {
        const img = this.assetManager.getEntityImage(typeId);
        if (img) {
            const anchor = this.assetManager.getEntityAnchor(typeId);
            const drawWidth = img.width * scaleX;
            const drawHeight = img.height * scaleY;
            
            // 使用矩阵变换支持旋转
            this.ctx.save();
            this.ctx.translate(x, y);
            this.ctx.rotate(rotation);
            const drawX = -drawWidth * anchor[0];
            const drawY = -drawHeight * anchor[1];
            
            this.ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
            this.ctx.restore();
        } else {
            // Placeholder 绘制
            this.ctx.fillStyle = typeId.includes('black') ? "#000000" : "#ffffff";
            this.ctx.beginPath();
            this.ctx.ellipse(x, y, this.tileSize * 0.4 * scaleX, this.tileSize * 0.4 * scaleY, rotation, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.strokeStyle = "#475569";
            this.ctx.stroke();
        }
    }
}