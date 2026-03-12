use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub owner: String,
    pub type_id: String,
    pub position: (i32, i32),
    pub attributes: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BoardState {
    pub dimensions: (i32, i32),
    pub occupied_nodes: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TurnManagement {
    pub current_turn: u32,
    pub active_player_index: usize,
    pub players: Vec<String>,
    pub phase: String,
    pub game_status: String,
    pub winner: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GameState {
    pub instance_id: String,
    pub game_id: String,
    pub turn_management: TurnManagement,
    pub board_state: BoardState,
    pub entities: HashMap<String, Entity>,
    pub last_occupied_nodes: Option<HashMap<String, String>>,
}

pub struct StateManager {
    pub current_state: RwLock<GameState>,
    history: RwLock<VecDeque<GameState>>,
    redo_stack: RwLock<VecDeque<GameState>>,
    max_history_depth: usize,
}

impl StateManager {
    pub fn new(initial_state: GameState) -> Self {
        Self {
            current_state: RwLock::new(initial_state.clone()),
            history: RwLock::new(VecDeque::new()),
            redo_stack: RwLock::new(VecDeque::new()),
            max_history_depth: 100,
        }
    }

    pub fn get_snapshot(&self) -> GameState {
        let state_guard = self.current_state.read().expect("读锁获取失败，状态机发生死锁");
        state_guard.clone()
    }

    pub fn apply_patch(&self, patch_fn: impl FnOnce(&mut GameState)) {
        let mut state_guard = self.current_state.write().expect("写锁获取失败，状态机发生死锁");
        let old_state = state_guard.clone();
        patch_fn(&mut state_guard);

        // 保存历史记录
        let mut history_guard = self.history.write().unwrap();
        history_guard.push_back(old_state);
        if history_guard.len() > self.max_history_depth {
            history_guard.pop_front();
        }

        // 清除重做栈
        let mut redo_guard = self.redo_stack.write().unwrap();
        redo_guard.clear();
    }

    pub fn undo(&self) -> bool {
        let mut history_guard = self.history.write().unwrap();
        if let Some(prev_state) = history_guard.pop_back() {
            let mut redo_guard = self.redo_stack.write().unwrap();
            let current_state_guard = self.current_state.read().unwrap();
            redo_guard.push_back(current_state_guard.clone());
            drop(current_state_guard);
            drop(redo_guard);
            drop(history_guard);

            // 恢复之前的状态
            let mut state_guard = self.current_state.write().unwrap();
            *state_guard = prev_state;
            true
        } else {
            false
        }
    }

    pub fn redo(&self) -> bool {
        let mut redo_guard = self.redo_stack.write().unwrap();
        if let Some(next_state) = redo_guard.pop_back() {
            let mut history_guard = self.history.write().unwrap();
            let current_state_guard = self.current_state.read().unwrap();
            history_guard.push_back(current_state_guard.clone());
            if history_guard.len() > self.max_history_depth {
                history_guard.pop_front();
            }
            drop(current_state_guard);
            drop(history_guard);
            drop(redo_guard);

            let mut state_guard = self.current_state.write().unwrap();
            *state_guard = next_state;
            true
        } else {
            false
        }
    }

    pub fn get_entity_at(&self, x: i32, y: i32) -> Option<String> {
        let state_guard = self.current_state.read().unwrap();
        let coord_key = format!("{},{}", x, y);
        state_guard.board_state.occupied_nodes.get(&coord_key).cloned()
    }
}