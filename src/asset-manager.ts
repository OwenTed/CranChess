import { invoke } from "@tauri-apps/api/tauri";
import { convertFileSrc } from "@tauri-apps/api/tauri";

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
    public manifest: Manifest | null = null;
    private gameId: string = '';

    constructor() {}

    async loadGame(gameId: string): Promise<boolean> {
        this.gameId = gameId;
        try {
            this.manifest = await invoke("get_game_manifest", { gameId });
            
            const activePacks = (window as any).cranchessSettings?.activeResourcePacks || [];
            const entities = this.manifest!.assets_mapping.entities;
            
            const loadPromises = Object.entries(entities).map(async ([key, { path }]) => {
                await this.loadImage(key, path, gameId, activePacks);
            });

            if (this.manifest!.assets_mapping.board_texture) {
                await this.loadImage('__board__', this.manifest!.assets_mapping.board_texture, gameId, activePacks);
            }

            await Promise.all(loadPromises);
            return true;
        } catch (error) {
            console.error("资源解析防线阻断:", error);
            return false;
        }
    }

    async loadImage(key: string, assetPath: string, gameId: string, activePacks: string[]): Promise<void> {
        return new Promise(async (resolve, reject) => {
            if (this.loadedImages.has(key)) {
                resolve();
                return;
            }
            try {
                const physicalPath = await invoke<string>("resolve_asset_path", {
                    gameId: gameId,
                    assetPath: assetPath,
                    activePacks: activePacks
                });
                
                const assetUrl = convertFileSrc(physicalPath);
                
                const img = new Image();
                img.onload = () => {
                    this.loadedImages.set(key, img);
                    resolve();
                };
                img.onerror = () => {
                    reject(new Error(`最终材质映射挂载失败: ${assetUrl}`));
                };
                img.src = assetUrl;
            } catch (e) {
                reject(e);
            }
        });
    }

    getEntityImage(typeId: string): HTMLImageElement | null {
        return this.loadedImages.get(typeId) || null;
    }

    getBoardImage(): HTMLImageElement | null {
        return this.loadedImages.get('__board__') || null;
    }

    getEntityAnchor(typeId: string): [number, number] {
        if (!this.manifest) return [0.5, 0.5];
        return this.manifest.assets_mapping.entities[typeId]?.anchor || [0.5, 0.5];
    }

    getBoardDimensions(): [number, number] {
        if (!this.manifest) return [8, 8];
        return [this.manifest.environment.grid_width, this.manifest.environment.grid_height];
    }

    getRenderMode(): string {
        return this.manifest?.environment.render_mode || 'grid_center';
    }

    getRenderOffset(): { x: number; y: number } {
        return this.manifest?.environment.render_offset || { x: 0.5, y: 0.5 };
    }

    clear() {
        this.loadedImages.clear();
        this.manifest = null;
        this.gameId = '';
    }
}

export const assetManager = new AssetManager();

if (typeof window !== 'undefined') {
    (window as any).assetManager = assetManager;
}