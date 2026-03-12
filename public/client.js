/* ============================================
   🐍 SNAKE MULTIPLAYER — CLIENT SINCRONIZADO
   ─────────────────────────────────────────
   ARQUITETURA CORRETA:
   • Mundo de jogo FIXO: 800×600, GRID=20
   • canvas HTML é sempre 800×600 (lógico)
   • CSS scale() adapta para qualquer tela
   • PC e mobile 100% sincronizados
   • dx/dy sempre ±20 (GRID do servidor)
   ============================================ */

// ──────────────── DOM ────────────────
const canvas        = document.getElementById('gameCanvas');
const ctx           = canvas.getContext('2d');
const menuCanvas    = document.getElementById('menuCanvas');
const menuCtx       = menuCanvas.getContext('2d');
const menuDiv       = document.getElementById('menu');
const multiMenuDiv  = document.getElementById('multiMenu');
const lobbyDiv      = document.getElementById('lobby');
const soloBtn       = document.getElementById('soloBtn');
const multiBtn      = document.getElementById('multiBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn   = document.getElementById('joinRoomBtn');
const readyBtn      = document.getElementById('readyBtn');
const backFromMulti = document.getElementById('backFromMulti');
const backFromLobby = document.getElementById('backFromLobby');
const pinInput      = document.getElementById('pinInput');
const nameInput     = document.getElementById('nameInput');
const pinDisplay    = document.getElementById('pinDisplay');
const playersList   = document.getElementById('playersList');
const scoreboard    = document.getElementById('scoreboard');
const quitBtn       = document.getElementById('quitBtn');

// ──────────────── MUNDO DO JOGO (espelha o servidor) ────────────────
// ✅ NUNCA muda — servidor e cliente usam os mesmos valores
const GAME_W  = 800;
const GAME_H  = 600;
const GRID    = 20;    // dx/dy enviados ao servidor sempre = ±GRID

// ──────────────── ESTADO ────────────────
let ws                 = null;
let playerId           = null;
let gameState          = null;
let playerName         = '';
let currentPIN         = null;
let isDrawing          = false;
let isSoloMode         = false;
let timeRemaining      = 0;
let deathMessages      = [];   // { text, color, timestamp }
let predefinedMsgs     = [];
let chatPanelOpen      = false;
let menuAnimOn         = false;

// ──────────────── DETECÇÃO MOBILE ────────────────
const isMobile = () => /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// ──────────────── CANVAS & ESCALA ────────────────
/*
  O canvas LÓGICO é sempre 800×600.
  Em dispositivos menores, aplicamos CSS transform: scale()
  para que caiba na tela — mas o jogo roda nas mesmas
  coordenadas do servidor. PC e mobile sincronizados.
*/
function setupCanvas() {
    // Canvas lógico fixo (igual ao mundo do servidor)
    canvas.width      = GAME_W;
    canvas.height     = GAME_H;
    menuCanvas.width  = GAME_W;
    menuCanvas.height = GAME_H;
    ctx.imageSmoothingEnabled = false;

    applyCanvasScale();
}

function applyCanvasScale() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Escala para caber inteiro na viewport (mantém proporção)
    const scaleX = vw / GAME_W;
    const scaleY = vh / GAME_H;
    const scale  = Math.min(scaleX, scaleY);     // ocupa 100% da menor dimensão

    // Centraliza e escala via CSS (não altera coordenadas lógicas)
    const style = `
        position: fixed;
        top:  50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(${scale});
        transform-origin: center center;
        image-rendering: pixelated;
    `;
    canvas.style.cssText     = style + 'display:none; border:3px solid #00FF00; border-radius:8px; box-shadow:0 0 30px rgba(0,255,0,0.6);';
    menuCanvas.style.cssText = style + 'opacity:0.35; filter:blur(1px);';
}

window.addEventListener('resize', applyCanvasScale);

// ──────────────── WEBSOCKET ────────────────
function getWSURL() {
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
        return 'ws://localhost:8080';
    return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`;
}

function setupWSHandlers() {
    ws.onmessage = e => {
        try { handleMessage(JSON.parse(e.data)); }
        catch (err) { console.error('WS parse:', err); }
    };
    ws.onerror = () => { alert('Erro de conexão com o servidor.'); showMenu(); };
    ws.onclose = () => { isDrawing = false; };
}

// ──────────────── HANDLER ────────────────
function handleMessage(data) {
    switch (data.type) {

        case 'joined':
            playerId   = data.playerId;
            gameState  = data.gameState;
            currentPIN = data.pin;
            predefinedMsgs = data.predefinedMessages || predefinedMsgs;
            if (isSoloMode) {
                hideMenu();
                hideEl(lobbyDiv);
            } else {
                hideEl(multiMenuDiv);
                showEl(lobbyDiv);
                pinDisplay.innerText = 'PIN: ' + currentPIN;
                updateLobby(data.players || []);
            }
            break;

        case 'lobbyUpdate':
            updateLobby(data.players || []);
            break;

        case 'update':
            gameState = data.gameState;
            if (gameState.status === 'playing') {
                hideMenu();
                hideEl(lobbyDiv);
                canvas.style.display = 'block';
                showEl(scoreboard);
                if (quitBtn) quitBtn.style.display = 'block';
                showChatBtn(true);
                updateTimerDisplay();
                if (!isDrawing) { isDrawing = true; requestAnimationFrame(draw); }
            }
            break;

        case 'gameEnd':
            gameState = data.gameState;
            isDrawing = false;
            showChatBtn(false);
            setTimeout(showPodium, 600);
            break;

        case 'timeUpdate':
            timeRemaining = data.timeRemaining;
            updateTimerDisplay();
            break;

        case 'playerDied':
            // ✅ Overlay de morte renderizado no canvas
            deathMessages.push({
                text:      `💀 ${data.playerName} morreu!`,
                color:     data.color || '#FF5555',
                timestamp: data.timestamp || Date.now()
            });
            if (deathMessages.length > 4) deathMessages.shift();
            break;

        case 'chatUpdate':
            appendChatMsg(data.message);
            break;

        case 'error':
            alert(data.message);
            showMenu();
            break;
    }
}

// ──────────────── MOVIMENTO ────────────────
// ✅ dx/dy sempre ±GRID (20) — igual ao servidor
function sendMove(dx, dy) {
    if (!ws || !gameState || gameState.status !== 'playing') return;
    if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'move', dx, dy }));
}

// ──────────────── TECLADO ────────────────
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { showMenu(); return; }

    if ((e.key === 'r' || e.key === 'R') && gameState?.status === 'ended') {
        ws?.readyState === WebSocket.OPEN &&
            ws.send(JSON.stringify({ type: 'restartGame' }));
        return;
    }

    if (!ws || !gameState || gameState.status !== 'playing') return;

    let dx = 0, dy = 0;
    if      (['ArrowUp',    'w','W'].includes(e.key)) dy = -GRID;
    else if (['ArrowDown',  's','S'].includes(e.key)) dy =  GRID;
    else if (['ArrowLeft',  'a','A'].includes(e.key)) dx = -GRID;
    else if (['ArrowRight', 'd','D'].includes(e.key)) dx =  GRID;
    else return;

    e.preventDefault();
    sendMove(dx, dy);
});

// ──────────────── SWIPE MOBILE ────────────────
/*
  O swipe detecta apenas DIREÇÃO — não usa coordenadas absolutas,
  então a escala CSS não afeta o controle.
*/
function setupSwipe() {
    let sx = 0, sy = 0;
    document.addEventListener('touchstart', e => {
        sx = e.touches[0].clientX;
        sy = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        if (!gameState || gameState.status !== 'playing') return;
        const dx = e.changedTouches[0].clientX - sx;
        const dy = e.changedTouches[0].clientY - sy;
        if (Math.hypot(dx, dy) < 30) return;   // swipe muito curto = ignorar
        Math.abs(dx) > Math.abs(dy)
            ? sendMove(dx > 0 ? GRID : -GRID, 0)
            : sendMove(0, dy > 0 ? GRID : -GRID);
    }, { passive: true });
}

// ──────────────── RENDERIZAÇÃO ────────────────
function draw() {
    if (!gameState || !isDrawing) return;

    // Fundo
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    // Grade
    ctx.strokeStyle = '#222';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    for (let x = 0; x <= GAME_W; x += GRID) { ctx.moveTo(x, 0); ctx.lineTo(x, GAME_H); }
    for (let y = 0; y <= GAME_H; y += GRID) { ctx.moveTo(0, y); ctx.lineTo(GAME_W, y); }
    ctx.stroke();

    // Borda do campo
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth   = 2;
    ctx.strokeRect(1, 1, GAME_W - 2, GAME_H - 2);

    // Comida
    if (gameState.food) {
        const { x: fx, y: fy } = gameState.food;
        ctx.save();
        ctx.shadowColor = '#FF5555'; ctx.shadowBlur = 14;
        ctx.fillStyle   = '#FF4444';
        ctx.fillRect(fx + 3, fy + 3, GRID - 6, GRID - 6);
        ctx.restore();
        ctx.strokeStyle = '#FF0000'; ctx.lineWidth = 1;
        ctx.strokeRect(fx + 1, fy + 1, GRID - 2, GRID - 2);
    }

    // Cobras
    for (const id in gameState.snakes) {
        const snake = gameState.snakes[id];
        if (!snake.alive) continue;

        // Corpo
        snake.body.forEach((seg, i) => {
            ctx.fillStyle = i === 0 ? snake.color : snake.color + 'AA';
            ctx.fillRect(seg.x + 1, seg.y + 1, GRID - 2, GRID - 2);
        });

        // Contorno da cabeça
        const h = snake.body[0];
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.strokeRect(h.x + 1, h.y + 1, GRID - 2, GRID - 2);

        // Olhos
        drawEyes(snake);

        // Nome
        ctx.save();
        ctx.font        = 'bold 11px Arial';
        ctx.textAlign   = 'center';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
        ctx.strokeText(snake.name, h.x + GRID / 2, h.y - 4);
        ctx.fillStyle = '#fff';
        ctx.fillText  (snake.name, h.x + GRID / 2, h.y - 4);
        ctx.restore();

        // Bolha de chat
        if (snake.tempMessage && Date.now() - snake.tempMessage.timestamp < snake.tempMessage.duration) {
            drawBubble(h, snake.tempMessage.text, snake.color);
        }
    }

    // Overlays de morte
    drawDeathMessages();

    // Scoreboard HTML
    const alive = Object.values(gameState.snakes).filter(s => s.alive);
    scoreboard.innerHTML = `<b>Vivos:</b> ${
        alive.map(s => `<span style="color:${s.color};font-weight:bold">${s.name}</span>`).join(' · ')
    } (${alive.length})`;

    if (gameState.status === 'playing') {
        requestAnimationFrame(draw);
    } else {
        isDrawing = false;
    }
}

// ── Olhos ──
function drawEyes(snake) {
    const h = snake.body[0];
    ctx.fillStyle = '#000';
    const e = 3, o = 5, s = 11;
    if      (snake.dx > 0)  { ctx.fillRect(h.x+GRID-o-e, h.y+o, e, e); ctx.fillRect(h.x+GRID-o-e, h.y+s, e, e); }
    else if (snake.dx < 0)  { ctx.fillRect(h.x+o,        h.y+o, e, e); ctx.fillRect(h.x+o,        h.y+s, e, e); }
    else if (snake.dy > 0)  { ctx.fillRect(h.x+o,        h.y+GRID-o-e, e, e); ctx.fillRect(h.x+s, h.y+GRID-o-e, e, e); }
    else                    { ctx.fillRect(h.x+o,        h.y+o, e, e); ctx.fillRect(h.x+s,        h.y+o, e, e); }
}

// ── Bolha de chat ──
function drawBubble(head, text, color) {
    const cx  = head.x + GRID / 2;
    const cy  = head.y - GRID * 2.5;
    ctx.save();
    ctx.font  = 'bold 11px Arial';
    const tw  = ctx.measureText(text).width;
    const bw  = tw + 14, bh = 20, r = 5;

    ctx.fillStyle   = 'rgba(0,0,0,0.78)';
    ctx.strokeStyle = color; ctx.lineWidth = 2;
    roundRect(ctx, cx - bw/2, cy - bh, bw, bh, r);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.fillText(text, cx, cy - 5);
    ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y,     x + w, y + r,     r);
    ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r,     r);
    ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
}

// ── Overlays de morte ──
function drawDeathMessages() {
    const now = Date.now();
    deathMessages = deathMessages.filter(m => now - m.timestamp < 3500);

    deathMessages.forEach((msg, i) => {
        const age     = now - msg.timestamp;
        const opacity = Math.max(0, 1 - age / 3500);
        if (opacity < 0.02) return;

        ctx.save();
        ctx.globalAlpha = opacity;
        ctx.font        = 'bold 18px Arial';
        ctx.textAlign   = 'center';

        const x   = GAME_W / 2;
        const y   = 55 + i * 42;
        const tw  = ctx.measureText(msg.text).width;

        ctx.fillStyle   = 'rgba(0,0,0,0.72)';
        ctx.fillRect(x - tw/2 - 12, y - 20, tw + 24, 26);
        ctx.strokeStyle = msg.color; ctx.lineWidth = 2;
        ctx.strokeRect(x - tw/2 - 12, y - 20, tw + 24, 26);

        ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
        ctx.strokeText(msg.text, x, y);
        ctx.fillStyle   = '#FF4444';
        ctx.fillText(msg.text, x, y);

        ctx.restore();
    });
}

// ──────────────── PÓDIO ────────────────
function showPodium() {
    canvas.style.display = 'block';
    ctx.fillStyle = 'rgba(0,0,0,0.93)';
    ctx.fillRect(0, 0, GAME_W, GAME_H);

    ctx.strokeStyle = '#FFD700'; ctx.lineWidth = 4;
    ctx.strokeRect(40, 40, GAME_W - 80, GAME_H - 80);

    ctx.textAlign   = 'center';
    ctx.font        = 'bold 36px Arial';
    ctx.fillStyle   = '#FFD700';
    ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
    ctx.strokeText('🏆 FIM DE JOGO 🏆', GAME_W / 2, 105);
    ctx.fillText  ('🏆 FIM DE JOGO 🏆', GAME_W / 2, 105);

    const medals = ['🥇','🥈','🥉','4️⃣'];
    (gameState?.leaderboard || []).forEach((p, i) => {
        const y = 165 + i * 55;
        ctx.font      = `bold ${i === 0 ? 24 : 20}px Arial`;
        ctx.fillStyle = i === 0 ? '#FFD700' : '#ddd';
        ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
        const line    = `${medals[i]}  ${p.name}  —  Tamanho: ${p.score}  |  ${p.survivalTime}s`;
        ctx.strokeText(line, GAME_W / 2, y);
        ctx.fillText  (line, GAME_W / 2, y);
    });

    ctx.font = '15px Arial'; ctx.fillStyle = '#999';
    ctx.fillText('ESC = Menu   |   R = Jogar novamente', GAME_W / 2, GAME_H - 55);
}

// ──────────────── TIMER ────────────────
function updateTimerDisplay() {
    const el = document.getElementById('timerDisplay');
    if (!el) return;
    el.style.display = timeRemaining > 0 ? 'block' : 'none';
    if (timeRemaining > 0) el.textContent = `⏰ ${timeRemaining}s`;
}

// ──────────────── CHAT IN-GAME ────────────────
function buildChatUI() {
    if (document.getElementById('chatToggleBtn')) return;

    // Botão flutuante 💬
    const btn = Object.assign(document.createElement('button'), { id: 'chatToggleBtn', textContent: '💬' });
    Object.assign(btn.style, {
        position: 'fixed', bottom: '70px', right: '12px', zIndex: '999',
        padding: '10px 14px', fontSize: '20px', borderRadius: '50%',
        background: 'rgba(0,0,0,0.75)', border: '2px solid #00FF00',
        color: '#fff', cursor: 'pointer', display: 'none'
    });
    document.body.appendChild(btn);

    // Painel
    const panel = Object.assign(document.createElement('div'), { id: 'chatPanel' });
    Object.assign(panel.style, {
        position: 'fixed', bottom: '130px', right: '12px', zIndex: '999',
        background: 'rgba(0,0,0,0.9)', border: '2px solid #00FF00',
        borderRadius: '12px', padding: '10px', width: '230px', display: 'none'
    });

    // Log
    const log = Object.assign(document.createElement('div'), { id: 'chatLog' });
    Object.assign(log.style, { maxHeight: '110px', overflowY: 'auto', marginBottom: '8px', fontSize: '11px', color: '#ccc' });
    panel.appendChild(log);

    // Mensagens rápidas
    const grid = document.createElement('div');
    Object.assign(grid.style, { display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' });
    predefinedMsgs.forEach(m => {
        const b = Object.assign(document.createElement('button'), { textContent: m });
        Object.assign(b.style, { fontSize: '10px', padding: '3px 6px', borderRadius: '6px',
            border: '1px solid #00FF00', background: 'rgba(0,255,0,0.12)', color: '#fff', cursor: 'pointer' });
        b.onclick = () => sendGameMsg(m);
        grid.appendChild(b);
    });
    panel.appendChild(grid);

    // Input livre
    const row = document.createElement('div');
    Object.assign(row.style, { display: 'flex', gap: '4px' });
    const inp = Object.assign(document.createElement('input'), { id: 'chatFreeInput', placeholder: 'Digitar...', maxLength: 40 });
    Object.assign(inp.style, { flex: '1', padding: '5px', borderRadius: '6px', fontSize: '12px',
        background: 'rgba(255,255,255,0.1)', border: '1px solid #00FF00', color: '#fff' });
    inp.addEventListener('keydown', e => {
        e.stopPropagation();
        if (e.key === 'Enter') { sendGameMsg(inp.value.trim()); inp.value = ''; }
    });
    const sendB = Object.assign(document.createElement('button'), { textContent: '▶' });
    Object.assign(sendB.style, { padding: '5px 8px', borderRadius: '6px',
        background: '#00CC00', border: 'none', color: '#000', cursor: 'pointer', fontWeight: 'bold' });
    sendB.onclick = () => { sendGameMsg(inp.value.trim()); inp.value = ''; };
    row.appendChild(inp); row.appendChild(sendB);
    panel.appendChild(row);
    document.body.appendChild(panel);

    btn.onclick = () => {
        chatPanelOpen = !chatPanelOpen;
        panel.style.display = chatPanelOpen ? 'block' : 'none';
    };
}

function sendGameMsg(text) {
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'gameMessage', message: text }));
}

function appendChatMsg(msg) {
    const log = document.getElementById('chatLog');
    if (!log) return;
    const d = document.createElement('div');
    d.innerHTML = `<b style="color:#FFD700">${esc(msg.name)}:</b> ${esc(msg.message)}`;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    while (log.children.length > 30) log.removeChild(log.firstChild);
}

function showChatBtn(v) {
    const btn   = document.getElementById('chatToggleBtn');
    const panel = document.getElementById('chatPanel');
    if (btn)   btn.style.display   = v ? 'block' : 'none';
    if (!v && panel) { panel.style.display = 'none'; chatPanelOpen = false; }
}

// ──────────────── UI HELPERS ────────────────
function showEl(el)  { if (el) el.style.display = 'block'; }
function hideEl(el)  { if (el) el.style.display = 'none'; }
function hideMenu()  { menuDiv.classList.add('hidden'); }
function esc(s)      { const d = document.createElement('div'); d.textContent = String(s); return d.innerHTML; }

function showMenu() {
    menuDiv.classList.remove('hidden');
    canvas.style.display = 'none';
    hideEl(multiMenuDiv);
    hideEl(lobbyDiv);
    hideEl(scoreboard);
    const td = document.getElementById('timerDisplay');
    if (td) td.style.display = 'none';
    if (quitBtn) quitBtn.style.display = 'none';
    showChatBtn(false);

    isDrawing     = false;
    isSoloMode    = false;
    timeRemaining = 0;
    deathMessages = [];

    if (ws) { ws.close(); ws = null; }
    animateMenuSnake();
}

function updateLobby(players) {
    if (!playersList) return;
    playersList.innerHTML = '';
    players.forEach(p => {
        const d = document.createElement('div');
        d.className   = 'player-item';
        d.textContent = `${p.ready ? '✅' : '⏳'} ${p.name} ${p.isBot ? '🤖' : '👤'}`;
        playersList.appendChild(d);
    });
}

// ──────────────── ANIMAÇÃO DO MENU ────────────────
let menuSnake = [{ x: 200, y: 300 }];
let menuDir   = { dx: GRID, dy: 0 };

function animateMenuSnake() {
    if (menuAnimOn) return;
    menuAnimOn = true;

    function step() {
        if (menuDiv.classList.contains('hidden')) { menuAnimOn = false; menuCtx.clearRect(0, 0, GAME_W, GAME_H); return; }
        menuCtx.clearRect(0, 0, GAME_W, GAME_H);
        menuSnake.forEach((seg, i) => {
            menuCtx.fillStyle = i === 0 ? '#00FF00' : `rgba(0,200,0,${1 - i * 0.08})`;
            menuCtx.fillRect(seg.x, seg.y, GRID - 1, GRID - 1);
        });
        const h = { x: menuSnake[0].x + menuDir.dx, y: menuSnake[0].y + menuDir.dy };
        h.x = ((h.x + GAME_W) % GAME_W);
        h.y = ((h.y + GAME_H) % GAME_H);
        menuSnake.unshift(h);
        if (menuSnake.length > 14) menuSnake.pop();
        if (Math.random() < 0.04) {
            const dirs = [{ dx: GRID, dy:0 },{ dx:-GRID, dy:0 },{ dx:0, dy:GRID },{ dx:0, dy:-GRID }];
            menuDir = dirs[Math.floor(Math.random() * dirs.length)];
        }
        setTimeout(() => requestAnimationFrame(step), 90);
    }
    requestAnimationFrame(step);
}

// ──────────────── CONEXÃO ────────────────
// ✅ Cliente NÃO envia canvasWidth/Height — servidor define o mundo
function connectSolo(name) {
    isSoloMode = true;
    ws = new WebSocket(getWSURL());
    setupWSHandlers();
    ws.onopen = () => ws.send(JSON.stringify({ type: 'solo', name }));
}

function connectRoom(pin, name) {
    isSoloMode = false;
    ws = new WebSocket(getWSURL());
    setupWSHandlers();
    ws.onopen = () => ws.send(JSON.stringify({ type: 'join', pin, name }));
}

function genPIN() { return Math.floor(1000 + Math.random() * 9000).toString(); }

// ──────────────── EVENT LISTENERS ────────────────
soloBtn.onclick = () => {
    const name = prompt('Digite seu nome:', 'Player');
    if (!name) return;
    playerName = name.trim() || 'Player';
    hideMenu();
    buildChatUI();
    connectSolo(playerName);
};

multiBtn.onclick = () => {
    if (!playerName) playerName = (prompt('Digite seu nome:', 'Player') || 'Player').trim();
    hideMenu();
    showEl(multiMenuDiv);
    nameInput.value = playerName;
};

backFromMulti.onclick = () => { hideEl(multiMenuDiv); showMenu(); };
backFromLobby.onclick = () => {
    hideEl(lobbyDiv); showEl(multiMenuDiv);
    if (ws) { ws.close(); ws = null; }
};

createRoomBtn.onclick = () => {
    playerName = nameInput.value.trim() || 'Player';
    buildChatUI();
    connectRoom(genPIN(), playerName);
    hideEl(multiMenuDiv);
    showEl(lobbyDiv);
};

joinRoomBtn.onclick = () => {
    playerName = nameInput.value.trim() || 'Player';
    const pin  = pinInput.value.trim();
    if (!pin || pin.length !== 4 || isNaN(pin)) { alert('PIN inválido!'); return; }
    buildChatUI();
    connectRoom(pin, playerName);
};

readyBtn.onclick = () => {
    if (ws?.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ready' }));
        readyBtn.disabled  = true;
        readyBtn.innerText = 'Pronto! ✓';
    }
};

if (quitBtn) quitBtn.onclick = () => { if (confirm('Sair do jogo?')) showMenu(); };

// ──────────────── INIT ────────────────
document.addEventListener('DOMContentLoaded', () => {
    setupCanvas();
    setupSwipe();
    animateMenuSnake();
    console.log(`🐍 Snake – mundo ${GAME_W}×${GAME_H} grid=${GRID} | mobile=${isMobile()}`);
});