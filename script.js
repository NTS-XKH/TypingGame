// === Multiplayer Setup ===
const socket = io();

// ອົງປະກອບຕ່າງໆໃນໜ້າ HTML
const loginScreen = document.getElementById('login-screen');
const playerNameInput = document.getElementById('player-name-input');
const joinButton = document.getElementById('join-button');
const gameWrapper = document.getElementById('game-wrapper');
const gameTitle = document.getElementById('game-title');

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

const wordDisplay = document.getElementById('word-display');
const wordInput = document.getElementById('word-input');
const startButton = document.getElementById('start-button');
const winnerModal = document.getElementById('winner-modal');
const winnerMessage = document.getElementById('winner-message');
const scoreboardDiv = document.getElementById('scoreboard');
const playAgainButton = document.getElementById('play-again-button');
const readyButton = document.getElementById('ready-button');

const playerHpDisplay = document.getElementById('player-hp');
const playerScoreDisplay = document.getElementById('player-score');

// === Game Settings ===
const PLAYER_HP_START = 20;
const BULLET_SPEED = 5;

// === Game State ===
let players = [];
let wordsOnScreen = [];
let bullets = [];
let explosions = [];
let gameInProgress = false;

// ເພີ່ມ Event Listener ສໍາລັບການກົດຄີບອດ
window.addEventListener('keydown', handleKeyPress);
readyButton.addEventListener('click', handleReadyClick);
startButton.addEventListener('click', () => {
    alert("ປຸ່ມນີ້ໃຊ້ບໍ່ໄດ້ໃນໂໝດອອນລາຍ. ກະລຸນາລໍຖ້າໝູ່ ແລ້ວກົດ 'ພ້ອມ'.");
});


// ເຂົ້າຮ່ວມເກມ
joinButton.addEventListener('click', joinGame);
playerNameInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        joinGame();
    }
});

function joinGame() {
    const playerName = playerNameInput.value.trim();
    if (playerName) {
        // ສົ່ງຊື່ໄປໃຫ້ເຊີບເວີເພື່ອເຂົ້າຮ່ວມ
        socket.emit('joinGame', { name: playerName });
    }
}

function handleReadyClick() {
    readyButton.disabled = true;
    readyButton.textContent = 'ກຳລັງລໍ...';
    socket.emit('playerReady');
}

function showCountdown(message) {
    ctx.font = '22px Noto Sans Lao';
    ctx.fillStyle = '#00FF00'; // ສີຂຽວ
    ctx.fillText(message, canvas.width / 2, canvas.height - 50);
}

function drawWaitingRoom(message = 'ກົດ "ພ້ອມ" ເພື່ອເລີ່ມ') {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.font = '20px Noto Sans Lao';
    ctx.fillText(`ກຳລັງລໍຖ້າຜູ້ຫຼິ້ນ... (${players.length}/3)`, canvas.width / 2, canvas.height / 2);

    // ສະແດງລາຍຊື່ຜູ້ຫຼິ້ນ
    players.forEach((player, index) => {
        const status = player.isReady ? '✅ (ພ້ອມ)' : '... (ກຳລັງລໍ)';
        ctx.font = '18px Noto Sans Lao';
        ctx.fillText(`${player.name} ${status}`, canvas.width / 2, canvas.height / 2 + 40 + (index * 30));
    });

    showCountdown(message);
}

// ເລີ່ມເກມ
playAgainButton.addEventListener('click', resetGameToLogin);

function startGame() {
    // Reset game state
    winnerModal.classList.add('hidden');
    readyButton.classList.add('hidden'); // ຮັບປະກັນວ່າປຸ່ມພ້ອມຖືກເຊື່ອງໄວ້
    startButton.classList.add('hidden'); // ເຊື່ອງປຸ່ມເລີ່ມເກມເມື່ອເກມເລີ່ມແລ້ວ
    gameInProgress = true;
    wordsOnScreen = [];
    bullets = [];
    explosions = [];

    // Setup canvas size
    canvas.width = gameWrapper.offsetWidth || 800;
    canvas.height = 500;

    // ຕັ້ງຄ່າຕຳແໜ່ງຍົນຂອງທຸກຄົນ
    const playerPositions = [canvas.width / 4, canvas.width / 2, (canvas.width / 4) * 3];
    const mainPlayerIndex = players.findIndex(p => p.id === socket.id);
    
    // ຈັດໃຫ້ຜູ້ຫຼິ້ນຫຼັກຢູ່ກາງສະເໝີ
    if (mainPlayerIndex !== -1) {
        const middleIndex = Math.floor(players.length / 2);
        [players[middleIndex], players[mainPlayerIndex]] = [players[mainPlayerIndex], players[middleIndex]];
    }

    players.forEach((player, index) => player.x = playerPositions[index]);
    players.forEach(p => p.y = canvas.height - 40);

    // Start game loop
    gameLoop();
}

function handleKeyPress(event) {
    if (!gameInProgress) return;

    const keyPressed = event.key;
    // ບອກເຊີບເວີວ່າກົດປຸ່ມຫຍັງ
    socket.emit('shoot', { key: keyPressed });
}

function gameLoop() {
    if (!gameInProgress) return;

    // 1. Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 2. Update and Draw Players
    players.forEach(player => {
        ctx.font = '30px Noto Sans Lao';
        ctx.textAlign = 'center';
        ctx.fillText(player.ship, player.x, player.y);
        ctx.font = '14px Noto Sans Lao';
        ctx.fillStyle = 'white';
        ctx.fillText(player.name, player.x, player.y + 20);
    });

    // 3. Update and Draw Words
    for (let i = wordsOnScreen.length - 1; i >= 0; i--) {
        const word = wordsOnScreen[i];
        ctx.font = '20px Noto Sans Lao';
        ctx.fillStyle = 'cyan';
        ctx.textAlign = 'center';
        ctx.fillText(word.text, word.x, word.y);
    }

    // 4. Update and Draw Bullets
    let bulletIndex = bullets.length - 1;
    while (bulletIndex >= 0) {
        const bullet = bullets[bulletIndex];

        if (bullet.isEnemy) {
            // ຈັດການລູກປືນສັດຕູ
            bullet.y += BULLET_SPEED - 1; // ຄວາມໄວລູກປືນສັດຕູ
            ctx.fillStyle = 'red';
            ctx.fillRect(bullet.x - 2, bullet.y, 4, 10);
            if (bullet.y > canvas.height) bullets.splice(bulletIndex, 1);

        } else {
            // ຈັດການລູກປືນຜູ້ຫຼິ້ນ
            const targetWord = wordsOnScreen.find(word => word.id === bullet.targetWordId);
            if (targetWord) {
                const dx = targetWord.x - bullet.x;
                const dy = targetWord.y - bullet.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                bullet.x += (dx / dist) * BULLET_SPEED;
                bullet.y += (dy / dist) * BULLET_SPEED;

                ctx.fillStyle = bullet.owner.isAI ? 'yellow' : 'lime';
                ctx.beginPath();
                ctx.arc(bullet.x, bullet.y, 3, 0, Math.PI * 2);
                ctx.fill();

                if (dist < BULLET_SPEED) {
                    bullets.splice(bulletIndex, 1);
                }
            } else {
                bullets.splice(bulletIndex, 1);
            }
        }
        bulletIndex--;
    }

    // 5. Update and Draw Explosions
    for (let i = explosions.length - 1; i >= 0; i--) {
        const exp = explosions[i];
        exp.life--;

        const progress = exp.life / exp.maxLife;
        ctx.beginPath();
        ctx.arc(exp.x, exp.y, exp.radius * (1 - progress), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 165, 0, ${progress})`; // ສີສົ້ມທີ່ຈາງລົງ
        ctx.fill();

        if (exp.life <= 0) {
            explosions.splice(i, 1);
        }
    }

    // 7. Update HUD
    const mainPlayerHud = players.find(p => p.id === socket.id);
    const totalScore = players.reduce((sum, p) => sum + p.score, 0);
    if (mainPlayerHud) { // ສະແດງ HP ຂອງຜູ້ຫຼິ້ນຫຼັກ
        playerHpDisplay.textContent = Math.max(0, mainPlayerHud.hp);
    }
    playerScoreDisplay.textContent = totalScore;

    requestAnimationFrame(gameLoop);
}

function endGame(finalPlayers) {
    gameInProgress = false;
    
    // ສ້າງກະດານຄະແນນ
    const sortedPlayers = finalPlayers.sort((a, b) => b.score - a.score);
    let scoreboardHTML = `
        <table>
            <tr>
                <th>ອັນດັບ</th>
                <th>ຊື່</th>
                <th>ຄະແນນ</th>
                <th>ຄວາມแม่นยำ</th>
            </tr>
    `;
    sortedPlayers.forEach((p, index) => {
        const totalAttempts = p.wordsTyped + p.incorrectTypes;
        const accuracy = totalAttempts > 0 ? ((p.wordsTyped / totalAttempts) * 100).toFixed(0) : 0;
        scoreboardHTML += `
            <tr>
                <td>${index + 1}</td>
                <td>${p.name}</td>
                <td>${p.score}</td>
                <td>${accuracy}%</td>
            </tr>
        `;
    });
    scoreboardHTML += '</table>';
    scoreboardDiv.innerHTML = scoreboardHTML;
    winnerModal.classList.remove('hidden');
    winnerModal.style.display = 'flex'; // ໃຊ້ flexbox ເພື່ອຈັດກາງ
}

function resetGameToLogin() {
    // ເຊື່ອງໜ້າຕ່າງຕ່າງໆ
    winnerModal.classList.add('hidden');
    gameWrapper.classList.add('hidden');
    gameTitle.classList.add('hidden');
    readyButton.classList.add('hidden');
    readyButton.disabled = false; // Reset ປຸ່ມພ້ອມ
    startButton.classList.add('hidden');

    // ສະແດງໜ້າເຂົ້າສູ່ລະບົບ
    loginScreen.classList.remove('hidden');
    playerNameInput.value = ''; // ລຶບຊື່ຜູ້ຫຼິ້ນອອກ

    // ລ້າງສະຖານະເກມທັງໝົດ
    players = [];
    wordsOnScreen = [];
    bullets = [];
    explosions = [];
    gameInProgress = false;
}

// === Socket.IO Event Listeners ===

socket.on('joinSuccess', () => {
    loginScreen.classList.add('hidden');
    gameWrapper.classList.remove('hidden');
    gameTitle.classList.remove('hidden');
    readyButton.classList.remove('hidden');
    startButton.classList.add('hidden');

    canvas.width = gameWrapper.offsetWidth || 800;
    canvas.height = 500;
});

socket.on('updateRoom', (roomPlayers) => {
    players = roomPlayers;
    drawWaitingRoom();
});

socket.on('allPlayersReady', () => {
    let countdown = 5;
    const countdownInterval = setInterval(() => {
        drawWaitingRoom(`ເກມຈະເລີ່ມໃນ ${countdown}...`);
        countdown--;
        if (countdown < 0) {
            clearInterval(countdownInterval);
        }
    }, 1000);
});

socket.on('gameStarted', (serverPlayers) => {
    players = serverPlayers;
    startGame();
});

socket.on('playerShot', (data) => {
    const shooter = players.find(p => p.id === data.shooterId);
    if (shooter) {
        bullets.push({
            x: shooter.x, y: shooter.y,
            targetWordId: data.targetId,
            owner: shooter
        });
    }
});

socket.on('enemyBullet', (data) => {
    const targetPlayer = players.find(p => p.id === data.targetId);
    if (targetPlayer) {
        bullets.push({
            x: targetPlayer.x,
            y: 0,
            isEnemy: true,
            targetPlayer: targetPlayer
        });
    }
});

socket.on('wordDestroyed', (data) => {
    wordsOnScreen = wordsOnScreen.filter(w => w.id !== data.wordId);
    explosions.push({
        x: data.explosionX, y: data.explosionY,
        radius: 30, life: 15, maxLife: 15,
    });
});

socket.on('mistype', (data) => {
    const player = players.find(p => p.id === data.playerId);
    if (player && player.id === socket.id) { // Show effect only for the player who mistyped
        canvas.style.borderColor = 'red';
        setTimeout(() => { canvas.style.borderColor = '#4a4a88'; }, 200);
    }
});

socket.on('updateGameState', (serverState) => {
    players = serverState.players;
    wordsOnScreen = serverState.words;
});

socket.on('gameOver', (finalPlayers) => {
    endGame(finalPlayers);
});
