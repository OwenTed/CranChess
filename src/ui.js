// 全局设置
window.cranchessSettings = {
    theme: 'default',
    animationSpeed: 1,
    soundVolume: 50,
    language: 'zh',
    load() {
        const saved = JSON.parse(localStorage.getItem('cranchess_settings') || '{}');
        this.theme = saved.theme || 'default';
        this.animationSpeed = saved.animationSpeed || 1;
        this.soundVolume = saved.soundVolume || 50;
        this.language = saved.language || 'zh';
    },
    save() {
        const settings = {
            theme: this.theme,
            animationSpeed: this.animationSpeed,
            soundVolume: this.soundVolume,
            language: this.language
        };
        localStorage.setItem('cranchess_settings', JSON.stringify(settings));
    }
};

// 屏幕管理
const screens = {
    'main-menu': document.getElementById('main-menu'),
    'game-select': document.getElementById('game-select'),
    'settings': document.getElementById('settings'),
    'game-screen': document.getElementById('game-screen'),
    'create-game': document.getElementById('create-game')
};

function showScreen(screenId) {
    // 隐藏所有屏幕
    Object.values(screens).forEach(screen => {
        screen.classList.remove('active');
    });
    // 显示目标屏幕
    const targetScreen = screens[screenId];
    if (targetScreen) {
        targetScreen.classList.add('active');
    }
}

// 按钮事件绑定
document.getElementById('start-game-btn').addEventListener('click', () => {
    showScreen('game-select');
    loadGameList();
});

document.getElementById('settings-btn').addEventListener('click', () => {
    showScreen('settings');
    loadSettings();
});

document.getElementById('back-from-select').addEventListener('click', () => {
    showScreen('main-menu');
});

document.getElementById('back-from-settings').addEventListener('click', () => {
    showScreen('main-menu');
    saveSettings();
});

document.getElementById('back-from-game').addEventListener('click', () => {
    // 停止游戏循环等清理工作
    // 暂时仅切换屏幕
    showScreen('main-menu');
});

document.getElementById('back-from-create').addEventListener('click', () => {
    showScreen('game-select');
});

// 设置相关
function loadSettings() {
    window.cranchessSettings.load();
    document.getElementById('theme-select').value = window.cranchessSettings.theme;
    document.getElementById('animation-speed').value = window.cranchessSettings.animationSpeed;
    document.getElementById('sound-volume').value = window.cranchessSettings.soundVolume;
    document.getElementById('language-select').value = window.cranchessSettings.language;
    updateSliderDisplay();
}

function saveSettings() {
    window.cranchessSettings.theme = document.getElementById('theme-select').value;
    window.cranchessSettings.animationSpeed = parseFloat(document.getElementById('animation-speed').value);
    window.cranchessSettings.soundVolume = parseInt(document.getElementById('sound-volume').value);
    window.cranchessSettings.language = document.getElementById('language-select').value;
    window.cranchessSettings.save();
    alert('设置已保存');
    // 应用主题变更
    applyTheme(window.cranchessSettings.theme);
}

function updateSliderDisplay() {
    document.getElementById('speed-value').textContent =
        document.getElementById('animation-speed').value + 'x';
    document.getElementById('volume-value').textContent =
        document.getElementById('sound-volume').value + '%';
}

document.getElementById('animation-speed').addEventListener('input', updateSliderDisplay);
document.getElementById('sound-volume').addEventListener('input', updateSliderDisplay);
document.getElementById('save-settings').addEventListener('click', saveSettings);

// 主题应用
function applyTheme(theme) {
    const body = document.body;
    // 移除现有主题类
    body.classList.remove('theme-default', 'theme-light', 'theme-green');
    // 添加新主题类
    body.classList.add(`theme-${theme}`);
    // 未来可以添加更多主题相关的样式
}

// 游戏列表
async function loadGameList() {
    const gameListContainer = document.getElementById('game-list');
    gameListContainer.innerHTML = '<div class="loading">加载游戏中...</div>';

    let games = [];

    // 尝试扫描 cran_games 目录
    try {
        games = await scanGameDirectory();
        console.log('扫描到游戏:', games);
    } catch (error) {
        console.log('扫描游戏目录失败，使用模拟数据:', error);
        // 模拟数据作为回退
        games = [
            { id: 'standard-chess@1.0.0', name: '标准国际象棋', description: '经典国际象棋规则', version: '1.0.0' },
            { id: 'go', name: '围棋', description: '传统围棋', version: '1.0.0' },
            { id: 'quantum-go@0.8.0', name: '量子围棋', description: '量子叠加规则的围棋', version: '0.8.0' }
        ];
    }

    gameListContainer.innerHTML = '';
    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'game-card';
        card.innerHTML = `
            <h3>${game.name}</h3>
            <p>${game.description}</p>
            <small>版本 ${game.version}</small>
        `;
        card.addEventListener('click', () => startGame(game.id));
        gameListContainer.appendChild(card);
    });

    // 添加创建游戏卡片
    const createCard = document.createElement('div');
    createCard.className = 'game-card';
    createCard.innerHTML = `
        <h3>+ 创建新游戏</h3>
        <p>设计自定义棋类游戏</p>
        <small>点击开始创建</small>
    `;
    createCard.addEventListener('click', () => {
        showScreen('create-game');
        initCreateGameForm();
    });
    gameListContainer.appendChild(createCard);
}

// 扫描游戏目录
async function scanGameDirectory() {
    // 检查是否在 Tauri 环境中
    if (window.__TAURI__) {
        const { readDir, readTextFile } = await import('@tauri-apps/api/fs');
        const entries = await readDir('cran_games');
        const games = [];

        for (const entry of entries) {
            if (entry.children) { // 是一个目录
                try {
                    const manifestPath = `cran_games/${entry.name}/manifest.json`;
                    const manifestContent = await readTextFile(manifestPath);
                    const manifest = JSON.parse(manifestContent);
                    games.push({
                        id: entry.name,
                        name: manifest.meta.name,
                        description: manifest.meta.game_id,
                        version: manifest.meta.version
                    });
                } catch (err) {
                    console.warn(`无法读取游戏 ${entry.name} 的 manifest:`, err);
                }
            }
        }
        return games;
    } else {
        // 在浏览器环境中，尝试通过 HTTP 获取游戏列表
        // 由于安全限制，可能无法直接访问文件系统
        // 这里可以尝试从服务器获取列表，但暂时返回空数组
        return [];
    }
}

// 启动游戏
function startGame(gameId) {
    console.log(`启动游戏: ${gameId}`);
    // 这里可以加载游戏配置，初始化引擎等
    showScreen('game-screen');
    // 触发游戏初始化
    if (window.startGameEngine) {
        window.startGameEngine(gameId);
    }
}

// ============================================
// 游戏创建功能
// ============================================

// 游戏配置状态
let gameConfig = {
    meta: {
        game_id: '',
        name: '',
        version: '0.1.0',
        author: ''
    },
    environment: {
        grid_width: 8,
        grid_height: 8,
        valid_nodes: 'all',
        render_mode: 'grid_center',
        render_offset: { x: 0.5, y: 0.5 }
    },
    inheritance: {
        base_game: null,
        override_logic: false
    },
    assets_mapping: {
        entities: {},
        board_texture: null
    },
    entry_point: 'logic/rules.js',
    code: `// CranChess 核心逻辑入口
export function onGameStart(state) {
  return [];
}

export function onPieceSelect(pieceId, state) {
  return [];
}

export function onMoveAttempt(pieceId, targetPos, state) {
  return [];
}

export function onTurnEnd(player, state) {
  return [];
}`
};

// 初始化创建游戏表单
function initCreateGameForm() {
    // 初始化标签页切换
    initTabNavigation();

    // 绑定表单字段
    bindFormFields();

    // 初始化实体列表
    initEntityList();

    // 初始化代码编辑器事件
    initCodeEditor();

    // 初始化预览
    updatePreview();

    // 初始化创建按钮事件
    document.getElementById('create-game-btn').addEventListener('click', createGameFiles);
    document.getElementById('export-game-btn').addEventListener('click', exportGamePackage);

    // 初始化其他按钮
    document.getElementById('refresh-preview-btn').addEventListener('click', updatePreview);
    document.getElementById('import-code-btn').addEventListener('click', importCodeFromFile);
    document.getElementById('export-code-btn').addEventListener('click', exportCodeToFile);
    document.getElementById('reset-code-btn').addEventListener('click', resetCodeToTemplate);
    document.getElementById('add-entity-btn').addEventListener('click', addEntityItem);
}

// 标签页导航
function initTabNavigation() {
    const tabBtns = document.querySelectorAll('.tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');

            // 更新活动标签按钮
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 显示对应标签页
            tabPanes.forEach(pane => {
                pane.classList.remove('active');
                if (pane.id === `tab-${tabId}`) {
                    pane.classList.add('active');
                }
            });
        });
    });
}

// 绑定表单字段到配置对象
function bindFormFields() {
    // 基本信息
    const nameInput = document.getElementById('game-name');
    const idInput = document.getElementById('game-id');
    const versionInput = document.getElementById('game-version');
    const authorInput = document.getElementById('game-author');

    nameInput.addEventListener('input', (e) => {
        gameConfig.meta.name = e.target.value;
        // 自动生成game_id
        const sanitized = e.target.value.toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
        gameConfig.meta.game_id = `cran.user.${sanitized}`;
        idInput.value = gameConfig.meta.game_id;
        updatePreview();
    });

    versionInput.addEventListener('input', (e) => {
        gameConfig.meta.version = e.target.value;
        updatePreview();
    });

    authorInput.addEventListener('input', (e) => {
        gameConfig.meta.author = e.target.value;
        updatePreview();
    });

    // 环境配置
    document.getElementById('grid-width').addEventListener('input', (e) => {
        gameConfig.environment.grid_width = parseInt(e.target.value) || 8;
        updatePreview();
    });

    document.getElementById('grid-height').addEventListener('input', (e) => {
        gameConfig.environment.grid_height = parseInt(e.target.value) || 8;
        updatePreview();
    });

    document.getElementById('valid-nodes').addEventListener('change', (e) => {
        gameConfig.environment.valid_nodes = e.target.value;
        updatePreview();
    });

    document.getElementById('render-mode').addEventListener('change', (e) => {
        gameConfig.environment.render_mode = e.target.value;
        updatePreview();
    });

    // 偏移量滑块
    const offsetXSlider = document.getElementById('offset-x');
    const offsetXValue = document.getElementById('offset-x-value');
    const offsetYSlider = document.getElementById('offset-y');
    const offsetYValue = document.getElementById('offset-y-value');

    offsetXSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value) / 100;
        gameConfig.environment.render_offset.x = value;
        offsetXValue.textContent = value.toFixed(2);
        updatePreview();
    });

    offsetYSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value) / 100;
        gameConfig.environment.render_offset.y = value;
        offsetYValue.textContent = value.toFixed(2);
        updatePreview();
    });

    // 棋盘纹理
    document.getElementById('board-texture').addEventListener('input', (e) => {
        gameConfig.assets_mapping.board_texture = e.target.value || null;
        updatePreview();
    });

    // 代码编辑器
    document.getElementById('game-code').addEventListener('input', (e) => {
        gameConfig.code = e.target.value;
        updatePreview();
    });
}

// 实体列表管理
function initEntityList() {
    // 初始为空，可通过添加按钮添加
    updateEntityListDisplay();
}

function addEntityItem() {
    const entityId = prompt('请输入实体类型ID（例如: pawn, rook, stone_black）:');
    if (!entityId) return;

    const path = prompt('请输入图片路径（例如: assets/pawn.png）:');
    if (!path) return;

    gameConfig.assets_mapping.entities[entityId] = {
        path: path,
        anchor: [0.5, 0.5]
    };

    updateEntityListDisplay();
    updatePreview();
}

function updateEntityListDisplay() {
    const container = document.getElementById('entities-list');
    const entities = gameConfig.assets_mapping.entities;

    container.innerHTML = '';

    if (Object.keys(entities).length === 0) {
        container.innerHTML = '<div class="setting-hint">暂无实体类型，点击"添加实体类型"按钮添加。</div>';
        return;
    }

    Object.entries(entities).forEach(([entityId, config]) => {
        const item = document.createElement('div');
        item.className = 'entity-item';
        item.innerHTML = `
            <strong>${entityId}</strong>
            <div>路径: ${config.path}</div>
            <div>锚点: [${config.anchor[0]}, ${config.anchor[1]}]</div>
            <button class="remove-entity-btn" data-id="${entityId}">删除</button>
        `;
        container.appendChild(item);
    });

    // 绑定删除按钮事件
    container.querySelectorAll('.remove-entity-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const entityId = e.target.getAttribute('data-id');
            delete gameConfig.assets_mapping.entities[entityId];
            updateEntityListDisplay();
            updatePreview();
        });
    });
}

// 代码编辑器功能
function initCodeEditor() {
    // 基础功能已通过input事件绑定
}

function importCodeFromFile() {
    alert('导入功能在浏览器环境中受限。请将代码复制粘贴到编辑器中。');
    // 未来可实现文件读取API
}

function exportCodeToFile() {
    const blob = new Blob([gameConfig.code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rules.js';
    a.click();
    URL.revokeObjectURL(url);
}

function resetCodeToTemplate() {
    if (confirm('确定要重置代码为模板吗？这将丢失所有更改。')) {
        gameConfig.code = `// CranChess 核心逻辑入口
export function onGameStart(state) {
  return [];
}

export function onPieceSelect(pieceId, state) {
  return [];
}

export function onMoveAttempt(pieceId, targetPos, state) {
  return [];
}

export function onTurnEnd(player, state) {
  return [];
}`;
        document.getElementById('game-code').value = gameConfig.code;
        updatePreview();
    }
}

// 预览功能
function updatePreview() {
    const manifest = generateManifest();
    const previewElement = document.getElementById('manifest-preview');
    previewElement.textContent = JSON.stringify(manifest, null, 4);
}

function generateManifest() {
    return {
        protocol_version: "1.0.0",
        engine_compatibility: ">=1.0.0",
        meta: gameConfig.meta,
        inheritance: gameConfig.inheritance,
        environment: gameConfig.environment,
        assets_mapping: gameConfig.assets_mapping,
        entry_point: gameConfig.entry_point
    };
}

// 文件创建功能
async function createGameFiles() {
    // 验证必填字段
    if (!gameConfig.meta.name || !gameConfig.meta.game_id) {
        alert('请填写游戏名称');
        return;
    }

    if (!gameConfig.meta.author) {
        gameConfig.meta.author = '匿名作者';
    }

    // 生成manifest
    const manifest = generateManifest();

    // Tauri环境：直接写入文件系统
    if (window.__TAURI__) {
        try {
            const { fs, path } = await import('@tauri-apps/api');
            const gameId = gameConfig.meta.game_id.replace('cran.user.', '');
            const gamesDir = 'cran_games';
            const gameDir = `${gamesDir}/${gameId}`;

            // 创建目录结构
            await fs.createDir(gameDir, { recursive: true });
            await fs.createDir(`${gameDir}/logic`, { recursive: true });
            await fs.createDir(`${gameDir}/assets`, { recursive: true });

            // 写入manifest.json
            await fs.writeTextFile(
                `${gameDir}/manifest.json`,
                JSON.stringify(manifest, null, 4)
            );

            // 写入rules.js
            await fs.writeTextFile(
                `${gameDir}/logic/rules.js`,
                gameConfig.code
            );

            alert(`游戏 "${gameConfig.meta.name}" 创建成功！\n目录：cran_games/${gameId}`);
            showScreen('game-select');
            loadGameList(); // 刷新游戏列表
        } catch (error) {
            console.error('创建游戏失败:', error);
            alert(`创建失败: ${error.message}`);
        }
    }
    // 浏览器环境：提供文件下载
    else {
        const gameId = gameConfig.meta.game_id.replace('cran.user.', '');

        // 创建manifest.json文件下载
        const manifestBlob = new Blob([JSON.stringify(manifest, null, 4)], { type: 'application/json' });
        const manifestUrl = URL.createObjectURL(manifestBlob);

        // 创建rules.js文件下载
        const codeBlob = new Blob([gameConfig.code], { type: 'application/javascript' });
        const codeUrl = URL.createObjectURL(codeBlob);

        alert(`在浏览器环境中，请下载以下文件：\n1. manifest.json\n2. logic/rules.js\n\n然后将它们放置到 cran_games/${gameId}/ 目录中`);

        // 自动触发下载
        const manifestLink = document.createElement('a');
        manifestLink.href = manifestUrl;
        manifestLink.download = 'manifest.json';
        manifestLink.click();

        const codeLink = document.createElement('a');
        codeLink.href = codeUrl;
        codeLink.download = 'rules.js';
        codeLink.click();

        // 清理URL
        setTimeout(() => {
            URL.revokeObjectURL(manifestUrl);
            URL.revokeObjectURL(codeUrl);
        }, 1000);

        showScreen('game-select');
    }
}

function exportGamePackage() {
    alert('导出游戏包功能尚未实现。当前仅支持创建游戏文件。');
    // 未来可实现ZIP打包
}

// 暴露函数给全局
window.initCreateGameForm = initCreateGameForm;

// 暴露给全局，供 main.ts 调用
window.showScreen = showScreen;
window.startGame = startGame;
window.cranchessSettings = window.cranchessSettings;

// 初始化
window.cranchessSettings.load();
applyTheme(window.cranchessSettings.theme);