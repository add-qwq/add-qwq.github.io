const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');
const SERVER_SIZE = 60;
const root = document.documentElement;
const body = document.body;

let width, height;
let particles = [];
let explosions = [];
let annotations = [];
let processingTasks = [];
let mode = 'normal';
let wafEnabled = false;
let frameCount = 0;
let isLightMode = false;
let educationPanelVisible = false;

let stats = {
    cpu: 0,
    bandwidth: 0,
    connections: 0,
    health: 100,
    totalReq: 0,
    totalVol: 0
};

let highCpuDuration = 0;
const HIGH_CPU_THRESHOLD = 90;
const CPU_CRASH_DURATION = 200;

let attackerX, serverX, centerY;
let wallX;

function resize() {
    width = window.innerWidth;
    height = document.getElementById('vis-container').clientHeight;
    canvas.width = width;
    canvas.height = height;

    attackerX = width * 0.1;
    serverX = width * 0.85;
    wallX = width * 0.5;
    centerY = height / 2;
}
window.addEventListener('resize', resize);
resize();

function detectMobileDevice() {
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    const isSmallScreen = window.innerWidth < 768;
    if (isMobile || isSmallScreen) {
        alert("Please enable 'Desktop Site' in your browser for the best experience!");
    }
}

detectMobileDevice();

function toggleEducationPanel() {
    educationPanelVisible = !educationPanelVisible;
    const panel = document.getElementById('education-panel');
    const btn = document.getElementById('btn-education');

    if (educationPanelVisible) {
        panel.classList.add('show');
        btn.classList.add('active');
    } else {
        panel.classList.remove('show');
        btn.classList.remove('active');
    }
}

(function () {
    const tooltip = document.createElement('div');
    tooltip.className = 'custom-tooltip top';
    document.body.appendChild(tooltip);

    const tooltipButtons = document.querySelectorAll('button[data-tooltip]');
    let hideTimer = null;
    let showTimer = null;
    let currentBtn = null;
    let hasShown = false;
    const SHOW_DELAY = 200;

    tooltipButtons.forEach(button => {
        button.addEventListener('mouseenter', function (e) {
            clearTimeout(hideTimer);
            currentBtn = this;

            if (hasShown) {
                clearTimeout(showTimer);
                if (tooltip.classList.contains('show')) {
                    tooltip.classList.remove('show');
                    setTimeout(() => showTooltip(this), 50);
                } else {
                    showTooltip(this);
                }
            } else {
                clearTimeout(showTimer);
                showTimer = setTimeout(() => {
                    if (currentBtn === this) {
                        showTooltip(this);
                        hasShown = true;
                    }
                }, SHOW_DELAY);
            }
        });

        button.addEventListener('mouseleave', function () {
            hideTimer = setTimeout(() => {
                tooltip.classList.remove('show');
                currentBtn = null;
                hasShown = false;
            }, 20);
        });
    });

    window.addEventListener('resize', function () {
        clearTimeout(hideTimer);
        clearTimeout(showTimer);
        tooltip.classList.remove('show');
        currentBtn = null;
        hasShown = false;
    });

    function showTooltip(btn) {
        const text = btn.getAttribute('data-tooltip');
        const rect = btn.getBoundingClientRect();
        tooltip.textContent = text;
        tooltip.style.left = `${rect.left + rect.width / 2}px`;
        tooltip.style.top = `${rect.bottom + 10}px`;
        setTimeout(() => {
            tooltip.classList.add('show');
        }, 50);
    }
})();

function toggleTheme(manual = true) {
    isLightMode = !isLightMode;
    const btn = document.getElementById('btn-theme');
    if (isLightMode) {
        body.classList.add('light-mode');
        btn.innerHTML = '☀️ Toggle Theme';
    } else {
        body.classList.remove('light-mode');
        btn.innerHTML = '🌙 Toggle Theme';
    }
    if (manual) {
        localStorage.setItem('theme', isLightMode ? 'light' : 'dark');
    }
}

function initTheme() {
    const storedTheme = localStorage.getItem('theme');
    const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;

    if (storedTheme === 'light' || (!storedTheme && prefersLight)) {
        isLightMode = false;
        toggleTheme(false);
    }
}
initTheme();

class Packet {
    constructor(type) {
        this.type = type;
        this.x = attackerX + (Math.random() * 50 - 25);
        this.y = centerY + (Math.random() * 400 - 200);

        this.targetX = serverX;
        this.targetY = centerY + (Math.random() * 100 - 50);

        const angle = Math.atan2(this.targetY - this.y, this.targetX - this.x);

        let speed = 3;
        if (type === 'ddos') speed = 12;
        if (type === 'cc') speed = 7;

        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;

        this.blocked = false;
        this.dead = false;
        this.size = type === 'ddos' ? 1.5 : 3;

        this.color = '';
        this.renderColor = '';
        if (type === 'normal') this.color = this.renderColor = getCSSVar('--term-green');
        if (type === 'ddos') this.color = this.renderColor = getCSSVar('--term-red');
        if (type === 'cc') {
            this.color = this.renderColor = getCSSVar('--term-yellow');
        }
        if (type === 'bypass') this.color = getCSSVar('--term-yellow');
        if (type === 'bypass') this.renderColor = getCSSVar('--term-green');

        this.volume = 0;
        if (type === 'normal') this.volume = 0.004;
        else if (type === 'ddos') this.volume = 0.3;
        else if (type === 'cc' || type === 'bypass') this.volume = 0.02;
    }

    update() {
        if (wafEnabled && !this.blocked && Math.abs(this.x - wallX) < 10) {
            let blocked = false;

            if (this.type === 'ddos') blocked = true;
            if (this.type === 'cc') {
                if (Math.random() > 0.3) blocked = true;
            }

            if (this.type === 'bypass') {
                if (Math.random() > 0.95) blocked = true;
                else {
                    this.renderColor = this.color;
                    annotations.push({
                        x: this.x, y: this.y,
                        text: Math.random() > 0.5 ? '[Fake User-Agent]' : '[IP Spoofing]',
                        life: 40
                    });
                }
            }

            if (blocked) {
                stats.totalReq++;
                stats.totalVol += this.volume;

                this.blocked = true;
                this.vx = -this.vx * 0.5;
                this.vy = -this.vy * 0.5;
                this.dead = true;
                spawnExplosion(this.x, this.y, this.renderColor, true);
                return;
            }
        }

        this.x += this.vx;
        this.y += this.vy;

        if (Math.abs(this.x - serverX) < SERVER_SIZE / 2 && Math.abs(this.y - centerY) < SERVER_SIZE && !this.dead) {
            this.dead = true;
            if (stats.health > 0) {
                stats.totalReq++;
                stats.totalVol += this.volume;
                hitServer(this.type);
            }
            if (!this.blocked) spawnExplosion(this.x, this.y, this.color, false);
        }

        if (this.x > width || this.x < 0) this.dead = true;
    }

    draw() {
        ctx.fillStyle = this.renderColor;
        ctx.shadowBlur = 5;
        ctx.shadowColor = this.renderColor;

        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x - this.vx * 3, this.y - this.vy * 3);
        ctx.strokeStyle = this.renderColor;
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1.0;
    }
}

function hitServer(type) {
    if (type === 'normal') {
        stats.bandwidth += 0.5;
        stats.cpu += 0.5;
        stats.connections += 1;
        stats.health = Math.min(100, stats.health + 0.5);
    } else if (type === 'ddos') {
        stats.bandwidth += 12.0;
        stats.connections += 8;
        stats.health = Math.max(0, stats.health - 0.7);
    } else if (type === 'cc' || type === 'bypass') {
        stats.bandwidth += 1.5;
        processingTasks.push({ life: 100 });
        stats.connections += 3;

        stats.health = Math.max(0, stats.health - 0.2);
    }
}

function spawnExplosion(x, y, color, isBlocked) {
    for (let i = 0; i < (isBlocked ? 10 : 5); i++) {
        explosions.push({
            x: x, y: y,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 1.0,
            color: color
        });
    }
}

function loop() {
    ctx.fillStyle = getCSSVar('--bg-color');
    ctx.globalAlpha = isLightMode ? 0.8 : 0.4;
    ctx.fillRect(0, 0, width, height);
    ctx.globalAlpha = 1.0;

    drawBackgroundGrid();

    drawNetworkLines();
    drawEntities();

    spawnPackets();

    particles.forEach(p => { p.update(); p.draw(); });
    particles = particles.filter(p => !p.dead);

    updateExplosions();
    updateAnnotations();
    updateServerState();

    requestAnimationFrame(loop);
    frameCount++;
}

function getCSSVar(varName) {
    return getComputedStyle(body).getPropertyValue(varName).trim();
}

function drawBackgroundGrid() {
    ctx.strokeStyle = getCSSVar('--grid-color');
    ctx.lineWidth = 0.5;
    for (let x = 0; x < width; x += 50) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
    }
    for (let y = 0; y < height; y += 50) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
    }
}

function drawEntities() {
    ctx.fillStyle = getCSSVar('--term-red');
    if (mode === 'normal') ctx.fillStyle = getCSSVar('--ui-border');

    for (let i = 0; i < 5; i++) {
        let y = centerY + (i - 2) * 60;
        ctx.fillRect(attackerX - 20, y - 10, 20, 20);
        if (mode !== 'normal' && Math.random() > 0.5) {
            ctx.fillStyle = isLightMode ? '#000' : '#fff';
            ctx.fillRect(attackerX - 18, y - 8, 4, 4);
            ctx.fillStyle = getCSSVar('--term-red');
        }
    }
    ctx.font = "14px 'Segoe UI', Arial, sans-serif";
    ctx.fillStyle = getCSSVar('--main-text-color');
    ctx.fillText("Internet / Attackers", attackerX - 50, centerY - 180);

    const loadColor = stats.cpu > 80 ? getCSSVar('--term-red') : getCSSVar('--term-green');
    ctx.fillStyle = isLightMode ? '#ccc' : '#222';
    ctx.strokeStyle = loadColor;
    ctx.lineWidth = 2;
    ctx.fillRect(serverX - 30, centerY - 60, 60, 120);
    ctx.strokeRect(serverX - 30, centerY - 60, 60, 120);

    let tasksHeight = Math.min(100, processingTasks.length * 2);
    ctx.fillStyle = 'rgba(255, 204, 0, 0.6)';
    ctx.fillRect(serverX - 28, centerY + 58 - tasksHeight, 56, tasksHeight);

    ctx.fillStyle = getCSSVar('--main-text-color');
    ctx.fillText("Web Server", serverX - 34, centerY - 70);
}

function updateAnnotations() {
    annotations = annotations.filter(a => {
        a.life--;
        return a.life > 0;
    });

    annotations.forEach(a => {
        ctx.fillStyle = a.color || getCSSVar('--term-yellow');
        ctx.globalAlpha = a.life / 40;
        ctx.font = "10px 'Segoe UI', Arial, sans-serif";
        ctx.fillText(a.text, a.x, a.y);
        ctx.globalAlpha = 1.0;
    });
}

function drawNetworkLines() {
    ctx.strokeStyle = getCSSVar('--ui-border');
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = -2; i <= 2; i++) {
        let yOffset = i * 50;
        ctx.moveTo(attackerX, centerY + yOffset);
        ctx.lineTo(serverX, centerY + yOffset / 2);
    }
    ctx.stroke();

    if (wafEnabled) {
        ctx.strokeStyle = getCSSVar('--term-blue');
        ctx.lineWidth = 3;
        ctx.shadowBlur = 15;
        ctx.shadowColor = getCSSVar('--term-blue');
        ctx.beginPath();
        ctx.moveTo(wallX, centerY - 200);
        ctx.lineTo(wallX, centerY + 200);
        ctx.stroke();

        let scanY = centerY - 200 + (frameCount * 3 % 390);
        ctx.fillStyle = 'rgba(0, 204, 255, 0.5)';
        ctx.fillRect(wallX - 2, scanY, 4, 20);

        ctx.shadowBlur = 0;

        ctx.fillStyle = getCSSVar('--term-blue');
        ctx.font = "12px 'Segoe UI', Arial, sans-serif";
        ctx.fillText("WAF Enabled", wallX - 25, centerY - 210);
    } else {
        ctx.strokeStyle = getCSSVar('--ui-border');
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(wallX, centerY - 200);
        ctx.lineTo(wallX, centerY + 200);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function spawnPackets() {
    let rate = 0.02;
    if (mode === 'ddos') rate = 0.8;
    if (mode === 'cc') rate = 0.4;
    if (mode === 'bypass') rate = 0.5;

    if (Math.random() < 0.02) particles.push(new Packet('normal'));

    if (mode !== 'normal') {
        let count = 1;
        if (mode === 'ddos') count = 5;

        for (let i = 0; i < count; i++) {
            if (Math.random() < rate) particles.push(new Packet(mode));
        }
    }
}

function updateExplosions() {
    explosions.forEach(e => {
        e.x += e.vx;
        e.y += e.vy;
        e.life -= 0.05;

        ctx.globalAlpha = e.life;
        ctx.fillStyle = e.color;
        ctx.beginPath();
        ctx.arc(e.x, e.y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
    });
    explosions = explosions.filter(e => e.life > 0);
}

function updateServerState() {
    let processingPower = 2;
    processingTasks = processingTasks.filter(t => {
        t.life -= 1;
        return t.life > 0;
    });

    let targetCpu = processingTasks.length * 3;
    stats.cpu += (Math.max(2, targetCpu) - stats.cpu) * 0.1;

    stats.bandwidth *= 0.93;
    stats.connections = Math.max(0, Math.min(300, stats.connections * 0.97));

    let cpuVal = Math.min(100, Math.round(stats.cpu));
    if (cpuVal >= HIGH_CPU_THRESHOLD) {
        highCpuDuration++;
        if (highCpuDuration >= CPU_CRASH_DURATION) {
            stats.health = Math.max(0, stats.health - 2);
        }
    } else {
        highCpuDuration = 0;
    }

    updateHUD();
}

function formatVolume(gb) {
    if (gb > 1024 * 1024) return (gb / (1024 * 1024)).toFixed(2) + " PB";
    if (gb > 1024) return (gb / 1024).toFixed(2) + " TB";
    return gb.toFixed(1) + " GB";
}

function updateHUD() {
    let cpuVal = Math.min(100, Math.round(stats.cpu));
    let bwVal = Math.min(100, Math.round(stats.bandwidth));
    let connVal = Math.round(stats.connections);

    document.getElementById('txt-cpu').innerText = cpuVal + "%";
    document.getElementById('bar-cpu').style.width = cpuVal + "%";

    document.getElementById('txt-bw').innerText = bwVal + "%";
    document.getElementById('bar-bw').style.width = bwVal + "%";

    document.getElementById('txt-conn').innerText = connVal;
    document.getElementById('bar-conn').style.width = (connVal / 300 * 100) + "%";

    document.getElementById('txt-total-req').innerText = stats.totalReq.toLocaleString();
    document.getElementById('txt-total-vol').innerText = formatVolume(stats.totalVol);

    const alertBox = document.getElementById('server-alert');
    if (stats.health <= 0) {
        alertBox.style.display = 'block';
        if (bwVal >= 95) alertBox.innerText = "⛔Server crashed (Bandwidth exhausted)";
        else if (cpuVal >= 95 && highCpuDuration >= CPU_CRASH_DURATION) alertBox.innerText = "⛔Server crashed (CPU overloaded)";
        else if (connVal >= 180) alertBox.innerText = "⛔Server crashed (Connections maxed)";
        else alertBox.innerText = "⛔Server crashed (Service unavailable)";
    } else if (cpuVal > 90 || bwVal > 90) {
        alertBox.style.display = 'block';
        alertBox.innerText = cpuVal > 90 ? "⚠️CPU Overload (Application layer pressure)" : "⚠️Bandwidth Saturation (Network layer pressure)";
    } else {
        alertBox.style.display = 'none';
    }
}

function setMode(m) {
    mode = m;
    document.querySelectorAll('.controls button').forEach(b => {
        if (b.id !== 'btn-waf' && b.id !== 'btn-theme' && b.id !== 'btn-restart' && b.id !== 'btn-education') b.classList.remove('active');
    });
    if (m !== 'waf') document.getElementById('btn-' + m).classList.add('active');
}

function toggleWAF() {
    wafEnabled = !wafEnabled;
    const btn = document.getElementById('btn-waf');
    btn.innerText = wafEnabled ? "CDN-WAF: On" : "CDN-WAF: Off";
    btn.classList.toggle('active');
}

function restartServer() {
    stats.health = 200;
    stats.cpu = 5;
    stats.bandwidth = 2;
    stats.connections = 0;
    stats.totalReq = 0;
    stats.totalVol = 0;
    processingTasks = [];
    highCpuDuration = 0;
}

function checkAnswer(questionId, radioEl) {
    const correctAnswers = {
        q1: 'b',
        q2: 'b',
        q3: 'b',
        q4: 'b',
        q5: 'c'
    };
    const resultEl = document.getElementById(questionId + '-result');

    if (radioEl.value === correctAnswers[questionId]) {
        resultEl.style.color = getCSSVar('--term-green');
        resultEl.innerText = 'Correct answer!';
    } else {
        resultEl.style.color = getCSSVar('--term-red');
        resultEl.innerText = 'Wrong answer! Try again?';
    }
}

function getAnswerLabel(answerVal) {
    const labelMap = { a: 'A', b: 'B', c: 'C', d: 'D' };
    return labelMap[answerVal] || '';
}

function calculateScore() {
    const correctAnswers = { q1: 'b', q2: 'b', q3: 'b', q4: 'b', q5: 'c' };
    let correctCount = 0;
    let totalCount = Object.keys(correctAnswers).length;

    Object.keys(correctAnswers).forEach(qId => {
        const selectedOption = document.querySelector(`input[name="${qId}"]:checked`);
        if (selectedOption && selectedOption.value === correctAnswers[qId]) {
            correctCount++;
        }
    });

    const score = (correctCount / totalCount) * 100;
    const scoreEl = document.getElementById('score-result');

    if (score === 100) {
        scoreEl.innerHTML = `Perfect score! (${correctCount}/${totalCount})`;
    } else if (score >= 80) {
        scoreEl.innerHTML = `Excellent! Score: ${score} points (${correctCount}/${totalCount})`;
    } else if (score >= 60) {
        scoreEl.innerHTML = `Pass! Score: ${score} points (${correctCount}/${totalCount}), you can review the knowledge`;
    } else {
        scoreEl.innerHTML = `Needs improvement! Score: ${score} points (${correctCount}/${totalCount})`;
    }
}

loop();