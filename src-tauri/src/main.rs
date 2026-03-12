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
use std::sync::{Mutex, mpsc};
use std::collections::HashMap;
use std::thread;
use serde_json::json;

enum JsMessage {
    TriggerOnMove {
        state: GameState,
        selected_id: Option<String>,
        target_pos: (i32, i32),
        reply: mpsc::Sender<Result<serde_json::Value, String>>,
    },
    TriggerOnGameStart {
        state: GameState,
        reply: mpsc::Sender<Result<serde_json::Value, String>>,
    },
    TriggerOnPieceSelect {
        state: GameState,
        piece_id: String,
        reply: mpsc::Sender<Result<serde_json::Value, String>>,
    },
    TriggerOnTurnEnd {
        state: GameState,
        player: String,
        reply: mpsc::Sender<Result<serde_json::Value, String>>,
    },
}

struct EngineState {
    pub manager: StateManager,
    pub js_channel: Mutex<mpsc::Sender<JsMessage>>,
}

#[tauri::command]
fn get_game_manifest(game_id: String) -> Result<serde_json::Value, String> {
    let mut games_root = std::env::current_dir().map_err(|e| e.to_string())?;
    if games_root.ends_with("src-tauri") {
        games_root.pop();
    }
    games_root.push("cran_games");
    games_root.push(&game_id);

    let manifest = mod_loader::ModLoader::load_manifest(&games_root)?;
    serde_json::to_value(manifest).map_err(|e| e.to_string())
}

#[tauri::command]
fn resolve_asset_path(
    game_id: String,
    asset_path: String,
    active_packs: Vec<String>,
) -> Result<String, String> {
    let mut games_root = std::env::current_dir().map_err(|e| e.to_string())?;
    if games_root.ends_with("src-tauri") {
        games_root.pop();
    }
    games_root.push("cran_games");

    let resolved = mod_loader::ModLoader::resolve_asset_physical_path(
        &games_root,
        &game_id,
        &asset_path,
        &active_packs,
    )?;

    Ok(resolved.to_string_lossy().to_string())
}

#[tauri::command]
fn attempt_move(
    target_x: i32, 
    target_y: i32, 
    selected_id: Option<String>,
    engine: tauri::State<'_, EngineState>
) -> Result<String, String> {
    let current_state = engine.manager.get_snapshot();
    let (reply_tx, reply_rx) = mpsc::channel();
    
    let msg = JsMessage::TriggerOnMove {
        state: current_state,
        selected_id,
        target_pos: (target_x, target_y),
        reply: reply_tx,
    };

    engine.js_channel.lock().map_err(|_| "Failed to lock JS channel")?.send(msg).map_err(|_| "Failed to send to JS thread")?;
    let actions_value = reply_rx.recv().map_err(|_| "No response from JS thread")??;

    engine.manager.apply_patch(|state| {
        if let Some(actions) = actions_value.as_array() {
            let mut turn_ended = false;
            for action in actions {
                match action["type"].as_str() {
                    Some("MUTATE_STATE") => {
                        let entity_id = action["entity_id"].as_str().unwrap_or(&format!("entity_{}_{}", target_x, target_y)).to_string();
                        state.board_state.occupied_nodes.insert(format!("{},{}", target_x, target_y), entity_id.clone());
                        state.entities.insert(entity_id, state_manager::Entity {
                            owner: state.turn_management.players[state.turn_management.active_player_index].clone(),
                            type_id: action["type_id"].as_str().unwrap_or("default").to_string(),
                            position: (target_x, target_y),
                            attributes: json!({}),
                        });
                        turn_ended = true;
                    },
                    Some("MOVE_ENTITY") => {
                        if let Some(entity_id) = action["entity_id"].as_str() {
                            if let Some(entity) = state.entities.get_mut(entity_id) {
                                let from_x = action["from_x"].as_i64().unwrap_or(0) as i32;
                                let from_y = action["from_y"].as_i64().unwrap_or(0) as i32;
                                let to_x = action["to_x"].as_i64().unwrap_or(target_x as i64) as i32;
                                let to_y = action["to_y"].as_i64().unwrap_or(target_y as i64) as i32;
                                
                                state.board_state.occupied_nodes.remove(&format!("{},{}", from_x, from_y));
                                state.board_state.occupied_nodes.insert(format!("{},{}", to_x, to_y), entity_id.to_string());
                                entity.position = (to_x, to_y);
                                turn_ended = true;
                            }
                        }
                    },
                    Some("DESTROY_ENTITY") => {
                        if let Some(id) = action["entity_id"].as_str() {
                            if let Some(ent) = state.entities.remove(id) {
                                state.board_state.occupied_nodes.remove(&format!("{},{}", ent.position.0, ent.position.1));
                            }
                        }
                    },
                    _ => {}
                }
            }
            if turn_ended {
                state.turn_management.active_player_index = (state.turn_management.active_player_index + 1) % state.turn_management.players.len();
            }
        }
    });

    Ok(actions_value.to_string())
}

#[tauri::command]
fn get_current_state(engine: State<'_, EngineState>) -> GameState {
    engine.manager.get_snapshot()
}

fn main() {
    let mut game_dir = std::env::current_dir().expect("Unable to get current directory");
    if game_dir.ends_with("src-tauri") {
        game_dir.pop();
    }
    game_dir.push("cran_games");
    game_dir.push("go");

    let manifest = mod_loader::ModLoader::load_manifest(&game_dir).expect("Failed to load manifest");
    let script_path = game_dir.join("logic").join("rules.js");
    let script_content = std::fs::read_to_string(script_path).unwrap_or_else(|_| "".to_string());
    
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut sandbox = sandbox::JsSandbox::new(&script_content).unwrap();
        for msg in rx {
            match msg {
                JsMessage::TriggerOnMove { state, selected_id, target_pos, reply } => {
                    let result = sandbox.trigger_on_move(&state, selected_id.as_deref(), target_pos);
                    let _ = reply.send(result);
                }
                JsMessage::TriggerOnGameStart { state, reply } => {
                    let result = sandbox.trigger_on_game_start(&state);
                    let _ = reply.send(result);
                }
                JsMessage::TriggerOnPieceSelect { state, piece_id, reply } => {
                    let result = sandbox.trigger_on_piece_select(&state, &piece_id);
                    let _ = reply.send(result);
                }
                JsMessage::TriggerOnTurnEnd { state, player, reply } => {
                    let result = sandbox.trigger_on_turn_end(&state, &player);
                    let _ = reply.send(result);
                }
            }
        }
    });

    let initial_state = GameState {
        instance_id: "init-game-001".to_string(),
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

    let engine_state = EngineState {
        manager: StateManager::new(initial_state),
        js_channel: Mutex::new(tx),
    };

    tauri::Builder::default()
        .manage(engine_state)
        .invoke_handler(tauri::generate_handler![
            attempt_move, 
            get_current_state, 
            resolve_asset_path, 
            get_game_manifest
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start CranChess Engine");
}