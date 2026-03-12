import { invoke } from "@tauri-apps/api/tauri";

export interface GameClient {
    connect(gameId: string, activeMods: string[]): Promise<void>;
    sendTick(): Promise<string>;
    sendMove(targetX: number, targetY: number, selectedId: string | null): Promise<string>;
    sendCustomAction(actionId: string): Promise<string>;
    sendControlChange(controlId: string, value: any): Promise<string>;
    fetchState(): Promise<any>;
    syncRemoteState(stateJson: string): Promise<void>;
    onStateUpdate(callback: (state: any) => void): void;
    onActionsReceived(callback: (actionsJson: string, triggerX: number, triggerY: number) => void): void;
}

export class LocalGameClient implements GameClient {
    private stateUpdateCallback?: (state: any) => void;
    private actionsCallback?: (actionsJson: string, triggerX: number, triggerY: number) => void;

    async connect(gameId: string, activeMods: string[]): Promise<void> {
        await invoke("load_game", { gameId, activeMods });
    }

    async sendTick(): Promise<string> {
        const actionsJson: string = await invoke("trigger_engine_tick");
        if (actionsJson !== "[]" && this.actionsCallback) {
            this.actionsCallback(actionsJson, 0, 0);
        }
        return actionsJson;
    }

    async sendMove(targetX: number, targetY: number, selectedId: string | null): Promise<string> {
        // 本地模式下直接调用 Rust 引擎进行判定
        const actionsJson: string = await invoke("attempt_move", { 
            targetX, targetY, selectedId 
        });
        if (this.actionsCallback) this.actionsCallback(actionsJson, targetX, targetY);
        return actionsJson;
    }

    async sendCustomAction(actionId: string): Promise<string> {
        const actionsJson: string = await invoke("trigger_custom_action", { actionId });
        if (this.actionsCallback) this.actionsCallback(actionsJson, 0, 0);
        return actionsJson;
    }

    async sendControlChange(controlId: string, value: any): Promise<string> {
        const actionsJson: string = await invoke("trigger_control_change", { controlId, value });
        if (this.actionsCallback) this.actionsCallback(actionsJson, 0, 0);
        return actionsJson;
    }

    async fetchState(): Promise<any> {
        const state = await invoke("get_current_state");
        if (this.stateUpdateCallback) this.stateUpdateCallback(state);
        return state;
    }

    async syncRemoteState(stateJson: string): Promise<void> {
        await invoke("sync_remote_state", { stateJson });
        await this.fetchState();
    }

    onStateUpdate(callback: (state: any) => void) {
        this.stateUpdateCallback = callback;
    }

    onActionsReceived(callback: (actionsJson: string, triggerX: number, triggerY: number) => void) {
        this.actionsCallback = callback;
    }
}