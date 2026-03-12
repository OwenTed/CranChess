use crate::state_manager::{StateManager, GameState};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct RaycastResult {
    pub passed_nodes: Vec<(i32, i32)>,
    pub hit_entity_id: Option<String>,
    pub hit_boundary: bool,
}

pub fn cast_ray(
    state_manager: &StateManager,
    start_x: i32,
    start_y: i32,
    dir_x: i32,
    dir_y: i32,
    max_steps: i32,
) -> RaycastResult {
    let state = state_manager.get_snapshot();
    let board = &state.board_state;
    
    let mut passed_nodes = Vec::new();
    let mut current_x = start_x;
    let mut current_y = start_y;
    let mut steps_taken = 0;

    // 规范化方向向量，确保每次只走一格（简化处理）
    let step_x = dir_x.signum();
    let step_y = dir_y.signum();

    loop {
        current_x += step_x;
        current_y += step_y;
        steps_taken += 1;

        // 边界检测
        if current_x < 0 || current_x >= board.dimensions.0 || 
           current_y < 0 || current_y >= board.dimensions.1 {
            return RaycastResult {
                passed_nodes,
                hit_entity_id: None,
                hit_boundary: true,
            };
        }

        // 实体碰撞检测
        let coord_key = format!("{},{}", current_x, current_y);
        if let Some(entity_id) = board.occupied_nodes.get(&coord_key) {
            return RaycastResult {
                passed_nodes,
                hit_entity_id: Some(entity_id.clone()),
                hit_boundary: false,
            };
        }

        passed_nodes.push((current_x, current_y));

        if steps_taken >= max_steps {
            break;
        }
    }

    RaycastResult {
        passed_nodes,
        hit_entity_id: None,
        hit_boundary: false,
    }
}

/// 基于 GameState 快照的射线投射版本
pub fn cast_ray_on_state(
    state: &GameState,
    start_x: i32,
    start_y: i32,
    dir_x: i32,
    dir_y: i32,
    max_steps: i32,
) -> RaycastResult {
    let board = &state.board_state;

    let mut passed_nodes = Vec::new();
    let mut current_x = start_x;
    let mut current_y = start_y;
    let mut steps_taken = 0;

    // 规范化方向向量，确保每次只走一格（简化处理）
    let step_x = dir_x.signum();
    let step_y = dir_y.signum();

    loop {
        current_x += step_x;
        current_y += step_y;
        steps_taken += 1;

        // 边界检测
        if current_x < 0 || current_x >= board.dimensions.0 ||
           current_y < 0 || current_y >= board.dimensions.1 {
            return RaycastResult {
                passed_nodes,
                hit_entity_id: None,
                hit_boundary: true,
            };
        }

        // 实体碰撞检测
        let coord_key = format!("{},{}", current_x, current_y);
        if let Some(entity_id) = board.occupied_nodes.get(&coord_key) {
            return RaycastResult {
                passed_nodes,
                hit_entity_id: Some(entity_id.clone()),
                hit_boundary: false,
            };
        }

        passed_nodes.push((current_x, current_y));

        if steps_taken >= max_steps {
            break;
        }
    }

    RaycastResult {
        passed_nodes,
        hit_entity_id: None,
        hit_boundary: false,
    }
}