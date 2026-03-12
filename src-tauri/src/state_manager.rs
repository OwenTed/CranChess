use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, VecDeque};
use std::sync::RwLock;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub owner: String,
    pub type_id: String,
    pub position: (i32, i32),
    #[serde(default)]
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
    #[serde(skip_serializing_if = "Option::is_none")]
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
            current_state: RwLock::new(initial_state),
            history: RwLock::new(VecDeque::new()),
            redo_stack: RwLock::new(VecDeque::new()),
            max_history_depth: 200,
        }
    }

    pub fn get_snapshot(&self) -> GameState {
        self.current_state.read().expect("Failed to acquire read lock on state").clone()
    }

    pub fn apply_patch<F>(&self, patch_fn: F) 
    where 
        F: FnOnce(&mut GameState) 
    {
        let mut state_guard = self.current_state.write().expect("Failed to acquire write lock on state");
        let old_state = state_guard.clone();
        
        patch_fn(&mut state_guard);

        let mut history_guard = self.history.write().unwrap();
        history_guard.push_back(old_state);
        if history_guard.len() > self.max_history_depth {
            history_guard.pop_front();
        }

        let mut redo_guard = self.redo_stack.write().unwrap();
        redo_guard.clear();
    }

    pub fn undo(&self) -> Result<GameState, String> {
        let mut history_guard = self.history.write().unwrap();
        if let Some(prev_state) = history_guard.pop_back() {
            let mut redo_guard = self.redo_stack.write().unwrap();
            let mut state_guard = self.current_state.write().unwrap();
            
            redo_guard.push_back(state_guard.clone());
            *state_guard = prev_state.clone();
            
            Ok(prev_state)
        } else {
            Err("No history available to undo".to_string())
        }
    }

    pub fn redo(&self) -> Result<GameState, String> {
        let mut redo_guard = self.redo_stack.write().unwrap();
        if let Some(next_state) = redo_guard.pop_back() {
            let mut history_guard = self.history.write().unwrap();
            let mut state_guard = self.current_state.write().unwrap();
            
            history_guard.push_back(state_guard.clone());
            if history_guard.len() > self.max_history_depth {
                history_guard.pop_front();
            }
            
            *state_guard = next_state.clone();
            Ok(next_state)
        } else {
            Err("No redo history available".to_string())
        }
    }

    pub fn get_entity_at(&self, x: i32, y: i32) -> Option<Entity> {
        let state_guard = self.current_state.read().unwrap();
        let coord_key = format!("{},{}", x, y);
        state_guard.board_state.occupied_nodes.get(&coord_key)
            .and_then(|id| state_guard.entities.get(id).cloned())
    }
}