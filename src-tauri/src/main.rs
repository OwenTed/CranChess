#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

mod state_manager;
mod mod_loader;
mod raycast;
mod sandbox;

use state_manager::{StateManager, GameState, TurnManagement, BoardState};
use tauri::State;
use std::sync::{RwLock, mpsc};
use std::collections::HashMap;
use std::thread;
use serde_json::json;
use std::time::SystemTime;

enum JsMessage {
    TriggerOnMove {
        state: GameState,
        selected_id: Option<String>,
        target_pos: (i32, i32),
        reply: mpsc::Sender<Result<serde_json::Value, String>>,
    },
    TriggerCustomAction {
        state: GameState,
        action_id: String,
        reply: mpsc::Sender<Result<serde_json::Value, String>>,
    },
}

struct EngineState {
    pub manager: RwLock<StateManager>,
    pub js_channel: RwLock<Option<mpsc::Sender<JsMessage>>>,
}

fn apply_actions(state: &mut GameState, actions_value: &serde_json::Value) -> Result<(), String> {
    let Some(actions) = actions_value.as_array() else { return Ok(()); };
    
    // 建立快照用于原子性事务
    let mut temp_state = state.clone();
    let mut turn_ended = false;

    for action in actions {
        match action["type"].as_str() {
            Some("MUTATE_STATE") => {
                let active_color = temp_state.turn_management.players.get(temp_state.turn_management.active_player_index).cloned().unwrap_or_default();
                let default_type = format!("stone_{}", active_color);
                let type_id = action["type_id"].as_str().unwrap_or(&default_type).to_string();
                let target_x = action["x"].as_i64().unwrap_or(0) as i32;
                let target_y = action["y"].as_i64().unwrap_or(0) as i32;
                let entity_id = action["entity_id"].as_str().unwrap_or(&format!("entity_{}_{}", target_x, target_y)).to_string();

                temp_state.board_state.occupied_nodes.insert(format!("{},{}", target_x, target_y), entity_id.clone());
                temp_state.entities.insert(entity_id, state_manager::Entity {
                    owner: active_color,
                    type_id,
                    position: (target_x, target_y),
                    attributes: json!({}),
                });
                turn_ended = true;
            },
            Some("MOVE_ENTITY") => {
                if let Some(entity_id) = action["entity_id"].as_str() {
                    if let Some(entity) = temp_state.entities.get_mut(entity_id) {
                        let from_x = action["from_x"].as_i64().unwrap_or(0) as i32;
                        let from_y = action["from_y"].as_i64().unwrap_or(0) as i32;
                        let to_x = action["to_x"].as_i64().unwrap_or(0) as i32;
                        let to_y = action["to_y"].as_i64().unwrap_or(0) as i32;
                        
                        temp_state.board_state.occupied_nodes.remove(&format!("{},{}", from_x, from_y));
                        temp_state.board_state.occupied_nodes.insert(format!("{},{}", to_x, to_y), entity_id.to_string());
                        entity.position = (to_x, to_y);
                        turn_ended = true;
                    } else {
                        return Err(format!("Entity {} not found during MOVE_ENTITY", entity_id));
                    }
                }
            },
            Some("DESTROY_ENTITY") => {
                if let Some(id) = action["entity_id"].as_str() {
                    if let Some(ent) = temp_state.entities.remove(id) {
                        temp_state.board_state.occupied_nodes.remove(&format!("{},{}", ent.position.0, ent.position.1));
                    }
                }
            },
            Some("END_TURN") => { turn_ended = true; },
            // 新增的前端表现层专用指令，对后端逻辑状态无影响
            Some("ANIMATE") | Some("SOUND") | Some("MESSAGE") | Some("DELAY") => {},
            _ => return Err("Invalid action type detected".to_string())
        }
    }
    if turn_ended && !temp_state.turn_management.players.is_empty() {
        temp_state.turn_management.active_player_index = (temp_state.turn_management.active_player_index + 1) % temp_state.turn_management.players.len();
    }
    // 事务成功，提交修改
    *state = temp_state;
    Ok(())
}

#[tauri::command]
fn load_game(game_id: String, engine: State<'_, EngineState>) -> Result<(), String> {
    let mut games_root = std::env::current_dir().map_err(|e| e.to_string())?;
    if games_root.ends_with("src-tauri") { games_root.pop(); }
    games_root.push("cran_games");
    games_root.push(&game_id);

    let manifest = mod_loader::ModLoader::load_manifest(&games_root)?;
    let script_path = games_root.join("logic").join("rules.js");
    let script_content = std::fs::read_to_string(script_path).unwrap_or_else(|_| "".to_string());

    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        if let Ok(mut sandbox) = sandbox::JsSandbox::new(&script_content) {
            for msg in rx {
                match msg {
                    JsMessage::TriggerOnMove { state, selected_id, target_pos, reply } => {
                        let _ = reply.send(sandbox.trigger_on_move(&state, selected_id.as_deref(), target_pos));
                    }
                    JsMessage::TriggerCustomAction { state, action_id, reply } => {
                        let _ = reply.send(sandbox.trigger_custom_action(&state, &action_id));
                    }
                }
            }
        }
    });

    let timestamp = SystemTime::now().duration_since(SystemTime::UNIX_EPOCH).unwrap().as_millis();
    let initial_state = GameState {
        instance_id: format!("game-{}", timestamp),
        game_id: manifest.meta.game_id,
        turn_management: TurnManagement {
            current_turn: 1,
            active_player_index: 0,
            players: vec!["black".to_string(), "white".to_string()],
            phase: "main".to_string(),
            game_status: "ongoing".to_string(),
            winner: None,
        },
        board_state: BoardState {
            dimensions: (manifest.environment.grid_width, manifest.environment.grid_height),
            occupied_nodes: HashMap::new(),
        },
        entities: HashMap::new(),
        last_occupied_nodes: None,
    };

    *engine.manager.write().unwrap() = StateManager::new(initial_state);
    *engine.js_channel.write().unwrap() = Some(tx);

    Ok(())
}

#[tauri::command]
async fn attempt_move(target_x: i32, target_y: i32, selected_id: Option<String>, engine: State<'_, EngineState>) -> Result<String, String> {
    let current_state = engine.manager.read().unwrap().get_snapshot();
    let (reply_tx, reply_rx) = mpsc::channel();
    
    let tx_guard = engine.js_channel.read().unwrap();
    let tx = tx_guard.as_ref().ok_or("Game not loaded")?;

    tx.send(JsMessage::TriggerOnMove {
        state: current_state,
        selected_id,
        target_pos: (target_x, target_y),
        reply: reply_tx,
    }).map_err(|_| "Failed to send to JS thread")?;

    let actions_value = reply_rx.recv().map_err(|_| "No response from JS thread")??;

    engine.manager.write().unwrap().apply_patch(|state| apply_actions(state, &actions_value))?;

    Ok(actions_value.to_string())
}

#[tauri::command]
async fn trigger_custom_action(action_id: String, engine: State<'_, EngineState>) -> Result<String, String> {
    let current_state = engine.manager.read().unwrap().get_snapshot();
    let (reply_tx, reply_rx) = mpsc::channel();
    
    let tx_guard = engine.js_channel.read().unwrap();
    let tx = tx_guard.as_ref().ok_or("Game not loaded")?;

    tx.send(JsMessage::TriggerCustomAction {
        state: current_state,
        action_id,
        reply: reply_tx,
    }).map_err(|_| "Failed to send to JS thread")?;

    let actions_value = reply_rx.recv().map_err(|_| "No response from JS thread")??;

    engine.manager.write().unwrap().apply_patch(|state| apply_actions(state, &actions_value))?;

    Ok(actions_value.to_string())
}

#[tauri::command]
fn undo_move(engine: State<'_, EngineState>) -> Result<(), String> {
    engine.manager.write().unwrap().undo().map(|_| ()).map_err(|e| e)
}

#[tauri::command]
fn redo_move(engine: State<'_, EngineState>) -> Result<(), String> {
    engine.manager.write().unwrap().redo().map(|_| ()).map_err(|e| e)
}

#[tauri::command]
fn get_local_games() -> Result<Vec<serde_json::Value>, String> {
    let mut games_root = std::env::current_dir().map_err(|e| e.to_string())?;
    if games_root.ends_with("src-tauri") { games_root.pop(); }
    games_root.push("cran_games");

    let mut games = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&games_root) {
        for entry in entries.filter_map(Result::ok) {
            let path = entry.path();
            if path.is_dir() {
                if let Ok(manifest) = mod_loader::ModLoader::load_manifest(&path) {
                    games.push(json!({
                        "id": entry.file_name().to_string_lossy(),
                        "name": manifest.meta.name,
                        "author": manifest.meta.author,
                        "version": manifest.meta.version
                    }));
                }
            }
        }
    }
    Ok(games)
}

#[tauri::command]
fn get_game_manifest(game_id: String) -> Result<serde_json::Value, String> {
    let mut games_root = std::env::current_dir().map_err(|e| e.to_string())?;
    if games_root.ends_with("src-tauri") { games_root.pop(); }
    games_root.push("cran_games");
    games_root.push(&game_id);
    let manifest = mod_loader::ModLoader::load_manifest(&games_root)?;
    serde_json::to_value(manifest).map_err(|e| e.to_string())
}

#[tauri::command]
fn resolve_asset_path(game_id: String, asset_path: String, active_packs: Vec<String>) -> Result<String, String> {
    let mut games_root = std::env::current_dir().map_err(|e| e.to_string())?;
    if games_root.ends_with("src-tauri") { games_root.pop(); }
    games_root.push("cran_games");
    let resolved = mod_loader::ModLoader::resolve_asset_physical_path(&games_root, &game_id, &asset_path, &active_packs)?;
    Ok(resolved.to_string_lossy().to_string())
}

#[tauri::command]
fn get_current_state(engine: State<'_, EngineState>) -> GameState {
    engine.manager.read().unwrap().get_snapshot()
}

fn main() {
    let empty_state = GameState {
        instance_id: "".to_string(),
        game_id: "".to_string(),
        turn_management: TurnManagement {
            current_turn: 1,
            active_player_index: 0,
            players: vec![],
            phase: "".to_string(),
            game_status: "".to_string(),
            winner: None,
        },
        board_state: BoardState { dimensions: (0, 0), occupied_nodes: HashMap::new() },
        entities: HashMap::new(),
        last_occupied_nodes: None,
    };

    let engine_state = EngineState {
        manager: RwLock::new(StateManager::new(empty_state)),
        js_channel: RwLock::new(None),
    };

    tauri::Builder::default()
        .manage(engine_state)
        .invoke_handler(tauri::generate_handler![
            load_game, attempt_move, undo_move, redo_move, trigger_custom_action,
            get_current_state, resolve_asset_path, get_game_manifest, get_local_games
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start CranChess Engine");
}