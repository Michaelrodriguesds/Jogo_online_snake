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

const backFromMulti = document.getElementById('backFromMulti');
const backFromLobby = document.getElementById('backFromLobby');

const pinInput = document.getElementById('pinInput');
const nameInput = document.getElementById('nameInput');

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

// Chat elements
let globalChatDiv, lobbyChatDiv, gameMessagePanel, predefinedMessages = [];
let isInGlobalChat = false;

let ws, playerId, gameState, playerName, currentPIN;
let isDrawing = false;
let temporaryMessages = [];
const GRID_SIZE = 20;
let timeRemaining = 0;

// --- Criar Interface de Chat Global (Menu Principal) ---
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
        if (e.key === 'Enter') {
            sendGlobalChatMessage();
        }
    });
}

// --- Criar Chat do Lobby ---
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
        if (e.key === 'Enter') {
            sendLobbyChatMessage();
        }
    });
}

// --- Criar Painel de Mensagens do Jogo ---
function createGameMessagePanel() {
    // Verificar se já existe
    let floatingBtn = document.getElementById('gameMessageFloat');
    if (floatingBtn) {
        floatingBtn.style.display = 'block';
        return;
    }
    
    // Criar botão flutuante pequeno para abrir painel
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
        opacity: 1 !important;
        visibility: visible !important;
    `;
    
    floatingBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('Botão de mensagem clicado');
        showMessageModal();
    };
    
    // Efeitos hover
    floatingBtn.onmouseenter = () => {
        floatingBtn.style.transform = 'scale(1.1)';
    };
    
    floatingBtn.onmouseleave = () => {
        floatingBtn.style.transform = 'scale(1)';
    };
    
    document.body.appendChild(floatingBtn);
    console.log('Botão de mensagem criado e adicionado ao DOM');
    
    // Debug: verificar se o botão foi realmente criado
    setTimeout(() => {
        const check = document.getElementById('gameMessageFloat');
        if (check) {
            console.log('Botão confirmado no DOM:', check.style.display);
        } else {
            console.error('Falha ao criar botão de mensagem');
        }
    }, 100);
}

function showMessageModal() {
    // Remover modal existente se houver
    const existingModal = document.getElementById('messageModal');
    if (existingModal) {
        existingModal.remove();
    }
    
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
            <input type="text" id="customMsg" placeholder="Sua mensagem (máx 15 chars)" maxlength="15" 
                   style="width: 100%; padding: 10px; border-radius: 10px; background: rgba(255,255,255,0.1); border: 2px solid #00FF00; color: white; text-align: center;">
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
            background: linear-gradient(45deg, #FFA500, #FF8C00);
        }
    `;
    document.head.appendChild(style);
    
    modal.appendChild(content);
    document.body.appendChild(modal);
    
    // Event listeners
    document.querySelectorAll('.quick-msg').forEach(btn => {
        btn.onclick = () => {
            const msg = btn.getAttribute('data-msg');
            sendGameMessage(msg);
            modal.remove();
        };
    });
    
    document.getElementById('sendCustom').onclick = () => {
        const customInput = document.getElementById('customMsg');
        const msg = customInput.value.trim();
        if (msg) {
            sendGameMessage(msg);
            modal.remove();
        }
    };
    
    document.getElementById('cancelMsg').onclick = () => {
        modal.remove();
    };
    
    document.getElementById('customMsg').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            document.getElementById('sendCustom').click();
        }
    });
    
    // Fechar clicando fora
    modal.onclick = (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    };
    
    // Focar no input
    setTimeout(() => {
        document.getElementById('customMsg').focus();
    }, 100);
}

// --- Função para obter URL do WebSocket ---
const getWebSocketURL = () => {
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        return 'ws://localhost:8080';
    } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        return `${protocol}//${window.location.host}`;
    }
};

// --- Detectar se é dispositivo mobile ---
function isMobileDevice() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
}

// --- Enviar movimento ---
function sendMove(dx, dy) {
    if (!ws || !gameState || gameState.status !== 'playing') return;
    
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: 'move', dx, dy}));
    }
}

// --- Configurar controles mobile ---
function setupMobileControls() {
    if (isMobileDevice()) {
        mobileControls.classList.add('active');
        
        // Aumentar tamanho dos botões mobile
        const controlBtns = document.querySelectorAll('.control-btn');
        controlBtns.forEach(btn => {
            btn.style.width = '70px';
            btn.style.height = '70px';
            btn.style.fontSize = '24px';
            btn.style.fontWeight = 'bold';
        });
        
        // Ajustar grid para botões maiores
        const controlDirection = document.querySelector('.control-direction');
        if (controlDirection) {
            controlDirection.style.gridTemplateColumns = 'repeat(3, 70px)';
            controlDirection.style.gridTemplateRows = 'repeat(3, 70px)';
            controlDirection.style.gap = '10px';
        }
        
        upBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            sendMove(0, -GRID_SIZE);
            upBtn.style.backgroundColor = '#00CC00';
        });
        
        downBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            sendMove(0, GRID_SIZE);
            downBtn.style.backgroundColor = '#00CC00';
        });
        
        leftBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            sendMove(-GRID_SIZE, 0);
            leftBtn.style.backgroundColor = '#00CC00';
        });
        
        rightBtn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            sendMove(GRID_SIZE, 0);
            rightBtn.style.backgroundColor = '#00CC00';
        });
        
        [upBtn, downBtn, leftBtn, rightBtn].forEach(btn => {
            btn.addEventListener('touchend', (e) => {
                e.preventDefault();
                btn.style.backgroundColor = 'rgba(0, 255, 0, 0.7)';
            });
            btn.addEventListener('touchcancel', (e) => {
                e.preventDefault();
                btn.style.backgroundColor = 'rgba(0, 255, 0, 0.7)';
            });
        });
    }
}

// --- Suporte a Swipe Gestures ---
function setupSwipeControls() {
    if (!isMobileDevice()) return;
    
    let touchStartX = 0;
    let touchStartY = 0;
    const minSwipeDistance = 30;
    
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
        
        if (Math.abs(diffX) > Math.abs(diffY)) {
            if (Math.abs(diffX) > minSwipeDistance) {
                if (diffX > 0) {
                    sendMove(GRID_SIZE, 0);
                } else {
                    sendMove(-GRID_SIZE, 0);
                }
            }
        } else {
            if (Math.abs(diffY) > minSwipeDistance) {
                if (diffY > 0) {
                    sendMove(0, GRID_SIZE);
                } else {
                    sendMove(0, -GRID_SIZE);
                }
            }
        }
        
        e.preventDefault();
    }, { passive: false });
}

// --- Chat Functions ---
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

function sendGameMessage(message) {
    console.log('Tentando enviar mensagem do jogo:', message); // Debug
    
    if (!ws || !gameState || gameState.status !== 'playing') {
        console.log('WebSocket ou gameState inválido'); // Debug
        return;
    }
    
    if (ws.readyState === WebSocket.OPEN) {
        console.log('Enviando via WebSocket:', message); // Debug
        ws.send(JSON.stringify({
            type: 'gameMessage',
            message: message
        }));
        
        // Feedback visual imediato
        const btn = event.target;
        const originalBg = btn.style.background;
        btn.style.background = '#FFD700';
        btn.style.color = '#000';
        btn.innerHTML = '✓ Enviado!';
        
        setTimeout(() => {
            btn.style.background = originalBg;
            btn.style.color = '#000';
            btn.innerHTML = message;
        }, 1000);
    } else {
        console.log('WebSocket não está aberto'); // Debug
    }
}

// --- Atualizar chats ---
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
    
    // Manter apenas últimas 20 mensagens
    while (messagesDiv.children.length > 20) {
        messagesDiv.removeChild(messagesDiv.firstChild);
    }
}

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

function showGameMessagePanel() {
    if (!gameMessagePanel) return;
    
    // Cabeçalho com botão para fechar
    gameMessagePanel.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; margin-bottom: 5px;">
            <span style="color: #00FF00; font-size: 12px; font-weight: bold;">💬 Mensagens Rápidas</span>
            <button id="closeGameMessages" style="background: #FF5555; border: none; color: white; border-radius: 50%; width: 20px; height: 20px; cursor: pointer; font-size: 12px; font-weight: bold;">×</button>
        </div>
    `;
    
    // Container para mensagens pré-definidas
    const predefinedContainer = document.createElement('div');
    predefinedContainer.style.cssText = 'display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-bottom: 8px;';
    
    if (predefinedMessages && predefinedMessages.length > 0) {
        predefinedMessages.forEach(message => {
            const btn = document.createElement('button');
            btn.innerText = message;
            btn.style.cssText = `
                background: linear-gradient(45deg, #00FF00, #00CC00);
                border: none;
                color: #000;
                padding: 6px 10px;
                border-radius: 15px;
                cursor: pointer;
                font-size: 11px;
                font-weight: bold;
                transition: all 0.2s;
                flex: 0 0 auto;
                min-width: fit-content;
            `;
            
            btn.onclick = () => {
                console.log('Enviando mensagem:', message);
                sendGameMessage(message);
            };
            
            btn.addEventListener('touchstart', () => btn.style.transform = 'scale(0.95)');
            btn.addEventListener('touchend', () => btn.style.transform = 'scale(1)');
            btn.addEventListener('mousedown', () => btn.style.transform = 'scale(0.95)');
            btn.addEventListener('mouseup', () => btn.style.transform = 'scale(1)');
            
            predefinedContainer.appendChild(btn);
        });
    }
    
    // Seção para criar mensagem personalizada
    const customContainer = document.createElement('div');
    customContainer.style.cssText = 'display: flex; gap: 4px; align-items: center; margin-top: 8px; padding-top: 8px; border-top: 1px solid #00FF00;';
    
    const customInput = document.createElement('input');
    customInput.id = 'customMessageInput';
    customInput.placeholder = 'Sua mensagem...';
    customInput.maxLength = 20;
    customInput.style.cssText = `
        flex: 1;
        padding: 6px 8px;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.3);
        color: white;
        font-size: 11px;
    `;
    
    const sendCustomBtn = document.createElement('button');
    sendCustomBtn.innerText = '📤';
    sendCustomBtn.style.cssText = `
        background: #FFD700;
        border: none;
        color: #000;
        padding: 6px 10px;
        border-radius: 10px;
        cursor: pointer;
        font-size: 11px;
        font-weight: bold;
    `;
    
    sendCustomBtn.onclick = () => {
        const customMessage = customInput.value.trim();
        if (customMessage) {
            console.log('Enviando mensagem personalizada:', customMessage);
            sendGameMessage(customMessage);
            customInput.value = '';
        }
    };
    
    customInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendCustomBtn.click();
        }
    });
    
    customContainer.appendChild(customInput);
    customContainer.appendChild(sendCustomBtn);
    
    gameMessagePanel.appendChild(predefinedContainer);
    gameMessagePanel.appendChild(customContainer);
    gameMessagePanel.style.display = 'flex';
    gameMessagePanel.style.flexDirection = 'column';
    
    // Event listener para fechar
    document.getElementById('closeGameMessages').onclick = () => {
        gameMessagePanel.style.display = 'none';
    };
    
    // Auto-fechar após 45 segundos
    setTimeout(() => {
        if (gameMessagePanel && gameMessagePanel.style.display === 'flex') {
            gameMessagePanel.style.display = 'none';
        }
    }, 45000);
}

// --- Atualizar timer ---
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
            box-shadow: 0 0 20px rgba(255,215,0,0.5);
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

// --- Mostrar/esconder elementos ---
function showElement(element) {
    element.style.display = element === menuDiv ? 'flex' : 'block';
}

function hideElement(element) {
    element.style.display = 'none';
}

function showMenu() {
    hideElement(canvas);
    hideElement(multiMenuDiv);
    hideElement(lobbyDiv);
    if (lobbyChatDiv) lobbyChatDiv.style.display = 'none';
    
    // Ocultar botão de mensagens do jogo
    const floatingBtn = document.getElementById('gameMessageFloat');
    if (floatingBtn) floatingBtn.style.display = 'none';
    
    // Fechar modal se estiver aberto
    const messageModal = document.getElementById('messageModal');
    if (messageModal) messageModal.remove();
    
    showElement(menuDiv);
    showElement(menuCanvas);
    hideElement(scoreboard);
    hideElement(messagesDiv);
    
    // Mostrar botão de chat global se tiver nome
    if (playerName && globalChatDiv) {
        createGlobalChatButton();
    }
    
    // Limpar estado
    isDrawing = false;
    timeRemaining = 0;
    updateTimerDisplay();
    
    if (ws) {
        ws.close();
        ws = null;
    }
    
    // Reiniciar animação do menu
    animateMenuSnake();
}

// --- Criar botão de chat global no menu ---
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
        box-shadow: 0 0 15px rgba(0, 255, 0, 0.3);
    `;
    
    chatBtn.onclick = () => {
        if (!globalChatDiv) createGlobalChatUI();
        globalChatDiv.style.display = 'flex';
        isInGlobalChat = true;
    };
    
    document.body.appendChild(chatBtn);
}

// --- Configuração inicial ---
// setupMobileControls(); - movido para depois
// setupSwipeControls(); - movido para depois

// --- Variáveis para animação do menu ---
let snakeX = 0, snakeY = 300, snakeDir = 1;
let animationRunning = false;

// --- Tela inicial animada ---
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
            
            // Desenha a cobra animada
            for (let i = 0; i < 8; i++) {
                const segmentX = snakeX - i * 25;
                const segmentY = snakeY;
                
                if (segmentX > -50 && segmentX < menuCanvas.width + 50) {
                    menuCtx.fillRect(segmentX, segmentY, 20, 20);
                    
                    // Cabeça com olhos
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

// --- Event Listeners dos Botões ---
soloBtn.onclick = () => {
    playerName = prompt("Digite seu nome:", "Player") || "Player";
    hideElement(menuDiv);
    hideElement(menuCanvas);
    if (globalChatDiv) globalChatDiv.style.display = 'none';
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

// --- Criar/Entrar em Sala ---
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

// --- Ready Button ---
readyBtn.onclick = () => { 
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: 'ready'}));
        readyBtn.disabled = true;
        readyBtn.innerText = "Pronto! ✓";
        readyBtn.style.backgroundColor = "#00CC00";
    }
};

// --- Solo ---
function startSolo(name) {
    ws = new WebSocket(getWebSocketURL());
    ws.onopen = () => { 
        ws.send(JSON.stringify({type: 'solo', name})); 
    };
    setupWS();
}

// --- Setup WebSocket ---
function setupWS() {
    hideElement(multiMenuDiv);
    showElement(lobbyDiv);
    
    // Criar e mostrar chat do lobby
    createLobbyChatUI();
    if (lobbyChatDiv) {
        lobbyChatDiv.style.display = 'flex';
    }

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'joined') {
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
            } 
            else if (data.type === 'lobbyUpdate') {
                updateLobby(data);
            }
            else if (data.type === 'chatUpdate') {
                updateLobbyChat(data.chatMessages);
            }
            else if (data.type === 'globalChatUpdate') {
                updateGlobalChat(data.message);
            }
            else if (data.type === 'update') {
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
                    
                    // Criar e mostrar botão flutuante de mensagens
                    if (!document.getElementById('gameMessageFloat')) {
                        createGameMessagePanel();
                    }
                    
                    // Garantir que o botão seja exibido
                    const floatingBtn = document.getElementById('gameMessageFloat');
                    if (floatingBtn) {
                        floatingBtn.style.display = 'block';
                        console.log('Botão de mensagem mostrado');
                    } else {
                        console.log('Erro: Botão de mensagem não encontrado');
                    }
                    
                    if (!isDrawing) {
                        isDrawing = true;
                        draw();
                    }
                }
            } 
            else if (data.type === 'gameEnd') {
                gameState = data.gameState;
                isDrawing = false;
                
                // Ocultar botão de mensagens
                const floatingBtn = document.getElementById('gameMessageFloat');
                if (floatingBtn) floatingBtn.style.display = 'none';
                
                // Fechar modal se estiver aberto
                const messageModal = document.getElementById('messageModal');
                if (messageModal) messageModal.remove();
                
                setTimeout(() => showPodium(), 1000);
            }
            else if (data.type === 'timeUpdate') {
                timeRemaining = data.timeRemaining;
                updateTimerDisplay();
            }
            else if (data.type === 'error') {
                alert(data.message);
                hideElement(lobbyDiv);
                if (lobbyChatDiv) lobbyChatDiv.style.display = 'none';
                showElement(multiMenuDiv);
            }
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

// --- Atualizar Lobby ---
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
    
    // Atualizar botão de pronto
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

// --- Controles do Teclado ---
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

// --- Limpar mensagens temporárias antigas ---
function clearOldTemporaryMessages() {
    const now = Date.now();
    temporaryMessages = temporaryMessages.filter(
        msg => now - msg.timestamp < 5000
    );
}

// --- Desenhar Jogo ---
function draw() {
    if (!gameState || !isDrawing) return;
    
    clearOldTemporaryMessages();
    
    // Fundo
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Grid sutil
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += GRID_SIZE) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
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
                const eyeSize = 4;
                if (snake.dx > 0) {
                    ctx.fillRect(segment.x + 13, segment.y + 4, eyeSize, eyeSize);
                    ctx.fillRect(segment.x + 13, segment.y + 12, eyeSize, eyeSize);
                } else if (snake.dx < 0) {
                    ctx.fillRect(segment.x + 3, segment.y + 4, eyeSize, eyeSize);
                    ctx.fillRect(segment.x + 3, segment.y + 12, eyeSize, eyeSize);
                } else if (snake.dy > 0) {
                    ctx.fillRect(segment.x + 4, segment.y + 13, eyeSize, eyeSize);
                    ctx.fillRect(segment.x + 12, segment.y + 13, eyeSize, eyeSize);
                } else {
                    ctx.fillRect(segment.x + 4, segment.y + 3, eyeSize, eyeSize);
                    ctx.fillRect(segment.x + 12, segment.y + 3, eyeSize, eyeSize);
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
        
        // Nome da cobra ou mensagem temporária acima da cabeça
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 12px Arial';
        ctx.textAlign = 'center';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        const headX = snake.body[0].x + GRID_SIZE/2;
        const headY = snake.body[0].y - 8;
        
        let displayText = snake.name;
        let showTempMessage = false;
        
        // Verificar se há mensagem temporária válida
        if (snake.tempMessage) {
            const now = Date.now();
            const elapsed = now - snake.tempMessage.timestamp;
            
            if (elapsed < snake.tempMessage.duration) {
                displayText = snake.tempMessage.text;
                showTempMessage = true;
                ctx.fillStyle = '#FFD700'; // Cor dourada para mensagens
                
                // Fundo para a mensagem temporária
                const textWidth = ctx.measureText(displayText).width;
                ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
                ctx.fillRect(headX - textWidth/2 - 8, headY - 16, textWidth + 16, 22);
                ctx.strokeStyle = '#FFD700';
                ctx.lineWidth = 2;
                ctx.strokeRect(headX - textWidth/2 - 8, headY - 16, textWidth + 16, 22);
                
                ctx.fillStyle = '#FFD700';
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 2;
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
    
    // Mensagens temporárias no centro superior
    if (temporaryMessages.length > 0) {
        const latestMessage = temporaryMessages[temporaryMessages.length - 1];
        
        ctx.font = 'bold 24px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        const textWidth = ctx.measureText(latestMessage.text).width;
        
        // Fundo semi-transparente
        ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.fillRect(
            canvas.width / 2 - textWidth / 2 - 20, 
            40, 
            textWidth + 40, 
            40
        );
        
        // Borda dourada
        ctx.strokeStyle = '#FFD700';
        ctx.lineWidth = 2;
        ctx.strokeRect(
            canvas.width / 2 - textWidth / 2 - 20, 
            40, 
            textWidth + 40, 
            40
        );
        
        // Texto da mensagem
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
    
    // Mostrar pontuação do jogador atual
    const mySnake = gameState.snakes[playerId];
    if (mySnake) {
        ctx.fillStyle = '#FFD700';
        ctx.font = 'bold 16px Arial';
        ctx.textAlign = 'left';
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        const scoreText = `Sua pontuação: ${mySnake.body.length} | Vivos: ${alivePlayers.length}`;
        ctx.strokeText(scoreText, 10, 25);
        ctx.fillText(scoreText, 10, 25);
    }
    
    if (gameState.status === 'playing') {
        requestAnimationFrame(draw);
    } else {
        isDrawing = false;
    }
}

// --- Mostrar Pódio ---
function showPodium() {
    // Limpar canvas
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Overlay escuro
    ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.fillRect(50, 50, canvas.width - 100, canvas.height - 100);
    
    // Borda do overlay
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 4;
    ctx.strokeRect(50, 50, canvas.width - 100, canvas.height - 100);
    
    // Título principal
    ctx.fillStyle = '#FFD700';
    ctx.font = 'bold 36px Arial';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    const title = '🏆 FIM DE JOGO 🏆';
    ctx.strokeText(title, canvas.width / 2, 120);
    ctx.fillText(title, canvas.width / 2, 120);
    
    if (gameState.leaderboard && gameState.leaderboard.length > 0) {
        // Mostrar apenas top 3
        const topThree = gameState.leaderboard.slice(0, 3);
        
        // Vencedor
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
        
        // 2º e 3º lugares se existirem
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
    
    // Criar botões clicáveis em vez de só instruções de texto
    createEndGameButtons();
}

function createEndGameButtons() {
    // Remover botões antigos se existirem
    const oldButtons = document.querySelectorAll('.endgame-btn');
    oldButtons.forEach(btn => btn.remove());
    
    // Botão Reiniciar
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
        box-shadow: 0 0 20px rgba(0, 255, 0, 0.5);
        margin-right: 10px;
    `;
    
    restartBtn.onclick = () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            console.log('Reiniciando jogo...');
            ws.send(JSON.stringify({type: 'restartGame'}));
            removeEndGameButtons();
        }
    };
    
    // Botão Menu
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
        box-shadow: 0 0 20px rgba(255, 85, 85, 0.5);
        margin-left: 10px;
    `;
    
    menuBtn.onclick = () => {
        showMenu();
        removeEndGameButtons();
    };
    
    document.body.appendChild(restartBtn);
    document.body.appendChild(menuBtn);
    
    // Adicionar listener para toque/clique na tela também
    const canvasClickHandler = (e) => {
        e.preventDefault();
        console.log('Tela tocada - reiniciando...');
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({type: 'restartGame'}));
            removeEndGameButtons();
            canvas.removeEventListener('click', canvasClickHandler);
            canvas.removeEventListener('touchend', canvasClickHandler);
        }
    };
    
    canvas.addEventListener('click', canvasClickHandler);
    canvas.addEventListener('touchend', canvasClickHandler);
}

function removeEndGameButtons() {
    const buttons = document.querySelectorAll('.endgame-btn');
    buttons.forEach(btn => btn.remove());
}

// --- Inicializar quando o DOM carregar ---
function startMenuAnimation() {
    animateMenuSnake();
}

function generateTempPIN() { 
    return Math.floor(1000 + Math.random() * 9000).toString(); 
}

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', function() {
    setupMobileControls();
    setupSwipeControls();
    showMenu();
    startMenuAnimation();
    
    // Ocultar footer no mobile durante jogo para não atrapalhar
    if (isMobileDevice()) {
        const footer = document.querySelector('.footer');
        if (footer) {
            footer.style.display = 'none';
        }
    }
});