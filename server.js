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
            temporaryMessages: []
        },
        autoStartTimer: null,
        autoStartInterval: null,
        startTime: null
    };
    spawnFood(pin);
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
        color: getRandomColor()
    };

    ws.send(JSON.stringify({type: 'joined', playerId, gameState: room.gameState, pin}));
    broadcastLobby(room);

    // Inicia timer para início automático se for o primeiro jogador
    if (room.players.length === 1) {
        startAutoStartTimer(pin);
    }

    // Preenche com bots se necessário
    if (room.players.length === 1) {
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
    if (!room || room.autoStartTimer) return;
    
    room.startTime = Date.now();
    
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
    
    addBot(pin);
    addBot(pin);
    addBot(pin);
    
    handleJoin(ws, { pin, name: data.name });

    const room = rooms[pin];
    room.gameState.status = 'playing';
    startGame(pin);
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

    room.players.push({ ws: null, playerId, name: `Bot${room.players.length + 1}`, isBot: true, ready: true });
    room.gameState.snakes[playerId] = {
        body: [{x: startX, y: startY}],
        dx: GRID_SIZE,
        dy: 0,
        alive: true,
        name: `Bot${room.players.length}`,
        speed: 2.2,
        moveCooldown: 0,
        isBot: true,
        survivalTime: 0,
        color: getRandomColor()
    };
}

// --- Movimento jogador ---
function handleMove(ws, data) {
    const room = rooms[ws.roomPin];
    if (!room) return;
    
    const snake = room.gameState.snakes[ws.playerId];
    if (!snake || !snake.alive) return;

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
    if (player) player.ready = true;

    broadcastLobby(room);

    // Cancela timer de início automático se todos estiverem prontos
    if (room.autoStartInterval) {
        clearInterval(room.autoStartInterval);
        room.autoStartInterval = null;
        // Envia tempo zerado para esconder o contador
        broadcastTimeRemaining(room, 0);
    }

    if (room.players.every(p => p.ready)) {
        room.gameState.status = 'playing';
        startGame(room.pin);
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
        
        room.gameState.status = 'playing';
        startGame(room.pin);
        broadcastLobby(room);
    }
}

// --- Desconexão ---
function handleDisconnect(ws) {
    if (!ws.roomPin || !rooms[ws.roomPin]) return;
    
    const room = rooms[ws.roomPin];
    room.players = room.players.filter(p => p.ws !== ws);
    
    if (ws.playerId) {
        delete room.gameState.snakes[ws.playerId];
    }
    
    // Cancela timer se não houver mais jogadores humanos
    if (room.autoStartInterval && room.players.filter(p => !p.isBot).length === 0) {
        clearInterval(room.autoStartInterval);
        room.autoStartInterval = null;
    }
    
    if (room.players.length === 0) {
        if (room.interval) {
            clearInterval(room.interval);
        }
        delete rooms[ws.roomPin];
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
    if (newHead.x < 0 || newHead.x >= CANVAS_SIZE || newHead.y < 0 || newHead.y >= CANVAS_SIZE) {
        return false;
    }
    
    for (let i = 0; i < snake.body.length - 1; i++) {
        if (snake.body[i].x === newHead.x && snake.body[i].y === newHead.y) {
            return false;
        }
    }
    
    for (let id in room.gameState.snakes) {
        if (id === snake.id) continue;
        
        const otherSnake = room.gameState.snakes[id];
        if (!otherSnake.alive) continue;
        
        for (let segment of otherSnake.body) {
            if (segment.x === newHead.x && segment.y === newHead.y) {
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
    
    room.interval = setInterval(() => {
        const state = room.gameState;
        if (state.status !== 'playing') return;

        clearOldTemporaryMessages(room);

        const aliveSnakes = Object.values(state.snakes).filter(s => s.alive);
        if (aliveSnakes.length <= 1) {
            endGame(pin, aliveSnakes);
            return;
        }

        for (let id in state.snakes) {
            const snake = state.snakes[id];
            if (!snake.alive) continue;

            if (snake.isBot) {
                const move = moveBot(snake, state.food, room);
                snake.dx = move.dx;
                snake.dy = move.dy;
            }

            snake.survivalTime += TICK_RATE / 1000;

            if (snake.survivalTime >= 30) {
                snake.speed = Math.min(snake.speed * 1.02, 8);
                snake.survivalTime = 0;
            }

            snake.moveCooldown -= 0.1;
            if (snake.moveCooldown <= 0) {
                const head = { 
                    x: snake.body[0].x + snake.dx, 
                    y: snake.body[0].y + snake.dy 
                };

                if (head.x < 0) head.x = CANVAS_SIZE - GRID_SIZE;
                else if (head.x >= CANVAS_SIZE) head.x = 0;
                if (head.y < 0) head.y = CANVAS_SIZE - GRID_SIZE;
                else if (head.y >= CANVAS_SIZE) head.y = 0;

                if (snake.body.slice(1).some(seg => seg.x === head.x && seg.y === head.y)) {
                    snake.alive = false;
                    const deathMessage = `${snake.name} mordeu a si mesmo!`;
                    addTemporaryMessage(room, deathMessage);
                    state.messages.push(deathMessage);
                    state.leaderboard.push({name: snake.name, score: snake.body.length});
                    continue;
                }

                let collision = false;
                for (let otherId in state.snakes) {
                    if (otherId === id) continue;
                    
                    const other = state.snakes[otherId];
                    if (!other.alive) continue;
                    
                    if (other.body.some(seg => seg.x === head.x && seg.y === head.y)) {
                        snake.alive = false;
                        const deathMessage = `${snake.name} Morreu pra ${other.name}!`;
                        addTemporaryMessage(room, deathMessage);
                        state.messages.push(deathMessage);
                        state.leaderboard.push({name: snake.name, score: snake.body.length});
                        collision = true;
                        break;
                    }
                }

                if (collision || !snake.alive) continue;

                snake.body.unshift(head);

                if (head.x === state.food.x && head.y === state.food.y) {
                    snake.speed = Math.min(snake.speed * 1.05, 8);
                    spawnFood(pin);
                } else {
                    snake.body.pop();
                }

                snake.moveCooldown = 1 / snake.speed;
            }
        }

        const finalAliveSnakes = Object.values(state.snakes).filter(s => s.alive);
        if (finalAliveSnakes.length <= 1) {
            endGame(pin, finalAliveSnakes);
            return;
        }

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
    
    if (aliveSnakes.length === 1) {
        const winner = aliveSnakes[0];
        state.leaderboard.unshift({
            name: winner.name, 
            score: winner.body.length,
            isWinner: true
        });
        const winMessage = `🎉 ${winner.name} venceu o jogo! 🎉`;
        addTemporaryMessage(room, winMessage);
        state.messages.push(winMessage);
    }
    
    for (let id in state.snakes) {
        const snake = state.snakes[id];
        const alreadyInLeaderboard = state.leaderboard.some(entry => entry.name === snake.name);
        if (!alreadyInLeaderboard) {
            state.leaderboard.push({
                name: snake.name,
                score: snake.body.length,
                isWinner: false
            });
        }
    }
    
    state.leaderboard.sort((a, b) => b.score - a.score);
    
    room.players.forEach(p => {
        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify({type: 'update', gameState: state}));
        }
    });
    
    if (room.interval) {
        clearInterval(room.interval);
        room.interval = null;
    }
    
    console.log(`Jogo finalizado na sala ${pin}. Vencedor: ${aliveSnakes.length > 0 ? aliveSnakes[0].name : 'Ninguém'}`);
}

// --- Lobby ---
function broadcastLobby(room) {
    const lobbyData = {
        type: 'lobbyUpdate',
        players: room.players.map(p => ({
            name: p.name,
            isBot: p.isBot,
            ready: p.ready
        }))
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
        '#FF55FF', '#55FFFF', '#FFAA00', '#AA00FF'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

// --- Inicia servidor ---
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
});