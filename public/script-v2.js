// Pong League 2.0 - Enhanced Client JavaScript with Tournament Support
class PongLeague2Client {
    constructor() {
        this.socket = null;
        this.gameState = {
            playerName: '',
            leagueJoined: false,
            currentMatch: null,
            gameActive: false,
            score: { player1: 0, player2: 0 },
            isPlayer1: false,
            serverGameState: null,
            matchday: 0,
            totalMatchdays: 0,
            // Tournament-specific state
            gameMode: 'classic',
            tournamentBracket: null,
            currentRound: 0,
            totalRounds: 0,
            eliminated: false,
            goldenGoalMode: false,
            receivedBye: false,
            matchDuration: 180, // default
        };

        // Enhanced performance tracking
        this.performance = {
            fps: 0,
            frameCount: 0,
            lastFpsTime: 0,
            targetFps: 60,
            adaptiveFps: true,
            quality: 'high'
        };

        // Network optimization
        this.network = {
            latency: 0,
            quality: 'good',
            reconnectAttempts: 0,
            maxReconnectAttempts: 5,
            pingInterval: null,
            lastPingTime: 0
        };

        // Input handling with prediction
        this.input = {
            state: { up: false, down: false },
            lastSent: { up: false, down: false },
            prediction: true,
            buffer: [],
            frameNumber: 0
        };

        // Canvas and rendering
        this.canvas = null;
        this.ctx = null;
        this.animationId = null;
        this.renderBuffer = [];

        // Device capabilities
        this.device = {
            isMobile: false,
            isTablet: false,
            hasTouch: false,
            pixelRatio: 1,
            performanceLevel: 'high'
        };

        // Audio system
        this.audio = {
            enabled: true,
            volume: 0.5,
            sounds: new Map()
        };

        // UI state
        this.ui = {
            currentSection: 'joinSection',
            modalsOpen: new Set(),
            notifications: []
        };

        this.init();
    }

    async init() {
        try {
            console.log('Initializing Pong League 2.0...');
            
            this.detectDeviceCapabilities();
            this.initAudio();
            this.setupEventListeners();
            this.initBackgroundEffects();
            this.initSocket();
            
            console.log('Pong League 2.0 initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Pong League 2.0:', error);
            this.showNotification('Initialization failed: ' + error.message, 'error');
        }
    }

    detectDeviceCapabilities() {
        this.device = {
            isMobile: /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
            isTablet: /iPad|Android/i.test(navigator.userAgent) && window.innerWidth > 768,
            hasTouch: 'ontouchstart' in window,
            pixelRatio: window.devicePixelRatio || 1,
            memory: navigator.deviceMemory || 4,
            cores: navigator.hardwareConcurrency || 4,
            webGL: this.detectWebGL(),
            performanceLevel: this.detectPerformanceLevel()
        };

        this.updateDeviceUI();
        console.log('Device capabilities detected:', this.device);
    }

    detectWebGL() {
        try {
            const canvas = document.createElement('canvas');
            return !!(canvas.getContext('webgl') || canvas.getContext('experimental-webgl'));
        } catch (e) {
            return false;
        }
    }

    detectPerformanceLevel() {
        const { memory, cores, isMobile } = this.device;
        
        if (isMobile) {
            return memory >= 6 ? 'medium' : 'low';
        }
        
        if (memory >= 8 && cores >= 8) return 'high';
        if (memory >= 4 && cores >= 4) return 'medium';
        return 'low';
    }

    updateDeviceUI() {
        const deviceTypeEl = document.getElementById('deviceType');
        const performanceLevelEl = document.getElementById('performanceLevel');
        
        if (deviceTypeEl) {
            deviceTypeEl.textContent = this.device.isMobile ? 'Mobile' : 
                                     this.device.isTablet ? 'Tablet' : 'Desktop';
        }
        
        if (performanceLevelEl) {
            performanceLevelEl.textContent = 
                this.device.performanceLevel.charAt(0).toUpperCase() + 
                this.device.performanceLevel.slice(1);
        }

        if (this.device.hasTouch && this.device.isMobile) {
            const touchControls = document.getElementById('touchControls');
            if (touchControls) touchControls.classList.remove('hidden');
        }
    }

    initAudio() {
        try {
            if (typeof AudioContext !== 'undefined' || typeof webkitAudioContext !== 'undefined') {
                this.audio.context = new (AudioContext || webkitAudioContext)();
            }
            this.loadSoundEffects();
        } catch (error) {
            console.warn('Audio initialization failed:', error);
            this.audio.enabled = false;
        }
    }

    loadSoundEffects() {
        const sounds = {
            paddleHit: this.createToneBuffer(440, 0.1),
            goal: this.createToneBuffer(880, 0.3),
            matchStart: this.createToneBuffer(660, 0.2),
            notification: this.createToneBuffer(550, 0.15),
            goldenGoal: this.createToneBuffer(1000, 0.5),
            elimination: this.createToneBuffer(300, 0.8),
            victory: this.createToneBuffer(800, 0.6)
        };

        this.audio.sounds = new Map(Object.entries(sounds));
    }

    createToneBuffer(frequency, duration) {
        if (!this.audio.context) return null;
        
        const sampleRate = this.audio.context.sampleRate;
        const buffer = this.audio.context.createBuffer(1, sampleRate * duration, sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < buffer.length; i++) {
            data[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.3 * 
                      Math.exp(-i / (sampleRate * duration * 0.3));
        }
        
        return buffer;
    }

    playSound(soundName, volume = 1) {
        if (!this.audio.enabled || !this.audio.context) return;
        
        const buffer = this.audio.sounds.get(soundName);
        if (!buffer) return;
        
        const source = this.audio.context.createBufferSource();
        const gainNode = this.audio.context.createGain();
        
        source.buffer = buffer;
        gainNode.gain.setValueAtTime(this.audio.volume * volume, this.audio.context.currentTime);
        
        source.connect(gainNode);
        gainNode.connect(this.audio.context.destination);
        
        source.start();
    }

    setupEventListeners() {
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        
        this.setupTouchControls();
        
        window.addEventListener('focus', () => this.handleWindowFocus());
        window.addEventListener('blur', () => this.handleWindowBlur());
        window.addEventListener('beforeunload', () => this.cleanup());
        window.addEventListener('resize', () => this.handleWindowResize());
        
        document.addEventListener('visibilitychange', () => this.handleVisibilityChange());
        
        window.addEventListener('online', () => this.handleNetworkChange(true));
        window.addEventListener('offline', () => this.handleNetworkChange(false));
    }

    setupTouchControls() {
        const upBtn = document.getElementById('upBtn');
        const downBtn = document.getElementById('downBtn');
        
        if (upBtn && downBtn) {
            [upBtn, downBtn].forEach(btn => {
                btn.addEventListener('contextmenu', e => e.preventDefault());
                btn.style.touchAction = 'manipulation';
            });
            
            upBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.input.state.up = true;
                this.sendPlayerInput();
            });
            
            upBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.input.state.up = false;
                this.sendPlayerInput();
            });
            
            downBtn.addEventListener('touchstart', (e) => {
                e.preventDefault();
                this.input.state.down = true;
                this.sendPlayerInput();
            });
            
            downBtn.addEventListener('touchend', (e) => {
                e.preventDefault();
                this.input.state.down = false;
                this.sendPlayerInput();
            });
        }
    }

    initSocket() {
        try {
            this.socket = io({
                transports: ['websocket', 'polling'],
                timeout: 20000,
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                reconnectionAttempts: this.network.maxReconnectAttempts
            });

            this.setupSocketEventListeners();
            this.startNetworkMonitoring();
            
        } catch (error) {
            console.error('Socket initialization failed:', error);
            this.showNotification('Failed to connect to server', 'error');
        }
    }

    setupSocketEventListeners() {
        // Connection events
        this.socket.on('connect', () => this.handleSocketConnect());
        this.socket.on('disconnect', (reason) => this.handleSocketDisconnect(reason));
        this.socket.on('connect_error', (error) => this.handleConnectionError(error));
        this.socket.on('reconnect', (attemptNumber) => this.handleReconnect(attemptNumber));
        this.socket.on('reconnect_failed', () => this.handleReconnectFailed());

        // Server info
        this.socket.on('server-info', (data) => this.handleServerInfo(data));
        
        // League events
        this.socket.on('joined-league-enhanced', (data) => this.handleJoinedLeague(data));
        this.socket.on('league-started-enhanced', (data) => this.handleLeagueStarted(data));
        this.socket.on('player-joined-enhanced', (data) => this.handlePlayerJoined(data));
        this.socket.on('player-left-enhanced', (data) => this.handlePlayerLeft(data));
        
        // Tournament-specific events
        this.socket.on('tournament-bracket-created', (data) => this.handleTournamentBracketCreated(data));
        this.socket.on('tournament-round-started', (data) => this.handleTournamentRoundStarted(data));
        this.socket.on('tournament-bye', (data) => this.handleTournamentBye(data));
        this.socket.on('tournament-finished-enhanced', (data) => this.handleTournamentFinished(data));
        this.socket.on('tournament-bracket-updated', (data) => this.handleTournamentBracketUpdated(data));
        this.socket.on('tournament-round-announcement', (data) => this.handleTournamentRoundAnnouncement(data));
        
        // Match events
        this.socket.on('matchday-started-enhanced', (data) => this.handleMatchdayStarted(data));
        this.socket.on('match-start-enhanced', (data) => this.handleMatchStart(data));
        this.socket.on('game-state-update-enhanced', (data) => this.handleGameStateUpdate(data));
        this.socket.on('goal-scored-enhanced', (data) => this.handleGoalScored(data));
        this.socket.on('paddle-hit', (data) => this.handlePaddleHit(data));
        this.socket.on('match-finished-enhanced', (data) => this.handleMatchFinished(data));
        this.socket.on('matchday-finished-enhanced', (data) => this.handleMatchdayFinished(data));
        
        // Golden Goal events
        this.socket.on('golden-goal-warning', (data) => this.handleGoldenGoalWarning(data));
        this.socket.on('golden-goal-mode', (data) => this.handleGoldenGoalMode(data));
        
        // League completion
        this.socket.on('league-finished-enhanced', (data) => this.handleLeagueFinished(data));
        
        // Timer and progress
        this.socket.on('timer-update', (data) => this.handleTimerUpdate(data));
        
        // Network monitoring
        this.socket.on('pong', (timestamp) => this.handlePong(timestamp));
        
        // Error handling
        this.socket.on('error', (error) => this.handleServerError(error));
        this.socket.on('server-shutdown', (data) => this.handleServerShutdown(data));
        this.socket.on('commentary-started', () => {
    console.log('Commentary started');
    if (!this.commentaryReceiver) {
        this.commentaryReceiver = new CommentaryReceiver();
    }
    this.commentaryReceiver.start();
    this.showNotification('Live commentary started', 'info');
});

this.socket.on('commentary-stopped', () => {
    console.log('Commentary stopped');
    if (this.commentaryReceiver) {
        this.commentaryReceiver.stop();
    }
    this.showNotification('Live commentary ended', 'info');
});

this.socket.on('commentary-chunk', async (data) => {
    if (this.commentaryReceiver && this.commentaryReceiver.isActive) {
        await this.commentaryReceiver.receiveChunk(data.data);
    }
});

// Initialize commentary receiver in constructor
this.commentaryReceiver = null;
    }

    startNetworkMonitoring() {
        this.network.pingInterval = setInterval(() => {
            if (this.socket?.connected) {
                this.network.lastPingTime = Date.now();
                this.socket.emit('ping', this.network.lastPingTime);
            }
        }, 5000);
    }

    // Enhanced Socket Event Handlers
    handleSocketConnect() {
        console.log('Connected to Pong League 2.0 server');
        this.updateConnectionStatus('connected');
        this.network.reconnectAttempts = 0;
        this.showNotification('Connected to server', 'success');
    }

    handleSocketDisconnect(reason) {
        console.log('Disconnected from server:', reason);
        this.updateConnectionStatus('disconnected');
        
        if (this.gameState.gameActive) {
            this.gameState.gameActive = false;
            this.showNotification('Connection lost during match', 'error');
        }
        
        const messages = {
            'io server disconnect': 'Server disconnected',
            'io client disconnect': 'Client disconnected',
            'ping timeout': 'Connection timeout',
            'transport close': 'Connection lost',
            'transport error': 'Network error'
        };
        
        this.showNotification(messages[reason] || 'Disconnected from server', 'warning');
    }

    handleConnectionError(error) {
        console.error('Connection error:', error);
        this.updateConnectionStatus('error');
        this.network.reconnectAttempts++;
        
        if (this.network.reconnectAttempts < this.network.maxReconnectAttempts) {
            this.showNotification(`Connection failed, retrying... (${this.network.reconnectAttempts}/${this.network.maxReconnectAttempts})`, 'warning');
        } else {
            this.showNotification('Failed to connect to server. Please refresh the page.', 'error');
        }
    }

    handleReconnect(attemptNumber) {
        console.log('Reconnected after', attemptNumber, 'attempts');
        this.updateConnectionStatus('connected');
        this.showNotification('Reconnected to server', 'success');
        
        if (this.gameState.playerName && this.gameState.leagueJoined) {
            this.socket.emit('reconnect-player', {
                playerName: this.gameState.playerName,
                reconnectToken: Date.now()
            });
        }
    }

    handleReconnectFailed() {
        console.error('Failed to reconnect to server');
        this.updateConnectionStatus('failed');
        this.showNotification('Failed to reconnect. Please refresh the page.', 'error');
    }

    handleServerInfo(data) {
        console.log('Server info received:', data);
        this.updateServerVersion(data.version);
        
        if (data.gameConfig) {
            this.updateGameConfig(data.gameConfig);
        }
    }

    handleJoinedLeague(data) {
        this.gameState.playerName = data.playerName;
        this.gameState.leagueJoined = true;
        
        this.updateLeagueInfo(data.league, data.playersCount);
        this.showSection('waitingSection');
        this.showNotification(`Welcome to ${data.league.name}!`, 'success');
        
        if (data.serverInfo?.version) {
            this.updateServerVersion(data.serverInfo.version);
        }
    }

handleLeagueStarted(data) {
    console.log('League started with enhanced features:', data);
    this.gameState.gameMode = data.gameMode || 'classic';
    this.gameState.totalMatchdays = data.totalMatchdays;
    this.gameState.matchDuration = data.matchDuration || 180;
    
    this.showSection('gameSection');
    this.initGame();
    
    if (data.gameMode === 'tournament') {
        this.showNotification(`Tournament has begun! Matches are ${this.formatDuration(data.matchDuration)} long.`, 'success');
        this.showTournamentUI();
    } else {
        this.showNotification(`Championship has begun! Matches are ${this.formatDuration(data.matchDuration)} long.`, 'success');
    }
    
    this.playSound('matchStart');
}

    // Tournament-specific handlers
    handleTournamentBracketUpdated(data) {
    console.log('Tournament bracket updated:', data);
    this.gameState.tournamentBracket = data.bracket;
    
    if (typeof displayPlayerBracket === 'function') {
        displayPlayerBracket(data.bracket);
    }
}

handleTournamentRoundAnnouncement(data) {
    console.log('Tournament round announcement:', data);
    
    // Show special announcement for finals/semi-finals
    const announcement = document.createElement('div');
    announcement.className = 'tournament-announcement';
    announcement.innerHTML = `
        <div class="announcement-content">
            <h2>${data.message}</h2>
            <p>${data.roundName} - Get Ready!</p>
        </div>
    `;
    
    document.body.appendChild(announcement);
    
    this.playSound(data.roundName === 'FINAL' ? 'victory' : 'notification');
    
    setTimeout(() => {
        announcement.remove();
    }, 5000);
}
    handleTournamentBracketCreated(data) {
        console.log('Tournament bracket created:', data);
        this.gameState.tournamentBracket = data.bracket;
        this.gameState.totalRounds = data.totalRounds;
        this.gameState.currentRound = data.currentRound;
        
        this.displayTournamentBracket(data.bracket);
        this.showNotification(`Tournament bracket created! ${data.totalRounds} rounds to championship!`, 'success');
    }

    handleTournamentRoundStarted(data) {
        console.log('Tournament round started:', data);
        this.gameState.currentRound = data.round;
        
        this.updateTournamentProgress(data.round, data.totalRounds);
        
        // Find player's match in this round
        const playerMatch = data.matches.find(match => 
            match.player1 === this.gameState.playerName || match.player2 === this.gameState.playerName
        );

        if (playerMatch) {
            if (playerMatch.isBye) {
                this.handleTournamentBye({ round: data.round, message: `You received a bye in round ${data.round}` });
            } else {
                this.gameState.currentMatch = playerMatch;
                this.gameState.isPlayer1 = playerMatch.player1 === this.gameState.playerName;
                this.updateCurrentMatchDisplay(playerMatch);
                this.updatePlayerRole(this.gameState.isPlayer1);
                this.showNotification(`Round ${data.round} match: vs ${this.gameState.isPlayer1 ? playerMatch.player2 : playerMatch.player1}`, 'info');
            }
        } else {
            // Player might be eliminated
            if (!this.gameState.eliminated) {
                this.showEliminationScreen();
            }
        }
    }

    handleTournamentBye(data) {
        console.log('Player received bye:', data);
        this.gameState.receivedBye = true;
        
        this.showByeScreen(data.round, data.message);
        this.showNotification(data.message, 'info');
        this.playSound('notification');
    }

 handleTournamentFinished(data) {
    console.log('Tournament finished:', data);
    this.gameState.eliminated = false; // Reset for results display
    
    // CRITICAL: Ensure we're in results section for tournament
    this.showSection('resultsSection');
    
    // Display ONLY tournament results (no league table)
    this.displayPureTournamentResults(data);
    
    const isChampion = data.champion === this.gameState.playerName;
    this.showNotification(
        isChampion ? 'Congratulations! You are the tournament champion!' : `Tournament completed! Champion: ${data.champion}`,
        isChampion ? 'success' : 'info'
    );
    
    if (isChampion) {
        this.playSound('victory');
        this.createChampionEffect();
    }
}

    // Golden Goal handlers
    handleGoldenGoalWarning(data) {
        console.log('Golden Goal warning:', data);
        this.showGoldenGoalWarning(data.message, data.countdown);
        this.showNotification(data.message, 'warning');
        this.playSound('notification');
    }

    handleGoldenGoalMode(data) {
        console.log('Golden Goal mode activated:', data);
        this.gameState.goldenGoalMode = true;
        
        this.showGoldenGoalMode(data.message);
        this.showNotification('GOLDEN GOAL MODE! First goal wins!', 'warning');
        this.playSound('goldenGoal');
    }

    handleMatchdayStarted(data) {
        if (this.gameState.gameMode === 'tournament') return; // Tournament doesn't use matchdays
        
        console.log('Matchday started:', data);
        this.gameState.matchday = data.matchday;
        
        this.updateMatchProgress(data.matchday, data.totalMatchdays);
        
        const playerMatch = data.matches?.find(match => 
            match.player1 === this.gameState.playerName || match.player2 === this.gameState.playerName
        );

        if (playerMatch) {
            this.gameState.currentMatch = playerMatch;
            this.gameState.isPlayer1 = playerMatch.player1 === this.gameState.playerName;
            this.updateCurrentMatchDisplay(playerMatch);
            this.updatePlayerRole(this.gameState.isPlayer1);
        } else {
            this.showByeRound(data.matchday);
        }
    }

handleMatchStart(data) {
    if (data.matchId === this.gameState.currentMatch?.id) {
        this.gameState.gameActive = true;
        this.gameState.goldenGoalMode = false; // Reset golden goal state
        this.gameState.matchDuration = data.matchDuration || 180;
        this.startInputHandler();
        this.updateMatchStatus('Match in progress...');
        this.showGameInstructions();
        this.playSound('matchStart');
        
        // Display match duration at start
        const timerEl = document.getElementById('gameTimer');
        if (timerEl) {
            timerEl.textContent = this.formatTime(this.gameState.matchDuration);
        }
    }
}

    handleGameStateUpdate(data) {
        if (this.gameState.gameActive) {
            this.gameState.serverGameState = data;
            this.gameState.goldenGoalMode = data.goldenGoalMode || false;
            this.updateScoreDisplay(data.score);
            this.updateRallyCount(data.rallyCount || 0);
        }
    }

    handleGoalScored(data) {
        this.gameState.score = data.score;
        this.updateScoreDisplay(data.score);
        
        const isPlayerGoal = data.scorer === this.gameState.playerName;
        let message = isPlayerGoal ? 'GOAL! You scored!' : `Goal by ${data.scorer}`;
        
        if (data.goldenGoalMode) {
            message += ' - GOLDEN GOAL WINNER!';
        }
        
this.showNotification(message, isPlayerGoal ? 'success' : 'warning');
        this.playSound('goal');
        
        this.showGoalEffect(isPlayerGoal);
    }

    handlePaddleHit(data) {
        this.playSound('paddleHit');
        
        if (data.player === this.gameState.playerName) {
            this.showNotification(`Nice hit! Rally: ${data.rallyCount}`, 'success');
        }
    }

    handleMatchFinished(data) {
        this.endMatch();
        
        let message, type;
        if (data.winner === 'draw') {
            message = 'Match ended in a draw!';
            type = 'warning';
        } else if (data.winner === this.gameState.playerName) {
            message = 'Victory! You won the match!';
            type = 'success';
            
            if (this.gameState.gameMode === 'tournament') {
                this.playSound('victory');
            }
        } else {
            message = `Match lost to ${data.winner}`;
            type = 'error';
            
            // Check if this eliminates the player in tournament mode
            if (this.gameState.gameMode === 'tournament' && data.winner !== this.gameState.playerName) {
                this.gameState.eliminated = true;
                setTimeout(() => {
                    this.showEliminationScreen();
                }, 3000);
            }
        }
        
        if (data.goldenGoal) {
            message += ' (Golden Goal)';
        }
        
        this.showNotification(message, type);
        this.showMatchSummary(data);
    }

    handleMatchdayFinished(data) {
        if (this.gameState.gameMode === 'tournament') return; // Tournament doesn't use matchdays
        
        this.updateMatchProgress(data.matchday, data.totalMatchdays || this.gameState.totalMatchdays);
        this.showNotification(`Matchday ${data.matchday} completed!`, 'success');
        
        if (data.nextMatchday) {
            setTimeout(() => {
                this.showNotification(`Preparing Matchday ${data.nextMatchday}...`, 'info');
            }, 3000);
        }
    }

    handleLeagueFinished(data) {
        this.showSection('resultsSection');
        this.displayLeagueResults(data);
        this.playSound('notification');
        
        const isWinner = data.awards.winner?.name === this.gameState.playerName;
        this.showNotification(
            isWinner ? 'Congratulations! You are the champion!' : 'League completed!',
            isWinner ? 'success' : 'info'
        );
    }

    handleTimerUpdate(data) {
        const timerEl = document.getElementById('gameTimer');
        if (timerEl) {
            timerEl.textContent = data.formatted || this.formatTime(data.timeLeft);
            
            if (data.goldenGoalMode) {
                timerEl.classList.add('golden-goal');
                timerEl.style.color = '#ffaa00';
            } else {
                timerEl.classList.remove('golden-goal');
                timerEl.style.color = '';
            }
            
            if (data.timeLeft <= 30 && !data.goldenGoalMode) {
                timerEl.classList.add('urgent');
            } else {
                timerEl.classList.remove('urgent');
            }
        }
    }

    handlePong(timestamp) {
        const latency = Date.now() - timestamp;
        this.network.latency = latency;
        this.updateLatencyDisplay(latency);
        
        this.network.quality = latency < 100 ? 'good' : latency < 200 ? 'ok' : 'poor';
        this.updateConnectionQuality(this.network.quality);
    }

    handleServerError(error) {
        console.error('Server error:', error);
        
        const errorMessages = {
            'no_league': 'No league available. Please wait for admin to create one.',
            'league_started': 'League has already started.',
            'invalid_name': 'Invalid player name. Please choose a different name.',
            'name_taken': 'Player name already taken.',
            'league_full': 'League is full. Please try again later.',
            'server_error': 'Server error occurred. Please try again.'
        };
        
        const message = errorMessages[error.type] || error.message || 'Unknown error occurred';
        this.showNotification(message, 'error');
    }

    handleServerShutdown(data) {
        this.showNotification('Server is shutting down for maintenance', 'warning');
        
        if (this.gameState.gameActive) {
            this.gameState.gameActive = false;
            this.stopInputHandler();
        }
    }

    // Input Handling
    handleKeyDown(e) {
        if (!this.gameState.gameActive || !this.gameState.currentMatch) return;
        
        let inputChanged = false;
        
        switch(e.code) {
            case 'ArrowUp':
            case 'KeyW':
                if (!this.input.state.up) {
                    this.input.state.up = true;
                    inputChanged = true;
                }
                e.preventDefault();
                break;
            case 'ArrowDown':
            case 'KeyS':
                if (!this.input.state.down) {
                    this.input.state.down = true;
                    inputChanged = true;
                }
                e.preventDefault();
                break;
        }
        
        if (inputChanged) {
            this.sendPlayerInput();
        }
    }

    handleKeyUp(e) {
        if (!this.gameState.gameActive || !this.gameState.currentMatch) return;
        
        let inputChanged = false;
        
        switch(e.code) {
            case 'ArrowUp':
            case 'KeyW':
                if (this.input.state.up) {
                    this.input.state.up = false;
                    inputChanged = true;
                }
                e.preventDefault();
                break;
            case 'ArrowDown':
            case 'KeyS':
                if (this.input.state.down) {
                    this.input.state.down = false;
                    inputChanged = true;
                }
                e.preventDefault();
                break;
        }
        
        if (inputChanged) {
            this.sendPlayerInput();
        }
    }

    sendPlayerInput() {
        if (!this.socket?.connected || !this.gameState.currentMatch) return;
        
        if (this.input.state.up !== this.input.lastSent.up || 
            this.input.state.down !== this.input.lastSent.down) {
            
            this.input.frameNumber++;
            
            this.socket.emit('player-input-enhanced', {
                input: { ...this.input.state },
                clientTimestamp: Date.now(),
                frameNumber: this.input.frameNumber
            });
            
            this.input.lastSent = { ...this.input.state };
        }
    }

    startInputHandler() {
        this.input.state = { up: false, down: false };
        this.input.lastSent = { up: false, down: false };
        this.input.frameNumber = 0;
    }

    stopInputHandler() {
        this.input.state = { up: false, down: false };
        this.input.lastSent = { up: false, down: false };
        this.sendPlayerInput();
    }

    // Window and Visibility Event Handlers
    handleWindowFocus() {
        if (this.gameState.gameActive) {
            this.input.state = { up: false, down: false };
            this.sendPlayerInput();
        }
    }

    handleWindowBlur() {
        if (this.gameState.gameActive) {
            this.input.state = { up: false, down: false };
            this.sendPlayerInput();
        }
    }

    handleWindowResize() {
        if (this.canvas) {
            this.adjustCanvasSize();
        }
    }

    handleVisibilityChange() {
        if (document.hidden) {
            this.performance.targetFps = 30;
            if (this.gameState.gameActive) {
                this.input.state = { up: false, down: false };
                this.sendPlayerInput();
            }
        } else {
            this.performance.targetFps = this.device.performanceLevel === 'high' ? 60 : 
                                       this.device.performanceLevel === 'medium' ? 45 : 30;
        }
    }

    handleNetworkChange(online) {
        if (online) {
            this.showNotification('Network connection restored', 'success');
            if (!this.socket?.connected) {
                this.socket?.connect();
            }
        } else {
            this.showNotification('Network connection lost', 'error');
            this.updateConnectionStatus('offline');
        }
    }

    // Game Initialization and Rendering
    initGame() {
        this.canvas = document.getElementById('gameCanvas');
        if (!this.canvas) {
            console.error('Game canvas not found');
            return;
        }
        
        this.ctx = this.canvas.getContext('2d');
        this.adjustCanvasSize();
        
        this.performance.targetFps = this.device.performanceLevel === 'high' ? 60 : 
                                   this.device.performanceLevel === 'medium' ? 45 : 30;
        
        this.startRenderLoop();
        this.startPerformanceMonitoring();
    }

    adjustCanvasSize() {
        if (!this.canvas) return;
        
        const container = this.canvas.parentElement;
        const maxWidth = container.clientWidth;
        const aspectRatio = 900 / 500;
        
        let canvasWidth = Math.min(maxWidth, 900);
        let canvasHeight = canvasWidth / aspectRatio;
        
        const pixelRatio = Math.min(this.device.pixelRatio, 2);
        
        this.canvas.width = canvasWidth * pixelRatio;
        this.canvas.height = canvasHeight * pixelRatio;
        this.canvas.style.width = canvasWidth + 'px';
        this.canvas.style.height = canvasHeight + 'px';
        
        this.ctx.scale(pixelRatio, pixelRatio);
        
        this.scaleX = canvasWidth / 900;
        this.scaleY = canvasHeight / 500;
    }

    startRenderLoop() {
        const render = (timestamp) => {
            if (this.performance.adaptiveFps) {
                const elapsed = timestamp - this.performance.lastFpsTime;
                const targetInterval = 1000 / this.performance.targetFps;
                
                if (elapsed >= targetInterval) {
                    this.render();
                    this.updateFPSCounter();
                    this.performance.lastFpsTime = timestamp;
                }
            } else {
                this.render();
                this.updateFPSCounter();
            }
            
            this.animationId = requestAnimationFrame(render);
        };
        
        render(performance.now());
    }

    render() {
        if (!this.canvas || !this.ctx) return;

        const width = 900;
        const height = 500;

        // Clear canvas with dark background
        this.ctx.fillStyle = '#000000';
        this.ctx.fillRect(0, 0, width, height);

        // Draw center line with glow effect
        this.drawCenterLine(width, height);

        if (this.gameState.serverGameState) {
            this.renderGameObjects(width, height);
        } else {
            this.renderWaitingState(width, height);
        }
    }

    drawCenterLine(width, height) {
        this.ctx.strokeStyle = '#333333';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([10, 10]);
        this.ctx.shadowColor = '#00ff88';
        this.ctx.shadowBlur = 5;
        
        this.ctx.beginPath();
        this.ctx.moveTo(width / 2, 0);
        this.ctx.lineTo(width / 2, height);
        this.ctx.stroke();
        
        this.ctx.setLineDash([]);
        this.ctx.shadowBlur = 0;
    }

    renderGameObjects(width, height) {
        const state = this.gameState.serverGameState;
        
        this.drawPaddles(state);
        this.drawBall(state);
        this.drawScore(state, width);
        this.drawPlayerIndicators(state, width);
        
        // Draw golden goal indicator if active
        if (this.gameState.goldenGoalMode) {
            this.drawGoldenGoalIndicator(width, height);
        }
    }

    drawPaddles(state) {
        const paddleWidth = 15;
        const paddleHeight = 80;
        
        // Left paddle (player1)
        this.ctx.fillStyle = this.gameState.isPlayer1 ? '#00ff88' : '#ffffff';
        this.ctx.shadowColor = this.gameState.isPlayer1 ? '#00ff88' : '#ffffff';
        this.ctx.shadowBlur = this.gameState.isPlayer1 ? 10 : 0;
        this.ctx.fillRect(0, state.player1Y, paddleWidth, paddleHeight);
        
        // Right paddle (player2)
        this.ctx.fillStyle = !this.gameState.isPlayer1 ? '#00ff88' : '#ffffff';
        this.ctx.shadowColor = !this.gameState.isPlayer1 ? '#00ff88' : '#ffffff';
        this.ctx.shadowBlur = !this.gameState.isPlayer1 ? 10 : 0;
        this.ctx.fillRect(900 - paddleWidth, state.player2Y, paddleWidth, paddleHeight);
        
        this.ctx.shadowBlur = 0;
    }

    drawBall(state) {
        const ballSize = 15;
        
        // Change ball color in golden goal mode
        this.ctx.fillStyle = this.gameState.goldenGoalMode ? '#ffaa00' : '#ffffff';
        this.ctx.shadowColor = this.gameState.goldenGoalMode ? '#ffaa00' : '#00ff88';
        this.ctx.shadowBlur = this.gameState.goldenGoalMode ? 12 : 8;
        this.ctx.fillRect(state.ballX, state.ballY, ballSize, ballSize);
        
        if (this.device.performanceLevel === 'high' && state.ballVelocity) {
            this.drawBallTrail(state);
        }
        
        this.ctx.shadowBlur = 0;
    }

    drawBallTrail(state) {
        const trailLength = 5;
        const velocity = state.ballVelocity;
        const speed = Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y);
        
        if (speed < 2) return;
        
        this.ctx.save();
        
        for (let i = 1; i <= trailLength; i++) {
            const alpha = (trailLength - i) / trailLength * 0.3;
            const trailX = state.ballX - (velocity.x * i * 0.5);
            const trailY = state.ballY - (velocity.y * i * 0.5);
            
            const trailColor = this.gameState.goldenGoalMode ? '255, 170, 0' : '0, 255, 136';
            this.ctx.fillStyle = `rgba(${trailColor}, ${alpha})`;
            this.ctx.fillRect(trailX, trailY, 15 - i, 15 - i);
        }
        
        this.ctx.restore();
    }

    drawScore(state, width) {
        this.ctx.font = 'bold 32px Orbitron';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#ffffff';
        this.ctx.shadowColor = '#00ff88';
        this.ctx.shadowBlur = 5;
        
        if (this.gameState.currentMatch) {
            const score1 = state.score[this.gameState.currentMatch.player1] || 0;
            const score2 = state.score[this.gameState.currentMatch.player2] || 0;
            
            this.ctx.fillText(score1.toString(), width / 4, 50);
            this.ctx.fillText(score2.toString(), width * 3 / 4, 50);
        }
        
        this.ctx.shadowBlur = 0;
    }

    drawPlayerIndicators(state, width) {
        this.ctx.font = '16px Orbitron';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#cccccc';
        
        if (this.gameState.currentMatch) {
            this.ctx.fillText(this.gameState.currentMatch.player1, width / 4, 80);
            this.ctx.fillText(this.gameState.currentMatch.player2, width * 3 / 4, 80);
            
            if (this.gameState.isPlayer1) {
                this.ctx.fillStyle = '#00ff88';
                this.ctx.fillText('YOU', width / 4, 100);
            } else {
                this.ctx.fillStyle = '#00ff88';
                this.ctx.fillText('YOU', width * 3 / 4, 100);
            }
        }
    }

    drawGoldenGoalIndicator(width, height) {
        this.ctx.save();
        this.ctx.font = 'bold 24px Orbitron';
        this.ctx.textAlign = 'center';
        this.ctx.fillStyle = '#ffaa00';
        this.ctx.shadowColor = '#ffaa00';
        this.ctx.shadowBlur = 10;
        this.ctx.fillText('GOLDEN GOAL', width / 2, height - 50);
        this.ctx.restore();
    }

    renderWaitingState(width, height) {
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        this.ctx.font = '20px Orbitron';
        this.ctx.textAlign = 'center';
        
        if (this.gameState.eliminated) {
            this.ctx.fillText('You have been eliminated', width / 2, height / 2);
            this.ctx.font = '16px Orbitron';
            this.ctx.fillText('Watching remaining matches...', width / 2, height / 2 + 40);
        } else if (this.gameState.receivedBye) {
            this.ctx.fillText('You received a bye this round', width / 2, height / 2);
            this.ctx.font = '16px Orbitron';
            this.ctx.fillText('Advancing automatically...', width / 2, height / 2 + 40);
        } else {
            this.ctx.fillText('Waiting for match...', width / 2, height / 2);
            
            if (!this.gameState.gameActive) {
                this.ctx.font = '16px Orbitron';
                this.ctx.fillText('Use WASD or Arrow Keys to move your paddle', width / 2, height / 2 + 40);
            }
        }
    }

    startPerformanceMonitoring() {
        setInterval(() => {
            this.updatePerformanceDisplay();
            this.adjustPerformanceSettings();
        }, 1000);
    }

    updateFPSCounter() {
        this.performance.frameCount++;
        const now = performance.now();
        
        if (now >= this.performance.lastFpsTime + 1000) {
            this.performance.fps = this.performance.frameCount;
            this.performance.frameCount = 0;
            this.performance.lastFpsTime = now;
        }
    }

    updatePerformanceDisplay() {
        const fpsEl = document.getElementById('fpsCounter');
        const qualityEl = document.getElementById('qualityIndicator');
        
        if (fpsEl) fpsEl.textContent = this.performance.fps;
        if (qualityEl) qualityEl.textContent = this.performance.quality;
    }

    adjustPerformanceSettings() {
        if (this.performance.fps < this.performance.targetFps * 0.8) {
            if (this.performance.quality !== 'low') {
                this.performance.quality = this.performance.fps < 30 ? 'low' : 'medium';
                this.performance.targetFps = this.performance.quality === 'low' ? 30 : 45;
                console.log(`Performance adjusted to ${this.performance.quality}`);
            }
        } else if (this.performance.fps > this.performance.targetFps * 0.95 && this.performance.quality !== 'high') {
            this.performance.quality = 'high';
            this.performance.targetFps = 60;
            console.log('Performance upgraded to high');
        }
    }

    // Tournament UI Methods
    showTournamentUI() {
        const gameSection = document.getElementById('gameSection');
        if (gameSection) {
            // Add tournament-specific UI elements
            const tournamentInfo = document.createElement('div');
            tournamentInfo.id = 'tournamentInfo';
            tournamentInfo.className = 'tournament-info';
            tournamentInfo.innerHTML = `
                <div class="tournament-header">
                    <h3>Tournament Mode</h3>
                    <div class="tournament-progress">
                        <span id="tournamentRound">Round 1</span> of <span id="tournamentTotalRounds">-</span>
                    </div>
                </div>
                <div id="tournamentBracket" class="tournament-bracket hidden">
                    <!-- Bracket will be populated here -->
                </div>
            `;
            
            const gameHeader = gameSection.querySelector('.game-header');
            if (gameHeader) {
                gameHeader.appendChild(tournamentInfo);
            }
        }
    }

    displayTournamentBracket(bracketData) {
        const bracketContainer = document.getElementById('tournamentBracket');
        if (!bracketContainer) return;
        
        bracketContainer.classList.remove('hidden');
        bracketContainer.innerHTML = this.generateBracketHTML(bracketData);
        
        console.log('Tournament bracket displayed');
    }

    generateBracketHTML(bracketData) {
        let html = '<div class="bracket-container">';
        
        for (let round = 1; round <= bracketData.totalRounds; round++) {
            const roundMatches = bracketData.rounds[round] || [];
            html += `<div class="bracket-round" data-round="${round}">`;
            html += `<div class="round-header">Round ${round}</div>`;
            
            roundMatches.forEach(match => {
                const status = match.completed ? 'completed' : match.isBye ? 'bye' : 'pending';
                const isPlayerMatch = match.player1 === this.gameState.playerName || 
                                    match.player2 === this.gameState.playerName;
                
                html += `<div class="bracket-match ${status} ${isPlayerMatch ? 'player-match' : ''}" data-match-id="${match.id}">`;
                
                if (match.isBye) {
                    html += `<div class="match-player winner">${match.player1}</div>`;
                    html += `<div class="bye-indicator">BYE</div>`;
                } else {
                    html += `<div class="match-player ${match.winner === match.player1 ? 'winner' : ''}">${match.player1}</div>`;
                    html += `<div class="match-vs">vs</div>`;
                    html += `<div class="match-player ${match.winner === match.player2 ? 'winner' : ''}">${match.player2}</div>`;
                }
                
                if (match.completed && match.score) {
                    html += `<div class="match-score">${match.score[match.player1]} - ${match.score[match.player2] || 0}</div>`;
                }
                
                html += '</div>';
            });
            
            html += '</div>';
        }
        
        html += '</div>';
        return html;
    }

    updateTournamentProgress(currentRound, totalRounds) {
        const roundEl = document.getElementById('tournamentRound');
        const totalRoundsEl = document.getElementById('tournamentTotalRounds');
        
        if (roundEl) roundEl.textContent = `Round ${currentRound}`;
        if (totalRoundsEl) totalRoundsEl.textContent = totalRounds;
    }

    showEliminationScreen() {
        this.gameState.eliminated = true;
        
        // Create elimination overlay
        const eliminationOverlay = document.createElement('div');
        eliminationOverlay.className = 'elimination-screen';
        eliminationOverlay.innerHTML = `
            <div class="elimination-content">
                <h2>Tournament Elimination</h2>
                <p>You have been eliminated from the tournament</p>
                <div class="elimination-stats">
                    <p>Thank you for participating!</p>
                    <p>You can continue watching the remaining matches</p>
                </div>
                <button class="btn btn-primary cyber-btn" onclick="this.parentElement.parentElement.remove()">
                    <span class="btn-text">CONTINUE WATCHING</span>
                </button>
            </div>
        `;
        
        document.body.appendChild(eliminationOverlay);
        
        this.showNotification('You have been eliminated from the tournament', 'error');
        this.playSound('elimination');
        
        setTimeout(() => {
            if (eliminationOverlay.parentElement) {
                eliminationOverlay.remove();
            }
        }, 10000);
    }

    showByeScreen(round, message) {
        const byeOverlay = document.createElement('div');
        byeOverlay.className = 'bye-screen';
        byeOverlay.innerHTML = `
            <div class="bye-content">
                <h2>Tournament Bye</h2>
                <p>${message}</p>
                <div class="bye-info">
                    <p>You automatically advance to the next round</p>
                </div>
                <button class="btn btn-primary cyber-btn" onclick="this.parentElement.parentElement.remove()">
                    <span class="btn-text">CONTINUE</span>
                </button>
            </div>
        `;
        
        document.body.appendChild(byeOverlay);
        
        setTimeout(() => {
            if (byeOverlay.parentElement) {
                byeOverlay.remove();
            }
        }, 8000);
    }

    showGoldenGoalWarning(message, countdown) {
        const warningOverlay = document.createElement('div');
        warningOverlay.className = 'golden-goal-warning';
        warningOverlay.innerHTML = `
            <div class="warning-content">
                <h2>⚠️ GOLDEN GOAL WARNING ⚠️</h2>
                <p>${message}</p>
                <div class="countdown" id="goldenGoalCountdown">${countdown}</div>
            </div>
        `;
        
        document.body.appendChild(warningOverlay);
        
        // Countdown timer
        let timeLeft = countdown;
        const countdownEl = document.getElementById('goldenGoalCountdown');
        const countdownTimer = setInterval(() => {
            timeLeft--;
            if (countdownEl) countdownEl.textContent = timeLeft;
            
            if (timeLeft <= 0) {
                clearInterval(countdownTimer);
                warningOverlay.remove();
            }
        }, 1000);
    }

    showGoldenGoalMode(message) {
        const modeOverlay = document.createElement('div');
        modeOverlay.className = 'golden-goal-mode';
        modeOverlay.innerHTML = `
            <div class="mode-content">
                <h2>⚡ GOLDEN GOAL MODE ⚡</h2>
                <p>${message}</p>
                <div class="mode-indicator">First goal wins!</div>
            </div>
        `;
        
        document.body.appendChild(modeOverlay);
        
        setTimeout(() => {
            if (modeOverlay.parentElement) {
                modeOverlay.remove();
            }
        }, 5000);
    }

    // UI Update Methods (continuing with existing and enhanced methods)
    updateConnectionStatus(status) {
        const indicator = document.getElementById('statusIndicator');
        const text = document.getElementById('statusText');
        
        if (indicator) indicator.className = `status-indicator ${status}`;
        if (text) {
            const statusTexts = {
                'connected': 'Connected',
                'connecting': 'Connecting...',
                'disconnected': 'Disconnected',
                'error': 'Connection Error',
                'failed': 'Failed',
                'offline': 'Offline'
            };
            text.textContent = statusTexts[status] || 'Unknown';
        }
    }

    updateLatencyDisplay(latency) {
        const latencyEl = document.getElementById('latencyDisplay');
        const pingEl = document.getElementById('pingDisplay');
        
        if (latencyEl) latencyEl.textContent = `${latency}ms`;
        if (pingEl) pingEl.textContent = `${latency}ms`;
    }

    updateConnectionQuality(quality) {
        const qualityColors = {
            'good': '#00ff88',
            'ok': '#ffaa00',
            'poor': '#ff4444'
        };
        
        const elements = document.querySelectorAll('.connection-quality');
        elements.forEach(el => {
            el.style.color = qualityColors[quality];
            el.textContent = quality.toUpperCase();
        });
        
        if (quality === 'poor' && this.gameState.gameActive) {
            this.showConnectionWarning(true);
        } else {
            this.showConnectionWarning(false);
        }
    }

    showConnectionWarning(show) {
        const warning = document.getElementById('connectionWarning');
        if (warning) {
            warning.classList.toggle('hidden', !show);
        }
    }

    updateServerVersion(version) {
        const versionEl = document.getElementById('serverVersion');
        if (versionEl) versionEl.textContent = version;
    }

    updateLeagueInfo(league, playerCount) {
        const leagueNameEl = document.getElementById('leagueName');
        const playerCountEl = document.getElementById('playerCount');
        const maxPlayersEl = document.getElementById('maxPlayers');
        
        if (leagueNameEl) leagueNameEl.textContent = league.name;
        if (playerCountEl) playerCountEl.textContent = playerCount;
        if (maxPlayersEl) maxPlayersEl.textContent = league.maxPlayers;
    }

    updateMatchProgress(currentMatchday, totalMatchdays) {
        const progressEl = document.getElementById('progressFill');
        const matchdayEl = document.getElementById('matchdayInfo');
        
        if (progressEl && totalMatchdays > 0) {
            const progress = (currentMatchday / totalMatchdays) * 100;
            progressEl.style.width = `${progress}%`;
        }
        
if (matchdayEl) {
            if (this.gameState.gameMode === 'tournament') {
                matchdayEl.textContent = `Round ${this.gameState.currentRound}/${this.gameState.totalRounds}`;
            } else {
                matchdayEl.textContent = `Matchday ${currentMatchday}/${totalMatchdays}`;
            }
        }
    }

    updateCurrentMatchDisplay(match) {
        const matchEl = document.getElementById('currentMatch');
        if (matchEl) {
            if (this.gameState.gameMode === 'tournament') {
                matchEl.innerHTML = `<strong>Tournament Match:</strong> ${match.player1} vs ${match.player2}`;
            } else {
                matchEl.innerHTML = `<strong>${match.player1}</strong> vs <strong>${match.player2}</strong>`;
            }
        }
    }

    updatePlayerRole(isPlayer1) {
        const roleEl = document.getElementById('playerRole');
        if (roleEl) {
            roleEl.classList.remove('hidden');
            const roleSpan = roleEl.querySelector('.role-highlight');
            if (roleSpan) {
                roleSpan.textContent = isPlayer1 ? 'Left' : 'Right';
            }
        }
    }

    updateMatchStatus(status) {
        const statusEl = document.getElementById('matchStatus');
        if (statusEl) {
            statusEl.textContent = status;
        }
    }

    updateScoreDisplay(score) {
        const scoreEl = document.getElementById('scoreDisplay');
        const yourScoreEl = document.getElementById('yourScore');
        
        if (scoreEl && this.gameState.currentMatch) {
            const score1 = score[this.gameState.currentMatch.player1] || 0;
            const score2 = score[this.gameState.currentMatch.player2] || 0;
            scoreEl.textContent = `${score1} - ${score2}`;
            
            if (yourScoreEl) {
                yourScoreEl.textContent = this.gameState.isPlayer1 ? score1 : score2;
            }
        }
    }

    updateRallyCount(count) {
        const rallyEl = document.getElementById('rallyCount');
        if (rallyEl) rallyEl.textContent = count;
    }

    showSection(sectionId) {
        const sections = ['joinSection', 'waitingSection', 'gameSection', 'resultsSection'];
        
        sections.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.classList.add('hidden');
            }
        });
        
        const targetSection = document.getElementById(sectionId);
        if (targetSection) {
            targetSection.classList.remove('hidden');
            this.ui.currentSection = sectionId;
        }
    }

    showByeRound(matchday) {
        this.updateMatchStatus(`Bye round - Matchday ${matchday}`);
        this.showNotification(`You have a bye this round. Next match coming soon...`, 'info');
    }

    showGameInstructions() {
        const instructions = document.getElementById('gameInstructions');
        if (instructions) {
            instructions.classList.remove('hidden');
            setTimeout(() => {
                instructions.classList.add('hidden');
            }, 5000);
        }
    }

    showGoalEffect(isPlayerGoal) {
        const effect = document.createElement('div');
        effect.className = `goal-effect ${isPlayerGoal ? 'player-goal' : 'opponent-goal'}`;
        effect.textContent = isPlayerGoal ? 'GOAL!' : 'GOAL';
        
        const canvas = document.getElementById('gameCanvas');
        if (canvas?.parentElement) {
            canvas.parentElement.appendChild(effect);
            
            setTimeout(() => {
                effect.remove();
            }, 2000);
        }
    }

    showMatchSummary(data) {
        const summary = {
            winner: data.winner,
            finalScore: data.finalScore,
            duration: data.duration,
            maxRally: data.maxRally,
            playerLatency: data.playerLatency,
            reason: data.reason,
            goldenGoal: data.goldenGoal
        };
        
        console.log('Match Summary:', summary);
    }

    endMatch() {
        this.gameState.gameActive = false;
        this.gameState.goldenGoalMode = false;
        this.stopInputHandler();
        this.updateMatchStatus('Match finished!');
        
        const instructions = document.getElementById('gameInstructions');
        if (instructions) instructions.classList.add('hidden');
        
        const roleEl = document.getElementById('playerRole');
        if (roleEl) roleEl.classList.add('hidden');
    }

displayTournamentResults(data) {
    this.displayPureTournamentResults(data);
}

displayTournamentAwards(awards) {
    const container = document.getElementById('awards');
    if (!container) return;
    
    container.classList.remove('hidden');
    container.innerHTML = '';
    
    // Check for Grand Slam
    if (awards.isGrandSlam) {
        this.showGrandSlamAchievement(awards.champion);
    }
    
    // 1. Champion Award
    const championAward = document.createElement('div');
    championAward.className = 'award-item champion';
    championAward.innerHTML = `
        <div class="award-icon">🏆</div>
        <h3>Tournament Champion</h3>
        <div class="award-winner">${awards.champion?.name || '-'}</div>
        <div class="award-stats">${awards.isPerfectRun ? 'Perfect Run - Undefeated!' : 'Eliminated all opponents'}</div>
    `;
    container.appendChild(championAward);
    
    // 2. Top Scorer Award
    if (awards.topScorer) {
        const topScorerAward = document.createElement('div');
        topScorerAward.className = 'award-item top-scorer';
        topScorerAward.innerHTML = `
            <div class="award-icon">⚽</div>
            <h3>Top Scorer</h3>
            <div class="award-winner">${awards.topScorer.name}</div>
            <div class="award-stats">${awards.topScorer.goalsFor} goals scored</div>
        `;
        container.appendChild(topScorerAward);
    }
    
    // 3. Best Player Award
    if (awards.bestPlayer) {
        const bestPlayerAward = document.createElement('div');
        bestPlayerAward.className = 'award-item best-player';
        bestPlayerAward.innerHTML = `
            <div class="award-icon">⭐</div>
            <h3>Best Player</h3>
            <div class="award-winner">${awards.bestPlayer.name}</div>
            <div class="award-stats">Overall Excellence<br>Score: ${awards.bestPlayer.bestPlayerScore || 'N/A'}</div>
        `;
        container.appendChild(bestPlayerAward);
    }
    
    // 4. Best Defense Award
    if (awards.bestDefense) {
        const bestDefenseAward = document.createElement('div');
        bestDefenseAward.className = 'award-item best-defense';
        bestDefenseAward.innerHTML = `
            <div class="award-icon">🛡️</div>
            <h3>Best Defense</h3>
            <div class="award-winner">${awards.bestDefense.name}</div>
            <div class="award-stats">
                Avg Conceded: ${awards.bestDefense.avgConceded || 'N/A'}<br>
                Defense Score: ${awards.bestDefense.defenseScore || 'N/A'}
            </div>
        `;
        container.appendChild(bestDefenseAward);
    }
}

// Add Grand Slam achievement display
showGrandSlamAchievement(champion) {
    const legendaryEl = document.getElementById('legendaryAchievement');
    const nameEl = document.getElementById('legendaryName');
    const typeEl = document.getElementById('achievementType');
    
    if (legendaryEl && nameEl && typeEl) {
        legendaryEl.classList.remove('hidden');
        nameEl.textContent = champion.name;
        typeEl.textContent = '💎 GRAND SLAM WINNER! 💎';
        
        const description = legendaryEl.querySelector('.legendary-description p');
        if (description) {
            description.textContent = 'Champion • Top Scorer • Best Player • Best Defense';
        }
        
        this.createConfettiEffect();
    }
}

// New method for pure tournament statistics (no league data)
displayPureTournamentStatistics(statistics, summary) {
    const statsGrid = document.getElementById('leagueStats');
    if (!statsGrid) return;
    
    // Clear any existing stats
    statsGrid.innerHTML = '';
    
    // Tournament-specific stat cards
    const tournamentStats = [
        {
            icon: '⚽',
            value: statistics?.totalGoals || 0,
            label: 'Total Goals'
        },
        {
            icon: '🎮',
            value: summary?.totalMatches || 0,
            label: 'Matches Played'
        },
        {
            icon: '⏱️',
            value: this.formatDuration((summary?.duration / 1000) || 0),
            label: 'Tournament Duration'
        },
        {
            icon: '🔥',
            value: statistics?.longestRally || 0,
            label: 'Longest Rally'
        },
        {
            icon: '⚡',
            value: summary?.goldenGoalMatches || 0,
            label: 'Golden Goal Matches'
        },
        {
            icon: '⏩',
            value: summary?.byesAwarded || 0,
            label: 'Byes Awarded'
        },
        {
            icon: '🏆',
            value: summary?.totalRounds || 0,
            label: 'Tournament Rounds'
        },
        {
            icon: '❌',
            value: summary?.eliminatedPlayers?.length || 0,
            label: 'Players Eliminated'
        }
    ];
    
    tournamentStats.forEach(stat => {
        const statCard = document.createElement('div');
        statCard.className = 'stat-card';
        statCard.innerHTML = `
            <div class="stat-icon">${stat.icon}</div>
            <div class="stat-number">${stat.value}</div>
            <div class="stat-label">${stat.label}</div>
        `;
        statsGrid.appendChild(statCard);
    });
}

    displayFinalBracket(bracket) {
        const bracketContainer = document.getElementById('tournamentBracket');
        if (bracketContainer) {
            bracketContainer.innerHTML = this.generateBracketHTML(bracket);
            bracketContainer.classList.remove('hidden');
        }
    }
    displayPureTournamentResults(data) {
    // Hide league table completely in tournament mode
    const tableContainer = document.querySelector('.table-container');
    if (tableContainer) {
        tableContainer.style.display = 'none';
    }
    
    // Show tournament-specific awards
    this.displayTournamentAwards(data.awards);
    
    // Display final bracket
    if (data.bracket) {
        this.displayFinalBracket(data.bracket);
    }
    
    // Display tournament statistics (NOT league stats)
    this.displayPureTournamentStatistics(data.statistics, data.tournamentSummary);
    
    // Update title
    const tableTitle = document.getElementById('finalTableTitle');
    if (tableTitle) {
        tableTitle.textContent = 'Tournament Results';
    }
}

    displayTournamentStatistics(statistics, summary) {
        const elements = {
            'totalGoals': statistics?.totalGoals || 0,
            'totalMatches': summary?.totalMatches || 0,
            'avgDuration': this.formatDuration(statistics?.averageMatchDuration || 0),
            'longestRally': statistics?.longestRally || 0
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });
        
        // Add tournament-specific stats
        if (summary?.byesAwarded !== undefined) {
            this.addTournamentStat('Byes Awarded', summary.byesAwarded);
        }
        if (summary?.goldenGoalMatches !== undefined) {
            this.addTournamentStat('Golden Goal Matches', summary.goldenGoalMatches);
        }
    }

    addTournamentStat(label, value) {
        const statsGrid = document.getElementById('leagueStats');
        if (statsGrid) {
            const statCard = document.createElement('div');
            statCard.className = 'stat-card';
            statCard.innerHTML = `
                <div class="stat-icon">⚡</div>
                <div class="stat-number">${value}</div>
                <div class="stat-label">${label}</div>
            `;
            statsGrid.appendChild(statCard);
        }
    }

    displayLeagueResults(data) {
        this.displayAwards(data.awards);
        this.displayLeagueTable(data.leagueTable);
        this.displayLeagueStatistics(data.statistics, data.leagueSummary);
    }

    displayAwards(awards) {
        if (awards.isQuadrupleWinner) {
            this.showLegendaryAchievement(awards.winner, 'Quadruple Crown Winner!');
        } else if (awards.isTripleWinner) {
            this.showLegendaryAchievement(awards.winner, 'Triple Crown Winner!');
        } else {
            this.showRegularAwards(awards);
        }
    }

    showLegendaryAchievement(winner, type) {
        const legendaryEl = document.getElementById('legendaryAchievement');
        const nameEl = document.getElementById('legendaryName');
        const typeEl = document.getElementById('achievementType');
        
        if (legendaryEl && nameEl && typeEl) {
            legendaryEl.classList.remove('hidden');
            nameEl.textContent = winner.name;
            typeEl.textContent = type;
            
            this.createConfettiEffect();
        }
    }

showRegularAwards(awards) {
    const awardsEl = document.getElementById('awards');
    if (!awardsEl) return;
    
    // Make sure awards container is visible
    awardsEl.classList.remove('hidden');
    
    // Clear previous content and create award items
    awardsEl.innerHTML = '';
    
    // Create award display for each award
    if (awards.winner) {
        const winnerAward = document.createElement('div');
        winnerAward.className = 'award-item champion';
        winnerAward.innerHTML = `
            <div class="award-icon">🏆</div>
            <h3>League Champion</h3>
            <div class="award-winner">${awards.winner.name}</div>
            <div class="award-stats">${awards.winner.points} points</div>
        `;
        awardsEl.appendChild(winnerAward);
    }
    
    if (awards.topScorer) {
        const topScorerAward = document.createElement('div');
        topScorerAward.className = 'award-item top-scorer';
        topScorerAward.innerHTML = `
            <div class="award-icon">⚽</div>
            <h3>Top Scorer</h3>
            <div class="award-winner">${awards.topScorer.name}</div>
            <div class="award-stats">${awards.topScorer.goalsFor} goals</div>
        `;
        awardsEl.appendChild(topScorerAward);
    }
    
    if (awards.bestPlayer) {
        const bestPlayerAward = document.createElement('div');
        bestPlayerAward.className = 'award-item best-player';
        bestPlayerAward.innerHTML = `
            <div class="award-icon">⭐</div>
            <h3>Best Player</h3>
            <div class="award-winner">${awards.bestPlayer.name}</div>
            <div class="award-stats">Overall Excellence</div>
        `;
        awardsEl.appendChild(bestPlayerAward);
    }
    
    if (awards.bestGoalDifference) {
        const bestDefenseAward = document.createElement('div');
        bestDefenseAward.className = 'award-item best-defense';
        bestDefenseAward.innerHTML = `
            <div class="award-icon">🛡️</div>
            <h3>Best Goal Difference</h3>
            <div class="award-winner">${awards.bestGoalDifference.name}</div>
            <div class="award-stats">${awards.bestGoalDifference.goalDifference > 0 ? '+' : ''}${awards.bestGoalDifference.goalDifference} GD</div>
        `;
        awardsEl.appendChild(bestDefenseAward);
    }
}

    updateAwardDisplay(elementId, player, stats) {
        const playerEl = document.getElementById(elementId);
        const statsEl = document.getElementById(elementId + 'Stats');
        
        if (playerEl) playerEl.textContent = player.name;
        if (statsEl) statsEl.textContent = stats;
    }

    displayLeagueTable(leagueTable) {
        const tbody = document.getElementById('finalTableBody');
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        leagueTable.forEach((player, index) => {
            const row = document.createElement('tr');
            
            if (player.name === this.gameState.playerName) {
                row.classList.add('current-player');
            }
            
            const formDisplay = player.formGuide?.slice(0, 5).join('') || '-';
            
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${player.name}</td>
                <td>${player.matches}</td>
                <td>${player.wins}</td>
                <td>${player.draws}</td>
                <td>${player.losses}</td>
                <td>${player.goalsFor}</td>
                <td>${player.goalsAgainst}</td>
                <td>${player.goalDifference > 0 ? '+' : ''}${player.goalDifference}</td>
                <td>${player.points}</td>
                <td class="form-guide">${formDisplay}</td>
            `;
            
            tbody.appendChild(row);
        });
    }

    displayLeagueStatistics(statistics, summary) {
        const elements = {
            'totalGoals': statistics.totalGoals,
            'totalMatches': summary.totalMatches,
            'avgDuration': this.formatDuration(summary.averageMatchDuration),
            'longestRally': summary.longestRally
        };
        
        Object.entries(elements).forEach(([id, value]) => {
            const el = document.getElementById(id);
            if (el) el.textContent = value;
        });
    }

    createChampionEffect() {
        // Create champion celebration effect
        const championEffect = document.createElement('div');
        championEffect.className = 'champion-effect';
        championEffect.innerHTML = `
            <div class="champion-content">
                <h1>🏆 CHAMPION! 🏆</h1>
                <p>Congratulations on your victory!</p>
            </div>
        `;
        
        document.body.appendChild(championEffect);
        
        setTimeout(() => {
            championEffect.remove();
        }, 5000);
        
        this.createConfettiEffect();
    }

    createConfettiEffect() {
        const canvas = document.getElementById('gameCanvas');
        if (!canvas?.parentElement) return;
        
        for (let i = 0; i < 50; i++) {
            setTimeout(() => {
                const confetti = document.createElement('div');
                confetti.className = 'confetti-piece';
                confetti.style.left = Math.random() * 100 + '%';
                confetti.style.background = ['#ffd700', '#ff69b4', '#00ff88', '#0099ff'][Math.floor(Math.random() * 4)];
                
                canvas.parentElement.appendChild(confetti);
                
                setTimeout(() => confetti.remove(), 3000);
            }, i * 50);
        }
    }

    showNotification(message, type = 'info', duration = 5000) {
        const container = document.getElementById('notifications');
        if (!container) {
            console.log(`Notification (${type}): ${message}`);
            return;
        }
        
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        
        container.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, duration);
        
        const notifications = container.querySelectorAll('.notification');
        if (notifications.length > 5) {
            notifications[0].remove();
        }
        
        this.playSound('notification', 0.3);
    }

    formatTime(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    formatDuration(seconds) {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    updateGameConfig(config) {
        console.log('Game config updated:', config);
    }

    initBackgroundEffects() {
        const particlesContainer = document.getElementById('particles');
        if (!particlesContainer) return;
        
        const createParticle = () => {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = Math.random() * 100 + 'vw';
            particle.style.animationDelay = Math.random() * 10 + 's';
            particle.style.animationDuration = (10 + Math.random() * 10) + 's';
            
            particlesContainer.appendChild(particle);
            
            setTimeout(() => {
                particle.remove();
            }, 20000);
        };
        
        for (let i = 0; i < 10; i++) {
            setTimeout(createParticle, i * 1000);
        }
        
        setInterval(createParticle, 2000);
    }

    cleanup() {
        console.log('Cleaning up Pong League 2.0...');
        
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        
        if (this.network.pingInterval) {
            clearInterval(this.network.pingInterval);
        }
        
        if (this.socket?.connected) {
            this.socket.disconnect();
        }
        
        document.removeEventListener('keydown', this.handleKeyDown);
        document.removeEventListener('keyup', this.handleKeyUp);
        
        if (this.audio.context) {
            this.audio.context.close();
        }
    }
}

class CommentaryReceiver {
    constructor() {
        this.audioContext = null;
        this.audioQueue = [];
        this.isPlaying = false;
        this.nextStartTime = 0;
        this.sampleRate = 16000;
        this.isActive = false;
    }
    
    async initialize() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate
            });
        }
        
        // Resume context if suspended (mobile browsers)
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }
    
    start() {
        this.isActive = true;
        this.nextStartTime = this.audioContext.currentTime;
        this.showIndicator();
        console.log('Commentary receiver started');
    }
    
    stop() {
        this.isActive = false;
        this.audioQueue = [];
        this.hideIndicator();
        console.log('Commentary receiver stopped');
    }
    
    async receiveChunk(int16Array) {
        if (!this.isActive) return;
        
        await this.initialize();
        
        // Convert Int16Array back to Float32Array
        const float32Array = new Float32Array(int16Array.length);
        for (let i = 0; i < int16Array.length; i++) {
            float32Array[i] = int16Array[i] / (int16Array[i] < 0 ? 0x8000 : 0x7FFF);
        }
        
        // Create audio buffer
        const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, this.sampleRate);
        audioBuffer.getChannelData(0).set(float32Array);
        
        // Schedule playback
        this.schedulePlayback(audioBuffer);
    }
    
    schedulePlayback(audioBuffer) {
        const source = this.audioContext.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(this.audioContext.destination);
        
        const currentTime = this.audioContext.currentTime;
        
        // If we're behind, catch up
        if (this.nextStartTime < currentTime) {
            this.nextStartTime = currentTime;
        }
        
        source.start(this.nextStartTime);
        this.nextStartTime += audioBuffer.duration;
    }
    
    showIndicator() {
        const indicator = document.getElementById('commentaryIndicator');
        if (indicator) {
            indicator.classList.remove('hidden');
        }
    }
    
    hideIndicator() {
        const indicator = document.getElementById('commentaryIndicator');
        if (indicator) {
            indicator.classList.add('hidden');
        }
    }
}

// Global Functions (for HTML onclick handlers)
let gameClient = null;

function initSocket() {
    if (!gameClient) {
        gameClient = new PongLeague2Client();
    }
}

function joinLeague() {
    if (!gameClient?.socket?.connected) {
        gameClient?.showNotification('Not connected to server', 'error');
        return;
    }
    
    const playerName = document.getElementById('playerName').value.trim();
    
    if (!playerName) {
        gameClient?.showNotification('Please enter your name', 'error');
        return;
    }
    
    if (playerName.length > 20) {
        gameClient?.showNotification('Name must be 20 characters or less', 'error');
        return;
    }
    
    if (!/^[a-zA-Z0-9_\-\s]+$/.test(playerName)) {
        gameClient?.showNotification('Name can only contain letters, numbers, spaces, hyphens, and underscores', 'error');
        return;
    }
    
    const deviceInfo = gameClient?.device || {};
    
    gameClient.socket.emit('join-league', {
        playerName: playerName,
        deviceInfo: deviceInfo
    });
}

function showDetailedStats() {
    const modal = document.getElementById('statsModal');
    if (modal) {
        modal.classList.remove('hidden');
        gameClient?.ui.modalsOpen.add('statsModal');
    }
}

function closeStatsModal() {
    const modal = document.getElementById('statsModal');
    if (modal) {
        modal.classList.add('hidden');
        gameClient?.ui.modalsOpen.delete('statsModal');
    }
}

function showStatsTab(tabName) {
    const tabs = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');
    
    tabs.forEach(tab => tab.classList.remove('active'));
    panes.forEach(pane => pane.classList.remove('active'));
    
    const activeTab = document.querySelector(`[onclick="showStatsTab('${tabName}')"]`);
    const activePane = document.getElementById(tabName + (tabName === 'league' ? 'StatsTab' : tabName === 'personal' ? 'Stats' : 'Tab'));
    
    if (activeTab) activeTab.classList.add('active');
    if (activePane) activePane.classList.add('active');
}


// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Pong League 2.0 client ready');
});

// Handle page unload
window.addEventListener('beforeunload', () => {
    gameClient?.cleanup();
});