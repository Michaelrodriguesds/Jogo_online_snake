// --- Importações ---
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

// --- Configurações ---
const GRID_SIZE = 20;
const CANVAS_SIZE = 800;
const MAX_PLAYERS = 4;
const TICK_RATE = 100;
const AUTO_START_TIME = 120000; // 2 minutos

// --- Servidor HTTP + Express ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Servir frontend
app.use(express.static(path.join(__dirname, 'public')));

// --- Estrutura de salas ---
let rooms = {}; // { pin: { players: [], gameState, interval, autoStartTimer } }
let globalChatUsers = []; // Chat global do menu principal

// --- Mensagens pré-definidas ---
const PREDEFINED_MESSAGES = [
    "😎 Show!",
    "😱 Nossa!",
    "😂 Haha!",
    "🔥 Fire!",
    "💪 Força!",
    "😢 Noooo!",
    "🎯 Foco!",
    "⚡ Rápido!",
    "🏆 Top!",
    "😵 Ops!"
];

// --- Criar sala ---
function createRoom(pin) {
    rooms[pin] = {
        players: [],
        gameState: {
            snakes: {},
            food: { x: 0, y: 0 },
            status: 'waiting',
            leaderboard: [],
            messages: [],
            temporaryMessages: [],
            chatMessages: [],
            gameMessages: [] // Mensagens durante o jogo
        },
        autoStartTimer: null,
        autoStartInterval: null,
        startTime: null,
        interval: null,
        isSoloMode: false
    };
    spawnFood(pin);
    console.log(`Sala ${pin} criada`);
}

// --- Spawn comida ---
function spawnFood(pin) {
    const room = rooms[pin];
    if (!room) return;
    
    const gridCellsX = CANVAS_SIZE / GRID_SIZE;
    const gridCellsY = CANVAS_SIZE / GRID_SIZE;
    
    const margin = 2;
    const minX = margin;
    const maxX = gridCellsX - margin - 1;
    const minY = margin;
    const maxY = gridCellsY - margin - 1;
    
    let attempts = 0;
    let foodPos;
    let valid = false;
    
    while (!valid && attempts < 100) {
        attempts++;
        
        const gridX = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
        const gridY = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
        
        foodPos = {
            x: gridX * GRID_SIZE,
            y: gridY * GRID_SIZE
        };
        
        valid = true;
        for (let id in room.gameState.snakes) {
            const snake = room.gameState.snakes[id];
            if (snake.body.some(segment => segment.x === foodPos.x && segment.y === foodPos.y)) {
                valid = false;
                break;
            }
        }
    }
    
    if (!valid) {
        const gridX = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
        const gridY = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
        foodPos = {
            x: gridX * GRID_SIZE,
            y: gridY * GRID_SIZE
        };
    }
    
    room.gameState.food = foodPos;
}

// --- WebSocket ---
wss.on('connection', ws => {
    console.log('Nova conexão estabelecida');
    
    ws.on('message', msg => {
        try {
            const data = JSON.parse(msg);
            switch(data.type){
                case 'join': handleJoin(ws, data); break;
                case 'solo': handleSolo(ws, data); break;
                case 'move': handleMove(ws, data); break;
                case 'ready': handleReady(ws); break;
                case 'startGame': handleStartGame(ws); break;
                case 'chat': handleChat(ws, data); break;
                case 'globalChat': handleGlobalChat(ws, data); break;
                case 'gameMessage': handleGameMessage(ws, data); break;
                case 'restartGame': handleRestartGame(ws); break;
            }
        } catch (error) {
            console.error('Erro ao processar mensagem:', error);
        }
    });

    ws.on('close', () => {
        console.log('Conexão fechada');
        handleDisconnect(ws);
    });
    
    ws.on('error', (error) => {
        console.error('Erro WebSocket:', error);
    });
});

// --- Chat Global do Menu Principal ---
function handleGlobalChat(ws, data) {
    const chatMessage = {
        name: data.name,
        message: data.message,
        timestamp: Date.now()
    };
    
    // Adicionar usuário se não existir
    if (!globalChatUsers.find(u => u.ws === ws)) {
        globalChatUsers.push({ ws, name: data.name });
    }
    
    // Broadcast para todos conectados no menu principal
    globalChatUsers.forEach(user => {
        if (user.ws && user.ws.readyState === WebSocket.OPEN) {
            user.ws.send(JSON.stringify({
                type: 'globalChatUpdate',
                message: chatMessage
            }));
        }
    });
    
    // Limpar usuários desconectados
    globalChatUsers = globalChatUsers.filter(u => u.ws.readyState === WebSocket.OPEN);
}

// --- Mensagem durante o jogo ---
function handleGameMessage(ws, data) {
    const room = rooms[ws.roomPin];
    if (!room || room.gameState.status !== 'playing') return;
    
    const player = room.players.find(p => p.ws === ws);
    if (!player) return;
    
    const snake = room.gameState.snakes[ws.playerId];
    if (!snake || !snake.alive) return;
    
    // Definir mensagem temporária na cobra
    snake.tempMessage = {
        text: data.message,
        timestamp: Date.now(),
        duration: 3000 // 3 segundos
    };
    
    // Broadcast para todos na sala
    room.players.forEach(p => {
        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify({
                type: 'update',
                gameState: room.gameState
            }));
        }
    });
}

// --- Chat do lobby ---
function handleChat(ws, data) {
    const room = rooms[ws.roomPin];
    if (!room) return;
    
    const player = room.players.find(p => p.ws === ws);
    if (!player) return;
    
    const chatMessage = {
        name: player.name,
        message: data.message,
        timestamp: Date.now()
    };
    
    room.gameState.chatMessages.push(chatMessage);
    
    // Manter apenas as últimas 20 mensagens
    if (room.gameState.chatMessages.length > 20) {
        room.gameState.chatMessages.shift();
    }
    
    // Broadcast para todos na sala
    room.players.forEach(p => {
        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify({
                type: 'chatUpdate',
                chatMessages: room.gameState.chatMessages
            }));
        }
    });
}

// --- Reiniciar jogo ---
function handleRestartGame(ws) {
    const room = rooms[ws.roomPin];
    if (!room) return;
    
    console.log(`Reiniciando jogo na sala ${ws.roomPin}`);
    
    // Resetar estado do jogo
    if (room.interval) {
        clearInterval(room.interval);
        room.interval = null;
    }
    
    if (room.autoStartInterval) {
        clearInterval(room.autoStartInterval);
        room.autoStartInterval = null;
    }
    
    // Resetar todos os jogadores
    room.players.forEach(player => {
        player.ready = false;
    });
    
    // Resetar estado do jogo
    room.gameState.status = 'waiting';
    room.gameState.leaderboard = [];
    room.gameState.messages = [];
    room.gameState.temporaryMessages = [];
    room.gameState.gameMessages = [];
    
    // Recriar cobras
    for (let i = 0; i < room.players.length; i++) {
        const player = room.players[i];
        const margin = 5;
        const gridCellsX = CANVAS_SIZE / GRID_SIZE;
        const gridCellsY = CANVAS_SIZE / GRID_SIZE;
        const minX = margin;
        const maxX = gridCellsX - margin - 1;
        const minY = margin;
        const maxY = gridCellsY - margin - 1;
        
        const startX = (Math.floor(Math.random() * (maxX - minX + 1)) + minX) * GRID_SIZE;
        const startY = (Math.floor(Math.random() * (maxY - minY + 1)) + minY) * GRID_SIZE;
        
        room.gameState.snakes[player.playerId] = {
            body: [{x: startX, y: startY}],
            dx: GRID_SIZE,
            dy: 0,
            alive: true,
            name: player.name,
            speed: player.isBot ? 2.2 : 3,
            moveCooldown: 0,
            isBot: player.isBot,
            survivalTime: 0,
            color: getRandomColor(),
            tempMessage: null
        };
    }
    
    spawnFood(ws.roomPin);
    broadcastLobby(room);
    
    // Reinicia timer se houver jogadores humanos e não for modo solo
    const humanPlayers = room.players.filter(p => !p.isBot);
    if (humanPlayers.length > 0 && !room.isSoloMode) {
        startAutoStartTimer(ws.roomPin);
    }
}

// --- Jogador entra em sala multiplayer ---
function handleJoin(ws, data) {
    const { pin, name } = data;
    
    if (!rooms[pin]) {
        createRoom(pin);
    }
    
    const room = rooms[pin];
    
    if (room.players.length >= MAX_PLAYERS) {
        ws.send(JSON.stringify({type: 'error', message: 'Sala cheia'}));
        return;
    }

    const playerId = generatePlayerId();
    ws.playerId = playerId;
    ws.roomPin = pin;

    const margin = 5;
    const gridCellsX = CANVAS_SIZE / GRID_SIZE;
    const gridCellsY = CANVAS_SIZE / GRID_SIZE;
    const minX = margin;
    const maxX = gridCellsX - margin - 1;
    const minY = margin;
    const maxY = gridCellsY - margin - 1;
    
    const startX = (Math.floor(Math.random() * (maxX - minX + 1)) + minX) * GRID_SIZE;
    const startY = (Math.floor(Math.random() * (maxY - minY + 1)) + minY) * GRID_SIZE;

    room.players.push({ ws, playerId, name, isBot: false, ready: false });
    room.gameState.snakes[playerId] = {
        body: [{x: startX, y: startY}],
        dx: GRID_SIZE,
        dy: 0,
        alive: true,
        name,
        speed: 3,
        moveCooldown: 0,
        isBot: false,
        survivalTime: 0,
        color: getRandomColor(),
        tempMessage: null
    };

    ws.send(JSON.stringify({
        type: 'joined', 
        playerId, 
        gameState: room.gameState, 
        pin,
        chatMessages: room.gameState.chatMessages,
        predefinedMessages: PREDEFINED_MESSAGES
    }));
    broadcastLobby(room);

    console.log(`Jogador ${name} entrou na sala ${pin}. Total: ${room.players.length} jogadores`);

    // Inicia timer para início automático se for o primeiro jogador humano e não for solo
    const humanPlayers = room.players.filter(p => !p.isBot);
    if (humanPlayers.length === 1 && room.gameState.status === 'waiting' && !room.isSoloMode) {
        startAutoStartTimer(pin);
    }

    // Preenche com bots se necessário (apenas se houver poucos jogadores)
    if (room.players.length === 1 && !room.isSoloMode) {
        addBot(pin);
        addBot(pin);
    }
}

// --- Função para broadcast do tempo restante ---
function broadcastTimeRemaining(room, timeRemaining) {
    room.players.forEach(p => {
        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify({
                type: 'timeUpdate',
                timeRemaining: Math.ceil(timeRemaining / 1000) // segundos
            }));
        }
    });
}

// --- Timer para início automático ---
function startAutoStartTimer(pin) {
    const room = rooms[pin];
    if (!room || room.autoStartInterval || room.gameState.status !== 'waiting' || room.isSoloMode) {
        return; // Não inicia timer em modo solo
    }
    
    room.startTime = Date.now();
    
    console.log(`Timer de início automático iniciado para sala ${pin}`);
    
    // Envia o tempo inicial
    broadcastTimeRemaining(room, AUTO_START_TIME);
    
    room.autoStartInterval = setInterval(() => {
        const elapsed = Date.now() - room.startTime;
        const timeRemaining = AUTO_START_TIME - elapsed;
        
        // Envia atualização do tempo a cada segundo
        broadcastTimeRemaining(room, timeRemaining);
        
        if (timeRemaining <= 0) {
            clearInterval(room.autoStartInterval);
            room.autoStartInterval = null;
            
            if (room.gameState.status === 'waiting') {
                console.log(`Iniciando jogo automaticamente na sala ${pin}`);
                room.players.forEach(player => {
                    player.ready = true;
                });
                room.gameState.status = 'playing';
                startGame(pin);
                broadcastLobby(room);
            }
        }
    }, 1000); // Atualiza a cada segundo
}

// --- Jogador solo ---
function handleSolo(ws, data) {
    const pin = generateTempPIN();
    createRoom(pin);
    
    // Marca como sala solo para não iniciar timer
    const room = rooms[pin];
    room.isSoloMode = true;
    
    // Adiciona bots primeiro
    addBot(pin);
    addBot(pin);
    addBot(pin);
    
    // Depois adiciona o jogador
    handleJoin(ws, { pin, name: data.name });

    // Inicia o jogo imediatamente no modo solo sem timer
    setTimeout(() => {
        if (room && room.gameState.status === 'waiting') {
            // Cancela qualquer timer que possa ter iniciado
            if (room.autoStartInterval) {
                clearInterval(room.autoStartInterval);
                room.autoStartInterval = null;
            }
            
            room.players.forEach(player => {
                player.ready = true;
            });
            room.gameState.status = 'playing';
            
            // Envia tempo zerado para esconder timer
            broadcastTimeRemaining(room, 0);
            
            startGame(pin);
            console.log(`Jogo solo iniciado na sala ${pin}`);
        }
    }, 300);
}

// --- Adiciona bot ---
function addBot(pin) {
    const room = rooms[pin];
    if (!room || room.players.length >= MAX_PLAYERS) return;
    
    const playerId = generatePlayerId();
    
    const margin = 5;
    const gridCellsX = CANVAS_SIZE / GRID_SIZE;
    const gridCellsY = CANVAS_SIZE / GRID_SIZE;
    const minX = margin;
    const maxX = gridCellsX - margin - 1;
    const minY = margin;
    const maxY = gridCellsY - margin - 1;
    
    const startX = (Math.floor(Math.random() * (maxX - minX + 1)) + minX) * GRID_SIZE;
    const startY = (Math.floor(Math.random() * (maxY - minY + 1)) + minY) * GRID_SIZE;

    const botName = `Bot${room.players.filter(p => p.isBot).length + 1}`;
    
    room.players.push({ ws: null, playerId, name: botName, isBot: true, ready: true });
    room.gameState.snakes[playerId] = {
        body: [{x: startX, y: startY}],
        dx: GRID_SIZE,
        dy: 0,
        alive: true,
        name: botName,
        speed: 2.2,
        moveCooldown: 0,
        isBot: true,
        survivalTime: 0,
        color: getRandomColor(),
        tempMessage: null
    };
    
    console.log(`Bot ${botName} adicionado à sala ${pin}`);
}

// --- Movimento jogador ---
function handleMove(ws, data) {
    const room = rooms[ws.roomPin];
    if (!room || room.gameState.status !== 'playing') return;
    
    const snake = room.gameState.snakes[ws.playerId];
    if (!snake || !snake.alive) return;

    // Prevenir movimento reverso
    if ((data.dx !== 0 && data.dx === -snake.dx) || (data.dy !== 0 && data.dy === -snake.dy)) {
        return;
    }
    
    snake.dx = data.dx;
    snake.dy = data.dy;
}

// --- Ready ---
function handleReady(ws) {
    const room = rooms[ws.roomPin];
    if (!room) return;
    
    const player = room.players.find(p => p.ws === ws);
    if (player) {
        player.ready = true;
        console.log(`Jogador ${player.name} está pronto na sala ${ws.roomPin}`);
    }

    broadcastLobby(room);

    // Verifica se todos estão prontos
    const allReady = room.players.every(p => p.ready);
    console.log(`Sala ${ws.roomPin}: ${room.players.filter(p => p.ready).length}/${room.players.length} prontos`);

    if (allReady && room.gameState.status === 'waiting') {
        // Cancela timer de início automático se todos estiverem prontos
        if (room.autoStartInterval) {
            clearInterval(room.autoStartInterval);
            room.autoStartInterval = null;
            broadcastTimeRemaining(room, 0);
        }

        console.log(`Todos prontos na sala ${ws.roomPin}, iniciando jogo`);
        room.gameState.status = 'playing';
        startGame(ws.roomPin);
        broadcastLobby(room);
    }
}

// --- Iniciar jogo manualmente ---
function handleStartGame(ws) {
    const room = rooms[ws.roomPin];
    if (!room) return;
    
    const isCreator = room.players[0] && room.players[0].ws === ws;
    if (isCreator && room.gameState.status === 'waiting') {
        // Cancela o timer se existir
        if (room.autoStartInterval) {
            clearInterval(room.autoStartInterval);
            room.autoStartInterval = null;
            broadcastTimeRemaining(room, 0);
        }
        
        console.log(`Jogo iniciado manualmente na sala ${ws.roomPin} pelo criador`);
        room.gameState.status = 'playing';
        startGame(ws.roomPin);
        broadcastLobby(room);
    }
}

// --- Desconexão ---
function handleDisconnect(ws) {
    // Remover do chat global
    globalChatUsers = globalChatUsers.filter(u => u.ws !== ws);
    
    if (!ws.roomPin || !rooms[ws.roomPin]) return;
    
    const room = rooms[ws.roomPin];
    const playerName = room.players.find(p => p.ws === ws)?.name || 'Jogador';
    
    room.players = room.players.filter(p => p.ws !== ws);
    
    if (ws.playerId) {
        delete room.gameState.snakes[ws.playerId];
    }
    
    console.log(`Jogador ${playerName} desconectou da sala ${ws.roomPin}`);
    
    // Cancela timer se não houver mais jogadores humanos
    const humanPlayers = room.players.filter(p => !p.isBot);
    if (room.autoStartInterval && humanPlayers.length === 0) {
        clearInterval(room.autoStartInterval);
        room.autoStartInterval = null;
    }
    
    if (room.players.length === 0) {
        if (room.interval) {
            clearInterval(room.interval);
        }
        if (room.autoStartInterval) {
            clearInterval(room.autoStartInterval);
        }
        delete rooms[ws.roomPin];
        console.log(`Sala ${ws.roomPin} removida (sem jogadores)`);
    } else {
        broadcastLobby(room);
    }
}

// --- Movimento de bot inteligente ---
function moveBot(snake, food, room) {
    const head = snake.body[0];
    
    const possibleDirections = [];
    
    // Direita
    if (snake.dx !== -GRID_SIZE) {
        const newHead = { x: head.x + GRID_SIZE, y: head.y };
        if (isSafeMove(snake, newHead, room)) {
            possibleDirections.push({dx: GRID_SIZE, dy: 0});
        }
    }
    
    // Esquerda
    if (snake.dx !== GRID_SIZE) {
        const newHead = { x: head.x - GRID_SIZE, y: head.y };
        if (isSafeMove(snake, newHead, room)) {
            possibleDirections.push({dx: -GRID_SIZE, dy: 0});
        }
    }
    
    // Baixo
    if (snake.dy !== -GRID_SIZE) {
        const newHead = { x: head.x, y: head.y + GRID_SIZE };
        if (isSafeMove(snake, newHead, room)) {
            possibleDirections.push({dx: 0, dy: GRID_SIZE});
        }
    }
    
    // Cima
    if (snake.dy !== GRID_SIZE) {
        const newHead = { x: head.x, y: head.y - GRID_SIZE };
        if (isSafeMove(snake, newHead, room)) {
            possibleDirections.push({dx: 0, dy: -GRID_SIZE});
        }
    }
    
    if (possibleDirections.length === 0) {
        return { dx: snake.dx, dy: snake.dy };
    }
    
    // 70% das vezes vai em direção à comida
    if (Math.random() < 0.7) {
        let bestDirection = null;
        let minDistance = Infinity;
        
        possibleDirections.forEach(dir => {
            const newHead = { x: head.x + dir.dx, y: head.y + dir.dy };
            const distance = Math.abs(newHead.x - food.x) + Math.abs(newHead.y - food.y);
            
            if (distance < minDistance) {
                minDistance = distance;
                bestDirection = dir;
            }
        });
        
        if (bestDirection) {
            return bestDirection;
        }
    }
    
    return possibleDirections[Math.floor(Math.random() * possibleDirections.length)];
}

// --- Verifica se movimento é seguro ---
function isSafeMove(snake, newHead, room) {
    // Aplicar wraparound primeiro
    let wrappedHead = { ...newHead };
    if (wrappedHead.x < 0) wrappedHead.x = CANVAS_SIZE - GRID_SIZE;
    else if (wrappedHead.x >= CANVAS_SIZE) wrappedHead.x = 0;
    if (wrappedHead.y < 0) wrappedHead.y = CANVAS_SIZE - GRID_SIZE;
    else if (wrappedHead.y >= CANVAS_SIZE) wrappedHead.y = 0;
    
    // Verificar colisão com próprio corpo (exceto a última posição da cauda)
    for (let i = 0; i < snake.body.length - 1; i++) {
        if (snake.body[i].x === wrappedHead.x && snake.body[i].y === wrappedHead.y) {
            return false;
        }
    }
    
    // Verificar colisão com outras cobras
    for (let id in room.gameState.snakes) {
        const otherSnake = room.gameState.snakes[id];
        if (otherSnake === snake || !otherSnake.alive) continue;
        
        for (let segment of otherSnake.body) {
            if (segment.x === wrappedHead.x && segment.y === wrappedHead.y) {
                return false;
            }
        }
    }
    
    return true;
}

// --- Adicionar mensagem temporária ---
function addTemporaryMessage(room, message) {
    const timestamp = Date.now();
    room.gameState.temporaryMessages.push({ text: message, timestamp });
    
    if (room.gameState.temporaryMessages.length > 5) {
        room.gameState.temporaryMessages.shift();
    }
}

// --- Limpar mensagens temporárias antigas ---
function clearOldTemporaryMessages(room) {
    const now = Date.now();
    room.gameState.temporaryMessages = room.gameState.temporaryMessages.filter(
        msg => now - msg.timestamp < 5000
    );
}

// --- Loop do jogo ---
function startGame(pin) {
    const room = rooms[pin];
    if (!room || room.interval) return;
    
    console.log(`Iniciando loop do jogo na sala ${pin}`);
    
    room.interval = setInterval(() => {
        const state = room.gameState;
        if (state.status !== 'playing') {
            clearInterval(room.interval);
            room.interval = null;
            return;
        }

        clearOldTemporaryMessages(room);

        // Contar cobras vivas ANTES do movimento
        const aliveSnakesBefore = Object.values(state.snakes).filter(s => s.alive);
        
        if (aliveSnakesBefore.length <= 1) {
            endGame(pin, aliveSnakesBefore);
            return;
        }

        // Processar movimento de cada cobra
        for (let id in state.snakes) {
            const snake = state.snakes[id];
            if (!snake.alive) continue;

            // Limpar mensagens temporárias expiradas
            if (snake.tempMessage && Date.now() - snake.tempMessage.timestamp > snake.tempMessage.duration) {
                snake.tempMessage = null;
            }

            // Bot AI
            if (snake.isBot) {
                const move = moveBot(snake, state.food, room);
                snake.dx = move.dx;
                snake.dy = move.dy;
            }

            // Aumentar tempo de sobrevivência
            snake.survivalTime += TICK_RATE / 1000;

            // Acelerar cobra com o tempo
            if (snake.survivalTime >= 30) {
                snake.speed = Math.min(snake.speed * 1.02, 8);
                snake.survivalTime = 0;
            }

            // Cooldown de movimento
            snake.moveCooldown -= 0.1;
            if (snake.moveCooldown <= 0) {
                // Calcular nova posição da cabeça
                let newHead = { 
                    x: snake.body[0].x + snake.dx, 
                    y: snake.body[0].y + snake.dy 
                };

                // Wraparound nas bordas
                if (newHead.x < 0) newHead.x = CANVAS_SIZE - GRID_SIZE;
                else if (newHead.x >= CANVAS_SIZE) newHead.x = 0;
                if (newHead.y < 0) newHead.y = CANVAS_SIZE - GRID_SIZE;
                else if (newHead.y >= CANVAS_SIZE) newHead.y = 0;

                // Verificar colisão com próprio corpo (não inclui a posição da cauda que será removida)
                const bodyToCheck = snake.body.slice(0, -1); // Remove a cauda da verificação
                if (bodyToCheck.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
                    snake.alive = false;
                    const deathMessage = `${snake.name} morreu!`;
                    addTemporaryMessage(room, deathMessage);
                    state.messages.push(deathMessage);
                    state.leaderboard.push({name: snake.name, score: snake.body.length});
                    continue;
                }

                // Verificar colisão com outras cobras
                let collision = false;
                for (let otherId in state.snakes) {
                    if (otherId === id) continue;
                    
                    const other = state.snakes[otherId];
                    if (!other.alive) continue;
                    
                    if (other.body.some(seg => seg.x === newHead.x && seg.y === newHead.y)) {
                        snake.alive = false;
                        const deathMessage = `${snake.name} morreu!`;
                        addTemporaryMessage(room, deathMessage);
                        state.messages.push(deathMessage);
                        state.leaderboard.push({name: snake.name, score: snake.body.length});
                        collision = true;
                        break;
                    }
                }

                if (collision || !snake.alive) continue;

                // Mover cobra
                snake.body.unshift(newHead);

                // Verificar se comeu comida
                if (newHead.x === state.food.x && newHead.y === state.food.y) {
                    snake.speed = Math.min(snake.speed * 1.05, 8);
                    spawnFood(pin);
                    // Não remove a cauda quando come
                } else {
                    snake.body.pop();
                }

                snake.moveCooldown = 1 / snake.speed;
            }
        }

        // Contar cobras vivas APÓS o movimento
        const aliveSnakesAfter = Object.values(state.snakes).filter(s => s.alive);
        
        if (aliveSnakesAfter.length <= 1) {
            endGame(pin, aliveSnakesAfter);
            return;
        }

        // Broadcast do estado para todos os jogadores
        room.players.forEach(p => {
            if (p.ws && p.ws.readyState === WebSocket.OPEN) {
                p.ws.send(JSON.stringify({type: 'update', gameState: state}));
            }
        });

    }, TICK_RATE);
}

// --- Finalizar jogo ---
function endGame(pin, aliveSnakes) {
    const room = rooms[pin];
    if (!room) return;
    
    const state = room.gameState;
    state.status = 'finished';
    
    console.log(`Finalizando jogo na sala ${pin}. Cobras vivas: ${aliveSnakes.length}`);
    
    // Criar ranking baseado na ordem de eliminação (último vivo = 1º lugar)
    const finalRanking = [];
    
    if (aliveSnakes.length === 1) {
        const winner = aliveSnakes[0];
        finalRanking.push({
            name: winner.name, 
            score: winner.body.length,
            position: 1,
            isWinner: true
        });
        const winMessage = `🏆 ${winner.name} venceu o jogo! 🏆`;
        addTemporaryMessage(room, winMessage);
        state.messages.push(winMessage);
    } else if (aliveSnakes.length === 0) {
        const drawMessage = "🤝 Empate! Ninguém sobreviveu!";
        addTemporaryMessage(room, drawMessage);
        state.messages.push(drawMessage);
    }
    
    // Adicionar cobras já mortas ao ranking (ordem reversa = quem morreu por último fica melhor colocado)
    const deadSnakes = state.leaderboard.slice().reverse(); // Inverter para quem morreu por último ficar em melhor posição
    deadSnakes.forEach((snake, index) => {
        finalRanking.push({
            name: snake.name,
            score: snake.score,
            position: finalRanking.length + 1,
            isWinner: false
        });
    });
    
    // Adicionar qualquer cobra viva restante
    aliveSnakes.forEach(snake => {
        if (!finalRanking.find(r => r.name === snake.name)) {
            finalRanking.push({
                name: snake.name,
                score: snake.body.length,
                position: finalRanking.length + 1,
                isWinner: false
            });
        }
    });
    
    // Ordenar por posição e depois por pontuação
    finalRanking.sort((a, b) => {
        if (a.position !== b.position) return a.position - b.position;
        return b.score - a.score;
    });
    
    // Manter apenas top 3 para o pódio
    state.leaderboard = finalRanking.slice(0, 3);
    
    // Broadcast final
    room.players.forEach(p => {
        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify({type: 'gameEnd', gameState: state}));
        }
    });
    
    // Limpar intervalo
    if (room.interval) {
        clearInterval(room.interval);
        room.interval = null;
    }
    
    console.log(`Jogo finalizado na sala ${pin}. Ranking: ${finalRanking.map(r => `${r.position}º ${r.name}`).join(', ')}`);
}

// --- Lobby ---
function broadcastLobby(room) {
    const lobbyData = {
        type: 'lobbyUpdate',
        players: room.players.map(p => ({
            name: p.name,
            isBot: p.isBot,
            ready: p.ready
        })),
        gameState: {
            status: room.gameState.status
        }
    };
    
    room.players.forEach(p => {
        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify(lobbyData));
        }
    });
}

// --- Utilitários ---
function generateTempPIN() { 
    return Math.floor(1000 + Math.random() * 9000).toString(); 
}

function generatePlayerId() {
    return Date.now() + Math.random().toString(36).substr(2, 9);
}

function getRandomColor() {
    const colors = [
        '#FF5555', '#55FF55', '#5555FF', '#FFFF55',
        '#FF55FF', '#55FFFF', '#FFAA00', '#AA00FF',
        '#FF8080', '#80FF80', '#8080FF', '#FFFF80'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// --- Limpeza periódica de salas vazias ---
setInterval(() => {
    for (let pin in rooms) {
        const room = rooms[pin];
        const humanPlayers = room.players.filter(p => !p.isBot && p.ws && p.ws.readyState === WebSocket.OPEN);
        
        if (humanPlayers.length === 0) {
            if (room.interval) {
                clearInterval(room.interval);
            }
            if (room.autoStartInterval) {
                clearInterval(room.autoStartInterval);
            }
            delete rooms[pin];
            console.log(`Sala ${pin} removida automaticamente (inativa)`);
        }
    }
}, 60000); // Verifica a cada minuto

// --- Middleware de log para debugging ---
app.get('/api/rooms', (req, res) => {
    const roomsInfo = Object.keys(rooms).map(pin => ({
        pin,
        players: rooms[pin].players.length,
        status: rooms[pin].gameState.status,
        humanPlayers: rooms[pin].players.filter(p => !p.isBot).length
    }));
    res.json(roomsInfo);
});

// --- Inicia servidor ---
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`🐍 Servidor Snake rodando na porta ${PORT}`);
    console.log(`📱 Acesse: http://localhost:${PORT}`);
    console.log(`📊 Debug: http://localhost:${PORT}/api/rooms`);
});