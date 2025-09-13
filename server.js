// --- Importações ---
const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

// --- Configurações ---
const GRID_SIZE = 20;
const CANVAS_SIZE = 800;
const MAX_PLAYERS = 4;
const TICK_RATE = 100; // 10 FPS (mais estável)

// --- Servidor HTTP + Express ---
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Servir frontend
app.use(express.static(path.join(__dirname, 'public')));

// --- Estrutura de salas ---
let rooms = {}; // { pin: { players: [], gameState, interval } }

// --- Criar sala ---
function createRoom(pin) {
    rooms[pin] = {
        players: [],
        gameState: {
            snakes: {},       // playerId -> {body, dx, dy, alive, name, speed, moveCooldown, isBot}
            food: { x: 0, y: 0 },
            status: 'waiting',
            leaderboard: [],
            messages: [],
            temporaryMessages: [] // Novidade: mensagens temporárias
        }
    };
    spawnFood(pin);
}

// --- Spawn comida ---
function spawnFood(pin) {
    const room = rooms[pin];
    if (!room) return;
    
    // Calcula os limites válidos para a comida (evita aparecer muito perto das bordas)
    const gridCellsX = CANVAS_SIZE / GRID_SIZE;
    const gridCellsY = CANVAS_SIZE / GRID_SIZE;
    
    // Define uma margem de segurança (2 células das bordas)
    const margin = 2;
    const minX = margin;
    const maxX = gridCellsX - margin - 1;
    const minY = margin;
    const maxY = gridCellsY - margin - 1;
    
    // Tenta encontrar uma posição válida (evita loop infinito)
    let attempts = 0;
    let foodPos;
    let valid = false;
    
    while (!valid && attempts < 100) {
        attempts++;
        
        // Gera posição dentro dos limites seguros
        const gridX = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
        const gridY = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
        
        foodPos = {
            x: gridX * GRID_SIZE,
            y: gridY * GRID_SIZE
        };
        
        valid = true;
        // Verifica se não está em cima de nenhuma cobra
        for (let id in room.gameState.snakes) {
            const snake = room.gameState.snakes[id];
            if (snake.body.some(segment => segment.x === foodPos.x && segment.y === foodPos.y)) {
                valid = false;
                break;
            }
        }
    }
    
    // Se não encontrou posição válida após 100 tentativas, usa fallback
    if (!valid) {
        // Fallback: posição aleatória segura
        const gridX = Math.floor(Math.random() * (maxX - minX + 1)) + minX;
        const gridY = Math.floor(Math.random() * (maxY - minY + 1)) + minY;
        foodPos = {
            x: gridX * GRID_SIZE,
            y: gridY * GRID_SIZE
        };
    }
    
    room.gameState.food = foodPos;
    console.log(`Comida gerada em: ${foodPos.x}, ${foodPos.y}`);
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

    // Gera posição inicial segura (longe das bordas)
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

    // Preenche com bots se necessário
    if (room.players.length < MAX_PLAYERS && room.players.length === 1) {
        addBot(pin);
        addBot(pin);
    }
}

// --- Jogador solo ---
function handleSolo(ws, data) {
    const pin = generateTempPIN();
    createRoom(pin);
    
    // Adiciona alguns bots para o modo solo
    addBot(pin);
    addBot(pin);
    addBot(pin);
    
    // Agora adiciona o jogador humano
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
    
    // Gera posição inicial segura (longe das bordas)
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
        speed: 2.5, // Bots um pouco mais lentos
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

    // Previne movimento inverso (virar 180 graus)
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

    if (room.players.every(p => p.ready)) {
        room.gameState.status = 'playing';
        startGame(room.pin);
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
    
    // Se a sala ficar vazia, remove ela
    if (room.players.length === 0) {
        if (room.interval) {
            clearInterval(room.interval);
        }
        delete rooms[ws.roomPin];
    } else {
        broadcastLobby(room);
    }
}

// --- Movimento de bot simples ---
function moveBot(snake, food) {
    // 30% de chance de movimento aleatório
    if (Math.random() < 0.3) {
        const directions = [
            {dx: GRID_SIZE, dy: 0},   // direita
            {dx: -GRID_SIZE, dy: 0},  // esquerda
            {dx: 0, dy: GRID_SIZE},   // baixo
            {dx: 0, dy: -GRID_SIZE}   // cima
        ];
        
        // Filtra direções que não são opostas à atual
        const validDirections = directions.filter(dir => 
            !(dir.dx === -snake.dx && dir.dy === -snake.dy)
        );
        
        return validDirections[Math.floor(Math.random() * validDirections.length)];
    }
    
    // 70% de chance de ir em direção à comida
    const head = snake.body[0];
    let dx = 0, dy = 0;
    
    if (head.x < food.x) dx = GRID_SIZE;
    else if (head.x > food.x) dx = -GRID_SIZE;
    
    if (head.y < food.y) dy = GRID_SIZE;
    else if (head.y > food.y) dy = -GRID_SIZE;
    
    // Previne movimento inverso
    if ((dx !== 0 && dx === -snake.dx) || (dy !== 0 && dy === -snake.dy)) {
        return { dx: snake.dx, dy: snake.dy };
    }
    
    // Se já está se movendo na direção correta, mantém
    if ((dx !== 0 && dx === snake.dx) || (dy !== 0 && dy === snake.dy)) {
        return { dx: snake.dx, dy: snake.dy };
    }
    
    // Prioriza o eixo com maior diferença
    if (Math.abs(head.x - food.x) > Math.abs(head.y - food.y)) {
        return { dx, dy: 0 };
    } else {
        return { dx: 0, dy };
    }
}

// --- Adicionar mensagem temporária ---
function addTemporaryMessage(room, message) {
    const timestamp = Date.now();
    room.gameState.temporaryMessages.push({ text: message, timestamp });
    
    // Limita a 5 mensagens temporárias
    if (room.gameState.temporaryMessages.length > 5) {
        room.gameState.temporaryMessages.shift();
    }
}

// --- Limpar mensagens temporárias antigas ---
function clearOldTemporaryMessages(room) {
    const now = Date.now();
    room.gameState.temporaryMessages = room.gameState.temporaryMessages.filter(
        msg => now - msg.timestamp < 5000 // Mantém por 5 segundos
    );
}

// --- Loop do jogo ---
function startGame(pin) {
    const room = rooms[pin];
    if (!room || room.interval) return;
    
    room.interval = setInterval(() => {
        const state = room.gameState;
        if (state.status !== 'playing') return;

        // Limpa mensagens temporárias antigas
        clearOldTemporaryMessages(room);

        // Verifica se o jogo já terminou
        const aliveSnakes = Object.values(state.snakes).filter(s => s.alive);
        if (aliveSnakes.length <= 1) {
            endGame(pin, aliveSnakes);
            return;
        }

        for (let id in state.snakes) {
            const snake = state.snakes[id];
            if (!snake.alive) continue;

            // Bot
            if (snake.isBot) {
                const move = moveBot(snake, state.food);
                snake.dx = move.dx;
                snake.dy = move.dy;
            }

            // Tempo de sobrevivência
            snake.survivalTime += TICK_RATE / 1000;

            // Aumento de velocidade a cada 30s (mais balanceado)
            if (snake.survivalTime >= 30) {
                snake.speed = Math.min(snake.speed * 1.02, 8); // Limite máximo de velocidade
                snake.survivalTime = 0;
            }

            snake.moveCooldown -= 0.1;
            if (snake.moveCooldown <= 0) {
                const head = { 
                    x: snake.body[0].x + snake.dx, 
                    y: snake.body[0].y + snake.dy 
                };

                // Colisão parede (teleporte para o lado oposto)
                if (head.x < 0) head.x = CANVAS_SIZE - GRID_SIZE;
                else if (head.x >= CANVAS_SIZE) head.x = 0;
                if (head.y < 0) head.y = CANVAS_SIZE - GRID_SIZE;
                else if (head.y >= CANVAS_SIZE) head.y = 0;

                // Colisão com próprio corpo
                if (snake.body.slice(1).some(seg => seg.x === head.x && seg.y === head.y)) {
                    snake.alive = false;
                    const deathMessage = `${snake.name} mordeu a si mesmo!`;
                    addTemporaryMessage(room, deathMessage);
                    state.messages.push(deathMessage);
                    state.leaderboard.push({name: snake.name, score: snake.body.length});
                    continue;
                }

                // Colisão com outras cobras
                let collision = false;
                for (let otherId in state.snakes) {
                    if (otherId === id) continue; // Pula verificação com si mesmo
                    
                    const other = state.snakes[otherId];
                    if (!other.alive) continue;
                    
                    if (other.body.some(seg => seg.x === head.x && seg.y === head.y)) {
                        snake.alive = false;
                        const deathMessage = `${snake.name} colidiu com ${other.name}!`;
                        addTemporaryMessage(room, deathMessage);
                        state.messages.push(deathMessage);
                        state.leaderboard.push({name: snake.name, score: snake.body.length});
                        collision = true;
                        break;
                    }
                }

                if (collision || !snake.alive) continue;

                snake.body.unshift(head);

                // Comida
                if (head.x === state.food.x && head.y === state.food.y) {
                    snake.speed = Math.min(snake.speed * 1.05, 8); // Aumento menor de velocidade
                    spawnFood(pin);
                } else {
                    snake.body.pop();
                }

                snake.moveCooldown = 1 / snake.speed;
            }
        }

        // Verifica novamente se o jogo terminou após processar todos os movimentos
        const finalAliveSnakes = Object.values(state.snakes).filter(s => s.alive);
        if (finalAliveSnakes.length <= 1) {
            endGame(pin, finalAliveSnakes);
            return;
        }

        // Atualiza jogadores humanos
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
    
    // Adiciona o vencedor ao leaderboard se houver
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
    
    // Adiciona todos os jogadores ao leaderboard se ainda não estiverem
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
    
    // Ordena o leaderboard por pontuação (maior primeiro)
    state.leaderboard.sort((a, b) => b.score - a.score);
    
    // Envia estado final para todos os jogadores
    room.players.forEach(p => {
        if (p.ws && p.ws.readyState === WebSocket.OPEN) {
            p.ws.send(JSON.stringify({type: 'update', gameState: state}));
        }
    });
    
    // Para o intervalo do jogo
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
server.listen(8080, () => {
    console.log('Servidor rodando em http://localhost:8080');
});