export interface AssetMapping {
    entities: Record<string, { path: string; anchor: [number, number] }>;
    board_texture?: string;
}

export interface Manifest {
    meta: {
        game_id: string;
        name: string;
        version: string;
        author: string;
    };
    environment: {
        grid_width: number;
        grid_height: number;
        valid_nodes: string;
        render_mode: string;
        render_offset: { x: number; y: number };
    };
    assets_mapping: AssetMapping;
    entry_point: string;
}

export class AssetManager {
    private loadedImages: Map<string, HTMLImageElement> = new Map();
    private manifest: Manifest | null = null;
    private gameId: string = '';

    constructor() {}

    // 加载游戏资源
    async loadGame(gameId: string): Promise<boolean> {
        this.gameId = gameId;
        try {
            // 加载 manifest
            const manifestPath = `cran_games/${gameId}/manifest.json`;
            const response = await fetch(manifestPath);
            if (!response.ok) {
                throw new Error(`无法加载 manifest: ${response.status}`);
            }
            this.manifest = await response.json();
            console.log(`加载游戏 ${gameId} 的 manifest 成功`, this.manifest);

            // 预加载所有实体图片
            const entities = this.manifest!.assets_mapping.entities;
            const loadPromises = Object.entries(entities).map(async ([key, { path }]) => {
                await this.loadImage(key, `cran_games/${gameId}/${path}`);
            });

            // 加载棋盘纹理（如果有）
            if (this.manifest!.assets_mapping.board_texture) {
                const boardPath = `cran_games/${gameId}/${this.manifest!.assets_mapping.board_texture}`;
                loadPromises.push(this.loadImage('__board__', boardPath));
            }

            await Promise.all(loadPromises);
            console.log(`游戏 ${gameId} 资源加载完成`);
            return true;
        } catch (error) {
            console.error(`加载游戏 ${gameId} 资源失败:`, error);
            return false;
        }
    }

    // 加载单个图片
    async loadImage(key: string, path: string): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.loadedImages.has(key)) {
                resolve();
                return;
            }
            const img = new Image();
            img.onload = () => {
                console.log(`图片加载成功: ${key} (${path})`);
                this.loadedImages.set(key, img);
                resolve();
            };
            img.onerror = () => {
                console.error(`图片加载失败: ${path}`);
                reject(new Error(`无法加载图片: ${path}`));
            };
            img.src = path;
        });
    }

    // 获取实体图片
    getEntityImage(typeId: string): HTMLImageElement | null {
        return this.loadedImages.get(typeId) || null;
    }

    // 获取棋盘图片
    getBoardImage(): HTMLImageElement | null {
        return this.loadedImages.get('__board__') || null;
    }

    // 获取实体锚点（相对位置）
    getEntityAnchor(typeId: string): [number, number] {
        if (!this.manifest) return [0.5, 0.5];
        return this.manifest.assets_mapping.entities[typeId]?.anchor || [0.5, 0.5];
    }

    // 获取棋盘尺寸
    getBoardDimensions(): [number, number] {
        if (!this.manifest) return [8, 8];
        return [this.manifest.environment.grid_width, this.manifest.environment.grid_height];
    }

    // 获取渲染模式和偏移
    getRenderMode(): string {
        return this.manifest?.environment.render_mode || 'grid_center';
    }

    getRenderOffset(): { x: number; y: number } {
        return this.manifest?.environment.render_offset || { x: 0.5, y: 0.5 };
    }

    // 清理资源
    clear() {
        this.loadedImages.clear();
        this.manifest = null;
        this.gameId = '';
    }
}

// 全局实例
export const assetManager = new AssetManager();

// 暴露给全局窗口对象
if (typeof window !== 'undefined') {
    (window as any).assetManager = assetManager;
}