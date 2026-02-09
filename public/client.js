/* ============================================
   🎮 SNAKE MULTIPLAYER - JAVASCRIPT CLIENT
   ============================================
   Arquivo: client.js
   Responsabilidades:
   - Gerenciamento de estado do jogo
   - Comunicação WebSocket com servidor
   - Renderização no canvas
   - Controles (teclado, touch, mobile)
   - Interface de usuário (menus, lobby, chat)
   - Animações
   ============================================ */

// ========== ELEMENTOS DOM ==========
// Canvas
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const menuCanvas = document.getElementById('menuCanvas');
const menuCtx = menuCanvas.getContext('2d');

// Menus
const menuDiv = document.getElementById('menu');
const multiMenuDiv = document.getElementById('multiMenu');
const lobbyDiv = document.getElementById('lobby');

// Botões do menu
const soloBtn = document.getElementById('soloBtn');
const multiBtn = document.getElementById('multiBtn');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const readyBtn = document.getElementById('readyBtn');
const backToHomeBtn = document.getElementById('backToHomeBtn');
const backFromMulti = document.getElementById('backFromMulti');
const backFromLobby = document.getElementById('backFromLobby');

// Inputs
const pinInput = document.getElementById('pinInput');
const nameInput = document.getElementById('nameInput');

// UI do jogo
const pinDisplay = document.getElementById('pinDisplay');
const playersList = document.getElementById('playersList');
const scoreboard = document.getElementById('scoreboard');
const messagesDiv = document.getElementById('messages');

// Controles mobile
const mobileControls = document.getElementById('mobileControls');
const upBtn = document.getElementById('upBtn');
const leftBtn = document.getElementById('leftBtn');
const rightBtn = document.getElementById('rightBtn');
const downBtn = document.getElementById('downBtn');

// ========== VARIÁVEIS GLOBAIS ==========
// WebSocket e estado
let ws = null;
let playerId = null;
let gameState = null;
let playerName = '';
let currentPIN = null;

// Controle do jogo
let isDrawing = false;
let temporaryMessages = [];
let GRID_SIZE = 20; // Será ajustado dinamicamente
let timeRemaining = 0;

// Chat
let globalChatDiv = null;
let lobbyChatDiv = null;
let gameMessagePanel = null;
let predefinedMessages = [];
let isInGlobalChat = false;

// ========== DETECÇÃO DE DISPOSITIVO ==========
/**
 * Detecta se é dispositivo mobile
 * @returns {boolean} true se for mobile
 */
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// ========== CONFIGURAÇÃO DE CANVAS ==========
/**
 * Configura tamanho do canvas baseado no dispositivo
 */
function setupCanvas() {
    if (isMobileDevice()) {
        // Mobile - tela cheia
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        menuCanvas.width = window.innerWidth * 0.9;
        menuCanvas.height = window.innerHeight * 0.6;
        
        // Calcular GRID_SIZE ideal para resolução
        // Para Full HD+ (1080x2460): queremos ~30-40 células na largura
        const targetCells = 27; // Número ideal de células na largura
        GRID_SIZE = Math.floor(canvas.width / targetCells);
        
        // Garantir que seja pelo menos 30px para telas grandes
        if (GRID_SIZE < 30) GRID_SIZE = 30;
        if (GRID_SIZE > 50) GRID_SIZE = 50; // Máximo 50px
        
        console.log(`Mobile Full HD+ detectado: ${canvas.width}x${canvas.height}, GRID_SIZE: ${GRID_SIZE}px`);
    } else {
        // Desktop - tamanho fixo
        canvas.width = 800;
        canvas.height = 600;
        menuCanvas.width = 800;
        menuCanvas.height = 600;
        GRID_SIZE = 20; // Grid menor no desktop
    }
    
    ctx.imageSmoothingEnabled = false;
    console.log('Canvas configurado:', canvas.width + 'x' + canvas.height, 'Grid:', GRID_SIZE + 'px');
}

// ========== WEBSOCKET ==========
/**
 * Retorna URL do WebSocket baseado no ambiente
 * @returns {string} URL do WebSocket
 */
const getWebSocketURL = () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'ws://localhost:8080';
    } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}`;
    }
};

/**
 * Configura event listeners do WebSocket
 */
function setupWS() {
    hideElement(multiMenuDiv);
    showElement(lobbyDiv);
    
    // Criar chat do lobby
    createLobbyChatUI();
    if (lobbyChatDiv) {
        lobbyChatDiv.style.display = 'flex';
    }

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            handleMessage(data);
        } catch (error) {
            console.error('Erro ao processar mensagem:', error);
        }
    };
    
    ws.onerror = (error) => {
        console.error('Erro WebSocket:', error);
        alert('Erro de conexão. Verifique se o servidor está rodando.');
        showMenu();
    };
    
    ws.onclose = () => {
        console.log('Conexão fechada');
        isDrawing = false;
        timeRemaining = 0;
        updateTimerDisplay();
    };
}

/**
 * Processa mensagens do servidor
 * @param {Object} data - Dados recebidos
 */
function handleMessage(data) {
    switch (data.type) {
        case 'joined':
            playerId = data.playerId;
            gameState = data.gameState;
            currentPIN = data.pin;
            pinDisplay.innerText = "PIN da Sala: " + currentPIN;
            if (data.predefinedMessages) {
                predefinedMessages = data.predefinedMessages;
            }
            updateLobby(data);
            if (data.chatMessages) {
                updateLobbyChat(data.chatMessages);
            }
            break;
        
        case 'lobbyUpdate':
            updateLobby(data);
            break;
        
        case 'chatUpdate':
            updateLobbyChat(data.chatMessages);
            break;
        
        case 'globalChatUpdate':
            updateGlobalChat(data.message);
            break;
        
        case 'update':
            gameState = data.gameState;
            
            if (gameState.temporaryMessages && gameState.temporaryMessages.length > 0) {
                temporaryMessages = gameState.temporaryMessages;
            }
            
            if (gameState.messages && gameState.messages.length > 0) {
                messagesDiv.innerHTML = gameState.messages.slice(-5).join('<br>');
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
            
            if (gameState.status === 'playing') {
                hideElement(lobbyDiv);
                if (lobbyChatDiv) lobbyChatDiv.style.display = 'none';
                showElement(canvas);
                showElement(scoreboard);
                showElement(messagesDiv);
                
                // Criar botão de mensagens do jogo
                if (!document.getElementById('gameMessageFloat')) {
                    createGameMessagePanel();
                }
                
                // Garantir que botão seja exibido
                const floatingBtn = document.getElementById('gameMessageFloat');
                if (floatingBtn) {
                    floatingBtn.style.display = 'block';
                }
                
                if (!isDrawing) {
                    isDrawing = true;
                    draw();
                }
            }
            break;
        
        case 'gameEnd':
            gameState = data.gameState;
            isDrawing = false;
            
            // Ocultar botão de mensagens
            const floatingBtn = document.getElementById('gameMessageFloat');
            if (floatingBtn) floatingBtn.style.display = 'none';
            
            // Fechar modal se estiver aberto
            const messageModal = document.getElementById('messageModal');
            if (messageModal) messageModal.remove();
            
            setTimeout(() => showPodium(), 1000);
            break;
        
        case 'timeUpdate':
            timeRemaining = data.timeRemaining;
            updateTimerDisplay();
            break;
        
        case 'error':
            alert(data.message);
            hideElement(lobbyDiv);
            if (lobbyChatDiv) lobbyChatDiv.style.display = 'none';
            showElement(multiMenuDiv);
            break;
    }
}

// ========== CONTROLES ==========
/**
 * Envia movimento para o servidor
 * @param {number} dx - Delta X
 * @param {number} dy - Delta Y
 */
function sendMove(dx, dy) {
    if (!ws || !gameState || gameState.status !== 'playing') return;
    
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: 'move', dx, dy}));
    }
}

/**
 * Configura controles para dispositivos mobile
 * APENAS SWIPE - sem botões na tela
 */
function setupMobileControls() {
    if (!isMobileDevice()) {
        console.log('Desktop detectado - usando teclado');
        return;
    }
    
    console.log('Mobile detectado - usando SWIPE/TOQUE (sem botões)');
    
    // NÃO mostrar botões - usar apenas swipe
    // mobileControls permanece escondido via CSS
}

/**
 * Configura controles por swipe/toque na tela
 */
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
    
    canvas.addEventListener('touchmove', (e) => {
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
            if (diffX > 0) {
                sendMove(GRID_SIZE, 0);
                showSwipeFeedback('➡️');
            } else {
                sendMove(-GRID_SIZE, 0);
                showSwipeFeedback('⬅️');
            }
        } else {
            if (diffY > 0) {
                sendMove(0, GRID_SIZE);
                showSwipeFeedback('⬇️');
            } else {
                sendMove(0, -GRID_SIZE);
                showSwipeFeedback('⬆️');
            }
        }
        
        e.preventDefault();
    }, { passive: false });
}

/**
 * Mostra feedback visual do swipe
 * @param {string} direction - Emoji da direção
 */
function showSwipeFeedback(direction) {
    const feedback = document.createElement('div');
    feedback.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        font-size: 40px;
        z-index: 999;
        pointer-events: none;
        animation: swipeFade 0.5s ease-out;
    `;
    feedback.innerHTML = direction;
    document.body.appendChild(feedback);
    
    setTimeout(() => feedback.remove(), 500);
    
    // Adicionar CSS da animação se não existir
    if (!document.getElementById('swipeStyles')) {
        const style = document.createElement('style');
        style.id = 'swipeStyles';
        style.textContent = `
            @keyframes swipeFade {
                0% { opacity: 1; transform: translate(-50%, -50%) scale(1.5); }
                100% { opacity: 0; transform: translate(-50%, -50%) scale(1); }
            }
        `;
        document.head.appendChild(style);
    }
}

/**
 * Controles do teclado
 */
document.addEventListener('keydown', e => {
    if (!ws || !gameState || gameState.status !== 'playing') return;
    
    let dx = 0, dy = 0;
    
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        dy = -GRID_SIZE;
    } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        dy = GRID_SIZE;
    } else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') {
        dx = -GRID_SIZE;
    } else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') {
        dx = GRID_SIZE;
    } else if (e.key === 'r' || e.key === 'R') {
        if (gameState && gameState.status === 'finished' && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({type: 'restartGame'}));
        }
        return;
    } else if (e.key === 'Escape') {
        showMenu();
        return;
    } else {
        return;
    }
    
    e.preventDefault();
    sendMove(dx, dy);
});

// ========== RENDERIZAÇÃO ==========
/**
 * Limpa mensagens temporárias antigas
 */
function clearOldTemporaryMessages() {
    const now = Date.now();
    temporaryMessages = temporaryMessages.filter(
        msg => now - msg.timestamp < 5000
    );
}

/**
 * Loop principal de renderização
 */
function draw() {
    if (!gameState || !isDrawing) return;
    
    clearOldTemporaryMessages();
    
    // Fundo
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Grid VISÍVEL - linhas mais grossas para Full HD+
    ctx.strokeStyle = isMobileDevice() ? '#444' : '#333'; // Mais claro no mobile
    ctx.lineWidth = isMobileDevice() ? 2 : 1; // Linhas mais grossas no mobile
    
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
    
    // Comida com brilho
    ctx.shadowColor = '#FF5555';
    ctx.shadowBlur = 15;
    ctx.fillStyle = '#FF5555';
    ctx.fillRect(gameState.food.x + 2, gameState.food.y + 2, GRID_SIZE - 4, GRID_SIZE - 4);
    ctx.shadowBlur = 0;
    
    // Borda da comida
    ctx.strokeStyle = '#FF0000';
    ctx.lineWidth = 2;
    ctx.strokeRect(gameState.food.x, gameState.food.y, GRID_SIZE, GRID_SIZE);
    
    // Desenhar cobras
    for (let id in gameState.snakes) {
        const snake = gameState.snakes[id];
        if (!snake.alive) continue;
        
        snake.body.forEach((segment, index) => {
            if (index === 0) {
                // Cabeça com destaque
                ctx.fillStyle = snake.color || '#00FF00';
                ctx.fillRect(segment.x + 1, segment.y + 1, GRID_SIZE - 2, GRID_SIZE - 2);
                
                // Borda da cabeça
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 3;
                ctx.strokeRect(segment.x, segment.y, GRID_SIZE, GRID_SIZE);
                
                // Olhos baseados na direção
                ctx.fillStyle = '#000000';
                const eyeSize = Math.max(3, Math.floor(GRID_SIZE / 5)); // Proporcional ao grid
                const eyeOffset = Math.floor(GRID_SIZE * 0.2); // 20% do tamanho
                const eyeSpacing = Math.floor(GRID_SIZE * 0.6); // 60% do tamanho
                
                if (snake.dx > 0) {
                    // Olhando para direita
                    ctx.fillRect(segment.x + GRID_SIZE - eyeOffset - eyeSize, segment.y + eyeOffset, eyeSize, eyeSize);
                    ctx.fillRect(segment.x + GRID_SIZE - eyeOffset - eyeSize, segment.y + eyeSpacing, eyeSize, eyeSize);
                } else if (snake.dx < 0) {
                    // Olhando para esquerda
                    ctx.fillRect(segment.x + eyeOffset, segment.y + eyeOffset, eyeSize, eyeSize);
                    ctx.fillRect(segment.x + eyeOffset, segment.y + eyeSpacing, eyeSize, eyeSize);
                } else if (snake.dy > 0) {
                    // Olhando para baixo
                    ctx.fillRect(segment.x + eyeOffset, segment.y + GRID_SIZE - eyeOffset - eyeSize, eyeSize, eyeSize);
                    ctx.fillRect(segment.x + eyeSpacing, segment.y + GRID_SIZE - eyeOffset - eyeSize, eyeSize, eyeSize);
                } else {
                    // Olhando para cima
                    ctx.fillRect(segment.x + eyeOffset, segment.y + eyeOffset, eyeSize, eyeSize);
                    ctx.fillRect(segment.x + eyeSpacing, segment.y + eyeOffset, eyeSize, eyeSize);
                }
            } else {
                // Corpo da cobra
                ctx.fillStyle = snake.color || '#00FF00';
                ctx.fillRect(segment.x + 2, segment.y + 2, GRID_SIZE - 4, GRID_SIZE - 4);
                
                // Borda sutil do corpo
                ctx.strokeStyle = snake.color || '#00FF00';
                ctx.lineWidth = 1;
                ctx.strokeRect(segment.x + 1, segment.y + 1, GRID_SIZE - 2, GRID_SIZE - 2);
            }
        });
        
        // Nome da cobra ou mensagem temporária
        ctx.fillStyle = '#FFFFFF';
        const fontSize = Math.max(10, Math.floor(GRID_SIZE * 0.6)); // Proporcional ao grid
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = Math.max(2, Math.floor(GRID_SIZE / 10));
        const headX = snake.body[0].x + GRID_SIZE/2;
        const headY = snake.body[0].y - Math.floor(GRID_SIZE * 0.4);
        
        let displayText = snake.name;
        let showTempMessage = false;
        
        // Verificar mensagem temporária
        if (snake.tempMessage) {
            const now = Date.now();
            const elapsed = now - snake.tempMessage.timestamp;
            
            if (elapsed < snake.tempMessage.duration) {
                displayText = snake.tempMessage.text;
                showTempMessage = true;
                ctx.fillStyle = '#FFD700';
                
                // Fundo para a mensagem
                const textWidth = ctx.measureText(displayText).width;
                const padding = Math.floor(GRID_SIZE * 0.4);
                const msgHeight = fontSize + padding;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.fillRect(headX - textWidth/2 - padding, headY - fontSize - padding, textWidth + padding * 2, msgHeight);
                ctx.strokeStyle = '#FFD700';
                ctx.lineWidth = 2;
                ctx.strokeRect(headX - textWidth/2 - padding, headY - fontSize - padding, textWidth + padding * 2, msgHeight);
                
                ctx.fillStyle = '#FFD700';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = Math.max(2, Math.floor(GRID_SIZE / 10));
            }
        }
        
        if (!showTempMessage) {
            ctx.fillStyle = '#FFFFFF';
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2;
        }
        
        ctx.strokeText(displayText, headX, headY);
        ctx.fillText(displayText, headX, headY);
    }
    
    // Mensagens temporárias no centro
    if (temporaryMessages.length > 0) {
        const latestMessage = temporaryMessages[temporaryMessages.length - 1];
        
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const textWidth = ctx.measureText(latestMessage.text).width;
        
        // Fundo
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(canvas.width / 2 - textWidth / 2 - 20, 40, textWidth + 40, 40);
        
        // Borda
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.strokeRect(canvas.width / 2 - textWidth / 2 - 20, 40, textWidth + 40, 40);
        
        // Texto
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeText(latestMessage.text, canvas.width / 2, 60);
        ctx.fillStyle = '#FFD700';
        ctx.fillText(latestMessage.text, canvas.width / 2, 60);
    }
    
    // Atualizar scoreboard
    const alivePlayers = Object.values(gameState.snakes).filter(s => s.alive);
    const playerNames = alivePlayers.map(s => s.name).join(', ');
    scoreboard.innerHTML = `Jogadores vivos (${alivePlayers.length}): ${playerNames}`;
    
    // Pontuação do jogador
    const mySnake = gameState.snakes[playerId];
    if (mySnake) {
        ctx.fillStyle = '#FFD700';
        const scoreFontSize = Math.max(14, Math.floor(GRID_SIZE * 0.8));
        ctx.font = `bold ${scoreFontSize}px Arial`;
        ctx.textAlign = 'left';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        const scoreText = `Sua pontuação: ${mySnake.body.length} | Vivos: ${alivePlayers.length}`;
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

// ========== CHAT ==========
/**
 * Cria interface de chat global
 */
function createGlobalChatUI() {
    if (document.getElementById('globalChatDiv')) return;
    
    globalChatDiv = document.createElement('div');
    globalChatDiv.id = 'globalChatDiv';
    globalChatDiv.style.cssText = `
        position: fixed;
        bottom: ${isMobileDevice() ? '120px' : '80px'};
        right: 20px;
        width: ${isMobileDevice() ? '90%' : '350px'};
        max-width: 350px;
        height: 300px;
        background: rgba(0, 0, 0, 0.95);
        border: 2px solid #00FF00;
        border-radius: 15px;
        padding: 10px;
        display: none;
        flex-direction: column;
        z-index: 1000;
        box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
    `;
    
    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; border-bottom: 2px solid #00FF00; padding-bottom: 5px;';
    header.innerHTML = `
        <span style="color: #00FF00; font-weight: bold;">💬 Chat Global</span>
        <button id="closeGlobalChat" style="background: #FF5555; border: none; color: white; border-radius: 50%; width: 25px; height: 25px; cursor: pointer; font-weight: bold;">×</button>
    `;
    globalChatDiv.appendChild(header);
    
    // Mensagens
    const messages = document.createElement('div');
    messages.id = 'globalChatMessages';
    messages.style.cssText = `
        flex: 1;
        overflow-y: auto;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 8px;
        margin-bottom: 10px;
        font-size: 12px;
        line-height: 1.4;
    `;
    globalChatDiv.appendChild(messages);
    
    // Input
    const inputGroup = document.createElement('div');
    inputGroup.style.cssText = 'display: flex; gap: 5px;';
    
    const input = document.createElement('input');
    input.id = 'globalChatInput';
    input.placeholder = 'Digite uma mensagem...';
    input.maxLength = 100;
    input.style.cssText = `
        flex: 1;
        padding: 8px;
        border-radius: 5px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        font-size: 12px;
    `;
    
    const sendBtn = document.createElement('button');
    sendBtn.id = 'sendGlobalChatBtn';
    sendBtn.innerText = '📤';
    sendBtn.style.cssText = `
        padding: 8px 12px;
        border-radius: 5px;
        background: linear-gradient(45deg, #00FF00, #00CC00);
        border: none;
        color: #000;
        cursor: pointer;
        font-weight: bold;
    `;
    
    inputGroup.appendChild(input);
    inputGroup.appendChild(sendBtn);
    globalChatDiv.appendChild(inputGroup);
    
    document.body.appendChild(globalChatDiv);
    
    // Event listeners
    document.getElementById('closeGlobalChat').onclick = () => {
        globalChatDiv.style.display = 'none';
        isInGlobalChat = false;
    };
    
    sendBtn.onclick = sendGlobalChatMessage;
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendGlobalChatMessage();
    });
}

/**
 * Cria interface de chat do lobby
 */
function createLobbyChatUI() {
    if (document.getElementById('lobbyChatDiv')) return;
    
    lobbyChatDiv = document.createElement('div');
    lobbyChatDiv.id = 'lobbyChatDiv';
    lobbyChatDiv.style.cssText = `
        position: fixed;
        top: ${isMobileDevice() ? '10px' : '20px'};
        right: 20px;
        width: ${isMobileDevice() ? 'calc(100% - 40px)' : '300px'};
        max-width: 300px;
        height: ${isMobileDevice() ? '200px' : '300px'};
        background: rgba(0, 0, 0, 0.9);
        border: 2px solid #00FF00;
        border-radius: 15px;
        padding: 10px;
        display: none;
        flex-direction: column;
        z-index: 999;
    `;
    
    const header = document.createElement('h4');
    header.innerText = '💬 Chat da Sala';
    header.style.cssText = 'color: #00FF00; text-align: center; margin-bottom: 10px; border-bottom: 2px solid #00FF00; padding-bottom: 5px;';
    lobbyChatDiv.appendChild(header);
    
    const messages = document.createElement('div');
    messages.id = 'lobbyChatMessages';
    messages.style.cssText = `
        flex: 1;
        overflow-y: auto;
        background: rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 8px;
        margin-bottom: 10px;
        font-size: 11px;
        line-height: 1.3;
    `;
    lobbyChatDiv.appendChild(messages);
    
    const inputGroup = document.createElement('div');
    inputGroup.style.cssText = 'display: flex; gap: 5px;';
    
    const input = document.createElement('input');
    input.id = 'lobbyChatInput';
    input.placeholder = 'Mensagem da sala...';
    input.maxLength = 100;
    input.style.cssText = `
        flex: 1;
        padding: 6px;
        border-radius: 5px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        font-size: 11px;
    `;
    
    const sendBtn = document.createElement('button');
    sendBtn.innerText = '📤';
    sendBtn.style.cssText = `
        padding: 6px 10px;
        border-radius: 5px;
        background: #00FF00;
        border: none;
        color: #000;
        cursor: pointer;
        font-size: 11px;
        font-weight: bold;
    `;
    
    inputGroup.appendChild(input);
    inputGroup.appendChild(sendBtn);
    lobbyChatDiv.appendChild(inputGroup);
    
    document.body.appendChild(lobbyChatDiv);
    
    sendBtn.onclick = sendLobbyChatMessage;
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendLobbyChatMessage();
    });
}

/**
 * Cria painel de mensagens do jogo
 */
function createGameMessagePanel() {
    let floatingBtn = document.getElementById('gameMessageFloat');
    if (floatingBtn) {
        floatingBtn.style.display = 'block';
        return;
    }
    
    floatingBtn = document.createElement('button');
    floatingBtn.id = 'gameMessageFloat';
    floatingBtn.innerHTML = '💬';
    floatingBtn.style.cssText = `
        position: fixed !important;
        top: ${isMobileDevice() ? '15px' : '20px'};
        right: ${isMobileDevice() ? '15px' : '20px'};
        width: 50px;
        height: 50px;
        border-radius: 50%;
        background: linear-gradient(45deg, #00FF00, #00CC00) !important;
        border: 2px solid #FFF;
        color: #000;
        font-size: 20px;
        cursor: pointer;
        z-index: 1000;
        display: block !important;
        box-shadow: 0 0 15px rgba(0, 255, 0, 0.5);
        transition: all 0.3s;
    `;
    
    floatingBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        showMessageModal();
    };
    
    document.body.appendChild(floatingBtn);
}

/**
 * Mostra modal de mensagens
 */
function showMessageModal() {
    const existingModal = document.getElementById('messageModal');
    if (existingModal) existingModal.remove();
    
    const modal = document.createElement('div');
    modal.id = 'messageModal';
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 2000;
    `;
    
    const content = document.createElement('div');
    content.style.cssText = `
        background: rgba(0, 0, 0, 0.95);
        border: 3px solid #00FF00;
        border-radius: 20px;
        padding: 20px;
        max-width: 90%;
        width: ${isMobileDevice() ? '90%' : '400px'};
        text-align: center;
    `;
    
    content.innerHTML = `
        <h3 style="color: #00FF00; margin-bottom: 15px;">💬 Enviar Mensagem</h3>
        <div style="margin-bottom: 15px;">
            <button class="quick-msg" data-msg="GG">👍 GG</button>
            <button class="quick-msg" data-msg="Nooo!">😱 Nooo!</button>
        </div>
        <div style="margin-bottom: 15px;">
            <input type="text" id="customMsg" placeholder="Sua mensagem (máx 20 chars)" maxlength="20" 
                   style="width: 100%; padding: 12px; border-radius: 10px; background: rgba(255,255,255,0.1); border: 2px solid #00FF00; color: white; text-align: center; font-size: 16px;">
        </div>
        <div>
            <button id="sendCustom" style="background: #00FF00; border: none; color: #000; padding: 10px 20px; border-radius: 10px; margin-right: 10px; font-weight: bold; cursor: pointer;">📤 Enviar</button>
            <button id="cancelMsg" style="background: #FF5555; border: none; color: #FFF; padding: 10px 20px; border-radius: 10px; font-weight: bold; cursor: pointer;">❌ Cancelar</button>
        </div>
    `;
    
    // Estilos para botões rápidos
    const style = document.createElement('style');
    style.textContent = `
        .quick-msg {
            background: linear-gradient(45deg, #FFD700, #FFA500);
            border: none;
            color: #000;
            padding: 8px 12px;
            border-radius: 15px;
            margin: 5px;
            cursor: pointer;
            font-weight: bold;
            transition: all 0.2s;
        }
        .quick-msg:hover, .quick-msg:active {
            transform: scale(1.1);
        }
    `;
    document.head.appendChild(style);
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Event listeners
    document.querySelectorAll('.quick-msg').forEach(btn => {
        btn.onclick = () => {
            sendGameMessage(btn.getAttribute('data-msg'));
            modal.remove();
        };
    });
    
    document.getElementById('sendCustom').onclick = () => {
        const msg = document.getElementById('customMsg').value.trim();
        if (msg) {
            sendGameMessage(msg);
            modal.remove();
        }
    };
    
    document.getElementById('cancelMsg').onclick = () => modal.remove();
    
    document.getElementById('customMsg').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') document.getElementById('sendCustom').click();
    });
    
    modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
    };
    
    setTimeout(() => document.getElementById('customMsg').focus(), 100);
}

/**
 * Envia mensagem do chat global
 */
function sendGlobalChatMessage() {
    const input = document.getElementById('globalChatInput');
    if (!input || !input.value.trim() || !playerName) return;
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'globalChat',
            name: playerName,
            message: input.value.trim()
        }));
        input.value = '';
    }
}

/**
 * Envia mensagem do chat do lobby
 */
function sendLobbyChatMessage() {
    const input = document.getElementById('lobbyChatInput');
    if (!input || !input.value.trim() || !ws) return;
    
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'chat',
            message: input.value.trim()
        }));
        input.value = '';
    }
}

/**
 * Envia mensagem durante o jogo
 * @param {string} message - Mensagem a enviar
 */
function sendGameMessage(message) {
    if (!ws || !gameState || gameState.status !== 'playing') return;
    
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'gameMessage',
            message: message
        }));
    }
}

/**
 * Atualiza chat global
 * @param {Object} message - Mensagem recebida
 */
function updateGlobalChat(message) {
    const messagesDiv = document.getElementById('globalChatMessages');
    if (!messagesDiv) return;
    
    const messageElement = document.createElement('div');
    messageElement.style.cssText = `
        margin-bottom: 5px;
        padding: 4px;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.05);
    `;
    messageElement.innerHTML = `<strong style="color: #00FF00;">${message.name}:</strong> <span style="color: #FFF;">${message.message}</span>`;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    while (messagesDiv.children.length > 20) {
        messagesDiv.removeChild(messagesDiv.firstChild);
    }
}

/**
 * Atualiza chat do lobby
 * @param {Array} messages - Lista de mensagens
 */
function updateLobbyChat(messages) {
    const messagesDiv = document.getElementById('lobbyChatMessages');
    if (!messagesDiv) return;
    
    messagesDiv.innerHTML = '';
    messages.forEach(msg => {
        const messageElement = document.createElement('div');
        messageElement.style.cssText = `
            margin-bottom: 4px;
            padding: 3px;
            border-radius: 3px;
            background: rgba(255, 255, 255, 0.05);
        `;
        messageElement.innerHTML = `<strong style="color: #00FF00;">${msg.name}:</strong> <span style="color: #FFF;">${msg.message}</span>`;
        messagesDiv.appendChild(messageElement);
    });
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// ========== UI ==========
/**
 * Atualiza display do timer
 */
function updateTimerDisplay() {
    let timerElement = document.getElementById('timerDisplay');
    
    if (!timerElement) {
        timerElement = document.createElement('div');
        timerElement.id = 'timerDisplay';
        timerElement.style.cssText = `
            position: fixed;
            top: ${isMobileDevice() ? '10px' : '20px'};
            left: 50%;
            transform: translateX(-50%);
            color: #FFD700;
            font-size: ${isMobileDevice() ? '16px' : '18px'};
            font-weight: bold;
            background: rgba(0,0,0,0.9);
            padding: ${isMobileDevice() ? '8px 15px' : '10px 20px'};
            border-radius: 20px;
            border: 2px solid #FFD700;
            z-index: 1001;
            display: none;
        `;
        document.body.appendChild(timerElement);
    }
    
    if (timeRemaining > 0) {
        timerElement.innerHTML = `⏰ ${timeRemaining}s`;
        timerElement.style.display = 'block';
    } else {
        timerElement.style.display = 'none';
    }
}

/**
 * Mostra elemento
 * @param {HTMLElement} element - Elemento a mostrar
 */
function showElement(element) {
    element.style.display = element === menuDiv ? 'flex' : 'block';
}

/**
 * Esconde elemento
 * @param {HTMLElement} element - Elemento a esconder
 */
function hideElement(element) {
    element.style.display = 'none';
}

/**
 * Volta ao menu principal
 */
function showMenu() {
    hideElement(canvas);
    hideElement(multiMenuDiv);
    hideElement(lobbyDiv);
    if (lobbyChatDiv) lobbyChatDiv.style.display = 'none';
    
    const floatingBtn = document.getElementById('gameMessageFloat');
    if (floatingBtn) floatingBtn.style.display = 'none';
    
    const messageModal = document.getElementById('messageModal');
    if (messageModal) messageModal.remove();
    
    showElement(menuDiv);
    showElement(menuCanvas);
    hideElement(scoreboard);
    hideElement(messagesDiv);
    
    createGlobalChatUI();
    createGlobalChatButton();
    if (globalChatDiv) {
        globalChatDiv.style.display = 'flex';
    }
    
    isDrawing = false;
    timeRemaining = 0;
    updateTimerDisplay();
    
    if (ws) {
        ws.close();
        ws = null;
    }
    
    animateMenuSnake();
}

/**
 * Cria botão de chat global
 */
function createGlobalChatButton() {
    let chatBtn = document.getElementById('globalChatBtn');
    if (chatBtn) return;
    
    chatBtn = document.createElement('button');
    chatBtn.id = 'globalChatBtn';
    chatBtn.innerText = '💬 Chat Global';
    chatBtn.style.cssText = `
        position: fixed;
        bottom: ${isMobileDevice() ? '130px' : '90px'};
        right: 20px;
        background: linear-gradient(45deg, #00FF00, #00CC00);
        border: none;
        color: #000;
        padding: ${isMobileDevice() ? '12px 16px' : '10px 15px'};
        border-radius: 25px;
        cursor: pointer;
        font-weight: bold;
        z-index: 999;
        font-size: ${isMobileDevice() ? '14px' : '12px'};
    `;
    
    chatBtn.onclick = () => {
        if (!globalChatDiv) createGlobalChatUI();
        globalChatDiv.style.display = 'flex';
        isInGlobalChat = true;
    };
    
    document.body.appendChild(chatBtn);
}

/**
 * Atualiza lobby
 * @param {Object} data - Dados do lobby
 */
function updateLobby(data) {
    playersList.innerHTML = '';
    const players = data.players || [];
    
    players.forEach((p, index) => {
        const playerItem = document.createElement('div');
        playerItem.className = 'player-item';
        
        let statusIcon = p.ready ? '✅' : '⏳';
        let botIcon = p.isBot ? ' 🤖' : ' 👤';
        let creatorBadge = (index === 0 && !p.isBot) ? ' 👑' : '';
        
        playerItem.innerHTML = `${p.name}${botIcon}${creatorBadge} - ${statusIcon}`;
        playersList.appendChild(playerItem);
    });
    
    const myPlayer = players.find(p => p.name === playerName);
    if (myPlayer && myPlayer.ready) {
        readyBtn.disabled = true;
        readyBtn.innerText = "Pronto! ✓";
        readyBtn.style.backgroundColor = "#00CC00";
    } else {
        readyBtn.disabled = false;
        readyBtn.innerText = "Pronto";
        readyBtn.style.backgroundColor = "#00FF00";
    }
}

// ========== ANIMAÇÃO DO MENU ==========
let snakeX = 0, snakeY = 300, snakeDir = 1;
let animationRunning = false;

/**
 * Anima cobra no menu
 */
function animateMenuSnake() {
    if (menuDiv.style.display === 'flex' && !animationRunning) {
        animationRunning = true;
        
        function animate() {
            if (menuDiv.style.display !== 'flex') {
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
            
            snakeX += 2 * snakeDir;
            if (snakeX > menuCanvas.width + 200) {
                snakeX = -200;
            }
            
            requestAnimationFrame(animate);
        }
        animate();
    }
}

// ========== PÓDIO (FIM DE JOGO) ==========
/**
 * Mostra pódio com vencedores
 */
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
    const title = '🏆 FIM DE JOGO 🏆';
    ctx.strokeText(title, canvas.width / 2, 120);
    ctx.fillText(title, canvas.width / 2, 120);
    
    if (gameState.leaderboard && gameState.leaderboard.length > 0) {
        const topThree = gameState.leaderboard.slice(0, 3);
        
        const winner = topThree[0];
        ctx.fillStyle = winner.isWinner ? '#00FF00' : '#FFD700';
        ctx.font = 'bold 28px Arial';
        const winnerText = `🥇 ${winner.name}`;
        ctx.strokeText(winnerText, canvas.width / 2, 180);
        ctx.fillText(winnerText, canvas.width / 2, 180);
        
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 20px Arial';
        const scoreText = `${winner.score} pontos`;
        ctx.strokeText(scoreText, canvas.width / 2, 210);
        ctx.fillText(scoreText, canvas.width / 2, 210);
        
        if (topThree.length > 1) {
            ctx.font = 'bold 24px Arial';
            ctx.fillStyle = '#C0C0C0';
            const second = `🥈 ${topThree[1].name} - ${topThree[1].score}`;
            ctx.strokeText(second, canvas.width / 2, 260);
            ctx.fillText(second, canvas.width / 2, 260);
        }
        
        if (topThree.length > 2) {
            ctx.fillStyle = '#CD7F32';
            const third = `🥉 ${topThree[2].name} - ${topThree[2].score}`;
            ctx.strokeText(third, canvas.width / 2, 300);
            ctx.fillText(third, canvas.width / 2, 300);
        }
    }
    
    createEndGameButtons();
}

/**
 * Cria botões de fim de jogo
 */
function createEndGameButtons() {
    const oldButtons = document.querySelectorAll('.endgame-btn');
    oldButtons.forEach(btn => btn.remove());
    
    const restartBtn = document.createElement('button');
    restartBtn.className = 'endgame-btn';
    restartBtn.innerText = '🔄 Jogar Novamente';
    restartBtn.style.cssText = `
        position: fixed;
        bottom: ${isMobileDevice() ? '80px' : '60px'};
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(45deg, #00FF00, #00CC00);
        border: none;
        color: #000;
        padding: ${isMobileDevice() ? '15px 25px' : '12px 20px'};
        border-radius: 25px;
        cursor: pointer;
        font-weight: bold;
        font-size: ${isMobileDevice() ? '16px' : '14px'};
        z-index: 1002;
        margin-right: 10px;
    `;
    
    restartBtn.onclick = () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({type: 'restartGame'}));
            removeEndGameButtons();
        }
    };
    
    const menuBtn = document.createElement('button');
    menuBtn.className = 'endgame-btn';
    menuBtn.innerText = '🏠 Menu Principal';
    menuBtn.style.cssText = `
        position: fixed;
        bottom: ${isMobileDevice() ? '80px' : '60px'};
        right: 50%;
        transform: translateX(50%);
        background: linear-gradient(45deg, #FF5555, #CC4444);
        border: none;
        color: #FFF;
        padding: ${isMobileDevice() ? '15px 25px' : '12px 20px'};
        border-radius: 25px;
        cursor: pointer;
        font-weight: bold;
        font-size: ${isMobileDevice() ? '16px' : '14px'};
        z-index: 1002;
        margin-left: 10px;
    `;
    
    menuBtn.onclick = () => {
        showMenu();
        removeEndGameButtons();
    };
    
    document.body.appendChild(restartBtn);
    document.body.appendChild(menuBtn);
}

/**
 * Remove botões de fim de jogo
 */
function removeEndGameButtons() {
    const buttons = document.querySelectorAll('.endgame-btn');
    buttons.forEach(btn => btn.remove());
}

// ========== UTILITÁRIOS ==========
/**
 * Gera PIN temporário de 4 dígitos
 * @returns {string} PIN gerado
 */
function generateTempPIN() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

/**
 * Inicia jogo solo
 * @param {string} name - Nome do jogador
 */
function startSolo(name) {
    ws = new WebSocket(getWebSocketURL());
    ws.onopen = () => {
        ws.send(JSON.stringify({type: 'solo', name}));
    };
    setupWS();
}

// ========== EVENT LISTENERS DOS BOTÕES ==========
soloBtn.onclick = () => {
    const name = prompt("Digite seu nome:", "Player");
    if (name === null) return;
    
    playerName = name || "Player";
    hideElement(menuDiv);
    hideElement(menuCanvas);
    if (globalChatDiv) globalChatDiv.style.display = 'none';
    
    const chatBtn = document.getElementById('globalChatBtn');
    if (chatBtn) chatBtn.remove();
    
    startSolo(playerName);
};

multiBtn.onclick = () => {
    if (!playerName) {
        playerName = prompt("Digite seu nome:", "Player") || "Player";
    }
    hideElement(menuDiv);
    hideElement(menuCanvas);
    if (globalChatDiv) globalChatDiv.style.display = 'none';
    showElement(multiMenuDiv);
    nameInput.value = playerName;
};

backToHomeBtn.onclick = () => window.location.href = 'index.html';

backFromMulti.onclick = showMenu;

backFromLobby.onclick = () => {
    hideElement(lobbyDiv);
    if (lobbyChatDiv) lobbyChatDiv.style.display = 'none';
    showElement(multiMenuDiv);
    if (ws) {
        ws.close();
        ws = null;
    }
};

createRoomBtn.onclick = () => {
    playerName = nameInput.value.trim() || "Player";
    if (!playerName) {
        alert("Por favor, digite um nome!");
        return;
    }
    
    ws = new WebSocket(getWebSocketURL());
    ws.onopen = () => {
        ws.send(JSON.stringify({type: 'join', pin: generateTempPIN(), name: playerName}));
    };
    setupWS();
};

joinRoomBtn.onclick = () => {
    playerName = nameInput.value.trim() || "Player";
    currentPIN = pinInput.value.trim();
    
    if (!playerName) {
        alert("Por favor, digite um nome!");
        return;
    }
    
    if (!currentPIN || currentPIN.length !== 4 || isNaN(currentPIN)) {
        alert("Por favor, digite um PIN válido de 4 dígitos!");
        return;
    }
    
    ws = new WebSocket(getWebSocketURL());
    ws.onopen = () => {
        ws.send(JSON.stringify({type: 'join', pin: currentPIN, name: playerName}));
    };
    setupWS();
};

readyBtn.onclick = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: 'ready'}));
        readyBtn.disabled = true;
        readyBtn.innerText = "Pronto! ✓";
        readyBtn.style.backgroundColor = "#00CC00";
    }
};

// Event listeners para inputs
nameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && nameInput.value.trim()) createRoomBtn.click();
});

pinInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && pinInput.value.trim() && nameInput.value.trim()) joinRoomBtn.click();
});

pinInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 4);
});

// Prevenir zoom no mobile
document.addEventListener('touchstart', (e) => {
    if (e.touches.length > 1) e.preventDefault();
}, { passive: false });

let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) e.preventDefault();
    lastTouchEnd = now;
}, false);

// ========== INICIALIZAÇÃO ==========
/**
 * Inicializa o jogo quando o DOM estiver pronto
 */
document.addEventListener('DOMContentLoaded', function() {
    setupCanvas();
    setupMobileControls();
    setupSwipeControls();
    showMenu();
    
    // Ocultar footer no mobile
    if (isMobileDevice()) {
        const footer = document.querySelector('.footer');
        if (footer) {
            footer.style.display = 'none';
        }
    }
    
    console.log('Jogo inicializado - Mobile:', isMobileDevice());
});