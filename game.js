// 初始化遊戲變數
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const engine = Matter.Engine.create();
const world = engine.world;

// 設定畫布大小
canvas.width = 800;
canvas.height = 400;

// 更新遊戲狀態顯示
function updateGameStatus(status) {
    document.getElementById('gameStatus').textContent = status;
}

// 初始化時顯示狀態
updateGameStatus('遊戲已準備');

// 確認 Canvas 環境
console.log('Canvas dimensions:', canvas.width, canvas.height);
console.log('Canvas context:', ctx ? 'available' : 'not available');

// 遊戲狀態
let power = 0;
let isPoweringUp = false;
let score = 0;
let turn = 1;
let lastMouseEvent = null;
let isPlaying = false; // 新增：追蹤遊戲是否在進行中

// 獲取滑鼠位置的輔助函數
function getMousePosition(canvas, event) {
    const rect = canvas.getBoundingClientRect();
    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    };
}

// 物理世界設定
engine.world.gravity.y = 0;
engine.timing.timeScale = 1.0;

// 設定桌邊界的物理特性
const TABLE_RESTITUTION = 0.6; // 邊界的彈性係數
const TABLE_FRICTION = 0.3;    // 邊界的摩擦力

// 邊界配置
const wallOptions = {
    isStatic: true,
    restitution: TABLE_RESTITUTION,
    friction: TABLE_FRICTION,
    render: {
        fillStyle: '#654321'
    }
};

// 建立桌邊界
const walls = [
    // 上邊左
    Matter.Bodies.rectangle(200, 0, 320, 20, { 
        ...wallOptions,
        chamfer: { radius: 5 }  // 圓角邊緣
    }),
    // 上邊右
    Matter.Bodies.rectangle(600, 0, 320, 20, { 
        ...wallOptions,
        chamfer: { radius: 5 }
    }),
    // 下邊左
    Matter.Bodies.rectangle(200, 400, 320, 20, { 
        ...wallOptions,
        chamfer: { radius: 5 }
    }),
    // 下邊右
    Matter.Bodies.rectangle(600, 400, 320, 20, { 
        ...wallOptions,
        chamfer: { radius: 5 }
    }),
    // 左邊上
    Matter.Bodies.rectangle(0, 100, 20, 160, { 
        ...wallOptions,
        chamfer: { radius: 5 }
    }),
    // 左邊下
    Matter.Bodies.rectangle(0, 300, 20, 160, { 
        ...wallOptions,
        chamfer: { radius: 5 }
    }),
    // 右邊上
    Matter.Bodies.rectangle(800, 100, 20, 160, { 
        ...wallOptions,
        chamfer: { radius: 5 }
    }),
    // 右邊下
    Matter.Bodies.rectangle(800, 300, 20, 160, { 
        ...wallOptions,
        chamfer: { radius: 5 }
    })
];

// 添加邊界到世界
Matter.World.add(world, walls);

// 設定球的物理參數
const BALL_OPTIONS = {
    restitution: 0.9,    // 球的彈性
    friction: 0.05,      // 球的摩擦力
    density: 0.0008,     // 球的密度
    frictionAir: 0.0005, // 空氣阻力
    constraintImpulse: { x: 0, y: 0 }, // 限制衝量
    plugin: {
        wrap: false // 禁止穿越邊界
    }
};

// 球洞位置
const pocketPositions = [
    { x: 30, y: 30 },    // 左上
    { x: 400, y: 15 },   // 中上
    { x: 770, y: 30 },   // 右上
    { x: 30, y: 370 },   // 左下
    { x: 400, y: 385 },  // 中下
    { x: 770, y: 370 }   // 右下
];

// 球洞半徑
const POCKET_RADIUS = 20;

// 繪製球洞
function drawPockets() {
    pocketPositions.forEach(pocket => {
        ctx.beginPath();
        ctx.arc(pocket.x, pocket.y, POCKET_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = '#000';
        ctx.fill();
        ctx.closePath();
    });
}

// 檢查球是否進洞
function checkPocketCollisions() {
    const ballsToRemove = [];
    
    [...balls, whiteBall].forEach(ball => {
        if (!ball || !ball.body) return;
        
        pocketPositions.forEach(pocket => {
            const dx = ball.body.position.x - pocket.x;
            const dy = ball.body.position.y - pocket.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < POCKET_RADIUS) {
                // 添加進球動畫
                VisualEffects.addPocketAnimation(pocket.x, pocket.y);
                // 播放進球音效
                AudioSystem.playPocket();
                
                if (ball === whiteBall) {
                    // 白球進洞，重置位置
                    Matter.Body.setPosition(ball.body, { x: 200, y: 200 });
                    Matter.Body.setVelocity(ball.body, { x: 0, y: 0 });
                    updateGameStatus('白球進洞！扣分！');
                    score -= 5;
                } else {
                    // 其他球進洞，加分並移除
                    ballsToRemove.push(ball);
                    score += 10;
                    updateGameStatus('球進洞！+10分');
                }
            }
        });
    });
    
    // 移除進洞的球
    ballsToRemove.forEach(ball => {
        const index = balls.indexOf(ball);
        if (index > -1) {
            Matter.World.remove(world, ball.body);
            balls.splice(index, 1);
        }
    });
}

// 建立球的類別
class Ball {
    constructor(x, y, radius, color) {
        this.body = Matter.Bodies.circle(x, y, radius, {
            ...BALL_OPTIONS,
            slop: 0,              // 防止重疊
            inertia: Infinity,    // 防止球旋轉
            render: {
                fillStyle: color
            }
        });
        
        // 確保球體不會旋轉
        this.body.rotationLocked = true;
        Matter.Body.setInertia(this.body, Infinity);
        
        this.body.label = 'ball';
        Matter.World.add(world, this.body);
        this.radius = radius;
        this.color = color;
        this.isStriped = false;   // 是否為花球
        this.lastSpeed = 0;       // 記錄上一幀的速度
    }

    draw() {
        const pos = this.body.position;
        
        // 繪製球的陰影
        VisualEffects.drawShadow(ctx, pos.x, pos.y, this.radius);
        
        // 繪製球的基本顏色
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, this.radius, 0, 2 * Math.PI);
        ctx.fillStyle = this.color;
        ctx.fill();
        
        // 如果是花球，繪製白色條紋
        if (this.isStriped) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, this.radius, 0, 2 * Math.PI);
            ctx.clip();
            
            // 繪製三條白色條紋
            ctx.fillStyle = '#FFFFFF';
            for (let i = -1; i <= 1; i++) {
                ctx.fillRect(
                    pos.x - this.radius,
                    pos.y - 2 + (i * 7),
                    this.radius * 2,
                    4
                );
            }
            ctx.restore();
        }
        
        // 繪製球的邊框
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, this.radius, 0, 2 * Math.PI);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.closePath();
        
        // 如果不是白球，繪製球號
        if (this.color !== '#FFFFFF') {
            ctx.fillStyle = this.isStriped ? '#000' : '#FFF';
            ctx.font = '10px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const number = balls.indexOf(this) + 1;
            ctx.fillText(number.toString(), pos.x, pos.y);
        }
    }
}

// 定義所有球的初始位置和顏色
const BALL_RADIUS = 15;
const INITIAL_POSITIONS = {
    whiteBall: { x: 200, y: 200 },
    rackPosition: { x: 600, y: 200 }  // 三角形底部中心位置
};

// 所有球的顏色定義
const BALL_COLORS = {
    solid: ['#FDD017', '#1F45FC', '#E42217', '#733635', '#4CC417', '#C58917', '#E78A61'], // 實心球 1-7
    stripe: ['#FDD017', '#1F45FC', '#E42217', '#733635', '#4CC417', '#C58917', '#E78A61'].map(color => addStripe(color)), // 花球 9-15
    black: '#000000',  // 8號球
    white: '#FFFFFF'   // 白球
};

// 為花球添加條紋效果
function addStripe(baseColor) {
    return {
        base: baseColor,
        stripe: '#FFFFFF'
    };
}

// 創建新的一組球
function createBalls() {
    // 創建白球
    const whiteBall = new Ball(INITIAL_POSITIONS.whiteBall.x, INITIAL_POSITIONS.whiteBall.y, BALL_RADIUS, BALL_COLORS.white);
    
    const balls = [];
    let ballCount = 0;
    const positions = calculateRackPositions();
    
    // 添加所有球
    // 實心球 (1-7)
    BALL_COLORS.solid.forEach((color, i) => {
        balls.push(new Ball(positions[ballCount].x, positions[ballCount].y, BALL_RADIUS, color));
        ballCount++;
    });
    
    // 8號球（放在中間）
    balls.push(new Ball(positions[7].x, positions[7].y, BALL_RADIUS, BALL_COLORS.black));
    ballCount++;
    
    // 花球 (9-15)
    BALL_COLORS.stripe.forEach((colors, i) => {
        const ball = new Ball(positions[ballCount].x, positions[ballCount].y, BALL_RADIUS, colors.base);
        ball.isStriped = true;
        balls.push(ball);
        ballCount++;
    });
    
    return { whiteBall, balls };
}

// 計算標準三角形排列的位置
function calculateRackPositions() {
    const positions = [];
    const startX = INITIAL_POSITIONS.rackPosition.x;
    const startY = INITIAL_POSITIONS.rackPosition.y;
    const spacing = BALL_RADIUS * 2.1; // 稍微增加間距確保球不會重疊
    const rowHeight = spacing * Math.sin(Math.PI / 3); // 等邊三角形的高度關係
    
    // 定義每一行的球數
    const rowBalls = [1, 2, 3, 4, 5];
    
    // 計算每一行的位置
    rowBalls.forEach((ballsInRow, row) => {
        const rowWidth = (ballsInRow - 1) * spacing;
        for (let ball = 0; ball < ballsInRow; ball++) {
            positions.push({
                x: startX + (row * rowHeight),
                y: startY - (rowWidth / 2) + (ball * spacing)
            });
        }
    });

    // 確保位置數量正確
    if (positions.length !== 15) {
        console.error('Position calculation error');
    }

    return positions;
}

// 創建新的一組球
function createBalls() {
    // 創建白球
    const whiteBall = new Ball(INITIAL_POSITIONS.whiteBall.x, INITIAL_POSITIONS.whiteBall.y, BALL_RADIUS, BALL_COLORS.white);
    
    const positions = calculateRackPositions();
    const balls = [];
    
    // 定義特定位置的球
    const ballArrangement = [
        1,      // 頂點：1號球
        null, null,  // 第二排：隨機
        null, 8, null,  // 第三排：中間是8號球
        null, null, null, null,  // 第四排：隨機
        null, null, null, null, null  // 第五排：隨機，但兩角必須是不同類型
    ];
    
    // 收集剩餘的球號（2-7和9-15，排除已放置的1和8）
    const remainingBalls = [];
    for (let i = 2; i <= 15; i++) {
        if (i !== 8) remainingBalls.push(i);
    }
    
    // 隨機打亂剩餘的球
    for (let i = remainingBalls.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingBalls[i], remainingBalls[j]] = [remainingBalls[j], remainingBalls[i]];
    }
    
    // 填充球的位置
    let remainingIndex = 0;
    ballArrangement.forEach((ballNumber, index) => {
        let finalBallNumber;
        if (ballNumber === null) {
            finalBallNumber = remainingBalls[remainingIndex++];
        } else {
            finalBallNumber = ballNumber;
        }
        
        let color;
        let isStriped = false;
        
        if (finalBallNumber === 8) {
            color = BALL_COLORS.black;
        } else if (finalBallNumber >= 9) {
            color = BALL_COLORS.stripe[finalBallNumber - 9];
            isStriped = true;
        } else {
            color = BALL_COLORS.solid[finalBallNumber - 1];
        }
        
        const ball = new Ball(positions[index].x, positions[index].y, BALL_RADIUS, color);
        ball.number = finalBallNumber;
        ball.isStriped = isStriped;
        balls.push(ball);
    });
    
    // 確保後排兩角是不同類型的球（一個實心一個花）
    const lastRow = balls.slice(-5);
    if ((lastRow[0].number < 8) === (lastRow[4].number < 8)) {
        // 如果兩角都是同類型，找到一個可以交換的球
        for (let i = 1; i < 4; i++) {
            if ((lastRow[i].number < 8) !== (lastRow[0].number < 8)) {
                // 交換位置
                const temp = lastRow[0];
                lastRow[0] = lastRow[i];
                lastRow[i] = temp;
                // 更新物理位置
                const tempPos = { x: lastRow[0].body.position.x, y: lastRow[0].body.position.y };
                Matter.Body.setPosition(lastRow[0].body, { x: lastRow[i].body.position.x, y: lastRow[i].body.position.y });
                Matter.Body.setPosition(lastRow[i].body, { x: tempPos.x, y: tempPos.y });
                break;
            }
        }
    }
    
    return { whiteBall, balls };
}

// 初始化球
let { whiteBall, balls } = createBalls();

// 確認球體初始化
console.log('White ball created:', whiteBall);
console.log('Colored balls created:', balls);

// 更新力度條
function updatePowerBar() {
    const powerBar = document.getElementById('powerBar');
    powerBar.style.width = `${power}%`;
}

// 射擊白球
function shootWhiteBall() {
    const baseForce = 0.05;   // 增加基礎力量
    const maxForce = 0.25;    // 大幅增加最大力量
    const force = baseForce + (power / 100) * (maxForce - baseForce);
    
    const mousePos = getMousePosition(canvas, lastMouseEvent);
    const ballPos = whiteBall.body.position;
    
    // 重置藥水狀態
    canUseDrug = true;
    drugUsed = false;
    isPlaying = true;
    
    // 計算方向向量（從球指向滑鼠）
    const direction = {
        x: mousePos.x - ballPos.x,
        y: mousePos.y - ballPos.y
    };
    
    // 向量正規化
    const magnitude = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
    const normalizedDirection = {
        x: direction.x / magnitude,
        y: direction.y / magnitude
    };
    
    // 計算初速度而不是力
    const velocity = {
        x: normalizedDirection.x * force * 30,
        y: normalizedDirection.y * force * 30
    };
    
    // 直接設置速度而不是施加力
    Matter.Body.setVelocity(whiteBall.body, velocity);
    
    // 更新遊戲狀態
    updateGameStatus(`擊球！力量: ${Math.round(power)}%`);
}

// 遊戲主循環
// 繪製球桿
function drawCue() {
    if (!isPoweringUp || !lastMouseEvent) return;

    const ballPos = whiteBall.body.position;
    const mousePos = getMousePosition(canvas, lastMouseEvent);
    
    // 計算方向（從球指向滑鼠的反方向，這樣球桿會在正確的位置）
    const angle = Math.atan2(ballPos.y - mousePos.y, ballPos.x - mousePos.x);
    
    // 繪製力度預覽效果
    VisualEffects.drawPowerPreview(ctx, ballPos, angle, power);
    
    // 繪製球桿
    ctx.save();
    ctx.translate(ballPos.x, ballPos.y);
    ctx.rotate(angle);
    
    // 球桿長度根據蓄力程度變化
    const cueLength = 150 + (power * 0.5);
    
    // 繪製球桿陰影
    ctx.beginPath();
    ctx.moveTo(2, 2);
    ctx.lineTo(cueLength + 2, 2);
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 10;
    ctx.stroke();
    
    // 繪製球桿
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(cueLength, 0);
    ctx.strokeStyle = '#8B4513';
    ctx.lineWidth = 8;
    ctx.stroke();
    
    // 繪製球桿頭
    ctx.beginPath();
    ctx.moveTo(cueLength, 0);
    ctx.lineTo(cueLength + 10, 0);
    ctx.strokeStyle = '#F4A460';
    ctx.lineWidth = 10;
    ctx.stroke();
    
    ctx.restore();
    
    // 繪製瞄準線
    drawAimingLine(ballPos, angle);
}

// 繪製瞄準線
function drawAimingLine(ballPos, angle) {
    // 計算瞄準線的起點（從球的位置開始）
    ctx.beginPath();
    ctx.moveTo(ballPos.x, ballPos.y);
    
    // 向滑鼠方向延伸瞄準線
    ctx.lineTo(
        ballPos.x - Math.cos(angle) * 200, // 注意這裡是減號，因為我們要往滑鼠的方向
        ballPos.y - Math.sin(angle) * 200
    );
    
    // 設置瞄準線的樣式
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'; // 增加透明度使其更明顯
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2; // 增加線寬
    ctx.stroke();
    ctx.setLineDash([]);
}

// 檢查和更新球的運動狀態
function updateBallMovements() {
    const speedThreshold = 0.15; // 調整停止閾值
    const allBalls = [whiteBall, ...balls].filter(ball => ball && ball.body);
    
    allBalls.forEach(ball => {
        const velocity = ball.body.velocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        
        // 逐漸減緩球的速度，但減緩程度較小
        if (speed > 0) {
            const dampingFactor = speed > 5 ? 0.995 : 0.99; // 高速時減緩較少
            Matter.Body.setVelocity(ball.body, {
                x: velocity.x * dampingFactor,
                y: velocity.y * dampingFactor
            });
        }
        
        // 如果球速度很小，就完全停下來
        if (speed < speedThreshold) {
            Matter.Body.setVelocity(ball.body, { x: 0, y: 0 });
        }
        
        // 更新球的上一幀速度
        ball.lastSpeed = speed;
    });
    
    // 檢查是否所有球都停止運動
    const allStopped = allBalls.every(ball => 
        Math.abs(ball.body.velocity.x) < speedThreshold && 
        Math.abs(ball.body.velocity.y) < speedThreshold
    );
    
    if (allStopped && isPlaying) {
        isPlaying = false;
        canUseDrug = false;
        drugUsed = false;
        updateGameStatus('準備擊球');
    }
}

// 繪製瞄準輔助線
function drawTargetLine() {
    if (!whiteBall || !lastMouseEvent) return;
    
    const ballPos = whiteBall.body.position;
    const mousePos = getMousePosition(canvas, lastMouseEvent);
    
    // 計算角度
    const angle = Math.atan2(ballPos.y - mousePos.y, ballPos.x - mousePos.x);
    
    // 繪製瞄準輔助線
    ctx.beginPath();
    ctx.moveTo(ballPos.x, ballPos.y);
    ctx.lineTo(
        ballPos.x - Math.cos(angle) * 1000, // 延長線
        ballPos.y - Math.sin(angle) * 1000
    );
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.setLineDash([]);
}

// 添加碰撞檢測
Matter.Events.on(engine, 'collisionStart', (event) => {
    event.pairs.forEach((pair) => {
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;
        
        // 限制碰撞後的最大速度
        const MAX_VELOCITY = 15;
        
        [bodyA, bodyB].forEach(body => {
            if (body && !body.isStatic) {
                const velocity = body.velocity;
                const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
                
                if (speed > MAX_VELOCITY) {
                    const scale = MAX_VELOCITY / speed;
                    Matter.Body.setVelocity(body, {
                        x: velocity.x * scale,
                        y: velocity.y * scale
                    });
                }
                
                // 播放碰撞音效
                if (speed > 1) {  // 只有當速度超過閾值時才播放音效
                    AudioSystem.playCollision(speed);
                }
            }
        });
    });
});

// 更新球的位置約束
function constrainBalls() {
    const margin = 5; // 邊界安全距離
    [whiteBall, ...balls].forEach(ball => {
        if (ball && ball.body) {
            const pos = ball.body.position;
            const radius = ball.radius;
            
            // 檢查並修正x軸位置
            if (pos.x < radius + margin) {
                Matter.Body.setPosition(ball.body, {
                    x: radius + margin,
                    y: pos.y
                });
            } else if (pos.x > canvas.width - radius - margin) {
                Matter.Body.setPosition(ball.body, {
                    x: canvas.width - radius - margin,
                    y: pos.y
                });
            }
            
            // 檢查並修正y軸位置
            if (pos.y < radius + margin) {
                Matter.Body.setPosition(ball.body, {
                    x: pos.x,
                    y: radius + margin
                });
            } else if (pos.y > canvas.height - radius - margin) {
                Matter.Body.setPosition(ball.body, {
                    x: pos.x,
                    y: canvas.height - radius - margin
                });
            }
        }
    });
}

// 遊戲主循環
function gameLoop() {
    // 清除畫布
    ctx.fillStyle = '#076324';  // 撞球桌綠色
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // 繪製球洞
    drawPockets();
    
    // 更新物理引擎
    Matter.Engine.update(engine, 1000 / 60); // 固定時間步長
    
    // 確保球不會飛出邊界
    constrainBalls();
    
    // 更新球的運動
    updateBallMovements();
    
    // 檢查球是否進洞
    checkPocketCollisions();
    
    // 始終顯示瞄準輔助線
    drawTargetLine();
    
    // 繪製所有球
    if (whiteBall) {
        whiteBall.draw();
    }
    
    if (balls && balls.length > 0) {
        balls.forEach(ball => {
            if (ball) {
                ball.draw();
            }
        });
    }
    
    // 只在準備擊球時顯示球桿
    if (!isPlaying) {
        drawCue();
    }
    
    // 更新進球動畫
    VisualEffects.updatePocketAnimations(ctx);
    
    requestAnimationFrame(gameLoop);
}

// 音效系統
const AudioSystem = {
    context: new (window.AudioContext || window.webkitAudioContext)(),
    sounds: {},

    // 初始化音效
    init() {
        this.createCollisionSound();
        this.createPocketSound();
    },

    // 創建碰撞音效
    createCollisionSound() {
        const buffer = this.context.createBuffer(1, 1024, this.context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        this.sounds.collision = buffer;
    },

    // 創建進球音效
    createPocketSound() {
        const buffer = this.context.createBuffer(1, 2048, this.context.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = Math.sin(440 * Math.PI * 2 * i / this.context.sampleRate) *
                     Math.exp(-4 * i / data.length);
        }
        this.sounds.pocket = buffer;
    },

    // 播放碰撞音效
    playCollision(velocity) {
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        source.buffer = this.sounds.collision;
        
        // 根據碰撞速度調整音量
        const volume = Math.min(Math.abs(velocity) / 15, 1) * 0.3;
        gain.gain.value = volume;
        
        source.connect(gain);
        gain.connect(this.context.destination);
        source.start();
    },

    // 播放進球音效
    playPocket() {
        const source = this.context.createBufferSource();
        const gain = this.context.createGain();
        source.buffer = this.sounds.pocket;
        gain.gain.value = 0.3;
        
        source.connect(gain);
        gain.connect(this.context.destination);
        source.start();
    }
};

// 視覺效果系統
const VisualEffects = {
    // 繪製球體陰影
    drawShadow(ctx, x, y, radius) {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius * 1.2);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.3)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.beginPath();
        ctx.arc(x + 2, y + 2, radius * 1.2, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();
    },

    // 進球動畫效果
    pocketAnimation: [],
    
    // 添加進球動畫
    addPocketAnimation(x, y) {
        this.pocketAnimation.push({
            x, y,
            radius: POCKET_RADIUS,
            alpha: 1,
            scale: 1
        });
    },

    // 更新和繪製進球動畫
    updatePocketAnimations(ctx) {
        this.pocketAnimation = this.pocketAnimation.filter(anim => {
            anim.alpha -= 0.05;
            anim.scale += 0.1;
            
            if (anim.alpha <= 0) return false;
            
            ctx.beginPath();
            ctx.arc(anim.x, anim.y, anim.radius * anim.scale, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(255, 255, 255, ${anim.alpha})`;
            ctx.lineWidth = 2;
            ctx.stroke();
            
            return true;
        });
    },

    // 力度預覽效果
    drawPowerPreview(ctx, ballPos, angle, power) {
        const gradient = ctx.createLinearGradient(
            ballPos.x, ballPos.y,
            ballPos.x - Math.cos(angle) * 200,
            ballPos.y - Math.sin(angle) * 200
        );
        
        gradient.addColorStop(0, `rgba(255, ${255 - power * 2}, 0, 0.5)`);
        gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
        
        ctx.beginPath();
        ctx.moveTo(ballPos.x, ballPos.y);
        ctx.lineTo(
            ballPos.x - Math.cos(angle) * (200 * power / 100),
            ballPos.y - Math.sin(angle) * (200 * power / 100)
        );
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4;
        ctx.stroke();
    }
};

// 初始化音效系統
AudioSystem.init();

// 事件監聽
canvas.addEventListener('mousemove', (event) => {
    lastMouseEvent = event;
});

canvas.addEventListener('mousedown', (event) => {
    isPoweringUp = true;
    power = 0;
    lastMouseEvent = event;
    const powerIncrease = () => {
        if (isPoweringUp && power < 100) {
            power += 2;
            updatePowerBar();
            requestAnimationFrame(powerIncrease);
        }
    };
    powerIncrease();
});

canvas.addEventListener('mouseup', () => {
    isPoweringUp = false;
    shootWhiteBall();
    turn++;
    power = 0;
    updatePowerBar();
});

document.getElementById('resetBtn').addEventListener('click', () => {
    // 重置遊戲
    Matter.World.clear(world);
    Matter.World.add(world, walls);
    
    // 重新創建所有球
    const newBalls = createBalls();
    whiteBall = newBalls.whiteBall;
    balls = newBalls.balls;
    
    // 添加所有球到物理世界
    Matter.World.add(world, whiteBall.body);
    balls.forEach(ball => Matter.World.add(world, ball.body));
    
    score = 0;
    turn = 1;
    updateGameStatus('遊戲已重新開始');
});

// 添加藥水功能的狀態控制
let canUseDrug = false; // 是否可以使用藥水
let drugUsed = false;   // 是否已經使用過藥水

// 監聽空白鍵
document.addEventListener('keydown', (event) => {
    if (event.code === 'Space' && canUseDrug && !drugUsed && isPlaying) {
        // 使用藥水停止白球
        if (whiteBall && whiteBall.body) {
            const currentSpeed = Math.sqrt(
                whiteBall.body.velocity.x * whiteBall.body.velocity.x + 
                whiteBall.body.velocity.y * whiteBall.body.velocity.y
            );
            
            // 只有當白球還在運動時才能使用藥水
            if (currentSpeed > 0.1) {
                Matter.Body.setVelocity(whiteBall.body, { x: 0, y: 0 });
                drugUsed = true;
                updateGameStatus('使用藥水停球！');
                
                // 播放音效
                playDrugSound();
            }
        }
    }
});

// 藥水音效
function playDrugSound() {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.start();
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    oscillator.stop(audioContext.currentTime + 0.1);
}

// 開始遊戲
gameLoop();
