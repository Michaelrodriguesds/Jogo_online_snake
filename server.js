// 🐍 SNAKE MULTIPLAYER — SERVIDOR
// Grid canônico fixo 800×600 / GRID 20px
// PC + Mobile usam o MESMO espaço de coordenadas
const express   = require('express');
const http      = require('http');
const path      = require('path');
const WebSocket = require('ws');

const GRID_SIZE   = 20;
const CANVAS_W    = 800;
const CANVAS_H    = 600;
const COLS        = CANVAS_W / GRID_SIZE;  // 40
const ROWS        = CANVAS_H / GRID_SIZE;  // 30
const MAX_PLAYERS = 4;
const TICK_RATE   = 320;   // ms — 3.1 mov/s (velocidade clássica snake)
const AUTO_START  = 120;   // segundos

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });
app.use(express.static(path.join(__dirname, 'public')));

let rooms           = {};
let globalChatUsers = [];

const PREDEFINED = [
    '😎 Show!','😱 Nossa!','😂 Haha!','🔥 Fire!',
    '💪 Força!','😢 Noooo!','🎯 Foco!','⚡ Go!',
    '🏆 Top!','😵 Ops!'
];
const COLORS = [
    '#FF6B6B','#4ECDC4','#45B7D1','#FFD93D',
    '#C3B1E1','#98D8C8','#FFA07A','#7ED6DF'
];

// ── SALA ──────────────────────────────────────
function createRoom(pin) {
    rooms[pin] = {
        players: [],
        gameState: {
            snakes:{}, food:{x:0,y:0}, status:'waiting',
            gridSize:GRID_SIZE, canvasW:CANVAS_W, canvasH:CANVAS_H,
            leaderboard:[], messages:[], temporaryMessages:[], chatMessages:[]
        },
        autoInterval:null, autoRemaining:AUTO_START,
        startTime:null, interval:null, isSoloMode:false
    };
    spawnFood(pin);
}

function spawnFood(pin) {
    const room = rooms[pin]; if (!room) return;
    const mg = 2; let pos, ok=false, t=0;
    while (!ok && t++<300) {
        pos = {
            x:(Math.floor(Math.random()*(COLS-mg*2))+mg)*GRID_SIZE,
            y:(Math.floor(Math.random()*(ROWS-mg*2))+mg)*GRID_SIZE
        };
        ok = Object.values(room.gameState.snakes).every(s=>!s.body.some(b=>b.x===pos.x&&b.y===pos.y));
    }
    room.gameState.food = pos||{x:GRID_SIZE*5,y:GRID_SIZE*5};
}

function createSnake(room, id, name, isBot) {
    const mg=3, ci=Object.keys(room.gameState.snakes).length%COLORS.length;
    let pos, ok=false, t=0;
    while (!ok && t++<200) {
        pos = {
            x:(Math.floor(Math.random()*(COLS-mg*2))+mg)*GRID_SIZE,
            y:(Math.floor(Math.random()*(ROWS-mg*2))+mg)*GRID_SIZE
        };
        ok = Object.values(room.gameState.snakes).every(s=>!s.body.some(b=>b.x===pos.x&&b.y===pos.y));
    }
    room.gameState.snakes[id] = {
        body:[pos], dx:GRID_SIZE, dy:0,
        color:COLORS[ci], name, alive:true, isBot,
        deathTime:null, tempMessage:null
    };
}

// ── WEBSOCKET ─────────────────────────────────
wss.on('connection', ws => {
    ws.on('message', raw => {
        try {
            const d = JSON.parse(raw);
            switch(d.type) {
                case 'join':        handleJoin(ws,d);       break;
                case 'solo':        handleSolo(ws,d);       break;
                case 'move':        handleMove(ws,d);       break;
                case 'ready':       handleReady(ws);        break;
                case 'startGame':   handleStartGame(ws);    break;
                case 'chat':        handleChat(ws,d);       break;
                case 'globalChat':  handleGlobalChat(ws,d); break;
                case 'gameMessage': handleGameMsg(ws,d);    break;
                case 'restartGame': handleRestart(ws);      break;
            }
        } catch(e){ console.error(e); }
    });
    ws.on('close', ()=>handleDisconnect(ws));
    ws.on('error', e=>console.error(e));
});

// ── JOIN ──────────────────────────────────────
function handleJoin(ws, d) {
    const pin=(d.pin||'').trim()||genPIN(), name=san(d.name,'Player');
    if (!rooms[pin]) createRoom(pin);
    const room=rooms[pin];
    if (room.players.length>=MAX_PLAYERS) return send(ws,{type:'error',message:'Sala cheia!'});
    if (room.gameState.status==='playing')  return send(ws,{type:'error',message:'Jogo já iniciado!'});
    const pid=newId(); ws.playerId=pid; ws.roomPin=pin;
    room.players.push({ws,id:pid,name,ready:false,isBot:false});
    createSnake(room,pid,name,false);
    send(ws,{type:'joined',playerId:pid,pin,players:room.players.map(pI),gameState:room.gameState,predefinedMessages:PREDEFINED});
    broadcastLobby(pin);
    if (room.players.filter(p=>!p.isBot).length===1 && !room.isSoloMode) startAutoTimer(pin);
}

// ── SOLO ──────────────────────────────────────
function handleSolo(ws, d) {
    const pin='s'+Date.now(), name=san(d.name,'Player');
    createRoom(pin);
    const room=rooms[pin]; room.isSoloMode=true;
    const pid=newId(); ws.playerId=pid; ws.roomPin=pin;
    room.players.push({ws,id:pid,name,ready:true,isBot:false});
    createSnake(room,pid,name,false);
    ['Bot1','Bot2','Bot3'].forEach((bn,i)=>{
        const bid='bot'+(i+1);
        room.players.push({ws:null,id:bid,name:bn,ready:true,isBot:true});
        createSnake(room,bid,bn,true);
    });
    send(ws,{type:'joined',playerId:pid,pin,players:room.players.map(pI),gameState:room.gameState,predefinedMessages:PREDEFINED});
    setTimeout(()=>startGame(pin),1200);
}

// ── READY ─────────────────────────────────────
function handleReady(ws) {
    const room=rooms[ws.roomPin]; if (!room) return;
    const p=room.players.find(p=>p.ws===ws); if (!p) return;
    p.ready=true; broadcastLobby(ws.roomPin);
    if (room.players.every(p=>p.ready)&&room.players.length>=2&&room.gameState.status==='waiting') {
        clearAutoTimer(ws.roomPin); setTimeout(()=>startGame(ws.roomPin),500);
    }
}
function handleStartGame(ws) { clearAutoTimer(ws.roomPin); startGame(ws.roomPin); }

// ── AUTO TIMER ────────────────────────────────
function startAutoTimer(pin) {
    const room=rooms[pin]; if (!room||room.autoInterval) return;
    room.autoRemaining=AUTO_START;
    bcastAll(pin,{type:'timeUpdate',timeRemaining:AUTO_START});
    room.autoInterval=setInterval(()=>{
        room.autoRemaining--;
        bcastAll(pin,{type:'timeUpdate',timeRemaining:Math.max(0,room.autoRemaining)});
        if (room.autoRemaining<=0) { clearAutoTimer(pin); if (room.gameState.status==='waiting') startGame(pin); }
    },1000);
}
function clearAutoTimer(pin) {
    const room=rooms[pin]; if (!room) return;
    if (room.autoInterval) { clearInterval(room.autoInterval); room.autoInterval=null; }
    bcastAll(pin,{type:'timeUpdate',timeRemaining:0});
}

// ── START GAME ────────────────────────────────
function startGame(pin) {
    const room=rooms[pin];
    if (!room||room.gameState.status!=='waiting') return;
    room.gameState.status='playing'; room.startTime=Date.now();
    bcastAll(pin,{type:'update',gameState:room.gameState});
    room.interval=setInterval(()=>gameLoop(pin),TICK_RATE);
    console.log('Jogo iniciado → sala '+pin);
}

// ── GAME LOOP ─────────────────────────────────
function gameLoop(pin) {
    const room=rooms[pin];
    if (!room||room.gameState.status!=='playing') return;
    const gs=room.gameState, now=Date.now();

    for (const id in gs.snakes) {
        const s=gs.snakes[id]; if (!s.alive) continue;

        // Bot AI
        if (s.isBot) { const m=botMove(s,gs.food,gs.snakes); s.dx=m.dx; s.dy=m.dy; }

        // Wraparound no espaço canônico 800×600
        const head = {
            x:((s.body[0].x+s.dx)+CANVAS_W)%CANVAS_W,
            y:((s.body[0].y+s.dy)+CANVAS_H)%CANVAS_H
        };

        if (head.x===gs.food.x&&head.y===gs.food.y) { s.body.unshift(head); spawnFood(pin); }
        else { s.body.unshift(head); s.body.pop(); }

        // Colisões
        let dead=s.body.slice(1).some(b=>b.x===head.x&&b.y===head.y);
        if (!dead) for (const oid in gs.snakes) {
            if (oid===id||!gs.snakes[oid].alive) continue;
            if (gs.snakes[oid].body.some(b=>b.x===head.x&&b.y===head.y)) { dead=true; break; }
        }
        if (dead) {
            s.alive=false; s.deathTime=now;
            gs.temporaryMessages.push({text:'💀 '+s.name+' morreu!',timestamp:now});
            if (gs.temporaryMessages.length>5) gs.temporaryMessages.shift();
            bcastAll(pin,{type:'playerDied',playerId:id,playerName:s.name,color:s.color,timestamp:now});
        }
        if (s.tempMessage&&now-s.tempMessage.timestamp>s.tempMessage.duration) s.tempMessage=null;
    }

    gs.temporaryMessages=gs.temporaryMessages.filter(m=>now-m.timestamp<5000);
    const alive=Object.values(gs.snakes).filter(s=>s.alive);
    if (alive.length<=1) { endGame(pin); return; }
    bcastAll(pin,{type:'update',gameState:gs});
}

// ── BOT AI ────────────────────────────────────
function botMove(snake, food, snakes) {
    const h=snake.body[0];
    const dirs=[{dx:GRID_SIZE,dy:0},{dx:-GRID_SIZE,dy:0},{dx:0,dy:GRID_SIZE},{dx:0,dy:-GRID_SIZE}];
    const safe=dirs.filter(d=>{
        if (d.dx===-snake.dx&&d.dy===-snake.dy) return false;
        const nx=((h.x+d.dx)+CANVAS_W)%CANVAS_W, ny=((h.y+d.dy)+CANVAS_H)%CANVAS_H;
        return !Object.values(snakes).some(s=>s.alive&&s.body.some(b=>b.x===nx&&b.y===ny));
    });
    if (!safe.length) return {dx:snake.dx,dy:snake.dy};
    if (Math.random()<0.8) {
        safe.sort((a,b)=>(Math.abs(h.x+a.dx-food.x)+Math.abs(h.y+a.dy-food.y))-(Math.abs(h.x+b.dx-food.x)+Math.abs(h.y+b.dy-food.y)));
        return safe[0];
    }
    return safe[Math.floor(Math.random()*safe.length)];
}

// ── FIM DE JOGO ───────────────────────────────
function endGame(pin) {
    const room=rooms[pin]; if (!room) return;
    clearInterval(room.interval); room.interval=null;
    const et=Date.now(), sn=room.gameState.snakes;
    const alive=Object.values(sn).filter(s=>s.alive)
        .map(s=>({name:s.name,score:s.body.length,alive:true,survivalTime:room.startTime?Math.floor((et-room.startTime)/1000):0}))
        .sort((a,b)=>b.score-a.score);
    const dead=Object.values(sn).filter(s=>!s.alive)
        .map(s=>({name:s.name,score:s.body.length,alive:false,
            survivalTime:(s.deathTime&&room.startTime)?Math.floor((s.deathTime-room.startTime)/1000):0,
            deathTime:s.deathTime||0}))
        .sort((a,b)=>b.deathTime-a.deathTime);
    room.gameState.leaderboard=[...alive,...dead].slice(0,4);
    room.gameState.status='ended';
    console.log('🏆 Fim sala '+pin+' – '+(room.gameState.leaderboard[0]?.name));
    bcastAll(pin,{type:'gameEnd',gameState:room.gameState});
}

// ── MOVE ──────────────────────────────────────
function handleMove(ws, d) {
    const room=rooms[ws.roomPin]; if (!room||room.gameState.status!=='playing') return;
    const s=room.gameState.snakes[ws.playerId]; if (!s||!s.alive) return;
    const dx=Number(d.dx), dy=Number(d.dy);
    const v=[GRID_SIZE,-GRID_SIZE,0];
    if (!v.includes(dx)||!v.includes(dy)||(dx===0&&dy===0)) return;
    if ((s.dx===GRID_SIZE&&dx===-GRID_SIZE)||(s.dx===-GRID_SIZE&&dx===GRID_SIZE)) return;
    if ((s.dy===GRID_SIZE&&dy===-GRID_SIZE)||(s.dy===-GRID_SIZE&&dy===GRID_SIZE)) return;
    s.dx=dx; s.dy=dy;
}

// ── CHAT ──────────────────────────────────────
function handleGameMsg(ws, d) {
    const room=rooms[ws.roomPin]; if (!room||room.gameState.status!=='playing') return;
    const s=room.gameState.snakes[ws.playerId]; if (!s||!s.alive) return;
    s.tempMessage={text:san(d.message,'').substring(0,40),timestamp:Date.now(),duration:3500};
    bcastAll(ws.roomPin,{type:'update',gameState:room.gameState});
}
function handleChat(ws, d) {
    const room=rooms[ws.roomPin]; if (!room) return;
    const player=room.players.find(p=>p.ws===ws); if (!player) return;
    const msg={name:player.name,message:san(d.message,'').substring(0,120),timestamp:Date.now()};
    room.gameState.chatMessages.push(msg);
    if (room.gameState.chatMessages.length>40) room.gameState.chatMessages.shift();
    bcastAll(ws.roomPin,{type:'chatUpdate',message:msg});
}
function handleGlobalChat(ws, d) {
    const msg={name:san(d.name,'Anon').substring(0,15),message:san(d.message,'').substring(0,120),timestamp:Date.now()};
    if (!globalChatUsers.find(u=>u.ws===ws)) globalChatUsers.push({ws,name:msg.name});
    const payload=JSON.stringify({type:'globalChatUpdate',message:msg});
    globalChatUsers.forEach(u=>{if(u.ws?.readyState===WebSocket.OPEN)u.ws.send(payload);});
    globalChatUsers=globalChatUsers.filter(u=>u.ws.readyState===WebSocket.OPEN);
}

// ── RESTART / DISCONNECT ──────────────────────
function handleRestart(ws) {
    const room=rooms[ws.roomPin]; if (!room||room.gameState.status!=='ended') return;
    Object.assign(room.gameState,{status:'waiting',snakes:{},leaderboard:[],messages:[],temporaryMessages:[]});
    room.startTime=null;
    room.players.forEach(p=>{createSnake(room,p.id,p.name,p.isBot); p.ready=p.isBot;});
    spawnFood(ws.roomPin); broadcastLobby(ws.roomPin);
    if (room.isSoloMode) setTimeout(()=>startGame(ws.roomPin),1200); else startAutoTimer(ws.roomPin);
}
function handleDisconnect(ws) {
    globalChatUsers=globalChatUsers.filter(u=>u.ws!==ws);
    const pin=ws.roomPin; if (!pin||!rooms[pin]) return;
    const room=rooms[pin], idx=room.players.findIndex(p=>p.ws===ws); if (idx===-1) return;
    console.log(room.players[idx].name+' saiu da sala '+pin);
    room.players.splice(idx,1); delete room.gameState.snakes[ws.playerId];
    if (!room.players.filter(p=>!p.isBot).length) {
        if (room.interval) clearInterval(room.interval);
        if (room.autoInterval) clearInterval(room.autoInterval);
        delete rooms[pin];
    } else {
        broadcastLobby(pin);
        if (room.gameState.status==='playing'&&Object.values(room.gameState.snakes).filter(s=>s.alive).length<=1) endGame(pin);
    }
}

// ── HELPERS ───────────────────────────────────
function broadcastLobby(pin) {
    const room=rooms[pin]; if (!room) return;
    bcastAll(pin,{type:'lobbyUpdate',players:room.players.map(pI),gameState:{status:room.gameState.status}});
}
function bcastAll(pin, obj) {
    const room=rooms[pin]; if (!room) return;
    const payload=JSON.stringify(obj);
    room.players.forEach(p=>{if(p.ws?.readyState===WebSocket.OPEN)p.ws.send(payload);});
}
function send(ws,obj)  {if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}
function pI(p)         {return{name:p.name,ready:p.ready,isBot:p.isBot};}
function newId()       {return 'p'+Date.now()+Math.random().toString(36).substr(2,5);}
function genPIN()      {return Math.floor(1000+Math.random()*9000).toString();}
function san(v,fb)     {return(typeof v==='string'?v.trim():'')||fb;}

const PORT=process.env.PORT||8080;
server.listen(PORT,()=>console.log(`
╔══════════════════════════════════════════╗
║  🐍 SNAKE MULTIPLAYER                   ║
║  Grid: ${CANVAS_W}x${CANVAS_H} / ${GRID_SIZE}px — ${COLS}x${ROWS} células   ║
║  Tick: ${TICK_RATE}ms | PC+Mobile sync ✅        ║
║  Porta: ${PORT}                              ║
╚══════════════════════════════════════════╝`));