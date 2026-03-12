use boa_engine::{Context, Source};
use crate::state_manager::GameState;
use serde_json::json;

pub struct JsSandbox {
    context: Context<'static>,
}

impl JsSandbox {
    pub fn new(script_content: &str) -> Result<Self, String> {
        let mut context = Context::default();

        let disable_script = r#"
            Object.freeze(Object.prototype);
            try { delete globalThis.eval; } catch(e) {}
            try { delete globalThis.Function; } catch(e) {}
        "#;
        context.eval(Source::from_bytes(disable_script)).ok();

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
                const currentState = JSON.parse('{}');
                const board = currentState.board_state;
                const entities = currentState.entities;

                function coordKey(x, y) {{ return x + "," + y; }}

                globalThis.CranCore = Object.freeze({{
                    raycast: function(startX, startY, dirX, dirY, maxSteps) {{
                        const passedNodes = [];
                        let cx = startX;
                        let cy = startY;
                        let steps = 0;
                        const sx = Math.sign(dirX);
                        const sy = Math.sign(dirY);

                        while(true) {{
                            cx += sx;
                            cy += sy;
                            steps++;

                            if (cx < 0 || cx >= board.dimensions[0] || cy < 0 || cy >= board.dimensions[1]) {{
                                return {{ passedNodes: passedNodes, hitEntityId: null, hitBoundary: true }};
                            }}

                            const key = coordKey(cx, cy);
                            if (board.occupied_nodes[key]) {{
                                return {{ passedNodes: passedNodes, hitEntityId: board.occupied_nodes[key], hitBoundary: false }};
                            }}

                            passedNodes.push([cx, cy]);
                            if (steps >= maxSteps) break;
                        }}
                        return {{ passedNodes: passedNodes, hitEntityId: null, hitBoundary: false }};
                    }},

                    getPieceAt: function(x, y) {{
                        const id = board.occupied_nodes[coordKey(x, y)];
                        return id ? Object.assign({{id: id}}, entities[id]) : null;
                    }},

                    queryEntities: function(filterFn) {{
                        const result = [];
                        for (const id in entities) {{
                            const entity = Object.assign({{id: id}}, entities[id]);
                            if (!filterFn || filterFn(entity)) result.push(entity);
                        }}
                        return result;
                    }},

                    getLineOfSight: function(fromPos, toPos) {{
                        const nodes = [];
                        let x0 = fromPos[0], y0 = fromPos[1];
                        const x1 = toPos[0], y1 = toPos[1];
                        const dx = Math.abs(x1 - x0);
                        const dy = Math.abs(y1 - y0);
                        const sx = (x0 < x1) ? 1 : -1;
                        const sy = (y0 < y1) ? 1 : -1;
                        let err = dx - dy;

                        while (true) {{
                            nodes.push([x0, y0]);
                            if (x0 === x1 && y0 === y1) break;
                            const e2 = 2 * err;
                            if (e2 > -dy) {{ err -= dy; x0 += sx; }}
                            if (e2 < dx) {{ err += dx; y0 += sy; }}
                        }}
                        return nodes;
                    }},

                    getThreatenedPositions: function(pieceType, position) {{
                        const x = position[0], y = position[1];
                        const threats = [];
                        const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
                        for (const d of dirs) {{
                            const nx = x + d[0], ny = y + d[1];
                            if (nx >= 0 && nx < board.dimensions[0] && ny >= 0 && ny < board.dimensions[1]) {{
                                threats.push([nx, ny]);
                            }}
                        }}
                        return threats;
                    }},

                    evaluateBoard: function(callback) {{
                        const result = [];
                        for (const key in board.occupied_nodes) {{
                            const id = board.occupied_nodes[key];
                            const entity = Object.assign({{id: id}}, entities[id]);
                            if (callback && typeof callback === 'function') {{
                                result.push(callback(entity));
                            }} else {{
                                result.push(entity);
                            }}
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
}