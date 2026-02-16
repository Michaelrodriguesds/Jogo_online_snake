/* ============================================
   🎮 SNAKE MULTIPLAYER - JAVASCRIPT LIMPO
   ============================================
   SEM CSS inline - apenas JavaScript puro
   ============================================ */

// ========== ELEMENTOS DOM ==========
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const menuCanvas = document.getElementById('menuCanvas');
const menuCtx = menuCanvas.getContext('2d');

const menuDiv = document.getElementById('menu');
const multiMenuDiv = document.getElementById('multiMenu');
const lobbyDiv = document.getElementById('lobby');

const soloBtn = document.getElementById('soloBtn');
const multiBtn = document.getElementById('multiBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const readyBtn = document.getElementById('readyBtn');
const backToHomeBtn = document.getElementById('backToHomeBtn');
const backFromMulti = document.getElementById('backFromMulti');
const backFromLobby = document.getElementById('backFromLobby');

const pinInput = document.getElementById('pinInput');
const nameInput = document.getElementById('nameInput');
const pinDisplay = document.getElementById('pinDisplay');
const playersList = document.getElementById('playersList');
const scoreboard = document.getElementById('scoreboard');
const messagesDiv = document.getElementById('messages');

// ========== VARIÁVEIS GLOBAIS ==========
let ws = null;
let playerId = null;
let gameState = null;
let playerName = '';
let currentPIN = null;
let isDrawing = false;
let temporaryMessages = [];
let GRID_SIZE = 20;
let timeRemaining = 0;

// ========== DETECÇÃO MOBILE ==========
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// ========== CONFIGURAÇÃO CANVAS ==========
function setupCanvas() {
    if (isMobileDevice()) {
        // ⚠️ TEMPORÁRIO: Forçar grid 20px (mesmo do servidor não atualizado)
        // Quando atualizar servidor, trocar de volta para grid adaptativo
        GRID_SIZE = 20; // ← FIXO temporariamente!
        
        // Canvas 95% da tela com bordas visíveis
        const usableWidth = window.innerWidth * 0.95;
        const usableHeight = window.innerHeight * 0.95;
        
        // Canvas = múltiplo EXATO de 20px (evita bugs)
        const cellsX = Math.floor(usableWidth / GRID_SIZE);
        const cellsY = Math.floor(usableHeight / GRID_SIZE);
        canvas.width = cellsX * GRID_SIZE;
        canvas.height = cellsY * GRID_SIZE;
        
        menuCanvas.width = window.innerWidth * 0.9;
        menuCanvas.height = window.innerHeight * 0.6;
        
        console.log(`Mobile (GRID FIXO 20px): ${canvas.width}x${canvas.height}, Células: ${cellsX}x${cellsY}`);
        console.log('⚠️ Grid fixo 20px - trocar quando servidor for atualizado!');
    } else {
        // Desktop
        canvas.width = 800;
        canvas.height = 600;
        menuCanvas.width = 800;
        menuCanvas.height = 600;
        GRID_SIZE = 20;
    }
    
    ctx.imageSmoothingEnabled = false;
}

// ========== WEBSOCKET ==========
const getWebSocketURL = () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'ws://localhost:8080';
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
};

function setupWS() {
    hideElement(multiMenuDiv);
    showElement(lobbyDiv);

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleMessage(data);
        } catch (error) {
            console.error('Erro:', error);
        }
    };
    
    ws.onerror = (error) => {
        console.error('Erro WebSocket:', error);
        alert('Erro de conexão');
        showMenu();
    };
    
    ws.onclose = () => {
        console.log('WebSocket fechado');
        isDrawing = false;
    };
}

function handleMessage(data) {
    switch (data.type) {
        case 'joined':
            playerId = data.playerId;
            gameState = data.gameState;
            currentPIN = data.pin;
            pinDisplay.innerText = "PIN: " + currentPIN;
            updateLobby(data);
            break;
        
        case 'lobbyUpdate':
            updateLobby(data);
            break;
        
        case 'update':
            gameState = data.gameState;
            
            if (gameState.temporaryMessages) {
                temporaryMessages = gameState.temporaryMessages;
            }
            
            if (gameState.status === 'playing') {
                hideElement(lobbyDiv);
                showElement(canvas);
                showElement(scoreboard);
                
                if (!isDrawing) {
                    isDrawing = true;
                    draw();
                }
            }
            break;
        
        case 'gameEnd':
            gameState = data.gameState;
            isDrawing = false;
            setTimeout(() => showPodium(), 1000);
            break;
        
        case 'timeUpdate':
            timeRemaining = data.timeRemaining;
            updateTimerDisplay();
            break;
        
        case 'error':
            alert(data.message);
            showMenu();
            break;
    }
}

// ========== MOVIMENTO ==========
function sendMove(dx, dy) {
    if (!ws || !gameState || gameState.status !== 'playing') return;
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: 'move', dx, dy}));
    }
}

// ========== CONTROLES MOBILE ==========
function setupMobileControls() {
    console.log(isMobileDevice() ? 'Mobile: usando SWIPE' : 'Desktop: usando teclado');
}

function setupSwipeControls() {
    if (!isMobileDevice()) return;
    
    let touchStartX = 0;
    let touchStartY = 0;
    const minSwipeDistance = 50;
    
    canvas.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        e.preventDefault();
    }, { passive: false });
    
    canvas.addEventListener('touchend', (e) => {
        const touchEndX = e.changedTouches[0].clientX;
        const touchEndY = e.changedTouches[0].clientY;
        
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;
        
        const swipeLength = Math.sqrt(diffX * diffX + diffY * diffY);
        if (swipeLength < minSwipeDistance) return;
        
        if (Math.abs(diffX) > Math.abs(diffY)) {
            sendMove(diffX > 0 ? GRID_SIZE : -GRID_SIZE, 0);
        } else {
            sendMove(0, diffY > 0 ? GRID_SIZE : -GRID_SIZE);
        }
        
        e.preventDefault();
    }, { passive: false });
}

// ========== TECLADO ==========
document.addEventListener('keydown', e => {
    // ESC = Menu (sempre)
    if (e.key === 'Escape') {
        showMenu();
        return;
    }
    
    // R = Restart (apenas no pódio)
    if (e.key === 'r' || e.key === 'R') {
        if (!isDrawing && gameState && gameState.status === 'ended') {
            // Restart - criar nova sala
            if (currentPIN) {
                ws = new WebSocket(getWebSocketURL());
                ws.onopen = () => {
                    ws.send(JSON.stringify({
                        type: 'join',
                        pin: generateTempPIN(),
                        name: playerName,
                        gridSize: GRID_SIZE
                    }));
                };
                setupWS();
            } else {
                showMenu();
            }
        }
        return;
    }
    
    // Controles do jogo
    if (!ws || !gameState || gameState.status !== 'playing') return;
    
    let dx = 0, dy = 0;
    
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') dy = -GRID_SIZE;
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') dy = GRID_SIZE;
    else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') dx = -GRID_SIZE;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dx = GRID_SIZE;
    else return;
    
    e.preventDefault();
    sendMove(dx, dy);
});

// ========== RENDERIZAÇÃO ==========
function draw() {
    if (!gameState || !isDrawing) return;
    
    // Limpar mensagens antigas
    const now = Date.now();
    temporaryMessages = temporaryMessages.filter(msg => now - msg.timestamp < 5000);
    
    // Fundo
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Grid visível
    ctx.strokeStyle = isMobileDevice() ? '#555' : '#333';
    ctx.lineWidth = isMobileDevice() ? 3 : 1;
    ctx.beginPath();
    for (let x = 0; x < canvas.width; x += GRID_SIZE) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
    }
    for (let y = 0; y < canvas.height; y += GRID_SIZE) {
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
    }
    ctx.stroke();
    
    // Comida
    if (gameState.food) {
        ctx.shadowColor = '#FF5555';
        ctx.shadowBlur = 15;
        ctx.fillStyle = '#FF5555';
        ctx.fillRect(gameState.food.x + 2, gameState.food.y + 2, GRID_SIZE - 4, GRID_SIZE - 4);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = 2;
        ctx.strokeRect(gameState.food.x, gameState.food.y, GRID_SIZE, GRID_SIZE);
    }
    
    // Cobras
    for (let id in gameState.snakes) {
        const snake = gameState.snakes[id];
        if (!snake.alive) continue;
        
        snake.body.forEach((segment, index) => {
            if (index === 0) {
                // Cabeça
                ctx.fillStyle = snake.color || '#00FF00';
                ctx.fillRect(segment.x + 1, segment.y + 1, GRID_SIZE - 2, GRID_SIZE - 2);
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 3;
                ctx.strokeRect(segment.x, segment.y, GRID_SIZE, GRID_SIZE);
                
                // Olhos
                ctx.fillStyle = '#000000';
                const eyeSize = Math.max(3, Math.floor(GRID_SIZE / 5));
                const eyeOffset = Math.floor(GRID_SIZE * 0.2);
                const eyeSpacing = Math.floor(GRID_SIZE * 0.6);
                
                if (snake.dx > 0) {
                    ctx.fillRect(segment.x + GRID_SIZE - eyeOffset - eyeSize, segment.y + eyeOffset, eyeSize, eyeSize);
                    ctx.fillRect(segment.x + GRID_SIZE - eyeOffset - eyeSize, segment.y + eyeSpacing, eyeSize, eyeSize);
                } else if (snake.dx < 0) {
                    ctx.fillRect(segment.x + eyeOffset, segment.y + eyeOffset, eyeSize, eyeSize);
                    ctx.fillRect(segment.x + eyeOffset, segment.y + eyeSpacing, eyeSize, eyeSize);
                } else if (snake.dy > 0) {
                    ctx.fillRect(segment.x + eyeOffset, segment.y + GRID_SIZE - eyeOffset - eyeSize, eyeSize, eyeSize);
                    ctx.fillRect(segment.x + eyeSpacing, segment.y + GRID_SIZE - eyeOffset - eyeSize, eyeSize, eyeSize);
                } else {
                    ctx.fillRect(segment.x + eyeOffset, segment.y + eyeOffset, eyeSize, eyeSize);
                    ctx.fillRect(segment.x + eyeSpacing, segment.y + eyeOffset, eyeSize, eyeSize);
                }
            } else {
                // Corpo
                ctx.fillStyle = snake.color || '#00FF00';
                ctx.fillRect(segment.x + 2, segment.y + 2, GRID_SIZE - 4, GRID_SIZE - 4);
            }
        });
        
        // Nome
        const fontSize = Math.max(10, Math.floor(GRID_SIZE * 0.6));
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        const headX = snake.body[0].x + GRID_SIZE/2;
        const headY = snake.body[0].y - Math.floor(GRID_SIZE * 0.4);
        ctx.strokeText(snake.name, headX, headY);
        ctx.fillText(snake.name, headX, headY);
    }
    
    // Scoreboard
    const alivePlayers = Object.values(gameState.snakes).filter(s => s.alive);
    scoreboard.innerHTML = `Vivos (${alivePlayers.length}): ${alivePlayers.map(s => s.name).join(', ')}`;
    
    // Pontuação
    const mySnake = gameState.snakes[playerId];
    if (mySnake) {
        ctx.fillStyle = '#FFD700';
        const scoreFontSize = Math.max(14, Math.floor(GRID_SIZE * 0.8));
        ctx.font = `bold ${scoreFontSize}px Arial`;
        ctx.textAlign = 'left';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        const scoreText = `Score: ${mySnake.body.length} | Vivos: ${alivePlayers.length}`;
        const scoreY = Math.max(25, GRID_SIZE + 5);
        ctx.strokeText(scoreText, 10, scoreY);
        ctx.fillText(scoreText, 10, scoreY);
    }
    
    if (gameState.status === 'playing') {
        requestAnimationFrame(draw);
    } else {
        isDrawing = false;
    }
}

// ========== UI ==========
function updateTimerDisplay() {
    const timerElement = document.getElementById('timerDisplay');
    if (timerElement) {
        timerElement.innerHTML = timeRemaining > 0 ? `⏰ ${timeRemaining}s` : '';
        timerElement.style.display = timeRemaining > 0 ? 'block' : 'none';
    }
}

function showElement(element) {
    element.style.display = 'block';
}

function hideElement(element) {
    element.style.display = 'none';
}

function showMenu() {
    hideElement(canvas);
    hideElement(multiMenuDiv);
    hideElement(lobbyDiv);
    showElement(menuDiv);
    showElement(menuCanvas);
    hideElement(scoreboard);
    
    isDrawing = false;
    timeRemaining = 0;
    
    if (ws) {
        ws.close();
        ws = null;
    }
    
    animateMenuSnake();
}

function updateLobby(data) {
    playersList.innerHTML = '';
    const players = data.players || [];
    
    players.forEach((p, index) => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        playerItem.innerHTML = `${p.name}${p.isBot ? ' 🤖' : ' 👤'}${index === 0 && !p.isBot ? ' 👑' : ''} - ${p.ready ? '✅' : '⏳'}`;
        playersList.appendChild(playerItem);
    });
    
    const myPlayer = players.find(p => p.name === playerName);
    if (myPlayer && myPlayer.ready) {
        readyBtn.disabled = true;
        readyBtn.innerText = "Pronto! ✓";
    }
}

// ========== ANIMAÇÃO MENU ==========
let snakeX = 0, snakeY = 300, animationRunning = false;

function animateMenuSnake() {
    if (menuDiv.style.display === 'block' && !animationRunning) {
        animationRunning = true;
        
        function animate() {
            if (menuDiv.style.display !== 'block') {
                menuCtx.clearRect(0, 0, menuCanvas.width, menuCanvas.height);
                animationRunning = false;
                return;
            }
            
            menuCtx.clearRect(0, 0, menuCanvas.width, menuCanvas.height);
            menuCtx.fillStyle = "#00FF00";
            
            for (let i = 0; i < 8; i++) {
                const segmentX = snakeX - i * 25;
                const segmentY = snakeY;
                
                if (segmentX > -50 && segmentX < menuCanvas.width + 50) {
                    menuCtx.fillRect(segmentX, segmentY, 20, 20);
                    if (i === 0) {
                        menuCtx.fillStyle = "#000000";
                        menuCtx.fillRect(segmentX + 15, segmentY + 5, 3, 3);
                        menuCtx.fillRect(segmentX + 15, segmentY + 12, 3, 3);
                        menuCtx.fillStyle = "#00FF00";
                    }
                }
            }
            
            snakeX += 2;
            if (snakeX > menuCanvas.width + 200) snakeX = -200;
            requestAnimationFrame(animate);
        }
        animate();
    }
}

// ========== PÓDIO ==========
function showPodium() {
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(50, 50, canvas.width - 100, canvas.height - 100);
    
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 4;
    ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100);
    
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText('🏆 FIM DE JOGO 🏆', canvas.width / 2, 120);
    ctx.fillText('🏆 FIM DE JOGO 🏆', canvas.width / 2, 120);
    
    if (gameState.leaderboard && gameState.leaderboard.length > 0) {
        const winner = gameState.leaderboard[0];
        ctx.font = 'bold 28px Arial';
        ctx.strokeText(`🥇 ${winner.name}`, canvas.width / 2, 180);
        ctx.fillText(`🥇 ${winner.name}`, canvas.width / 2, 180);
        
        ctx.font = 'bold 20px Arial';
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeText(`${winner.score} pontos`, canvas.width / 2, 210);
        ctx.fillText(`${winner.score} pontos`, canvas.width / 2, 210);
    }
    
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = '#AAA';
    ctx.strokeText('ESC = Menu | R = Restart', canvas.width / 2, canvas.height - 80);
    ctx.fillText('ESC = Menu | R = Restart', canvas.width / 2, canvas.height - 80);
}

function generateTempPIN() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function startSolo(name) {
    ws = new WebSocket(getWebSocketURL());
    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'solo',
            name: name,
            gridSize: GRID_SIZE // ← ENVIAR GRID_SIZE!
        }));
    };
    setupWS();
}

// ========== EVENT LISTENERS ==========
soloBtn.onclick = () => {
    const name = prompt("Digite seu nome:", "Player");
    if (name === null) return;
    playerName = name || "Player";
    hideElement(menuDiv);
    hideElement(menuCanvas);
    startSolo(playerName);
};

multiBtn.onclick = () => {
    if (!playerName) playerName = prompt("Digite seu nome:", "Player") || "Player";
    hideElement(menuDiv);
    hideElement(menuCanvas);
    showElement(multiMenuDiv);
    nameInput.value = playerName;
};

backToHomeBtn.onclick = () => window.location.href = 'index.html';
backFromMulti.onclick = showMenu;

backFromLobby.onclick = () => {
    hideElement(lobbyDiv);
    showElement(multiMenuDiv);
    if (ws) {
        ws.close();
        ws = null;
    }
};

createRoomBtn.onclick = () => {
    playerName = nameInput.value.trim() || "Player";
    if (!playerName) { alert("Digite um nome!"); return; }
    ws = new WebSocket(getWebSocketURL());
    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'join',
            pin: generateTempPIN(),
            name: playerName,
            gridSize: GRID_SIZE // ← ENVIAR GRID_SIZE!
        }));
    };
    setupWS();
};

joinRoomBtn.onclick = () => {
    playerName = nameInput.value.trim() || "Player";
    currentPIN = pinInput.value.trim();
    if (!playerName) { alert("Digite um nome!"); return; }
    if (!currentPIN || currentPIN.length !== 4 || isNaN(currentPIN)) {
        alert("PIN inválido!");
        return;
    }
    ws = new WebSocket(getWebSocketURL());
    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'join',
            pin: currentPIN,
            name: playerName,
            gridSize: GRID_SIZE // ← ENVIAR GRID_SIZE!
        }));
    };
    setupWS();
};

readyBtn.onclick = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: 'ready'}));
        readyBtn.disabled = true;
        readyBtn.innerText = "Pronto! ✓";
    }
};

// Prevenir zoom mobile
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

// ========== INICIALIZAÇÃO ==========
document.addEventListener('DOMContentLoaded', function() {
    setupCanvas();
    setupMobileControls();
    setupSwipeControls();
    showMenu();
    console.log('Jogo inicializado - Mobile:', isMobileDevice(), 'Grid:', GRID_SIZE);
});