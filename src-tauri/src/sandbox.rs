use boa_engine::{Context, Source};
use crate::state_manager::GameState;
use crate::raycast::{cast_ray_on_state, RaycastResult};
use serde_json::json;

pub struct JsSandbox {
    context: Context<'static>,
}

impl JsSandbox {
    pub fn new(script_content: &str) -> Result<Self, String> {
        let mut context = Context::default();

        // 注入初始的 CranChess API 对象（占位符）
        let api_script = r#"
            var CranChess = Object.freeze({
                raycast: function(startX, startY, dirX, dirY, maxSteps) {
                    throw new Error('CranChess.raycast must be implemented by host');
                },
                getPieceAt: function(x, y) {
                    throw new Error('CranChess.getPieceAt must be implemented by host');
                },
                queryEntities: function(filterCondition) {
                    throw new Error('CranChess.queryEntities must be implemented by host');
                }
            });
            Object.defineProperty(globalThis, 'CranChess', {
                value: CranChess,
                writable: false,
                configurable: false,
                enumerable: false,
            });
        "#;

        context.eval(Source::from_bytes(api_script))
            .map_err(|e| format!("API 注入失败: {}", e))?;

        // 尝试禁用危险全局函数
        let disable_script = r#"
            try { delete globalThis.eval; } catch {}
            try { delete globalThis.Function; } catch {}
        "#;
        context.eval(Source::from_bytes(disable_script)).ok();

        // 加载用户脚本
        context.eval(Source::from_bytes(script_content))
            .map_err(|e| format!("JS 脚本加载失败: {}", e))?;

        Ok(Self { context })
    }

    pub fn trigger_on_move(
        &mut self,
        state: &GameState,
        target_pos: (i32, i32)
    ) -> Result<serde_json::Value, String> {
        self.call_hook("onMoveAttempt", state, Some(&[
            "null", // selectedEntityId (围棋中为null)
            &format!("[{}, {}]", target_pos.0, target_pos.1)
        ]))
    }

    pub fn trigger_on_game_start(
        &mut self,
        state: &GameState
    ) -> Result<serde_json::Value, String> {
        self.call_hook("onGameStart", state, None)
    }

    pub fn trigger_on_piece_select(
        &mut self,
        state: &GameState,
        piece_id: &str
    ) -> Result<serde_json::Value, String> {
        self.call_hook("onPieceSelect", state, Some(&[&format!("\"{}\"", piece_id)]))
    }

    pub fn trigger_on_turn_end(
        &mut self,
        state: &GameState,
        player: &str
    ) -> Result<serde_json::Value, String> {
        self.call_hook("onTurnEnd", state, Some(&[&format!("\"{}\"", player)]))
    }

    fn call_hook(
        &mut self,
        hook_name: &str,
        state: &GameState,
        extra_args: Option<&[&str]>
    ) -> Result<serde_json::Value, String> {
        // 注入基于当前状态的 API
        self.inject_stateful_apis(state)?;

        let state_json = serde_json::to_string(state)
            .map_err(|e| format!("状态序列化失败: {}", e))?;

        // 构建 JavaScript 调用代码
        let mut call_code = format!("JSON.stringify({}(JSON.parse('{}')", hook_name, state_json);

        if let Some(args) = extra_args {
            for arg in args {
                call_code.push_str(", ");
                call_code.push_str(arg);
            }
        }

        call_code.push_str("))");

        let result = self.context.eval(Source::from_bytes(call_code.as_bytes()))
            .map_err(|e| format!("钩子 {} 执行失败: {}", hook_name, e))?;

        let result_str = result.to_string(&mut self.context)
            .map_err(|e| format!("结果转换失败: {}", e))?
            .to_std_string()
            .map_err(|e| format!("字符串转换失败: {}", e))?;

        serde_json::from_str(&result_str)
            .map_err(|e| format!("JSON 解析失败: {}", e))
    }

    fn inject_stateful_apis(&mut self, state: &GameState) -> Result<(), String> {
        // 序列化状态数据以便在 JavaScript 中使用
        let state_json = serde_json::to_string(state)
            .map_err(|e| format!("状态序列化失败: {}", e))?;

        // 创建 JavaScript 代码来注入基于当前状态的 API
        let api_script = format!(r#"
            // 解析状态数据
            const __currentState = JSON.parse('{}');
            const __boardState = __currentState.board_state;
            const __entities = __currentState.entities;

            // 辅助函数：获取坐标键
            function __coordKey(x, y) {{
                return x + "," + y;
            }}

            // 辅助函数：射线投射实现
            function __raycastImpl(startX, startY, dirX, dirY, maxSteps) {{
                // 简化实现：在 JavaScript 中实现射线投射
                // 注意：这是简化版本，实际应该使用 Rust 实现
                const board = __boardState;
                const passedNodes = [];
                let currentX = startX;
                let currentY = startY;
                let stepsTaken = 0;

                const stepX = Math.sign(dirX);
                const stepY = Math.sign(dirY);

                while (true) {{
                    currentX += stepX;
                    currentY += stepY;
                    stepsTaken++;

                    // 边界检测
                    if (currentX < 0 || currentX >= board.dimensions[0] ||
                        currentY < 0 || currentY >= board.dimensions[1]) {{
                        return {{
                            passedNodes: passedNodes,
                            hitEntityId: null,
                            hitBoundary: true
                        }};
                    }}

                    // 实体碰撞检测
                    const coordKey = __coordKey(currentX, currentY);
                    const entityId = board.occupied_nodes[coordKey];
                    if (entityId) {{
                        return {{
                            passedNodes: passedNodes,
                            hitEntityId: entityId,
                            hitBoundary: false
                        }};
                    }}

                    passedNodes.push([currentX, currentY]);

                    if (stepsTaken >= maxSteps) {{
                        break;
                    }}
                }}

                return {{
                    passedNodes: passedNodes,
                    hitEntityId: null,
                    hitBoundary: false
                }};
            }}

            // 更新 CranChess API
            var CranChess = Object.freeze({{
                raycast: function(startX, startY, dirX, dirY, maxSteps) {{
                    return __raycastImpl(startX, startY, dirX, dirY, maxSteps);
                }},

                getPieceAt: function(x, y) {{
                    const coordKey = __coordKey(x, y);
                    const entityId = __boardState.occupied_nodes[coordKey];
                    if (entityId && __entities[entityId]) {{
                        const entity = __entities[entityId];
                        return {{
                            id: entityId,
                            owner: entity.owner,
                            type_id: entity.type_id,
                            position: entity.position
                        }};
                    }}
                    return null;
                }},

                queryEntities: function(filterCondition) {{
                    // 简化实现：返回所有实体
                    // TODO: 实现过滤条件
                    const result = [];
                    for (const entityId in __entities) {{
                        const entity = __entities[entityId];
                        result.push({{
                            id: entityId,
                            owner: entity.owner,
                            type_id: entity.type_id,
                            position: entity.position
                        }});
                    }}
                    return result;
                }}
            }});

            // 重新定义全局 CranChess 对象
            Object.defineProperty(globalThis, 'CranChess', {{
                value: CranChess,
                writable: false,
                configurable: false,
                enumerable: false
            }});
        "#, state_json.replace("'", "\\'"));

        self.context.eval(Source::from_bytes(api_script.as_bytes()))
            .map_err(|e| format!("API 注入失败: {}", e))?;

        Ok(())
    }
}