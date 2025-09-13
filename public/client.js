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

let ws, playerId, gameState, playerName, currentPIN;
let isDrawing = false;
let temporaryMessages = [];

// --- Inicial ---
canvas.style.display = 'none';
multiMenuDiv.style.display = 'none';
lobbyDiv.style.display = 'none';
menuDiv.style.display = 'flex';

// --- Tela inicial animada ---
let snakeX = 0, snakeY = 40, snakeDir = 1;
function animateMenuSnake() {
    if (menuDiv.style.display === 'flex') {
        menuCtx.clearRect(0, 0, menuCanvas.width, menuCanvas.height);
        menuCtx.fillStyle = "#00FF00";
        for (let i = 0; i < 5; i++) {
            menuCtx.fillRect(snakeX - i * 20, snakeY, 18, 18);
        }
        snakeX += 1.5 * snakeDir;
        if (snakeX > menuCanvas.width || snakeX < 0) snakeDir *= -1;
    } else {
        menuCtx.clearRect(0, 0, menuCanvas.width, menuCanvas.height);
    }
    requestAnimationFrame(animateMenuSnake);
}
animateMenuSnake();

// --- Botões ---
soloBtn.onclick = () => {
    playerName = prompt("Digite seu nome:", "Player") || "Player";
    menuDiv.style.display = 'none';
    menuCanvas.style.display = 'none';
    startSolo(playerName);
};

multiBtn.onclick = () => {
    menuDiv.style.display = 'none';
    menuCanvas.style.display = 'none';
    multiMenuDiv.style.display = 'block';
};

backFromMulti.onclick = () => {
    multiMenuDiv.style.display = 'none';
    menuDiv.style.display = 'flex';
    menuCanvas.style.display = 'block';
    
    // Fecha conexão se existir
    if (ws) {
        ws.close();
        ws = null;
    }
};

backFromLobby.onclick = () => {
    lobbyDiv.style.display = 'none';
    multiMenuDiv.style.display = 'block';
    
    // Fecha conexão se existir
    if (ws) {
        ws.close();
        ws = null;
    }
};

// --- Sala ---
createRoomBtn.onclick = () => {
    playerName = nameInput.value || "Player";
    if (!playerName.trim()) {
        alert("Por favor, digite um nome!");
        return;
    }
    
    ws = new WebSocket('ws://localhost:8080');
    ws.onopen = () => { 
        ws.send(JSON.stringify({type: 'join', pin: generateTempPIN(), name: playerName})); 
    };
    setupWS();
};

joinRoomBtn.onclick = () => {
    playerName = nameInput.value || "Player";
    currentPIN = pinInput.value;
    
    if (!playerName.trim()) {
        alert("Por favor, digite um nome!");
        return;
    }
    
    if (!currentPIN || currentPIN.length !== 4 || isNaN(currentPIN)) {
        alert("Por favor, digite um PIN válido de 4 dígitos!");
        return;
    }
    
    ws = new WebSocket('ws://localhost:8080');
    ws.onopen = () => { 
        ws.send(JSON.stringify({type: 'join', pin: currentPIN, name: playerName})); 
    };
    setupWS();
};

// --- Ready ---
readyBtn.onclick = () => { 
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: 'ready'})); 
    }
};

// --- Solo ---
function startSolo(name) {
    ws = new WebSocket('ws://localhost:8080');
    ws.onopen = () => { 
        ws.send(JSON.stringify({type: 'solo', name})); 
    };
    setupWS();
}

// --- Setup WS ---
function setupWS() {
    multiMenuDiv.style.display = 'none';
    lobbyDiv.style.display = 'block';

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'joined') {
                playerId = data.playerId;
                gameState = data.gameState;
                currentPIN = data.pin;
                pinDisplay.innerText = "PIN da Sala: " + currentPIN;
                updateLobby(data.gameState);
            } 
            else if (data.type === 'lobbyUpdate') {
                updateLobby({players: data.players});
            } 
            else if (data.type === 'update') {
                gameState = data.gameState;
                
                // Atualiza mensagens temporárias
                if (gameState.temporaryMessages && gameState.temporaryMessages.length > 0) {
                    temporaryMessages = gameState.temporaryMessages;
                }
                
                // Atualiza mensagens do chat
                if (gameState.messages && gameState.messages.length > 0) {
                    messagesDiv.innerHTML = gameState.messages.slice(-5).join('<br>');
                    messagesDiv.scrollTop = messagesDiv.scrollHeight;
                }
                
                if (gameState.status === 'playing') {
                    lobbyDiv.style.display = 'none';
                    canvas.style.display = 'block';
                    if (!isDrawing) {
                        isDrawing = true;
                        draw();
                    }
                } 
                else if (gameState.status === 'finished') {
                    isDrawing = false;
                    showPodium();
                }
            } 
            else if (data.type === 'error') {
                alert(data.message);
                lobbyDiv.style.display = 'none';
                multiMenuDiv.style.display = 'block';
            }
        } catch (error) {
            console.error('Erro ao processar mensagem:', error);
        }
    };
    
    ws.onerror = (error) => {
        console.error('Erro WebSocket:', error);
        alert('Erro de conexão. Verifique se o servidor está rodando.');
        lobbyDiv.style.display = 'none';
        multiMenuDiv.style.display = 'block';
    };
    
    ws.onclose = () => {
        console.log('Conexão fechada');
        isDrawing = false;
    };
}

// --- Lobby ---
function updateLobby(state) {
    playersList.innerHTML = '';
    const players = state.snakes ? Object.values(state.snakes) : state.players || [];
    
    players.forEach(p => {
        playersList.innerHTML += `
            <div class="player-item">
                ${p.name} ${p.isBot ? '(Bot)' : ''} - ${p.ready ? '✔️' : '❌'}
            </div>
        `;
    });
}

// --- Teclado ---
document.addEventListener('keydown', e => {
    if (!ws || !gameState || gameState.status !== 'playing') return;
    
    let dx = 0, dy = 0, grid = 20;
    
    if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') dy = -grid;
    else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') dy = grid;
    else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') dx = -grid;
    else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dx = grid;
    else return; // Ignora outras teclas
    
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({type: 'move', dx, dy}));
    }
});

// --- Limpar mensagens temporárias antigas ---
function clearOldTemporaryMessages() {
    const now = Date.now();
    temporaryMessages = temporaryMessages.filter(
        msg => now - msg.timestamp < 5000 // Mantém por 5 segundos
    );
}

// --- Draw ---
function draw() {
    if (!gameState || !isDrawing) return;
    
    // Limpa mensagens temporárias antigas
    clearOldTemporaryMessages();
    
    // Limpa o canvas
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Desenha grid (opcional)
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    for (let x = 0; x < canvas.width; x += 20) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 20) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
    
    // Desenha comida
    ctx.fillStyle = '#FF5555';
    ctx.fillRect(gameState.food.x, gameState.food.y, 19, 19);
    ctx.strokeStyle = '#AA0000';
    ctx.strokeRect(gameState.food.x, gameState.food.y, 19, 19);
    
    // Desenha cobras
    for (let id in gameState.snakes) {
        const snake = gameState.snakes[id];
        if (!snake.alive) continue;
        
        // Usa a cor definida no servidor ou uma cor padrão
        ctx.fillStyle = snake.color || '#00FF00';
        
        // Desenha o corpo
        snake.body.forEach((seg, index) => {
            ctx.fillRect(seg.x, seg.y, 19, 19);
            
            // Adiciona um efeito visual para a cabeça
            if (index === 0) {
                ctx.strokeStyle = '#FFFFFF';
                ctx.lineWidth = 2;
                ctx.strokeRect(seg.x, seg.y, 19, 19);
                
                // Olhos da cobra
                ctx.fillStyle = '#000';
                if (snake.dx > 0) { // Direita
                    ctx.fillRect(seg.x + 13, seg.y + 4, 4, 4);
                    ctx.fillRect(seg.x + 13, seg.y + 12, 4, 4);
                } else if (snake.dx < 0) { // Esquerda
                    ctx.fillRect(seg.x + 3, seg.y + 4, 4, 4);
                    ctx.fillRect(seg.x + 3, seg.y + 12, 4, 4);
                } else if (snake.dy > 0) { // Baixo
                    ctx.fillRect(seg.x + 4, seg.y + 13, 4, 4);
                    ctx.fillRect(seg.x + 12, seg.y + 13, 4, 4);
                } else if (snake.dy < 0) { // Cima
                    ctx.fillRect(seg.x + 4, seg.y + 3, 4, 4);
                    ctx.fillRect(seg.x + 12, seg.y + 3, 4, 4);
                }
                
                ctx.fillStyle = snake.color || '#00FF00';
            }
        });
        
        // Nome do jogador
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(snake.name, snake.body[0].x + 10, snake.body[0].y - 5);
    }
    
    // Desenha mensagens temporárias (mortes)
    if (temporaryMessages.length > 0) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '20px Arial';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Desenha a mensagem mais recente no centro da tela
        const latestMessage = temporaryMessages[temporaryMessages.length - 1];
        ctx.fillText(latestMessage.text, canvas.width / 2, 50);
        
        // Desenha um fundo semi-transparente para melhor legibilidade
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        const textWidth = ctx.measureText(latestMessage.text).width;
        ctx.fillRect(
            canvas.width / 2 - textWidth / 2 - 10, 
            35, 
            textWidth + 20, 
            30
        );
        
        // Redesenha o texto por cima do fundo
        ctx.fillStyle = '#FF5555';
        ctx.fillText(latestMessage.text, canvas.width / 2, 50);
    }
    
    // Atualiza scoreboard
    const alivePlayers = Object.values(gameState.snakes).filter(s => s.alive).map(s => s.name);
    scoreboard.innerHTML = "Jogadores vivos: " + (alivePlayers.length > 0 ? alivePlayers.join(', ') : 'Nenhum');
    
    // Mostra pontuação atual
    const mySnake = gameState.snakes[playerId];
    if (mySnake) {
        const scoreText = `Sua pontuação: ${mySnake.body.length}`;
        ctx.fillStyle = '#FFFF00';
        ctx.font = '14px Arial';
        ctx.textAlign = 'left';
        ctx.fillText(scoreText, 10, 20);
    }
    
    if (gameState.status === 'playing') {
        requestAnimationFrame(draw);
    } else {
        isDrawing = false;
    }
}

// --- Pódio ---
function showPodium() {
    // Limpa o canvas
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(50, 50, canvas.width - 100, canvas.height - 100);
    
    ctx.fillStyle = '#FFD700';
    ctx.font = '48px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('🏆 FIM DE JOGO 🏆', canvas.width / 2, 100);
    
    if (gameState.leaderboard && gameState.leaderboard.length > 0) {
        // Desenha o vencedor
        const winner = gameState.leaderboard[0];
        ctx.fillStyle = '#00FF00';
        ctx.font = '36px Arial';
        ctx.fillText(`Vencedor: ${winner.name}`, canvas.width / 2, 170);
        ctx.fillText(`Pontuação: ${winner.score}`, canvas.width / 2, 220);
        
        // Desenha o ranking
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '24px Arial';
        ctx.fillText('Ranking Final:', canvas.width / 2, 280);
        
        gameState.leaderboard.slice(0, 5).forEach((player, index) => {
            const y = 330 + index * 40;
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            ctx.fillText(`${medal} ${player.name} - ${player.score}`, canvas.width / 2, y);
        });
        
        // Mensagem para jogar novamente
        ctx.fillStyle = '#AAAAAA';
        ctx.font = '18px Arial';
        ctx.fillText('Recarregue a página para jogar novamente', canvas.width / 2, 550);
    } else {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '24px Arial';
        ctx.fillText('Nenhum jogador sobreviveu!', canvas.width / 2, 250);
    }
}

// --- Gerar PIN ---
function generateTempPIN() { 
    return Math.floor(1000 + Math.random() * 9000).toString(); 
}