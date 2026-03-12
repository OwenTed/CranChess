use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MetaDef {
    pub game_id: String,
    pub name: String,
    pub version: String,
    pub author: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentDef {
    pub grid_width: i32,
    pub grid_height: i32,
    pub valid_nodes: String,
    pub render_mode: String,
    pub render_offset: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InheritanceDef {
    #[serde(default)]
    pub base_game: Option<String>,
    #[serde(default)]
    pub override_logic: bool,
}

impl Default for InheritanceDef {
    fn default() -> Self {
        Self {
            base_game: None,
            override_logic: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Manifest {
    pub protocol_version: String,
    pub engine_compatibility: String,
    pub meta: MetaDef,
    #[serde(default)]
    pub inheritance: InheritanceDef,
    pub environment: EnvironmentDef,
    pub assets_mapping: HashMap<String, serde_json::Value>,
    pub entry_point: String,
}

pub struct ModLoader;

impl ModLoader {
    pub fn load_manifest<P: AsRef<Path>>(game_dir: P) -> Result<Manifest, String> {
        let manifest_path = game_dir.as_ref().join("manifest.json");
        
        let file_content = fs::read_to_string(&manifest_path)
            .map_err(|e| format!("无法读取配置文件: {}", e))?;
            
        let manifest: Manifest = serde_json::from_str(&file_content)
            .map_err(|e| format!("JSON 解析失败，基因图谱已损坏: {}", e))?;
            
        Ok(manifest)
    }

    pub fn resolve_asset_physical_path(
        games_root: &Path,
        game_id: &str,
        asset_path: &str,
        active_packs: &[String],
    ) -> Result<PathBuf, String> {
        let sanitized = asset_path.trim_start_matches('/');
        let sanitized_path = Path::new(sanitized);

        for pack in active_packs {
            let pack_path = games_root.join(".resourcepacks").join(pack).join(sanitized_path);
            if pack_path.exists() && pack_path.is_file() {
                return Ok(pack_path);
            }
        }

        let base_path = games_root.join(game_id).join(sanitized_path);
        if base_path.exists() && base_path.is_file() {
            return Ok(base_path);
        }

        Err(format!("物理路径检索失败，没有任何层级包含此资源: {}", asset_path))
    }
}