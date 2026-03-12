import { invoke } from '@tauri-apps/api/tauri';
import { open, message } from '@tauri-apps/api/dialog';

window.cranchessSettings = {
    graphics: {
        renderScale: 1.0,
        particlesLimit: 500,
        enableTween: true,
        theme: 'dark'
    },
    audio: {
        masterVolume: 80,
        sfxVolume: 100,
        bgmVolume: 50
    },
    developer: {
        showHitbox: false,
        verboseLog: false
    },
    activeResourcePacks: [],
    
    load() {
        const saved = JSON.parse(localStorage.getItem('cranchess_engine_prefs') || '{}');
        if (saved.graphics) Object.assign(this.graphics, saved.graphics);
        if (saved.audio) Object.assign(this.audio, saved.audio);
        if (saved.developer) Object.assign(this.developer, saved.developer);
        if (saved.activeResourcePacks) this.activeResourcePacks = saved.activeResourcePacks;
    },
    
    save() {
        localStorage.setItem('cranchess_engine_prefs', JSON.stringify({
            graphics: this.graphics,
            audio: this.audio,
            developer: this.developer,
            activeResourcePacks: this.activeResourcePacks
        }));
    }
};

// 启动器路由与DOM管理
document.addEventListener('DOMContentLoaded', () => {
    window.cranchessSettings.load();
    initLauncherNav();
    initSettingsPanel();
    loadLocalGameLibrary();
    initExtraEvents();

    // 绑定退出游戏按钮
    document.getElementById('btn-exit-game').addEventListener('click', () => {
        document.getElementById('game-container').style.display = 'none';
        // 触发外部逻辑停止循环 (main.ts 中应当暴露相应的清理方法)
        if (window.stopGameEngine) window.stopGameEngine();
    });
});

function initExtraEvents() {
    // 绑定工作室编辑器按钮
    const btnStudio = document.getElementById('btn-studio-editor');
    if (btnStudio) {
        btnStudio.addEventListener('click', async () => {
            if (window.__TAURI_IPC__) {
                await message('工作室模块正在重构中，敬请期待！\n目前请直接在文件系统中修改 cran_games 下的文件。', { title: 'CranChess Studio', type: 'info' });
            } else {
                alert('工作室模块重构中，敬请期待！');
            }
        });
    }

    // 绑定资源包导入按钮
    const btnImport = document.getElementById('btn-import-asset');
    if (btnImport) {
        btnImport.addEventListener('click', async () => {
            if (window.__TAURI_IPC__) {
                try {
                    const selected = await open({
                        filters: [{ name: '资源包', extensions: ['zip'] }]
                    });
                    if (selected) {
                        await message(`成功选择资源包: ${selected}\n资源解压与加载模块正在开发中...`, { title: '资源导入', type: 'info' });
                    }
                } catch (e) {
                    console.error("资源选取被拦截或抛错:", e);
                }
            } else {
                alert('请在桌面端应用中使用资源导入功能。');
            }
        });
    }
}

// 左侧边栏路由逻辑
function initLauncherNav() {
    const navItems = document.querySelectorAll('.nav-item');
    const screens = document.querySelectorAll('.main-content .screen');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            // 清理高亮
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            // 切换屏幕
            const targetId = item.getAttribute('data-target');
            screens.forEach(s => {
                s.classList.remove('active');
                if (s.id === targetId) s.classList.add('active');
            });
            
            // 如果切到设置，刷新一次视图数据
            if (targetId === 'screen-settings') syncSettingsToUI();
        });
    });
}

// 设置面板的内部 Tab 切换与数据绑定
function initSettingsPanel() {
    const tabs = document.querySelectorAll('.setting-tab');
    const groups = document.querySelectorAll('.setting-group');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            groups.forEach(g => g.classList.remove('active'));
            
            tab.classList.add('active');
            document.getElementById(tab.getAttribute('data-group')).classList.add('active');
        });
    });

    document.getElementById('btn-save-settings').addEventListener('click', () => {
        // 读取 DOM 回写到 Config
        const conf = window.cranchessSettings;
        conf.graphics.renderScale = parseFloat(document.getElementById('opt-render-scale').value);
        conf.graphics.particlesLimit = parseInt(document.getElementById('opt-particles').value);
        conf.graphics.enableTween = document.getElementById('opt-tween').value === 'true';
        
        conf.developer.showHitbox = document.getElementById('opt-debug-hitbox').value === 'true';
        conf.developer.verboseLog = document.getElementById('opt-debug-log').value === 'true';

        conf.save();
        
        const btn = document.getElementById('btn-save-settings');
        btn.innerText = "已保存";
        btn.style.backgroundColor = "#10b981"; // 成功绿
        setTimeout(() => {
            btn.innerText = "应用更改";
            btn.style.backgroundColor = "var(--accent)";
        }, 1500);
    });
}

// 将内存中的配置同步渲染到控制面板
function syncSettingsToUI() {
    const conf = window.cranchessSettings;
    document.getElementById('opt-render-scale').value = conf.graphics.renderScale;
    document.getElementById('opt-particles').value = conf.graphics.particlesLimit;
    document.getElementById('opt-tween').value = conf.graphics.enableTween ? 'true' : 'false';
    document.getElementById('opt-debug-hitbox').value = conf.developer.showHitbox ? 'true' : 'false';
    document.getElementById('opt-debug-log').value = conf.developer.verboseLog ? 'true' : 'false';
}

// 扫描并加载游戏库
async function loadLocalGameLibrary() {
    const container = document.getElementById('game-list');
    container.innerHTML = '<div style="color:var(--text-muted);">正在检索本地清单...</div>';

    let games = [];
    if (window.__TAURI_IPC__) {
        try {
            // 安全下发至 Rust 并发获取，规避 JS 层直接操作 FS 的隔离域限制
            games = await invoke("get_local_games");
        } catch (e) {
            console.error("Rust 层读取游戏库失败:", e);
        }
    } else {
        // 浏览器环境后备模拟数据
        games = [
            { id: 'standard-chess@1.0.0', name: '标准国际象棋', author: 'CranChess', version: '1.0.0' },
            { id: 'go', name: '围棋 (Weiqi)', author: 'CranChess', version: '1.0.0' },
            { id: 'custom-variant', name: '五子棋扩展版', author: '社区作者', version: '0.5.1' }
        ];
    }

    container.innerHTML = '';
    
    if (games.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);">未发现任何游戏变种，请检查 cran_games 目录。</div>';
        return;
    }

    games.forEach(game => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <div class="card-title">${game.name}</div>
            <div class="card-meta">作者: ${game.author} | 版本: v${game.version}</div>
            <div style="font-size:0.85rem; color:var(--text-muted)">引擎层: ${game.id}</div>
        `;
        card.addEventListener('click', () => launchGameEnv(game.id));
        container.appendChild(card);
    });
}

// 调起游戏渲染层
function launchGameEnv(gameId) {
    if (window.cranchessSettings.developer.verboseLog) {
        console.log(`[Launcher] 准备装载引擎实例: ${gameId}`);
    }
    
    // 显示覆盖层
    const gameContainer = document.getElementById('game-container');
    gameContainer.style.display = 'flex';
    
    // 通知 main.ts 启动循环
    if (window.startGameEngine) {
        window.startGameEngine(gameId);
    } else {
        console.error("未能挂载底层渲染循环入口");
    }
}