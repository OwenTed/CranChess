export interface TweenOptions {
    targetId: string;
    startX: number;
    startY: number;
    endX: number;
    endY: number;
    startScaleX?: number;
    endScaleX?: number;
    startScaleY?: number;
    endScaleY?: number;
    startRotation?: number; // 弧度
    endRotation?: number;
    startAlpha?: number; // 0-1
    endAlpha?: number;
    durationMs: number;
    startTime: number;
    easing?: (t: number) => number; // 缓动函数，默认线性
}

export class TweenManager {
    private activeTweens: Map<string, TweenOptions> = new Map();

    public addTween(tween: TweenOptions) {
        this.activeTweens.set(tween.targetId, tween);
    }

    public getInterpolatedPosition(targetId: string, currentTime: number): {x: number, y: number} | null {
        const state = this.getInterpolatedState(targetId, currentTime);
        return state ? { x: state.x, y: state.y } : null;
    }

    public getInterpolatedState(targetId: string, currentTime: number): {x: number, y: number, scaleX: number, scaleY: number, rotation: number, alpha: number} | null {
        const tween = this.activeTweens.get(targetId);
        if (!tween) return null;

        const elapsed = currentTime - tween.startTime;
        if (elapsed >= tween.durationMs) {
            this.activeTweens.delete(targetId);
            return null; // 动画结束
        }

        const progress = elapsed / tween.durationMs;
        const ease = tween.easing || ((t) => t);
        const t = ease(progress);

        const currentX = tween.startX + (tween.endX - tween.startX) * t;
        const currentY = tween.startY + (tween.endY - tween.startY) * t;
        const startScaleX = tween.startScaleX ?? 1;
        const endScaleX = tween.endScaleX ?? 1;
        const startScaleY = tween.startScaleY ?? 1;
        const endScaleY = tween.endScaleY ?? 1;
        const currentScaleX = startScaleX + (endScaleX - startScaleX) * t;
        const currentScaleY = startScaleY + (endScaleY - startScaleY) * t;
        const startRotation = tween.startRotation ?? 0;
        const endRotation = tween.endRotation ?? 0;
        const currentRotation = startRotation + (endRotation - startRotation) * t;
        const startAlpha = tween.startAlpha ?? 1;
        const endAlpha = tween.endAlpha ?? 1;
        const currentAlpha = startAlpha + (endAlpha - startAlpha) * t;

        return {
            x: currentX,
            y: currentY,
            scaleX: currentScaleX,
            scaleY: currentScaleY,
            rotation: currentRotation,
            alpha: currentAlpha
        };
    }

    public hasActiveTweens(): boolean {
        return this.activeTweens.size > 0;
    }
}