use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModCapabilities {
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub incompatible_with: Vec<String>,
}

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
    pub engine: Option<String>,
    pub meta: MetaDef,
    #[serde(default)]
    pub inheritance: InheritanceDef,
    pub environment: EnvironmentDef,
    pub assets_mapping: HashMap<String, serde_json::Value>,
    pub entry_point: String,
    #[serde(default)]
    pub custom_ui: Option<serde_json::Value>,
    pub capabilities: Option<ModCapabilities>,
}

pub struct ModLoader;

impl ModLoader {
    pub fn validate_mods(manifests: &[Manifest]) -> Result<(), String> {
        let mut exclusive_tags = std::collections::HashSet::new();
        let mut active_ids = std::collections::HashSet::new();

        for m in manifests {
            active_ids.insert(&m.meta.game_id);
        }

        for m in manifests {
            if let Some(caps) = &m.capabilities {
                // 校验互斥型核心逻辑
                for tag in &caps.tags {
                    if tag == "core_rules_override" || tag == "victory_condition" {
                        if !exclusive_tags.insert(tag) {
                            return Err(format!("冲突拦截：多个模组尝试接管核心逻辑或胜利条件 [{}]", tag));
                        }
                    }
                }
                // 校验定向不兼容声明
                for incompat in &caps.incompatible_with {
                    if active_ids.contains(incompat) {
                        return Err(format!("冲突拦截：模组 {} 明确声明与 {} 不兼容", m.meta.game_id, incompat));
                    }
                }
            }
        }
        Ok(())
    }
    
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