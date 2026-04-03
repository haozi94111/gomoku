// 游戏状态
let currentRoomId = null;
let playerId = null;
let playerName = '';
let playerColor = 'black';
let isMyTurn = false;
let gameState = null;
let roomRef = null;
let unsubscribe = null;

// 倒计时相关
let countdownInterval = null;
let timeLeft = 50;
const TURN_TIME_LIMIT = 50; // 每回合50秒

// 棋盘配置
const BOARD_SIZE = 15;
const EMPTY = 0;
const BLACK = 1;
const WHITE = 2;

// DOM 元素
const screens = {
    home: document.getElementById('home-screen'),
    create: document.getElementById('create-screen'),
    join: document.getElementById('join-screen'),
    waiting: document.getElementById('waiting-screen'),
    game: document.getElementById('game-screen')
};

// 页面切换
function showScreen(screenName) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[screenName.replace('-screen', '')].classList.add('active');
}

// 生成房间号
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

// 生成玩家ID
function generatePlayerId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 颜色选择
document.querySelectorAll('.color-option').forEach(option => {
    option.addEventListener('click', () => {
        document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
        option.classList.add('selected');
        playerColor = option.dataset.color;
    });
});

// 显示创建房间页面
function showCreateRoom() {
    showScreen('create-screen');
    document.getElementById('create-nickname').focus();
}

// 显示加入房间页面
function showJoinRoom() {
    showScreen('join-screen');
    document.getElementById('join-room-id').focus();
}

// 创建房间
async function createRoom() {
    const nickname = document.getElementById('create-nickname').value.trim();
    if (!nickname) {
        showMessage('请输入昵称');
        return;
    }

    playerId = generatePlayerId();
    playerName = nickname;
    currentRoomId = generateRoomId();

    const roomData = {
        createdAt: firebase.database.ServerValue.TIMESTAMP,
        status: 'waiting',
        board: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0)),
        currentTurn: 'black',
        turnStartTime: null,
        players: {
            [playerId]: {
                name: nickname,
                color: playerColor,
                ready: true
            }
        },
        moveHistory: [],
        winner: null
    };

    try {
        await database.ref(`rooms/${currentRoomId}`).set(roomData);
        
        document.getElementById('waiting-room-id').textContent = currentRoomId;
        document.getElementById('waiting-player-name').textContent = nickname;
        showScreen('waiting-screen');
        
        subscribeToRoom();
    } catch (error) {
        showMessage('创建房间失败，请重试');
        console.error(error);
    }
}

// 加入房间
async function joinRoom() {
    const roomId = document.getElementById('join-room-id').value.trim().toUpperCase();
    const nickname = document.getElementById('join-nickname').value.trim();

    if (!roomId) {
        showMessage('请输入房间号');
        return;
    }
    if (!nickname) {
        showMessage('请输入昵称');
        return;
    }

    try {
        const snapshot = await database.ref(`rooms/${roomId}`).once('value');
        const room = snapshot.val();

        if (!room) {
            showMessage('房间不存在');
            return;
        }

        if (room.status === 'playing') {
            showMessage('游戏已开始，无法加入');
            return;
        }

        if (Object.keys(room.players || {}).length >= 2) {
            showMessage('房间已满');
            return;
        }

        // 确定玩家颜色（与房主相反）
        const existingPlayer = Object.values(room.players)[0];
        playerColor = existingPlayer.color === 'black' ? 'white' : 'black';

        playerId = generatePlayerId();
        playerName = nickname;
        currentRoomId = roomId;

        await database.ref(`rooms/${roomId}/players/${playerId}`).set({
            name: nickname,
            color: playerColor,
            ready: true
        });

        await database.ref(`rooms/${roomId}`).update({
            status: 'playing',
            turnStartTime: firebase.database.ServerValue.TIMESTAMP
        });

        showScreen('game-screen');
        initBoard();
        subscribeToRoom();
    } catch (error) {
        showMessage('加入房间失败，请重试');
        console.error(error);
    }
}

// 订阅房间数据
function subscribeToRoom() {
    if (unsubscribe) unsubscribe();
    
    roomRef = database.ref(`rooms/${currentRoomId}`);
    unsubscribe = roomRef.on('value', (snapshot) => {
        const room = snapshot.val();
        if (!room) return;

        gameState = room;

        // 等待页面更新
        if (room.status === 'waiting') {
            updateWaitingScreen(room);
        }
        // 游戏页面更新
        else if (room.status === 'playing' || room.status === 'finished') {
            if (!screens.game.classList.contains('active')) {
                showScreen('game-screen');
                initBoard();
            }
            updateGameScreen(room);
        }
    });
}

// 更新等待页面
function updateWaitingScreen(room) {
    const players = Object.values(room.players || {});
    if (players.length >= 2) {
        // 游戏开始
        database.ref(`rooms/${currentRoomId}`).update({ 
            status: 'playing',
            turnStartTime: firebase.database.ServerValue.TIMESTAMP
        });
        showScreen('game-screen');
        initBoard();
    }
}

// 更新游戏页面
function updateGameScreen(room) {
    const players = room.players || {};
    const playerEntries = Object.entries(players);
    
    // 更新玩家信息
    playerEntries.forEach(([pid, player]) => {
        const cardId = player.color === 'black' ? 'player-black' : 'player-white';
        const card = document.getElementById(cardId);
        card.querySelector('.name').textContent = player.name;
        // 不覆盖 status，由倒计时函数处理
    });

    // 更新回合指示
    const isBlackTurn = room.currentTurn === 'black';
    document.getElementById('player-black').classList.toggle('active', isBlackTurn);
    document.getElementById('player-white').classList.toggle('active', !isBlackTurn);
    document.getElementById('turn-arrow').classList.toggle('right', !isBlackTurn);

    // 判断是否轮到我
    const myPlayer = players[playerId];
    const wasMyTurn = isMyTurn;
    isMyTurn = myPlayer && myPlayer.color === room.currentTurn && !room.winner;

    // 处理倒计时
    if (isMyTurn && !room.winner) {
        startCountdown(room.turnStartTime);
    } else {
        stopCountdown();
    }

    // 更新棋盘
    drawBoard(room.board);

    // 显示胜利信息
    if (room.winner) {
        stopCountdown();
        const isWin = myPlayer && myPlayer.color === room.winner;
        const winnerName = playerEntries.find(([_, p]) => p.color === room.winner)?.[1]?.name || '';
        showResult(isWin ? '你赢了！🎉' : `${winnerName} 赢了！`, isWin ? '恭喜获得胜利！' : '再接再厉！');
    }
}

// 开始倒计时
function startCountdown(turnStartTime) {
    stopCountdown();
    
    const startTime = turnStartTime || Date.now();
    
    countdownInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        timeLeft = Math.max(0, TURN_TIME_LIMIT - elapsed);
        
        // 更新显示
        updateCountdownDisplay(timeLeft);
        
        // 时间到，自动下棋
        if (timeLeft <= 0) {
            stopCountdown();
            autoPlaceStone();
        }
    }, 100);
}

// 停止倒计时
function stopCountdown() {
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    timeLeft = TURN_TIME_LIMIT;
    updateCountdownDisplay(timeLeft);
}

// 更新倒计时显示
function updateCountdownDisplay(seconds) {
    const myPlayer = gameState?.players?.[playerId];
    if (!myPlayer) return;
    
    const cardId = myPlayer.color === 'black' ? 'player-black' : 'player-white';
    const card = document.getElementById(cardId);
    const statusEl = card.querySelector('.status');
    if (!statusEl) return;
    
    if (isMyTurn && !gameState.winner) {
        statusEl.textContent = `(你) ${seconds}秒`;
        statusEl.style.color = seconds <= 10 ? '#ff4757' : '#667eea';
    } else {
        // 不是我的回合时，只显示 (你)，不覆盖倒计时
        if (!statusEl.textContent.includes('秒')) {
            statusEl.textContent = '(你)';
        }
        statusEl.style.color = '';
    }
}

// 自动随机下棋
function autoPlaceStone() {
    if (!isMyTurn || !gameState || gameState.winner) return;
    
    // 找到所有空位
    const emptyCells = [];
    for (let y = 0; y < BOARD_SIZE; y++) {
        for (let x = 0; x < BOARD_SIZE; x++) {
            if (gameState.board[y][x] === EMPTY) {
                emptyCells.push({x, y});
            }
        }
    }
    
    if (emptyCells.length === 0) return;
    
    // 随机选择一个位置
    const randomMove = emptyCells[Math.floor(Math.random() * emptyCells.length)];
    
    // 执行下棋
    const piece = playerColor === 'black' ? BLACK : WHITE;
    gameState.board[randomMove.y][randomMove.x] = piece;
    gameState.moveHistory.push({ x: randomMove.x, y: randomMove.y, player: playerId });
    
    // 检查胜利
    const winner = checkWin(gameState.board, randomMove.x, randomMove.y, piece);
    
    // 更新到数据库
    const updates = {
        board: gameState.board,
        moveHistory: gameState.moveHistory,
        currentTurn: playerColor === 'black' ? 'white' : 'black',
        turnStartTime: firebase.database.ServerValue.TIMESTAMP
    };
    
    if (winner) {
        updates.winner = playerColor;
        updates.status = 'finished';
    }
    
    database.ref(`rooms/${currentRoomId}`).update(updates);
    
    showMessage('时间到！系统自动下棋');
}

// 初始化棋盘
let canvas, ctx;
let cellSize, boardPadding;

function initBoard() {
    canvas = document.getElementById('board');
    if (!canvas) return;
    
    ctx = canvas.getContext('2d');
    
    // 设置画布大小
    const container = canvas.parentElement;
    let size = container.clientWidth;
    
    // 如果容器宽度为0，使用默认大小
    if (size === 0) {
        size = Math.min(window.innerWidth - 40, 500);
    }
    
    canvas.width = size;
    canvas.height = size;
    
    // 计算格子大小
    boardPadding = size * 0.06;
    cellSize = (size - 2 * boardPadding) / (BOARD_SIZE - 1);
    
    // 绑定点击事件（使用全局标志确保只绑定一次）
    if (!window.boardEventBound) {
        canvas.addEventListener('click', handleBoardClick);
        canvas.addEventListener('touchstart', handleTouch, { passive: false });
        window.boardEventBound = true;
    }
    
    document.getElementById('game-room-id').textContent = currentRoomId;
}

// 绘制棋盘
function drawBoard(board) {
    if (!ctx) return;
    
    const size = canvas.width;
    
    // 清空画布
    ctx.fillStyle = '#f0c78a';
    ctx.fillRect(0, 0, size, size);
    
    // 绘制网格
    ctx.strokeStyle = '#8b4513';
    ctx.lineWidth = 1;
    
    for (let i = 0; i < BOARD_SIZE; i++) {
        const pos = boardPadding + i * cellSize;
        
        // 横线
        ctx.beginPath();
        ctx.moveTo(boardPadding, pos);
        ctx.lineTo(size - boardPadding, pos);
        ctx.stroke();
        
        // 竖线
        ctx.beginPath();
        ctx.moveTo(pos, boardPadding);
        ctx.lineTo(pos, size - boardPadding);
        ctx.stroke();
    }
    
    // 绘制星位
    const stars = [[3, 3], [3, 11], [7, 7], [11, 3], [11, 11]];
    ctx.fillStyle = '#8b4513';
    stars.forEach(([x, y]) => {
        const px = boardPadding + x * cellSize;
        const py = boardPadding + y * cellSize;
        ctx.beginPath();
        ctx.arc(px, py, 4, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // 绘制棋子
    if (board) {
        for (let y = 0; y < BOARD_SIZE; y++) {
            for (let x = 0; x < BOARD_SIZE; x++) {
                if (board[y][x] !== EMPTY) {
                    drawPiece(x, y, board[y][x]);
                }
            }
        }
        
        // 标记最后一步
        const lastMove = gameState?.moveHistory?.[gameState.moveHistory.length - 1];
        if (lastMove) {
            markLastMove(lastMove.x, lastMove.y);
        }
    }
}

// 绘制棋子
function drawPiece(x, y, type) {
    const px = boardPadding + x * cellSize;
    const py = boardPadding + y * cellSize;
    const radius = cellSize * 0.4;
    
    const gradient = ctx.createRadialGradient(
        px - radius * 0.3, py - radius * 0.3, radius * 0.1,
        px, py, radius
    );
    
    if (type === BLACK) {
        gradient.addColorStop(0, '#666');
        gradient.addColorStop(1, '#000');
    } else {
        gradient.addColorStop(0, '#fff');
        gradient.addColorStop(1, '#ddd');
    }
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, Math.PI * 2);
    ctx.fill();
    
    // 阴影
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    ctx.stroke();
    ctx.shadowColor = 'transparent';
}

// 标记最后一步
function markLastMove(x, y) {
    const px = boardPadding + x * cellSize;
    const py = boardPadding + y * cellSize;
    
    ctx.strokeStyle = '#ff4757';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(px, py, cellSize * 0.45, 0, Math.PI * 2);
    ctx.stroke();
}

// 处理点击
function handleBoardClick(e) {
    // 调试信息
    console.log('点击棋盘', { isMyTurn, gameState: !!gameState, winner: gameState?.winner });
    
    if (!isMyTurn) {
        showMessage('等待对手...');
        return;
    }
    if (!gameState) {
        showMessage('游戏未初始化');
        return;
    }
    if (gameState.winner) {
        showMessage('游戏已结束');
        return;
    }
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    makeMoveAt(x, y);
}

// 处理触摸
function handleTouch(e) {
    if (!isMyTurn || !gameState || gameState.winner) return;
    e.preventDefault();
    
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    
    makeMoveAt(x, y);
}

// 下棋
function makeMoveAt(px, py) {
    const gridX = Math.round((px - boardPadding) / cellSize);
    const gridY = Math.round((py - boardPadding) / cellSize);
    
    if (gridX < 0 || gridX >= BOARD_SIZE || gridY < 0 || gridY >= BOARD_SIZE) return;
    if (gameState.board[gridY][gridX] !== EMPTY) return;
    
    const piece = playerColor === 'black' ? BLACK : WHITE;
    
    // 更新本地棋盘
    gameState.board[gridY][gridX] = piece;
    gameState.moveHistory.push({ x: gridX, y: gridY, player: playerId });
    
    // 检查胜利
    const winner = checkWin(gameState.board, gridX, gridY, piece);
    
    // 更新到数据库
    const updates = {
        board: gameState.board,
        moveHistory: gameState.moveHistory,
        currentTurn: playerColor === 'black' ? 'white' : 'black',
        turnStartTime: firebase.database.ServerValue.TIMESTAMP
    };
    
    if (winner) {
        updates.winner = playerColor;
        updates.status = 'finished';
    }
    
    database.ref(`rooms/${currentRoomId}`).update(updates);
}

// 检查胜利
function checkWin(board, x, y, piece) {
    const directions = [
        [1, 0],   // 水平
        [0, 1],   // 垂直
        [1, 1],   // 对角线
        [1, -1]   // 反对角线
    ];
    
    for (const [dx, dy] of directions) {
        let count = 1;
        
        // 正向检查
        for (let i = 1; i < 5; i++) {
            const nx = x + dx * i;
            const ny = y + dy * i;
            if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
            if (board[ny][nx] !== piece) break;
            count++;
        }
        
        // 反向检查
        for (let i = 1; i < 5; i++) {
            const nx = x - dx * i;
            const ny = y - dy * i;
            if (nx < 0 || nx >= BOARD_SIZE || ny < 0 || ny >= BOARD_SIZE) break;
            if (board[ny][nx] !== piece) break;
            count++;
        }
        
        if (count >= 5) return true;
    }
    
    return false;
}

// 请求悔棋
function requestUndo() {
    if (!gameState || gameState.moveHistory.length === 0) return;
    
    showConfirm('请求悔棋', '确定要悔棋吗？', async () => {
        const history = gameState.moveHistory;
        const lastMove = history[history.length - 1];
        
        // 只能悔自己的棋
        if (lastMove.player !== playerId) {
            showMessage('只能悔自己的棋');
            return;
        }
        
        const newBoard = JSON.parse(JSON.stringify(gameState.board));
        newBoard[lastMove.y][lastMove.x] = EMPTY;
        
        await database.ref(`rooms/${currentRoomId}`).update({
            board: newBoard,
            moveHistory: history.slice(0, -1),
            currentTurn: playerColor,
            turnStartTime: firebase.database.ServerValue.TIMESTAMP
        });
        
        closeConfirm();
    });
}

// 请求重新开始
function requestRestart() {
    showConfirm('重新开始', '确定要重新开始吗？', async () => {
        await database.ref(`rooms/${currentRoomId}`).update({
            status: 'playing',
            board: Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(0)),
            currentTurn: 'black',
            turnStartTime: firebase.database.ServerValue.TIMESTAMP,
            moveHistory: [],
            winner: null
        });
        closeResult();
        closeConfirm();
    });
}

// 离开房间
async function leaveRoom() {
    stopCountdown();
    
    if (unsubscribe) {
        unsubscribe();
        unsubscribe = null;
    }
    
    if (currentRoomId && roomRef) {
        // 删除玩家
        await database.ref(`rooms/${currentRoomId}/players/${playerId}`).remove();
        
        // 检查是否还有玩家
        const snapshot = await database.ref(`rooms/${currentRoomId}/players`).once('value');
        if (!snapshot.val()) {
            // 没有玩家了，删除房间
            await database.ref(`rooms/${currentRoomId}`).remove();
        }
    }
    
    currentRoomId = null;
    playerId = null;
    gameState = null;
    roomRef = null;
    
    showScreen('home-screen');
}

// 返回首页
function backToHome() {
    leaveRoom();
}

// 复制房间号
function copyRoomId() {
    const roomId = document.getElementById('waiting-room-id').textContent;
    navigator.clipboard.writeText(roomId).then(() => {
        showMessage('房间号已复制');
    });
}

// 显示消息
function showMessage(text) {
    const msg = document.getElementById('game-message');
    msg.textContent = text;
    msg.classList.add('show');
    setTimeout(() => msg.classList.remove('show'), 2000);
}

// 显示结果
function showResult(title, message) {
    document.getElementById('result-title').textContent = title;
    document.getElementById('result-message').textContent = message;
    document.getElementById('result-modal').classList.add('show');
}

function closeResult() {
    document.getElementById('result-modal').classList.remove('show');
}

// 显示确认
function showConfirm(title, message, onConfirm) {
    document.getElementById('confirm-title').textContent = title;
    document.getElementById('confirm-message').textContent = message;
    document.getElementById('confirm-yes').onclick = onConfirm;
    document.getElementById('confirm-modal').classList.add('show');
}

function closeConfirm() {
    document.getElementById('confirm-modal').classList.remove('show');
}

// 窗口大小改变时重新绘制
window.addEventListener('resize', () => {
    if (currentRoomId && canvas) {
        initBoard();
        if (gameState && gameState.board) {
            drawBoard(gameState.board);
        }
    }
});

// 页面关闭时清理
window.addEventListener('beforeunload', () => {
    stopCountdown();
    if (currentRoomId && playerId) {
        database.ref(`rooms/${currentRoomId}/players/${playerId}`).remove();
    }
});
