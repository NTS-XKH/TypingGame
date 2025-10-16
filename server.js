const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const PORT = process.env.PORT || 3000;

// ໃຫ້ເຊີບເວີສົ່ງໄຟລ໌ HTML, CSS, JS ໄປໃຫ້ຜູ້ຫຼິ້ນ
app.use(express.static(__dirname));

// === Game State on Server ===
let rooms = {};
const MAX_PLAYERS_PER_ROOM = 3;
const PLAYER_HP_START = 20;
const WORD_FALL_SPEED = 0.5;

// ຄຳສັບພາສາລາວສຳລັບເກມ
const laoCharacters = [
    'ກ', 'ຂ', 'ຄ', 'ງ', 'ຈ', 'ສ', 'ຊ', 'ຍ', 'ດ', 'ຕ',
    'ຖ', 'ທ', 'ນ', 'ບ', 'ປ', 'ຜ', 'ຝ', 'ພ', 'ຟ', 'ມ',
    'ຢ', 'ຣ', 'ລ', 'ວ', 'ຫ', 'ອ', 'ຮ',
    'ະ', 'າ', 'ິ', 'ີ', 'ຶ', 'ື', 'ຸ', 'ູ', 'ເ', 'ແ',
    'ໂ', 'ໃ', 'ໄ', 'ໍ', 'ັ', 'ົ', 'ຽ'
];

io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    socket.on('joinGame', (data) => {
        let roomId = findAvailableRoom();
        if (!roomId) {
            roomId = `room_${Date.now()}`;
            rooms[roomId] = {
                id: roomId,
                players: [],
                words: [],
                gameInProgress: false,
                gameLoopInterval: null,
                wordSpawnInterval: null,
                nextWordId: 0,
                startGameTimer: null
            };
        }

        socket.join(roomId);
        const player = {
            id: socket.id,
            name: data.name,
            isReady: false,
            hp: PLAYER_HP_START,
            score: 0,
            wordsTyped: 0,
            incorrectTypes: 0,
            ship: '🚀'
        };
        rooms[roomId].players.push(player);
        socket.roomId = roomId;

        socket.emit('joinSuccess');
        io.to(roomId).emit('updateRoom', rooms[roomId].players);

        if (rooms[roomId].players.length === MAX_PLAYERS_PER_ROOM) {
            if (rooms[roomId].startGameTimer) {
                clearTimeout(rooms[roomId].startGameTimer);
                rooms[roomId].startGameTimer = null;
            }
        } else if (rooms[roomId].players.length === 1) {
            rooms[roomId].startGameTimer = setTimeout(() => forceStartGame(roomId), 20000); // 20 ວິນາທີ
        }
    });

    socket.on('playerReady', () => {
        const roomId = socket.roomId;
        if (!rooms[roomId]) return;

        const player = rooms[roomId].players.find(p => p.id === socket.id);
        if (player) player.isReady = true;

        io.to(roomId).emit('updateRoom', rooms[roomId].players);

        const realPlayers = rooms[roomId].players.filter(p => !p.isAI);
        const allReady = realPlayers.every(p => p.isReady);

        if (allReady && rooms[roomId].players.length >= 1) {
            if (rooms[roomId].startGameTimer) clearTimeout(rooms[roomId].startGameTimer);
            forceStartGame(roomId); // Start immediately if all real players are ready
        }
    });

    socket.on('shoot', (data) => {
        const roomId = socket.roomId;
        const room = rooms[roomId];
        if (!room || !room.gameInProgress) return;

        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        let targetIndex = -1;
        let lowestY = -1;

        for (let i = 0; i < room.words.length; i++) {
            if (room.words[i].text === data.key) {
                if (room.words[i].y > lowestY) {
                    lowestY = room.words[i].y;
                    targetIndex = i;
                }
            }
        }

        if (targetIndex !== -1) {
            const targetWord = room.words[targetIndex];
            io.to(roomId).emit('playerShot', { shooterId: socket.id, targetId: targetWord.id });
            
            // Server confirms the hit and updates state
            setTimeout(() => {
                const wordExists = room.words.find(w => w.id === targetWord.id);
                if (wordExists) {
                    room.words.splice(room.words.findIndex(w => w.id === targetWord.id), 1);
                    player.score += 10;
                    player.wordsTyped++;
                    io.to(roomId).emit('wordDestroyed', { wordId: targetWord.id, explosionX: targetWord.x, explosionY: targetWord.y });
                }
            }, 250); // Delay to allow bullet animation

        } else {
            player.incorrectTypes++;
            player.hp--;
            io.to(roomId).emit('mistype', { playerId: socket.id });
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        const roomId = socket.roomId;
        if (!rooms[roomId]) return;

        if (rooms[roomId].startGameTimer && rooms[roomId].players.length <= 2) {
            clearTimeout(rooms[roomId].startGameTimer);
        }
        rooms[roomId].players = rooms[roomId].players.filter(p => p.id !== socket.id);

        if (rooms[roomId].players.length === 0) {
            console.log(`Room ${roomId} is empty, deleting.`);
            clearInterval(rooms[roomId].wordSpawnInterval);
            clearInterval(rooms[roomId].gameLoopInterval);
            delete rooms[roomId];
        } else {
            io.to(roomId).emit('updateRoom', rooms[roomId].players);
        }
    });
});

function findAvailableRoom() {
    for (const roomId in rooms) {
        if (rooms[roomId].players.length < MAX_PLAYERS_PER_ROOM && !rooms[roomId].gameInProgress) {
            return roomId;
        }
    }
    return null;
}

function forceStartGame(roomId) {
    const room = rooms[roomId];
    if (!room || room.gameInProgress) return;

    console.log(`Force starting game for room ${roomId}.`);

    while (room.players.length < MAX_PLAYERS_PER_ROOM) {
        const roboxId = `robox_${room.players.length}_${roomId}`;
        room.players.push({
            id: roboxId, name: `Robox ${room.players.length}`, isReady: true, isAI: true,
            hp: PLAYER_HP_START, score: 0, wordsTyped: 0, incorrectTypes: 0, ship: '🛸'
        });
    }

    io.to(roomId).emit('allPlayersReady');
    setTimeout(() => startGameForRoom(roomId), 5000); // Wait 5 seconds after countdown
}

function startGameForRoom(roomId) {
    const room = rooms[roomId];
    if (!room || room.gameInProgress) return;

    console.log(`Starting game for room ${roomId}`);
    room.gameInProgress = true;

    io.to(roomId).emit('gameStarted', room.players);

    room.wordSpawnInterval = setInterval(() => {
        const text = laoCharacters[Math.floor(Math.random() * laoCharacters.length)];
        const newWord = {
            id: room.nextWordId++,
            text: text,
            x: Math.random() * (700) + 50, // Assuming canvas width is around 800
            y: 0
        };
        room.words.push(newWord);
    }, 2000);

    room.gameLoopInterval = setInterval(() => {
        // Update word positions
        for (let i = room.words.length - 1; i >= 0; i--) {
            const word = room.words[i];
            word.y += WORD_FALL_SPEED;

            if (word.y > 500) { // Assuming canvas height is 500
                room.words.splice(i, 1);
                room.players.forEach(p => { if (!p.isAI) p.hp--; });
            }
        }

        // AI Logic
        const aiPlayers = room.players.filter(p => p.isAI);
        const dangerousWords = room.words.filter(w => w.y > 250);
        if (dangerousWords.length > 0 && aiPlayers.length > 0) {
            aiPlayers.forEach(ai => {
                if (Math.random() < 0.02) {
                    const targetWord = dangerousWords[0];
                    io.to(roomId).emit('playerShot', { shooterId: ai.id, targetId: targetWord.id });
                    setTimeout(() => {
                        const wordExists = room.words.find(w => w.id === targetWord.id);
                        if (wordExists) {
                            room.words.splice(room.words.findIndex(w => w.id === targetWord.id), 1);
                            ai.score += 10;
                            io.to(roomId).emit('wordDestroyed', { wordId: targetWord.id, explosionX: targetWord.x, explosionY: targetWord.y });
                        }
                    }, 250);
                }
            });
        }

        // Send updated state to all clients
        io.to(roomId).emit('updateGameState', { players: room.players, words: room.words });

        // Check for game over
        const realPlayers = room.players.filter(p => !p.isAI);
        if (realPlayers.length > 0 && realPlayers.every(p => p.hp <= 0)) {
            io.to(roomId).emit('gameOver', realPlayers);
            clearInterval(room.wordSpawnInterval);
            clearInterval(room.gameLoopInterval);
            delete rooms[roomId];
        }
    }, 1000 / 60); // 60 FPS
}

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
