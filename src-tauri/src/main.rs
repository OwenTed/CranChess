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

// 定义用于跨线程通信的消息体
enum JsMessage {
    TriggerOnMove {
        state: GameState,
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
fn attempt_move(
    target_x: i32, 
    target_y: i32, 
    engine: tauri::State<'_, EngineState>
) -> Result<String, String> {
    let current_state = engine.manager.get_snapshot();

    // 创建一个单次使用的回信信道
    let (reply_tx, reply_rx) = mpsc::channel();
    let msg = JsMessage::TriggerOnMove {
        state: current_state,
        target_pos: (target_x, target_y),
        reply: reply_tx,
    };

    // 把计算任务发送给专属的 JS 线程
    engine.js_channel.lock().map_err(|_| "锁获取失败")?.send(msg).map_err(|_| "JS线程通信失败")?;
    
    // 阻塞等待 JS 线程的计算结果
    let actions_value = reply_rx.recv().map_err(|_| "JS线程无响应")??;

    engine.manager.apply_patch(|state| {
        if let Some(actions) = actions_value.as_array() {
            let mut turn_ended = false;
            for action in actions {
                match action["type"].as_str() {
                    Some("MUTATE_STATE") => {
                        let piece_id = format!("stone_{}_{}", target_x, target_y);
                        state.board_state.occupied_nodes.insert(format!("{},{}", target_x, target_y), piece_id.clone());
                        state.entities.insert(piece_id, state_manager::Entity {
                            owner: state.turn_management.players[state.turn_management.active_player_index].clone(),
                            type_id: "stone".into(),
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
                                // 更新占用节点映射
                                state.board_state.occupied_nodes.remove(&format!("{},{}", from_x, from_y));
                                state.board_state.occupied_nodes.insert(format!("{},{}", to_x, to_y), entity_id.to_string());
                                // 更新实体位置
                                entity.position = (to_x, to_y);
                            }
                        }
                        turn_ended = true;
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
                state.turn_management.active_player_index = (state.turn_management.active_player_index + 1) % 2;
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
    let mut game_dir = std::env::current_dir().expect("无法获取当前工作目录");
    if game_dir.ends_with("src-tauri") {
        game_dir.pop();
    }
    game_dir.push("cran_games");
    game_dir.push("go");

    let manifest = mod_loader::ModLoader::load_manifest(&game_dir)
        .expect("无法加载配置清单");

    let script_path = game_dir.join("logic").join("rules.js");
    let script_content = std::fs::read_to_string(script_path).expect("读取 rules.js 失败");
    
    // 开辟专属后台线程，将 JS 引擎永远锁在里面
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        let mut sandbox = sandbox::JsSandbox::new(&script_content).unwrap();
        for msg in rx {
            match msg {
                JsMessage::TriggerOnMove { state, target_pos, reply } => {
                    let result = sandbox.trigger_on_move(&state, target_pos);
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
        instance_id: "init-go-001".to_string(),
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
        manager: StateManager::new(initial_state.clone()),
        js_channel: Mutex::new(tx),
    };

    // 调用 onGameStart 钩子
    {
        let (reply_tx, reply_rx) = mpsc::channel();
        let msg = JsMessage::TriggerOnGameStart {
            state: initial_state.clone(),
            reply: reply_tx,
        };

        if let Ok(channel) = engine_state.js_channel.lock() {
            if channel.send(msg).is_ok() {
                if let Ok(result) = reply_rx.recv() {
                    match result {
                        Ok(actions_value) => {
                            // 处理返回的动作
                            if let Some(actions) = actions_value.as_array() {
                                engine_state.manager.apply_patch(|state| {
                                    for action in actions {
                                        // 这里可以调用与 attempt_move 相同的动作处理逻辑
                                        // 简化：只记录日志
                                        println!("onGameStart 返回动作: {:?}", action);
                                    }
                                });
                            }
                        }
                        Err(e) => {
                            println!("onGameStart 执行失败: {}", e);
                        }
                    }
                }
            }
        }
    }

    tauri::Builder::default()
        .manage(engine_state)
        .invoke_handler(tauri::generate_handler![attempt_move, get_current_state])
        .run(tauri::generate_context!())
        .expect("CranChess 启动失败");
}