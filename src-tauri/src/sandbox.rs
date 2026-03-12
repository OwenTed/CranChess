use boa_engine::{Context, Source};
use crate::state_manager::GameState;
use serde_json::json;

pub struct JsSandbox {
    context: Context<'static>,
}

impl JsSandbox {
    pub fn new(script_content: &str) -> Result<Self, String> {
        let mut context = Context::default();

        let setup_script = r#"
            Object.freeze(Object.prototype);
            try { delete globalThis.eval; } catch(e) {}
            try { delete globalThis.Function; } catch(e) {}

            // 确定性保障：重写时间与注入基于种子的 PRNG
            globalThis.__engine_seed = 1048576;
            Math.random = function() {
                var t = globalThis.__engine_seed += 0x6D2B79F5;
                t = Math.imul(t ^ t >>> 15, t | 1);
                t ^= t + Math.imul(t ^ t >>> 7, t | 61);
                return ((t ^ t >>> 14) >>> 0) / 4294967296;
            };
            Date.now = function() { return 0; };

            // 事件总线架构
            globalThis.EventBus = {
                listeners: {},
                on: function(event, callback) {
                    if(!this.listeners[event]) this.listeners[event] = [];
                    this.listeners[event].push(callback);
                },
                emit: function(event, data) {
                    if(this.listeners[event]) {
                        this.listeners[event].forEach(cb => cb(data));
                    }
                }
            };
        "#;
        context.eval(Source::from_bytes(setup_script)).ok();

        context.eval(Source::from_bytes(script_content))
            .map_err(|e| format!("Failed to load user script: {}", e))?;

        Ok(Self { context })
    }

    pub fn trigger_on_move(
        &mut self,
        state: &GameState,
        selected_id: Option<&str>,
        target_pos: (i32, i32)
    ) -> Result<serde_json::Value, String> {
        let selected_arg = selected_id.map(|id| format!("\"{}\"", id)).unwrap_or_else(|| "null".to_string());
        self.call_hook("onMoveAttempt", state, Some(&[
            &selected_arg,
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

    pub fn trigger_custom_action(
        &mut self,
        state: &GameState,
        action_id: &str
    ) -> Result<serde_json::Value, String> {
        self.call_hook("onCustomAction", state, Some(&[&format!("\"{}\"", action_id)]))
    }

    fn call_hook(
        &mut self,
        hook_name: &str,
        state: &GameState,
        extra_args: Option<&[&str]>
    ) -> Result<serde_json::Value, String> {
        self.inject_stateful_apis(state)?;

        let state_json = serde_json::to_string(state)
            .map_err(|e| format!("State serialization failed: {}", e))?;

        let mut args_str = String::new();
        if let Some(args) = extra_args {
            for arg in args {
                args_str.push_str(", ");
                args_str.push_str(arg);
            }
        }

        let wrapper_code = format!(r#"
            (function() {{
                try {{
                    const res = {}(JSON.parse('{}') {});
                    if (res instanceof Promise) {{
                        res.then(val => globalThis.__promiseResult = val)
                           .catch(err => globalThis.__promiseError = err);
                        return "PROMISE_PENDING";
                    }}
                    return JSON.stringify(res);
                }} catch (e) {{
                    return JSON.stringify({{ error: e.toString() }});
                }}
            }})()
        "#, hook_name, state_json, args_str);

        let result = self.context.eval(Source::from_bytes(wrapper_code.as_bytes()))
            .map_err(|e| format!("Hook execution failed ({}): {}", hook_name, e))?;

        let mut result_str = result.to_string(&mut self.context)
            .map_err(|e| format!("Result conversion failed: {}", e))?
            .to_std_string()
            .map_err(|e| format!("String conversion failed: {}", e))?;

        if result_str == "PROMISE_PENDING" {
            self.context.run_jobs();
            
            let check_err = self.context.eval(Source::from_bytes("globalThis.__promiseError ? globalThis.__promiseError.toString() : null".as_bytes()))
                .map_err(|e| e.to_string())?;
            
            if !check_err.is_null() {
                let err_msg = check_err.to_string(&mut self.context).unwrap().to_std_string().unwrap();
                return Err(format!("Promise rejected in hook {}: {}", hook_name, err_msg));
            }

            let promise_val = self.context.eval(Source::from_bytes("JSON.stringify(globalThis.__promiseResult)".as_bytes()))
                .map_err(|e| e.to_string())?;
            
            result_str = promise_val.to_string(&mut self.context).unwrap().to_std_string().unwrap();
        }

        serde_json::from_str(&result_str)
            .map_err(|e| format!("JSON parsing failed: {}", e))
    }

    fn inject_stateful_apis(&mut self, state: &GameState) -> Result<(), String> {
        let state_json = serde_json::to_string(state)
            .map_err(|e| format!("State serialization failed: {}", e))?;

        let api_script = format!(r#"
            (function() {{
                const rawState = JSON.parse('{}');
                
                // Draft State 代理，支持同计算周期的级联推演与增量计算
                globalThis.__draftState = {{
                    board: JSON.parse(JSON.stringify(rawState.board_state)),
                    entities: JSON.parse(JSON.stringify(rawState.entities))
                }};

                function coordKey(x, y) {{ return x + "," + y; }}

                globalThis.CranCore = Object.freeze({{
                    simulateAction: function(action) {{
                        const board = globalThis.__draftState.board;
                        const entities = globalThis.__draftState.entities;
                        if (action.type === 'DESTROY_ENTITY') {{
                            delete entities[action.entity_id];
                            for(let k in board.occupied_nodes) {{
                                if(board.occupied_nodes[k] === action.entity_id) delete board.occupied_nodes[k];
                            }}
                        }} else if (action.type === 'MOVE_ENTITY') {{
                            const e = entities[action.entity_id];
                            if(e) {{
                                delete board.occupied_nodes[coordKey(e.position[0], e.position[1])];
                                e.position = [action.to_x, action.to_y];
                                board.occupied_nodes[coordKey(action.to_x, action.to_y)] = action.entity_id;
                            }}
                        }} else if (action.type === 'MUTATE_STATE') {{
                            entities[action.entity_id] = {{
                                owner: rawState.turn_management.players[rawState.turn_management.active_player_index],
                                type_id: action.type_id,
                                position: [action.x, action.y],
                                attributes: {{}}
                            }};
                            board.occupied_nodes[coordKey(action.x, action.y)] = action.entity_id;
                        }}
                    }},

                    getPieceAt: function(x, y) {{
                        const id = globalThis.__draftState.board.occupied_nodes[coordKey(x, y)];
                        return id ? Object.assign({{id: id}}, globalThis.__draftState.entities[id]) : null;
                    }},

                    queryEntities: function(filterFn) {{
                        const result = [];
                        const entities = globalThis.__draftState.entities;
                        for (const id in entities) {{
                            const entity = Object.assign({{id: id}}, entities[id]);
                            if (!filterFn || filterFn(entity)) result.push(entity);
                        }}
                        return result;
                    }}
                }});
            }})();
        "#, state_json.replace("'", "\\'").replace("\\", "\\\\"));

        self.context.eval(Source::from_bytes(api_script.as_bytes()))
            .map_err(|e| format!("Core API injection failed: {}", e))?;

        Ok(())
    }

    pub fn trigger_control_change(
        &mut self,
        state: &GameState,
        control_id: &str,
        value: serde_json::Value
    ) -> Result<serde_json::Value, String> {
        let val_str = value.to_string();
        self.call_hook("onControlChange", state, Some(&[&format!("\"{}\"", control_id), &val_str]))
    }

    pub fn trigger_tick(
        &mut self,
        state: &GameState
    ) -> Result<serde_json::Value, String> {
        self.inject_stateful_apis(state)?;

        // 触发事件总线上的 onTick 监听器
        let tick_code = r#"
            (function() {
                try {
                    // 收集 Tick 期间产生的所有动作
                    globalThis.__tickActions = [];
                    globalThis.EventBus.emit('onTick', globalThis.__draftState);
                    return JSON.stringify(globalThis.__tickActions);
                } catch (e) {
                    return JSON.stringify({ error: e.toString() });
                }
            })()
        "#;

        let result = self.context.eval(Source::from_bytes(tick_code.as_bytes()))
            .map_err(|e| format!("Tick execution failed: {}", e))?;

        let result_str = result.to_string(&mut self.context)
            .map_err(|e| format!("Result conversion failed: {}", e))?
            .to_std_string()
            .map_err(|e| format!("String conversion failed: {}", e))?;

        serde_json::from_str(&result_str)
            .map_err(|e| format!("JSON parsing failed: {}", e))
    }
}