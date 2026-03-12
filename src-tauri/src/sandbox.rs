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

    fn call_hook(
        &mut self,
        hook_name: &str,
        state: &GameState,
        extra_args: Option<&[&str]>
    ) -> Result<serde_json::Value, String> {
        self.inject_stateful_apis(state)?;

        let state_json = serde_json::to_string(state)
            .map_err(|e| format!("State serialization failed: {}", e))?;

        let mut call_code = format!("JSON.stringify({}(JSON.parse('{}')", hook_name, state_json);

        if let Some(args) = extra_args {
            for arg in args {
                call_code.push_str(", ");
                call_code.push_str(arg);
            }
        }
        call_code.push_str("))");

        let result = self.context.eval(Source::from_bytes(call_code.as_bytes()))
            .map_err(|e| format!("Hook execution failed ({}): {}", hook_name, e))?;

        let result_str = result.to_string(&mut self.context)
            .map_err(|e| format!("Result conversion failed: {}", e))?
            .to_std_string()
            .map_err(|e| format!("String conversion failed: {}", e))?;

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
                    }}
                }});
            }})();
        "#, state_json.replace("'", "\\'").replace("\\", "\\\\"));

        self.context.eval(Source::from_bytes(api_script.as_bytes()))
            .map_err(|e| format!("Core API injection failed: {}", e))?;

        Ok(())
    }
}