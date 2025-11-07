const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    pingTimeout: 60000,
    pingInterval: 25000,
    transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;

// Enhanced game constants with tournament support
const GAME_CONFIG = {
    CANVAS_WIDTH: 900,
    CANVAS_HEIGHT: 500,
    PADDLE_WIDTH: 15,
    PADDLE_HEIGHT: 80,
    BALL_SIZE: 15,
    PLAYER_SPEED: 8,
    MIN_BALL_SPEED: 4,
    MAX_BALL_SPEED: 12,
    SPEED_INCREMENT: 0.05,
    DEFAULT_MATCH_DURATION: 180, // 3 minutes default
    GOLDEN_GOAL_WARNING: 5, // 5 seconds warning before golden goal
    PERFORMANCE_MODES: {
        HIGH: { FPS: 60, INTERPOLATION: true },
        MEDIUM: { FPS: 45, INTERPOLATION: true },
        LOW: { FPS: 30, INTERPOLATION: false }
    }
};

// Get local IP address
function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const interface of interfaces[name]) {
            if (interface.family === 'IPv4' && !interface.internal) {
                return interface.address;
            }
        }
    }
    return 'localhost';
}

const HOST_IP = getLocalIP();

// Voice commentary system
const commentaryState = {
    isActive: false,
    adminSocketId: null
};

// Enhanced security middleware
function isHostIP(req) {
    const clientIP = req.connection.remoteAddress || req.socket.remoteAddress || req.ip;
    const allowedIPs = ['::1', '127.0.0.1', '::ffff:127.0.0.1'];
    return allowedIPs.some(ip => clientIP.includes(ip));
}

// Rate limiting for connections
const connectionLimiter = new Map();

const MAX_CONNECTIONS_PER_IP = 5;
const CONNECTION_WINDOW = 60000; // 1 minute

function checkConnectionLimit(ip) {
    const now = Date.now();
    const connections = connectionLimiter.get(ip) || [];
    const recentConnections = connections.filter(time => now - time < CONNECTION_WINDOW);
    
    connectionLimiter.set(ip, recentConnections);
    return recentConnections.length < MAX_CONNECTIONS_PER_IP;
}

// Clean up old connection records every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [ip, connections] of connectionLimiter.entries()) {
        const recentConnections = connections.filter(time => now - time < CONNECTION_WINDOW);
        if (recentConnections.length === 0) {
            connectionLimiter.delete(ip);
        } else {
            connectionLimiter.set(ip, recentConnections);
        }
    }
}, 5 * 60 * 1000);

// Helper function to detect if request is from browser
function isBrowserRequest(req) {
    const accept = req.headers.accept || '';
    return accept.includes('text/html');
}

// Helper to generate HTML wrapper with v2.0 styling
function wrapHTML(title, content) {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <link rel="stylesheet" href="/style-v2.css">
    <style>
        body { padding: var(--spacing-lg); }
        .api-container { max-width: 1200px; margin: 0 auto; }
        .api-header { text-align: center; margin-bottom: var(--spacing-xl); }
        .api-card { background: var(--bg-glass); backdrop-filter: blur(20px); 
                    border: 1px solid var(--border-color); border-radius: var(--radius-xl); 
                    padding: var(--spacing-xl); margin: var(--spacing-lg) 0; }
        .stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
                     gap: var(--spacing-md); margin: var(--spacing-lg) 0; }
        .stat-item { background: rgba(0,0,0,0.3); padding: var(--spacing-md); 
                     border-radius: var(--radius-lg); border: 1px solid var(--border-color); 
                     text-align: center; }
        .stat-value { font-family: var(--font-primary); font-size: 1.5rem; 
                      color: var(--primary-color); margin-bottom: var(--spacing-xs); }
        .stat-label { font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; }
        .leaderboard-table { width: 100%; border-collapse: collapse; margin: var(--spacing-lg) 0; }
        .leaderboard-table th { background: linear-gradient(135deg, rgba(0,255,136,0.2), rgba(0,153,255,0.2)); 
                                 padding: var(--spacing-md); text-align: left; }
        .leaderboard-table td { padding: var(--spacing-md); border-bottom: 1px solid var(--border-color); }
        .leaderboard-table tr:hover { background: rgba(0,255,136,0.05); }
        .rank-badge { display: inline-block; width: 30px; height: 30px; border-radius: 50%; 
                      background: var(--primary-color); color: white; text-align: center; 
                      line-height: 30px; font-weight: bold; }
        .rank-badge.gold { background: #ffd700; }
        .rank-badge.silver { background: #c0c0c0; }
        .rank-badge.bronze { background: #cd7f32; }
        .player-avatar { width: 40px; height: 40px; border-radius: 50%; 
                         background: linear-gradient(135deg, var(--primary-color), var(--secondary-color)); }
        .search-box { width: 100%; padding: var(--spacing-md); background: rgba(0,0,0,0.5); 
                      border: 2px solid var(--border-color); border-radius: var(--radius-lg); 
                      color: white; font-family: var(--font-secondary); margin-bottom: var(--spacing-lg); }
        .match-history { margin: var(--spacing-lg) 0; }
        .match-item { display: flex; justify-content: space-between; padding: var(--spacing-md); 
                      background: rgba(0,0,0,0.3); border-radius: var(--radius-md); 
                      margin-bottom: var(--spacing-sm); border: 1px solid var(--border-color); }
        .match-result { padding: var(--spacing-xs) var(--spacing-sm); border-radius: var(--radius-sm); 
                        font-weight: bold; }
        .match-result.win { background: rgba(0,255,136,0.2); color: var(--success-color); }
        .match-result.draw { background: rgba(255,170,0,0.2); color: var(--warning-color); }
        .match-result.loss { background: rgba(255,68,68,0.2); color: var(--error-color); }
        .back-link { display: inline-block; padding: var(--spacing-sm) var(--spacing-md); 
                     background: var(--primary-color); color: white; text-decoration: none; 
                     border-radius: var(--radius-md); margin-bottom: var(--spacing-lg); }
        .health-indicator { width: 12px; height: 12px; border-radius: 50%; 
                            background: var(--success-color); display: inline-block; 
                            box-shadow: 0 0 10px currentColor; margin-right: var(--spacing-xs); }
    </style>
</head>
<body>
    <div class="api-container">
        <div class="api-header">
            <h1 class="glitch" data-text="${title}">${title}</h1>
        </div>
        ${content}
    </div>
</body>
</html>`;
}

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Enhanced routes with error handling
app.get('/', (req, res) => {
    try {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
    } catch (error) {
        console.error('Error serving index.html:', error);
        res.status(500).send('Server error');
    }
});

app.get('/admin', (req, res) => {
    try {
        if (!isHostIP(req)) {
            return res.status(403).json({ error: 'Admin access restricted to host machine only' });
        }
        res.sendFile(path.join(__dirname, 'public', 'admin.html'));
    } catch (error) {
        console.error('Error serving admin.html:', error);
        res.status(500).send('Server error');
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    try {
        const healthData = {
            status: 'healthy',
            uptime: process.uptime(),
            timestamp: new Date().toISOString(),
            activeConnections: io.engine.clientsCount,
            activeGames: gameState.activeGames.size,
            leagueStatus: gameState.leagueStarted ? 'running' : 'waiting',
            mode: gameState.league?.gameMode || 'none',
            memory: {
                rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
                heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024)
            }
        };

        // Return JSON for API calls
        if (!isBrowserRequest(req)) {
            return res.json(healthData);
        }

        // Return HTML for browser
        const htmlContent = `
            <div class="api-card">
                <h2><span class="health-indicator"></span>Server Health</h2>
                <div class="stat-grid">
                    <div class="stat-item">
                        <div class="stat-value">${healthData.status.toUpperCase()}</div>
                        <div class="stat-label">Status</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${Math.floor(healthData.uptime / 60)}m ${Math.floor(healthData.uptime % 60)}s</div>
                        <div class="stat-label">Uptime</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${healthData.activeConnections}</div>
                        <div class="stat-label">Connections</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${healthData.activeGames}</div>
                        <div class="stat-label">Active Games</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${healthData.memory.heapUsed}MB</div>
                        <div class="stat-label">Memory Used</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${healthData.leagueStatus}</div>
                        <div class="stat-label">League Status</div>
                    </div>
                </div>
                <p style="text-align:center; color: var(--text-muted); margin-top: var(--spacing-lg);">
                    Last updated: ${new Date().toLocaleString()}
                </p>
            </div>`;

        res.send(wrapHTML('Server Health', htmlContent));
    } catch (error) {
        console.error('Error in /health:', error);
        res.status(500).json({ error: 'Health check failed' });
    }
});

// POST /api/auth - Enhanced authentication endpoint
app.post('/api/auth', express.json(), (req, res) => {
    try {
        const { username, password, rememberMe } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({
                success: false,
                error: 'Username and password required',
                code: 'MISSING_CREDENTIALS'
            });
        }

        // Enhanced mock authentication with role-based access
        const users = {
            'admin': { password: 'admin123', role: 'admin', permissions: ['all'] },
            'moderator': { password: 'mod123', role: 'moderator', permissions: ['view', 'manage_players'] },
            'viewer': { password: 'view123', role: 'viewer', permissions: ['view'] }
        };

        const user = users[username];
        
        if (user && user.password === password) {
            const token = `jwt-${username}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const expiresIn = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000; // 30 days or 1 day
            
            res.json({
                success: true,
                token: token,
                expiresIn: expiresIn,
                expiresAt: new Date(Date.now() + expiresIn).toISOString(),
                user: {
                    username: username,
                    role: user.role,
                    permissions: user.permissions,
                    loginTime: new Date().toISOString()
                },
                serverVersion: '2.0'
            });
        } else {
            res.status(401).json({
                success: false,
                error: 'Invalid credentials',
                code: 'INVALID_CREDENTIALS',
                attemptsRemaining: 3 // Mock value
            });
        }
    } catch (error) {
        console.error('Error in /api/auth:', error);
        res.status(500).json({ 
            success: false, 
            error: 'Authentication service unavailable',
            code: 'SERVER_ERROR'
        });
    }
});

// GET /api/stats/summary - Enhanced summary statistics
app.get('/api/stats/summary', (req, res) => {
    try {
        updateLeagueTableEnhanced();
        
        const topScorer = gameState.leagueTable.reduce((prev, curr) => 
            curr.goalsFor > (prev?.goalsFor || 0) ? curr : prev, null);
        
        const bestDefense = gameState.leagueTable.reduce((prev, curr) => 
            curr.goalsAgainst < (prev?.goalsAgainst || Infinity) ? curr : prev, null);
        
        const mostWins = gameState.leagueTable.reduce((prev, curr) => 
            curr.wins > (prev?.wins || 0) ? curr : prev, null);
        
        const bestGoalDiff = gameState.leagueTable.reduce((prev, curr) => 
            curr.goalDifference > (prev?.goalDifference || -Infinity) ? curr : prev, null);

        const summary = {
            league: {
                name: gameState.league?.name || 'No league',
                status: gameState.leagueStarted ? (gameState.leagueFinished ? 'finished' : 'running') : 'waiting',
                gameMode: gameState.league?.gameMode || 'none',
                participants: gameState.players.size,
                maxPlayers: gameState.league?.maxPlayers || 0
            },
            standings: {
                leader: {
                    name: gameState.leagueTable[0]?.name || 'N/A',
                    points: gameState.leagueTable[0]?.points || 0,
                    goalDifference: gameState.leagueTable[0]?.goalDifference || 0,
                    form: gameState.leagueTable[0]?.formGuide?.slice(0, 5) || []
                },
                topScorer: {
                    name: topScorer?.name || 'N/A',
                    goals: topScorer?.goalsFor || 0,
                    matchesPlayed: topScorer?.matches || 0,
                    goalsPerMatch: topScorer ? (topScorer.goalsFor / Math.max(topScorer.matches, 1)).toFixed(2) : '0.00'
                },
                bestDefense: {
                    name: bestDefense?.name || 'N/A',
                    conceded: bestDefense?.goalsAgainst || 0,
                    matchesPlayed: bestDefense?.matches || 0,
                    concededPerMatch: bestDefense ? (bestDefense.goalsAgainst / Math.max(bestDefense.matches, 1)).toFixed(2) : '0.00'
                },
                mostWins: {
                    name: mostWins?.name || 'N/A',
                    wins: mostWins?.wins || 0,
                    winRate: mostWins ? ((mostWins.wins / Math.max(mostWins.matches, 1)) * 100).toFixed(1) + '%' : '0%'
                },
                bestGoalDifference: {
                    name: bestGoalDiff?.name || 'N/A',
                    difference: bestGoalDiff?.goalDifference || 0
                }
            },
            progress: {
                totalMatches: gameState.totalMatches,
                completedMatches: gameState.completedMatches,
                activeMatches: gameState.activeGames.size,
                percentComplete: gameState.totalMatches > 0 ? 
                    ((gameState.completedMatches / gameState.totalMatches) * 100).toFixed(1) + '%' : '0%',
                currentMatchday: gameState.currentMatchday + 1,
                totalMatchdays: gameState.fixtures.length
            },
            statistics: {
                totalGoals: gameState.statistics.totalGoals,
                totalShots: gameState.statistics.totalShots,
                averageGoalsPerMatch: gameState.completedMatches > 0 ? 
                    (gameState.statistics.totalGoals / gameState.completedMatches).toFixed(2) : '0.00',
                longestRally: gameState.statistics.longestRally,
                goldenGoalMatches: gameState.statistics.goldenGoalMatches,
                averageMatchDuration: Math.round(gameState.statistics.averageMatchDuration) + 's'
            },
            timestamp: new Date().toISOString()
        };

        if (!isBrowserRequest(req)) {
            return res.json(summary);
        }

        const htmlContent = `
            <a href="/" class="back-link">Ã¢â€ Â Home</a>
            <div class="api-card">
                <h2>Ã°Å¸â€œÅ  League Summary</h2>
                
                <h3>Ã°Å¸Ââ€  Current Standings</h3>
                <div class="stat-grid">
                    <div class="stat-item">
                        <div class="stat-value">${summary.standings.leader.name}</div>
                        <div class="stat-label">League Leader</div>
                        <div class="stat-label">${summary.standings.leader.points} pts ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ ${summary.standings.leader.goalDifference > 0 ? '+' : ''}${summary.standings.leader.goalDifference} GD</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${summary.standings.topScorer.name}</div>
                        <div class="stat-label">Top Scorer</div>
                        <div class="stat-label">${summary.standings.topScorer.goals} goals (${summary.standings.topScorer.goalsPerMatch} per match)</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${summary.standings.bestDefense.name}</div>
                        <div class="stat-label">Best Defense</div>
                        <div class="stat-label">${summary.standings.bestDefense.conceded} conceded (${summary.standings.bestDefense.concededPerMatch} per match)</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${summary.standings.mostWins.name}</div>
                        <div class="stat-label">Most Wins</div>
                        <div class="stat-label">${summary.standings.mostWins.wins} wins (${summary.standings.mostWins.winRate})</div>
                    </div>
                </div>

                <h3>Ã°Å¸â€œË† League Progress</h3>
                <div class="stat-grid">
                    <div class="stat-item">
                        <div class="stat-value">${summary.progress.completedMatches}/${summary.progress.totalMatches}</div>
                        <div class="stat-label">Matches Completed</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${summary.progress.percentComplete}</div>
                        <div class="stat-label">Progress</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${summary.progress.activeMatches}</div>
                        <div class="stat-label">Active Now</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${summary.progress.currentMatchday}/${summary.progress.totalMatchdays}</div>
                        <div class="stat-label">Current Matchday</div>
                    </div>
                </div>

                <h3>Ã¢Å¡Â½ Match Statistics</h3>
                <div class="stat-grid">
                    <div class="stat-item">
                        <div class="stat-value">${summary.statistics.totalGoals}</div>
                        <div class="stat-label">Total Goals</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${summary.statistics.averageGoalsPerMatch}</div>
                        <div class="stat-label">Avg Goals/Match</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${summary.statistics.longestRally}</div>
                        <div class="stat-label">Longest Rally</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${summary.statistics.goldenGoalMatches}</div>
                        <div class="stat-label">Golden Goal Matches</div>
                    </div>
                </div>
            </div>`;

        res.send(wrapHTML('League Summary', htmlContent));
    } catch (error) {
        console.error('Error in /api/stats/summary:', error);
        res.status(500).json({ error: 'Failed to get summary statistics' });
    }
});

// GET /api/matchdays - List all matchdays with their status
app.get('/api/matchdays', (req, res) => {
    try {
        if (!gameState.league) {
            return res.status(404).json({ error: 'No league created' });
        }

        if (gameState.league.gameMode === 'tournament') {
            return res.status(400).json({ 
                error: 'Matchdays are only available in classic league mode',
                gameMode: 'tournament'
            });
        }

        const matchdays = gameState.fixtures.map((fixtures, index) => {
            const matchdayNumber = index + 1;
            const isCurrentMatchday = gameState.currentMatchday === index;
            const isPast = gameState.currentMatchday > index;
            const isFuture = gameState.currentMatchday < index;

            // Get match results for this matchday
            const matchdayMatches = Array.from(gameState.matches.values())
                .filter(m => m.matchday === matchdayNumber);

            const completedMatches = matchdayMatches.filter(m => m.finished).length;
            const activeMatches = matchdayMatches.filter(m => !m.finished && gameState.activeGames.has(m.id)).length;

            let status = 'upcoming';
            if (isPast) status = 'completed';
            if (isCurrentMatchday) {
                if (activeMatches > 0) status = 'in_progress';
                else if (completedMatches === fixtures.length) status = 'completed';
                else status = 'scheduled';
            }

            return {
                matchday: matchdayNumber,
                status: status,
                totalFixtures: fixtures.length,
                completedMatches: completedMatches,
                activeMatches: activeMatches,
                pendingMatches: fixtures.length - completedMatches - activeMatches,
                fixtures: fixtures.map((fixture, fIndex) => {
                    const match = matchdayMatches.find(m => 
                        (m.player1 === fixture.home && m.player2 === fixture.away) ||
                        (m.player1 === fixture.away && m.player2 === fixture.home)
                    );

                    return {
                        matchNumber: fIndex + 1,
                        home: fixture.home,
                        away: fixture.away,
                        status: match ? (match.finished ? 'completed' : 'in_progress') : 'scheduled',
                        score: match && match.finished ? match.finalScore : null,
                        winner: match?.winner || null,
                        duration: match?.duration ? Math.round(match.duration) + 's' : null
                    };
                }),
                startedAt: isCurrentMatchday || isPast ? matchdayMatches[0]?.createdAt : null,
                url: `/api/matchdays/${matchdayNumber}`
            };
        });

        const summary = {
            totalMatchdays: gameState.fixtures.length,
            currentMatchday: gameState.currentMatchday + 1,
            completedMatchdays: matchdays.filter(m => m.status === 'completed').length,
            inProgressMatchdays: matchdays.filter(m => m.status === 'in_progress').length,
            upcomingMatchdays: matchdays.filter(m => m.status === 'upcoming').length
        };

        if (!isBrowserRequest(req)) {
            return res.json({ summary, matchdays });
        }

        const htmlContent = `
            <a href="/" class="back-link">ÃƒÂ¢Ã¢â‚¬ Ã‚Â Home</a>
            <div class="api-card">
                <h2>Ã°Å¸â€œâ€¦ All Matchdays</h2>
                
                <div class="stat-grid">
                    <div class="stat-item">
                        <div class="stat-value">${summary.currentMatchday}/${summary.totalMatchdays}</div>
                        <div class="stat-label">Current Matchday</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${summary.completedMatchdays}</div>
                        <div class="stat-label">Completed</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${summary.inProgressMatchdays}</div>
                        <div class="stat-label">In Progress</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${summary.upcomingMatchdays}</div>
                        <div class="stat-label">Upcoming</div>
                    </div>
                </div>

                <h3>Matchday Schedule</h3>
                ${matchdays.map(md => `
                    <div class="match-item ${md.status === 'completed' ? 'win' : md.status === 'in_progress' ? 'draw' : ''}">
                        <div>
                            <strong>Matchday ${md.matchday}</strong>
                            <span style="margin-left: var(--spacing-md); text-transform: uppercase; color: var(--primary-color);">
                                ${md.status.replace('_', ' ')}
                            </span>
                        </div>
                        <div>
                            ${md.completedMatches}/${md.totalFixtures} completed
                            ${md.activeMatches > 0 ? `Ã¢â‚¬Â¢ ${md.activeMatches} active` : ''}
                        </div>
                    </div>
                    <div style="margin-left: var(--spacing-lg); margin-bottom: var(--spacing-md);">
                        ${md.fixtures.map(f => `
                            <div style="padding: var(--spacing-sm); border-left: 2px solid var(--border-color); margin-bottom: var(--spacing-xs);">
                                ${f.home} vs ${f.away} 
                                ${f.score ? `<strong>${f.score[f.home]} - ${f.score[f.away]}</strong>` : 
                                  f.status === 'in_progress' ? '<em style="color: var(--warning-color);">Playing...</em>' : 
                                  '<em style="color: var(--text-muted);">Not started</em>'}
                            </div>
                        `).join('')}
                    </div>
                `).join('')}
            </div>`;

        res.send(wrapHTML('All Matchdays', htmlContent));
    } catch (error) {
        console.error('Error in /api/matchdays:', error);
        res.status(500).json({ error: 'Failed to get matchdays' });
    }
});

// GET /api/matchdays/:number - Individual matchday details
app.get('/api/matchdays/:number', (req, res) => {
    try {
        const matchdayNumber = parseInt(req.params.number);

        if (isNaN(matchdayNumber) || matchdayNumber < 1 || matchdayNumber > gameState.fixtures.length) {
            return res.status(404).json({ error: 'Matchday not found' });
        }

        const fixtures = gameState.fixtures[matchdayNumber - 1];
        const matchdayMatches = Array.from(gameState.matches.values())
            .filter(m => m.matchday === matchdayNumber);

        const completedMatches = matchdayMatches.filter(m => m.finished);
        const activeMatches = matchdayMatches.filter(m => !m.finished && gameState.activeGames.has(m.id));

        const isCurrentMatchday = gameState.currentMatchday === matchdayNumber - 1;
        const isPast = gameState.currentMatchday > matchdayNumber - 1;

        let status = 'upcoming';
        if (isPast) status = 'completed';
        if (isCurrentMatchday) {
            if (activeMatches.length > 0) status = 'in_progress';
            else if (completedMatches.length === fixtures.length) status = 'completed';
            else status = 'scheduled';
        }

        const matchdayData = {
            matchday: matchdayNumber,
            status: status,
            fixtures: fixtures.map((fixture, index) => {
                const match = matchdayMatches.find(m => 
                    (m.player1 === fixture.home && m.player2 === fixture.away) ||
                    (m.player1 === fixture.away && m.player2 === fixture.home)
                );

                return {
                    matchNumber: index + 1,
                    home: fixture.home,
                    away: fixture.away,
                    status: match ? (match.finished ? 'completed' : 'in_progress') : 'scheduled',
                    score: match && match.finished ? match.finalScore : null,
                    winner: match?.winner || null,
                    duration: match?.duration ? Math.round(match.duration) : null,
                    maxRally: match?.maxRally || null
                };
            }),
            statistics: {
                totalFixtures: fixtures.length,
                completed: completedMatches.length,
                active: activeMatches.length,
                pending: fixtures.length - completedMatches.length - activeMatches.length,
                totalGoals: completedMatches.reduce((sum, m) => {
                    return sum + Object.values(m.finalScore || {}).reduce((a, b) => a + b, 0);
                }, 0)
            }
        };

        if (!isBrowserRequest(req)) {
            return res.json(matchdayData);
        }

        const htmlContent = `
            <a href="/api/matchdays" class="back-link">ÃƒÂ¢Ã¢â‚¬ Ã‚Â All Matchdays</a>
            <div class="api-card">
                <h2>Ã°Å¸â€œâ€¦ Matchday ${matchdayNumber}</h2>
                <p style="text-align: center; color: var(--primary-color); text-transform: uppercase; font-size: 1.2rem;">
                    Status: ${status.replace('_', ' ')}
                </p>

                <div class="stat-grid">
                    <div class="stat-item">
                        <div class="stat-value">${matchdayData.statistics.completed}/${matchdayData.statistics.totalFixtures}</div>
                        <div class="stat-label">Completed</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${matchdayData.statistics.active}</div>
                        <div class="stat-label">In Progress</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${matchdayData.statistics.pending}</div>
                        <div class="stat-label">Pending</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${matchdayData.statistics.totalGoals}</div>
                        <div class="stat-label">Total Goals</div>
                    </div>
                </div>

                <h3>Fixtures</h3>
                <div class="match-history">
                    ${matchdayData.fixtures.map(f => `
                        <div class="match-item ${f.status === 'completed' ? (f.winner ? 'win' : 'draw') : f.status === 'in_progress' ? 'draw' : ''}">
                            <div>
                                <strong>Match ${f.matchNumber}</strong>: ${f.home} vs ${f.away}
                            </div>
                            <div>
                                ${f.score ? 
                                    `<span style="font-family: var(--font-primary);">${f.score[f.home]} - ${f.score[f.away]}</span>` : 
                                  f.status === 'in_progress' ? 
                                    '<span style="color: var(--warning-color);">Playing...</span>' : 
                                    '<span style="color: var(--text-muted);">Not started</span>'}
                                ${f.winner ? `<span class="match-result win">Winner: ${f.winner}</span>` : ''}
                                ${f.duration ? `<span style="margin-left: var(--spacing-sm); color: var(--text-muted);">${f.duration}</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>`;

        res.send(wrapHTML(`Matchday ${matchdayNumber}`, htmlContent));
    } catch (error) {
        console.error('Error in /api/matchdays/:number:', error);
        res.status(500).json({ error: 'Failed to get matchday details' });
    }
});

// GET /api/stats - Server statistics
app.get('/api/stats', (req, res) => {
    try {
        const statsData = {
            server: {
                uptime: process.uptime(),
                startTime: new Date(Date.now() - process.uptime() * 1000).toISOString(),
                version: '2.0',
                mode: gameState.league?.gameMode || 'none'
            },
            league: {
                name: gameState.league?.name || 'No league',
                started: gameState.leagueStarted,
                finished: gameState.leagueFinished,
                totalPlayers: gameState.players.size,
                maxPlayers: gameState.league?.maxPlayers || 0
            },
            matches: {
                total: gameState.totalMatches,
                completed: gameState.completedMatches,
                active: gameState.activeGames.size
            },
            statistics: gameState.statistics
        };

        if (!isBrowserRequest(req)) {
            return res.json(statsData);
        }

        const htmlContent = `
            <div class="api-card">
                <h2>Ã°Å¸â€œÅ  Server Statistics</h2>
                <h3>Server Info</h3>
                <div class="stat-grid">
                    <div class="stat-item">
                        <div class="stat-value">${Math.floor(statsData.server.uptime / 3600)}h ${Math.floor((statsData.server.uptime % 3600) / 60)}m</div>
                        <div class="stat-label">Uptime</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${statsData.server.version}</div>
                        <div class="stat-label">Version</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${statsData.server.mode}</div>
                        <div class="stat-label">Game Mode</div>
                    </div>
                </div>
                <h3>League Info</h3>
                <div class="stat-grid">
                    <div class="stat-item">
                        <div class="stat-value">${statsData.league.totalPlayers}/${statsData.league.maxPlayers}</div>
                        <div class="stat-label">Players</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${statsData.league.started ? 'Yes' : 'No'}</div>
                        <div class="stat-label">Started</div>
                    </div>
                </div>
                <h3>Match Statistics</h3>
                <div class="stat-grid">
                    <div class="stat-item">
                        <div class="stat-value">${statsData.matches.completed}/${statsData.matches.total}</div>
                        <div class="stat-label">Matches</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${statsData.matches.active}</div>
                        <div class="stat-label">Active Now</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${statsData.statistics.totalGoals}</div>
                        <div class="stat-label">Total Goals</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${statsData.statistics.longestRally}</div>
                        <div class="stat-label">Longest Rally</div>
                    </div>
                </div>
            </div>`;

        res.send(wrapHTML('Server Statistics', htmlContent));
    } catch (error) {
        console.error('Error in /api/stats:', error);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

// GET /api/leaderboard - League table
app.get('/api/leaderboard', (req, res) => {
    try {
        updateLeagueTableEnhanced();
        
        const leaderboardData = gameState.leagueTable.map((player, index) => ({
            rank: index + 1,
            name: player.name,
            matches: player.matches,
            wins: player.wins,
            draws: player.draws,
            losses: player.losses,
            goalsFor: player.goalsFor,
            goalsAgainst: player.goalsAgainst,
            goalDifference: player.goalDifference,
            points: player.points,
            form: player.formGuide || [],
            avatar: `/api/avatar/${player.name}` // Placeholder
        }));

        if (!isBrowserRequest(req)) {
            return res.json(leaderboardData);
        }

        const htmlContent = `
            <div class="api-card">
                <h2>Ã°Å¸Ââ€  Leaderboard</h2>
                <input type="text" id="searchBox" class="search-box" placeholder="Search players..." onkeyup="filterTable()">
                <table class="leaderboard-table" id="leaderboardTable">
                    <thead>
                        <tr>
                            <th>Rank</th>
                            <th>Player</th>
                            <th>P</th>
                            <th>W</th>
                            <th>D</th>
                            <th>L</th>
                            <th>GF</th>
                            <th>GA</th>
                            <th>GD</th>
                            <th>Pts</th>
                            <th>Form</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${leaderboardData.map(player => `
                            <tr>
                                <td><span class="rank-badge ${player.rank === 1 ? 'gold' : player.rank === 2 ? 'silver' : player.rank === 3 ? 'bronze' : ''}">${player.rank}</span></td>
                                <td><a href="/api/player/${encodeURIComponent(player.name)}" style="color: var(--primary-color); text-decoration: none;">${player.name}</a></td>
                                <td>${player.matches}</td>
                                <td>${player.wins}</td>
                                <td>${player.draws}</td>
                                <td>${player.losses}</td>
                                <td>${player.goalsFor}</td>
                                <td>${player.goalsAgainst}</td>
                                <td style="color: ${player.goalDifference > 0 ? 'var(--success-color)' : player.goalDifference < 0 ? 'var(--error-color)' : 'inherit'}">${player.goalDifference > 0 ? '+' : ''}${player.goalDifference}</td>
                                <td><strong>${player.points}</strong></td>
                                <td>${player.form.slice(0, 5).join(' ') || '-'}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <script>
                function filterTable() {
                    const input = document.getElementById('searchBox');
                    const filter = input.value.toUpperCase();
                    const table = document.getElementById('leaderboardTable');
                    const tr = table.getElementsByTagName('tr');
                    for (let i = 1; i < tr.length; i++) {
                        const td = tr[i].getElementsByTagName('td')[1];
                        if (td) {
                            const txtValue = td.textContent || td.innerText;
                            tr[i].style.display = txtValue.toUpperCase().indexOf(filter) > -1 ? '' : 'none';
                        }
                    }
                }
            </script>`;

        res.send(wrapHTML('Leaderboard', htmlContent));
    } catch (error) {
        console.error('Error in /api/leaderboard:', error);
        res.status(500).json({ error: 'Failed to get leaderboard' });
    }
});

// GET /api/players - List all players
app.get('/api/players', (req, res) => {
    try {
        const playersList = Array.from(gameState.players.values()).map(player => ({
            name: player.name,
            matches: player.matches,
            points: player.points,
            status: player.disconnected ? 'offline' : player.eliminated ? 'eliminated' : 'active',
            link: `/api/player/${encodeURIComponent(player.name)}`
        }));

        if (!isBrowserRequest(req)) {
            return res.json(playersList);
        }

        const htmlContent = `
            <div class="api-card">
                <h2>Ã°Å¸â€˜Â¥ All Players</h2>
                <div class="stat-grid">
                    ${playersList.map(player => `
                        <div class="stat-item">
                            <div class="stat-value"><a href="${player.link}" style="color: var(--primary-color); text-decoration: none;">${player.name}</a></div>
                            <div class="stat-label">${player.points} pts Ã¢â‚¬Â¢ ${player.matches} matches</div>
                            <div class="stat-label" style="color: ${player.status === 'active' ? 'var(--success-color)' : player.status === 'eliminated' ? 'var(--error-color)' : 'var(--text-muted)'};">${player.status}</div>
                        </div>
                    `).join('')}
                </div>
            </div>`;

        res.send(wrapHTML('All Players', htmlContent));
    } catch (error) {
        console.error('Error in /api/players:', error);
        res.status(500).json({ error: 'Failed to get players list' });
    }
});

// GET /api/player/:name - Individual player details
app.get('/api/player/:name', (req, res) => {
    try {
        const playerName = decodeURIComponent(req.params.name);
        const player = gameState.players.get(playerName);

        if (!player) {
            return res.status(404).json({ error: 'Player not found' });
        }

        // Find player's position in table
        updateLeagueTableEnhanced();
        const position = gameState.leagueTable.findIndex(p => p.name === playerName) + 1;

        // Get match history
        const matchHistory = gameState.results
            .filter(result => result.player1 === playerName || result.player2 === playerName)
            .map(match => {
                const isPlayer1 = match.player1 === playerName;
                const opponent = isPlayer1 ? match.player2 : match.player1;
                const playerScore = match.score[playerName];
                const opponentScore = match.score[opponent];
                const result = playerScore > opponentScore ? 'win' : playerScore < opponentScore ? 'loss' : 'draw';

                return {
                    matchday: match.matchday || match.round || 'N/A',
                    opponent,
                    score: `${playerScore} - ${opponentScore}`,
                    result
                };
            });

        const playerData = {
            name: player.name,
            position,
            stats: {
                matches: player.matches,
                wins: player.wins,
                draws: player.draws,
                losses: player.losses,
                goalsFor: player.goalsFor,
                goalsAgainst: player.goalsAgainst,
                goalDifference: player.goalsFor - player.goalsAgainst,
                points: player.points,
                accuracy: (player.accuracy * 100).toFixed(1) + '%',
                form: player.formGuide || []
            },
            matchHistory,
            status: player.disconnected ? 'offline' : player.eliminated ? 'eliminated' : 'active'
        };

        if (!isBrowserRequest(req)) {
            return res.json(playerData);
        }

        const htmlContent = `
            <a href="/api/leaderboard" class="back-link">Ã¢â€ Â Back to Leaderboard</a>
            <div class="api-card">
                <h2>Ã°Å¸Å½Â® ${playerData.name}</h2>
                <div class="stat-grid">
                    <div class="stat-item">
                        <div class="stat-value">#${playerData.position}</div>
                        <div class="stat-label">Position</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${playerData.stats.points}</div>
                        <div class="stat-label">Points</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${playerData.stats.wins}-${playerData.stats.draws}-${playerData.stats.losses}</div>
                        <div class="stat-label">W-D-L</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${playerData.stats.goalsFor}</div>
                        <div class="stat-label">Goals Scored</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value">${playerData.stats.goalsAgainst}</div>
                        <div class="stat-label">Goals Conceded</div>
                    </div>
                    <div class="stat-item">
                        <div class="stat-value" style="color: ${playerData.stats.goalDifference > 0 ? 'var(--success-color)' : playerData.stats.goalDifference < 0 ? 'var(--error-color)' : 'inherit'}">${playerData.stats.goalDifference > 0 ? '+' : ''}${playerData.stats.goalDifference}</div>
                        <div class="stat-label">Goal Difference</div>
                    </div>
                </div>
                <h3>Match History</h3>
                <div class="match-history">
                    ${matchHistory.length === 0 ? '<p style="text-align:center; color: var(--text-muted);">No matches played yet</p>' : ''}
                    ${matchHistory.map(match => `
                        <div class="match-item">
                            <span>Matchday ${match.matchday}: vs ${match.opponent}</span>
                            <span>${match.score}</span>
                            <span class="match-result ${match.result}">${match.result.toUpperCase()}</span>
                        </div>
                    `).join('')}
                </div>
                <h3>Form Guide</h3>
                <p style="text-align:center; font-size: 1.2rem;">${playerData.stats.form.slice(0, 5).join(' ') || 'No form data'}</p>
            </div>`;

        res.send(wrapHTML(`Player: ${playerData.name}`, htmlContent));
    } catch (error) {
        console.error('Error in /api/player/:name:', error);
        res.status(500).json({ error: 'Failed to get player details' });
    }
});

// GET /leaderboard - Browser-friendly leaderboard page (alias)
app.get('/leaderboard', (req, res) => {
    res.redirect('/api/leaderboard');
});

// GET /player/:name - Browser-friendly player page (alias)
app.get('/player/:name', (req, res) => {
    res.redirect(`/api/player/${req.params.name}`);
});

// Placeholder avatar endpoint
app.get('/api/avatar/:name', (req, res) => {
    // Generate a simple SVG avatar
    const name = req.params.name;
    const initials = name.substring(0, 2).toUpperCase();
    const hue = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
    
    const svg = `
        <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
            <rect width="100" height="100" fill="hsl(${hue}, 70%, 50%)"/>
            <text x="50" y="50" font-family="Arial" font-size="40" fill="white" 
                  text-anchor="middle" dominant-baseline="central">${initials}</text>
        </svg>
    `;
    
    res.setHeader('Content-Type', 'image/svg+xml');
    res.send(svg);
});

// Enhanced game state with tournament support
let gameState = {
    league: null,
    players: new Map(),
    matches: new Map(),
    currentMatchday: 0,
    leagueStarted: false,
    leagueFinished: false,
    fixtures: [],
    results: [],
    leagueTable: [],
    activeGames: new Map(),
    serverStartTime: Date.now(),
    totalMatches: 0,
    completedMatches: 0,
    // Tournament-specific state
    tournamentBracket: null,
    currentRound: 0,
    totalRounds: 0,
    eliminatedPlayers: new Set(),
    byeHistory: new Map(), // Track who got byes
    goldenGoalMatches: new Set(), // Track matches in golden goal mode
    // Enhanced statistics
    statistics: {
        totalGoals: 0,
        totalShots: 0,
        totalSaves: 0,
        averageMatchDuration: 0,
        longestRally: 0,
        byesAwarded: 0,
        goldenGoalMatches: 0
    }
};

/**
 * Tournament Bracket System
 * Handles single-elimination tournament logic with fair bye allocation
 */
class TournamentBracket {
constructor(players) {
    if (!players || !Array.isArray(players) || players.length < 2) {
        throw new Error('Invalid players array for tournament');
    }
    
    this.players = [...new Set(players)]; // Remove duplicates
    this.originalPlayerCount = this.players.length;
    
    if (this.originalPlayerCount > 32) {
        console.warn('Large tournament detected, performance may be affected');
    }
        this.players = [...players];
        this.originalPlayerCount = players.length;
        this.bracket = new Map();
        this.currentRound = 1;
        this.totalRounds = this.calculateTotalRounds();
        this.byeHistory = new Map(); // Track bye allocations per player
        this.roundResults = new Map();
        
        this.initializeBracket();
    }

    calculateTotalRounds() {
        return Math.ceil(Math.log2(this.originalPlayerCount));
    }

    initializeBracket() {
        // Shuffle players for random seeding
        this.shuffleArray(this.players);
        
        // Initialize bye history for all players
        this.players.forEach(player => {
            this.byeHistory.set(player, 0);
        });

        // Calculate bracket positions for perfect power of 2
        const nextPowerOf2 = Math.pow(2, this.totalRounds);
        const totalBracketSlots = nextPowerOf2;
        
        // Create initial bracket structure
        this.bracket.set(1, this.createFirstRound(totalBracketSlots));
        
        console.log(`Tournament initialized: ${this.players.length} players, ${this.totalRounds} rounds`);
    }

    createFirstRound(totalSlots) {
        const firstRound = [];
        const playersInBracket = [...this.players];
        
        // Calculate number of byes needed
        const byesNeeded = totalSlots - this.players.length;
        
        // Assign byes fairly if needed
        if (byesNeeded > 0) {
            const byePlayers = this.selectPlayersForByes(byesNeeded);
            byePlayers.forEach(player => {
                firstRound.push({
                    id: `r1-bye-${player}`,
                    player1: player,
                    player2: 'BYE',
                    isBye: true,
                    completed: false,
                    winner: null
                });
                this.byeHistory.set(player, (this.byeHistory.get(player) || 0) + 1);
                gameState.statistics.byesAwarded++;
            });
            
            // Remove bye players from available pool
            byePlayers.forEach(player => {
                const index = playersInBracket.indexOf(player);
                if (index > -1) playersInBracket.splice(index, 1);
            });
        }

        // Create regular matches with remaining players
        for (let i = 0; i < playersInBracket.length; i += 2) {
            if (i + 1 < playersInBracket.length) {
                firstRound.push({
                    id: `r1-m${Math.floor(i/2) + 1}`,
                    player1: playersInBracket[i],
                    player2: playersInBracket[i + 1],
                    isBye: false,
                    completed: false,
                    winner: null,
                    score: { [playersInBracket[i]]: 0, [playersInBracket[i + 1]]: 0 }
                });
            }
        }

        return firstRound;
    }

    selectPlayersForByes(count) {
        // Fair bye selection: prioritize players who haven't had byes
        const playersByByes = [...this.players].sort((a, b) => {
            const byesA = this.byeHistory.get(a) || 0;
            const byesB = this.byeHistory.get(b) || 0;
            if (byesA !== byesB) return byesA - byesB;
            return Math.random() - 0.5; // Random tiebreaker
        });

        return playersByByes.slice(0, count);
    }

    shuffleArray(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    getCurrentRoundMatches() {
        return this.bracket.get(this.currentRound) || [];
    }

    advanceMatch(matchId, winner, score = null) {
        const currentRoundMatches = this.bracket.get(this.currentRound);
        const match = currentRoundMatches.find(m => m.id === matchId);
        
        if (!match) {
            console.error(`Match ${matchId} not found in current round ${this.currentRound}`);
            return false;
        }

        match.completed = true;
        match.winner = winner;
        if (score) match.score = score;

        // Store round results
        if (!this.roundResults.has(this.currentRound)) {
            this.roundResults.set(this.currentRound, []);
        }
        this.roundResults.get(this.currentRound).push({
            matchId,
            winner,
            loser: match.player1 === winner ? match.player2 : match.player1,
            score
        });

        // Add loser to eliminated players (except for byes)
        if (!match.isBye) {
            const loser = match.player1 === winner ? match.player2 : match.player1;
            if (loser !== 'BYE') {
                gameState.eliminatedPlayers.add(loser);
            }
        }

        console.log(`Match ${matchId} completed. Winner: ${winner}`);
        
        // Check if round is complete
        if (this.isRoundComplete()) {
            this.prepareNextRound();
        }

        return true;
    }

    isRoundComplete() {
        const currentRoundMatches = this.bracket.get(this.currentRound) || [];
        return currentRoundMatches.every(match => match.completed);
    }

// Update prepareNextRound in TournamentBracket class:
prepareNextRound() {
    if (this.currentRound >= this.totalRounds) {
        this.completeTournament();
        return;
    }

    const currentRoundMatches = this.bracket.get(this.currentRound);
    const winners = currentRoundMatches.map(match => match.winner).filter(w => w !== null);

    console.log(`Round ${this.currentRound} complete. Winners:`, winners);

    if (winners.length === 1) {
        this.completeTournament();
        return;
    }

    // Prepare next round
    this.currentRound++;
    const nextRoundMatches = this.createNextRound(winners);
    this.bracket.set(this.currentRound, nextRoundMatches);

    console.log(`Round ${this.currentRound} prepared with ${nextRoundMatches.length} matches`);
    
    // Enhanced round naming based on actual matches (not including byes)
    const actualMatches = nextRoundMatches.filter(m => !m.isBye);
    let roundName = `Round ${this.currentRound}`;
    
    // Determine round name based on how many rounds remain
    const roundsRemaining = this.totalRounds - this.currentRound + 1;
    
    if (roundsRemaining === 1 || actualMatches.length === 1) {
        roundName = 'FINAL';
    } else if (roundsRemaining === 2 || actualMatches.length === 2) {
        roundName = 'SEMI-FINALS';
    } else if (roundsRemaining === 3 || actualMatches.length === 4) {
        roundName = 'QUARTER-FINALS';
    } else if (roundsRemaining === 4 || actualMatches.length === 8) {
        roundName = 'ROUND OF 16';
    }
    
    // Small delay before starting next round
    setTimeout(() => {
        io.emit('tournament-round-announcement', {
            round: this.currentRound,
            roundName: roundName,
            totalRounds: this.totalRounds,
            message: roundName === 'FINAL' ? '🏆 FINAL SHOWDOWN! 🏆' : 
                     roundName === 'SEMI-FINALS' ? '⚔️ SEMI-FINALS! ⚔️' : 
                     roundName === 'QUARTER-FINALS' ? '🔥 QUARTER-FINALS! 🔥' :
                     `Round ${this.currentRound}`,
            actualMatchCount: actualMatches.length
        });
        
        setTimeout(() => {
            startTournamentRound();
        }, 3000);
    }, 5000);
}

    createNextRound(winners) {
        const nextRoundMatches = [];
        const availableWinners = [...winners];
        
        // Handle odd number of winners with byes
        if (availableWinners.length % 2 === 1) {
            const byePlayer = this.selectPlayersForByes(1)[0];
            if (availableWinners.includes(byePlayer)) {
                nextRoundMatches.push({
                    id: `r${this.currentRound}-bye-${byePlayer}`,
                    player1: byePlayer,
                    player2: 'BYE',
                    isBye: true,
                    completed: false,
                    winner: null
                });
                
                availableWinners.splice(availableWinners.indexOf(byePlayer), 1);
                this.byeHistory.set(byePlayer, (this.byeHistory.get(byePlayer) || 0) + 1);
                gameState.statistics.byesAwarded++;
            }
        }

        // Create matches with remaining winners
        for (let i = 0; i < availableWinners.length; i += 2) {
            if (i + 1 < availableWinners.length) {
                nextRoundMatches.push({
                    id: `r${this.currentRound}-m${Math.floor(i/2) + 1}`,
                    player1: availableWinners[i],
                    player2: availableWinners[i + 1],
                    isBye: false,
                    completed: false,
                    winner: null,
                    score: { [availableWinners[i]]: 0, [availableWinners[i + 1]]: 0 }
                });
            }
        }

        return nextRoundMatches;
    }

    completeTournament() {
        const finalRoundMatches = this.bracket.get(this.currentRound);
        const champion = finalRoundMatches.find(match => match.completed)?.winner;
        
        console.log('Tournament completed! Champion:', champion);
        
        // Emit tournament completion
        setTimeout(() => {
            endTournamentEnhanced(champion);
        }, 3000);
    }

    getChampion() {
        // Find the winner of the final round
        for (let round = this.totalRounds; round >= 1; round--) {
            const roundMatches = this.bracket.get(round);
            if (roundMatches) {
                const finalMatch = roundMatches.find(match => match.completed && match.winner);
                if (finalMatch) return finalMatch.winner;
            }
        }
        return null;
    }

    getBracketStructure() {
        const structure = {
            totalRounds: this.totalRounds,
            currentRound: this.currentRound,
            rounds: {},
            eliminatedPlayers: Array.from(gameState.eliminatedPlayers),
            byeHistory: Array.from(this.byeHistory.entries()),
            champion: this.getChampion()
        };

        // Convert bracket to serializable format
        for (let round = 1; round <= this.totalRounds; round++) {
            const roundMatches = this.bracket.get(round);
            if (roundMatches) {
                structure.rounds[round] = roundMatches.map(match => ({
                    ...match,
                    status: match.completed ? 'completed' : 
                           match.isBye ? 'bye' : 'pending'
                }));
            }
        }

        return structure;
    }
}

/**
 * Enhanced GameInstance with Golden Goal support
 */
class GameInstance {
    constructor(matchId, player1, player2, isTournamentMatch = false) {
        this.matchId = matchId;
        this.player1 = player1;
        this.player2 = player2;
        this.isTournamentMatch = isTournamentMatch;
        
        this.gameState = {
            ballX: GAME_CONFIG.CANVAS_WIDTH / 2 - GAME_CONFIG.BALL_SIZE / 2,
            ballY: GAME_CONFIG.CANVAS_HEIGHT / 2 - GAME_CONFIG.BALL_SIZE / 2,
            ballSpeedX: 0,
            ballSpeedY: 0,
            player1Y: GAME_CONFIG.CANVAS_HEIGHT / 2 - GAME_CONFIG.PADDLE_HEIGHT / 2,
            player2Y: GAME_CONFIG.CANVAS_HEIGHT / 2 - GAME_CONFIG.PADDLE_HEIGHT / 2,
            lastUpdate: Date.now(),
            serverTick: 0
        };
        
        this.score = { [player1]: 0, [player2]: 0 };
        this.gameActive = false;
        this.gameTimer = null;
        this.timeLeft = gameState.league?.matchDuration || GAME_CONFIG.DEFAULT_MATCH_DURATION;
        this.goldenGoalMode = false;
        this.goldenGoalWarning = false;
        
        this.playerInputs = {
            [player1]: { up: false, down: false, timestamp: 0 },
            [player2]: { up: false, down: false, timestamp: 0 }
        };
        
        this.performanceMode = 'HIGH';
        this.frameInterval = 1000 / GAME_CONFIG.PERFORMANCE_MODES[this.performanceMode].FPS;
        this.lastFrameTime = 0;
        this.rallyCount = 0;
        this.maxRally = 0;
        this.matchStartTime = Date.now();
        // Add monitoring interval
this.monitoringInterval = null;
this.cleanedUp = false;

// Start connection monitoring
this.monitoringInterval = setInterval(() => {
    try {
        this.monitorConnections();
    } catch (e) {
        console.error('Error in connection monitoring:', e.message);
    }
}, 5000);
        
        // Network optimization
        this.lastStateBroadcast = 0;
        this.broadcastInterval = 33; // ~30fps broadcast rate
        
        // Player connection quality tracking
        this.playerLatency = { [player1]: 0, [player2]: 0 };
        this.connectionQuality = { [player1]: 'good', [player2]: 'good' };
    }

    start() {
        this.gameActive = true;
        this.resetBall();
        this.startTimer();
        this.detectPerformanceMode();
        this.gameLoop();
        
        // Notify players of match start with enhanced data
io.to(this.matchId).emit('match-start-enhanced', {
    matchId: this.matchId,
    player1: this.player1,
    player2: this.player2,
    isTournamentMatch: this.isTournamentMatch,
    performanceMode: this.performanceMode,
    matchDuration: this.timeLeft,
    config: {
        canvasWidth: GAME_CONFIG.CANVAS_WIDTH,
        canvasHeight: GAME_CONFIG.CANVAS_HEIGHT,
        paddleWidth: GAME_CONFIG.PADDLE_WIDTH,
        paddleHeight: GAME_CONFIG.PADDLE_HEIGHT,
        ballSize: GAME_CONFIG.BALL_SIZE
    }
});

        console.log(`Match ${this.matchId} started: ${this.player1} vs ${this.player2}`);
    }

    detectPerformanceMode() {
        const connectedClients = io.engine.clientsCount;
        const activeGamesCount = gameState.activeGames.size;
        
        if (connectedClients > 10 || activeGamesCount > 3) {
            this.performanceMode = 'MEDIUM';
        } else if (connectedClients > 20 || activeGamesCount > 5) {
            this.performanceMode = 'LOW';
        }
        
        this.frameInterval = 1000 / GAME_CONFIG.PERFORMANCE_MODES[this.performanceMode].FPS;
        this.broadcastInterval = this.performanceMode === 'LOW' ? 50 : 33;
    }

startTimer() {
    this.gameTimer = setInterval(() => {
        // Don't decrease time if paused for golden goal
        if (this.gamePausedForGoldenGoal) {
            return;
        }

        this.timeLeft--;
        
        // Check for golden goal warning in tournament matches - ONLY ONCE
        if (this.isTournamentMatch && 
            this.timeLeft === GAME_CONFIG.GOLDEN_GOAL_WARNING && 
            this.score[this.player1] === this.score[this.player2] && 
            !this.goldenGoalWarning && 
            !this.goldenGoalMode) {
            this.triggerGoldenGoalWarning();
        }
        
        // Broadcast timer update less frequently to save bandwidth
        if (!this.goldenGoalWarning && !this.gamePausedForGoldenGoal) {
            if (this.timeLeft % 5 === 0 || this.timeLeft <= 10 || this.goldenGoalMode) {
                io.to(this.matchId).emit('timer-update', {
                    timeLeft: this.timeLeft,
                    formatted: this.formatTime(this.timeLeft),
                    goldenGoalMode: this.goldenGoalMode,
                    goldenGoalWarning: this.goldenGoalWarning
                    
                });
            }
            
        }

        // Always send timer updates to admin
this.broadcastToAdmin();
        
        // Handle time up - only if not in golden goal mode and not warned
        if (this.timeLeft <= 0 && !this.goldenGoalMode && !this.goldenGoalWarning) {
            this.handleTimeUp();
        }
    }, 1000);
}
    
    formatTime(seconds) {
        if (seconds <= 0 && this.goldenGoalMode) return 'Golden Goal';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }

    resetBall() {
        this.gameState.ballX = GAME_CONFIG.CANVAS_WIDTH / 2 - GAME_CONFIG.BALL_SIZE / 2;
        this.gameState.ballY = GAME_CONFIG.CANVAS_HEIGHT / 2 - GAME_CONFIG.BALL_SIZE / 2;
        
        if (this.gameActive) {
            const speed = GAME_CONFIG.MIN_BALL_SPEED + Math.random() * 2;
            this.gameState.ballSpeedX = Math.random() > 0.5 ? speed : -speed;
            this.gameState.ballSpeedY = (Math.random() - 0.5) * speed;
            this.rallyCount = 0;
        } else {
            this.gameState.ballSpeedX = 0;
            this.gameState.ballSpeedY = 0;
        }
    }

    updateGame() {
        const state = this.gameState;
        const now = Date.now();
        
        const deltaTime = Math.min((now - state.lastUpdate) / 1000, 1/30);
        state.lastUpdate = now;
        state.serverTick++;

        this.updatePaddles(deltaTime);
        this.updateBall(deltaTime);
        this.updateStatistics();
    }

    updatePaddles(deltaTime) {
        const speed = GAME_CONFIG.PLAYER_SPEED;
        const state = this.gameState;
        
        // Player 1 paddle
        const input1 = this.playerInputs[this.player1];
        if (input1.up && state.player1Y > 0) {
            state.player1Y = Math.max(0, state.player1Y - speed);
        }
        if (input1.down && state.player1Y < GAME_CONFIG.CANVAS_HEIGHT - GAME_CONFIG.PADDLE_HEIGHT) {
            state.player1Y = Math.min(
                GAME_CONFIG.CANVAS_HEIGHT - GAME_CONFIG.PADDLE_HEIGHT,
                state.player1Y + speed
            );
        }

        // Player 2 paddle
        const input2 = this.playerInputs[this.player2];
        if (input2.up && state.player2Y > 0) {
            state.player2Y = Math.max(0, state.player2Y - speed);
        }
        if (input2.down && state.player2Y < GAME_CONFIG.CANVAS_HEIGHT - GAME_CONFIG.PADDLE_HEIGHT) {
            state.player2Y = Math.min(
                GAME_CONFIG.CANVAS_HEIGHT - GAME_CONFIG.PADDLE_HEIGHT,
                state.player2Y + speed
            );
        }
    }

updateBall(deltaTime) {
    const state = this.gameState;
    
    // Prevent NaN propagation
    if (isNaN(state.ballSpeedX) || isNaN(state.ballSpeedY)) {
        console.warn(`NaN detected in ball speed for match ${this.matchId}, resetting`);
        this.resetBall();
        return;
    }
    
    // Clamp ball speed to prevent instability
    const maxSpeed = GAME_CONFIG.MAX_BALL_SPEED * 1.5; // Allow some overflow
    const currentSpeed = Math.sqrt(state.ballSpeedX * state.ballSpeedX + state.ballSpeedY * state.ballSpeedY);
    if (currentSpeed > maxSpeed) {
        const ratio = maxSpeed / currentSpeed;
        state.ballSpeedX *= ratio;
        state.ballSpeedY *= ratio;
    }
    
    state.ballX += state.ballSpeedX;
    state.ballY += state.ballSpeedY;

    this.checkWallCollisions();
    this.checkPaddleCollisions();
    this.checkGoals();
}

    checkWallCollisions() {
        const state = this.gameState;
        
        if (state.ballY <= 0 || state.ballY + GAME_CONFIG.BALL_SIZE >= GAME_CONFIG.CANVAS_HEIGHT) {
            state.ballSpeedY = -state.ballSpeedY;
            state.ballSpeedY += (Math.random() - 0.5) * 0.5;
            state.ballY = Math.max(0, Math.min(state.ballY, GAME_CONFIG.CANVAS_HEIGHT - GAME_CONFIG.BALL_SIZE));
        }
    }

    checkPaddleCollisions() {
        const state = this.gameState;
        
        // Left paddle collision
        if (state.ballX <= GAME_CONFIG.PADDLE_WIDTH && 
            state.ballSpeedX < 0 &&
            state.ballY + GAME_CONFIG.BALL_SIZE >= state.player1Y && 
            state.ballY <= state.player1Y + GAME_CONFIG.PADDLE_HEIGHT) {
            
            this.handlePaddleHit(this.player1, state.player1Y, 'left');
        }

        // Right paddle collision
        if (state.ballX + GAME_CONFIG.BALL_SIZE >= GAME_CONFIG.CANVAS_WIDTH - GAME_CONFIG.PADDLE_WIDTH && 
            state.ballSpeedX > 0 &&
            state.ballY + GAME_CONFIG.BALL_SIZE >= state.player2Y && 
            state.ballY <= state.player2Y + GAME_CONFIG.PADDLE_HEIGHT) {
            
            this.handlePaddleHit(this.player2, state.player2Y, 'right');
        }
    }

    handlePaddleHit(playerName, paddleY, side) {
        const state = this.gameState;
        
        state.ballSpeedX = -state.ballSpeedX;
        
        const ballCenterY = state.ballY + GAME_CONFIG.BALL_SIZE / 2;
        const paddleCenterY = paddleY + GAME_CONFIG.PADDLE_HEIGHT / 2;
        const hitPosition = (ballCenterY - paddleCenterY) / (GAME_CONFIG.PADDLE_HEIGHT / 2);
        
        state.ballSpeedY = hitPosition * 3;
        
        const speedMultiplier = 1 + GAME_CONFIG.SPEED_INCREMENT;
        state.ballSpeedX *= speedMultiplier;
        state.ballSpeedY *= speedMultiplier;
        
        const maxSpeed = GAME_CONFIG.MAX_BALL_SPEED;
        state.ballSpeedX = Math.sign(state.ballSpeedX) * Math.min(Math.abs(state.ballSpeedX), maxSpeed);
        state.ballSpeedY = Math.sign(state.ballSpeedY) * Math.min(Math.abs(state.ballSpeedY), maxSpeed);
        
        if (side === 'left') {
            state.ballX = GAME_CONFIG.PADDLE_WIDTH + 1;
        } else {
            state.ballX = GAME_CONFIG.CANVAS_WIDTH - GAME_CONFIG.PADDLE_WIDTH - GAME_CONFIG.BALL_SIZE - 1;
        }
        
        const player = gameState.players.get(playerName);
        if (player) {
            player.shots++;
            player.accuracy = player.goalsFor / Math.max(player.shots, 1);
        }
        
        this.rallyCount++;
        this.maxRally = Math.max(this.maxRally, this.rallyCount);
        
        io.to(this.matchId).emit('paddle-hit', {
            player: playerName,
            rallyCount: this.rallyCount,
            ballSpeed: Math.sqrt(state.ballSpeedX * state.ballSpeedX + state.ballSpeedY * state.ballSpeedY)
        });
    }

    checkGoals() {
        const state = this.gameState;
        
        if (state.ballX < -GAME_CONFIG.BALL_SIZE) {
            this.handleGoal(this.player2, this.player1);
        } else if (state.ballX > GAME_CONFIG.CANVAS_WIDTH + GAME_CONFIG.BALL_SIZE) {
            this.handleGoal(this.player1, this.player2);
        }
    }

    handleGoal(scorer, opponent) {
        this.score[scorer]++;
        
        const scorerPlayer = gameState.players.get(scorer);
        const opponentPlayer = gameState.players.get(opponent);
        
        if (scorerPlayer) scorerPlayer.goalsFor++;
        if (opponentPlayer) opponentPlayer.goalsAgainst++;
        
        gameState.statistics.totalGoals++;
        gameState.statistics.longestRally = Math.max(gameState.statistics.longestRally, this.rallyCount);
        
        this.resetBall();
        
        io.to(this.matchId).emit('goal-scored-enhanced', {
            scorer: scorer,
            score: this.score,
            rallyLength: this.rallyCount,
            timeRemaining: this.timeLeft,
            goldenGoalMode: this.goldenGoalMode
        });

        // In Golden Goal mode, first goal wins
        if (this.goldenGoalMode) {
            console.log(`Golden Goal! ${scorer} wins match ${this.matchId}`);
            setTimeout(() => {
                this.endGame('golden-goal');
            }, 2000);
        }
    }

    updateStatistics() {
        gameState.statistics.totalShots = Array.from(gameState.players.values())
            .reduce((total, player) => total + player.shots, 0);
        
        gameState.statistics.totalSaves = Array.from(gameState.players.values())
            .reduce((total, player) => total + player.saves, 0);
    }

triggerGoldenGoalWarning() {
    this.goldenGoalWarning = true;
    
    // PAUSE THE GAME DURING COUNTDOWN
    this.gameActive = false;
    this.gamePausedForGoldenGoal = true;
    
    // Store current ball state
    this.storedBallState = {
        x: this.gameState.ballX,
        y: this.gameState.ballY,
        speedX: this.gameState.ballSpeedX,
        speedY: this.gameState.ballSpeedY
    };
    
    io.to(this.matchId).emit('golden-goal-warning', {
        message: 'Golden Goal in 5 seconds! Next goal wins!',
        countdown: GAME_CONFIG.GOLDEN_GOAL_WARNING,
        gamePaused: true
    });

    console.log(`Golden Goal warning for match ${this.matchId} - game paused`);
    
    // Resume game after countdown
    setTimeout(() => {
        this.enterGoldenGoalMode();
    }, GAME_CONFIG.GOLDEN_GOAL_WARNING * 1000);
}

enterGoldenGoalMode() {
    // Prevent double execution
    if (this.goldenGoalMode) {
        console.log('Golden goal mode already active, skipping');
        return;
    }

    this.goldenGoalMode = true;
    this.goldenGoalWarning = false;
    this.gamePausedForGoldenGoal = false;
    this.timeLeft = 0;
    
    // Resume game with ball at center
    this.gameActive = true;
    this.resetBall();
    
    gameState.goldenGoalMatches.add(this.matchId);
    gameState.statistics.goldenGoalMatches++;
    
    
    console.log(`Match ${this.matchId} entered Golden Goal mode - game resumed`);
    
    // CRITICAL FIX: Restart the game loop if it's not already running
    if (!this.loopTimeout) {
        console.log(`Restarting game loop for match ${this.matchId}`);
        this.lastFrameTime = Date.now();
        this.lastStateBroadcast = Date.now();
        this.gameLoop();
    }
}

handleTimeUp() {
    console.log(`Time up for match ${this.matchId}`);
    
    // Check if it's a draw in tournament mode
    if (this.isTournamentMatch && this.score[this.player1] === this.score[this.player2]) {
        // Should have triggered golden goal already, but just in case
        if (!this.goldenGoalMode && !this.goldenGoalWarning) {
            console.warn(`Match ${this.matchId} ended in draw but golden goal wasn't triggered`);
            this.enterGoldenGoalMode();
        }
    } else {
        // Match ends normally
        this.endGame('time');
    }
}

// Update the gameLoop method to respect the pause
gameLoop() {
    if (!this.gameActive || this.cleanedUp) {
        this.loopTimeout = null;
        return;
    }

    const now = Date.now();
    
    // Skip game updates if paused for golden goal
    if (this.gamePausedForGoldenGoal) {
        // Still broadcast state but don't update positions
        if (now - this.lastStateBroadcast >= this.broadcastInterval) {
            this.broadcastGameState();
            this.broadcastToAdmin();
            this.lastStateBroadcast = now;
        }
        
        this.loopTimeout = setTimeout(() => {
            try {
                this.gameLoop();
            } catch (e) {
                console.error(`Game loop error for ${this.matchId}:`, e.message);
                this.endGame('error');
            }
        }, 16);
        return;
    }
    
    // Rest of gameLoop remains the same...
    if (this.lastLoopTime && (now - this.lastLoopTime) < 10) {
        this.loopTimeout = setTimeout(() => {
            try {
                this.gameLoop();
            } catch (e) {
                console.error(`Game loop error for ${this.matchId}:`, e.message);
                this.endGame('error');
            }
        }, 16);
        return;
    }
    this.lastLoopTime = now;
    
    try {
        if (now - this.lastFrameTime >= this.frameInterval) {
            this.updateGame();
            this.lastFrameTime = now;
        }

        if (now - this.lastStateBroadcast >= this.broadcastInterval) {
            this.broadcastGameState();
            this.lastStateBroadcast = now;
        }
    } catch (e) {
        console.error(`Game update error for ${this.matchId}:`, e.message);
    }

    this.loopTimeout = setTimeout(() => {
        try {
            this.gameLoop();
        } catch (e) {
            console.error(`Critical game loop error for ${this.matchId}:`, e.message);
            this.endGame('error');
        }
    }, 16);
}

broadcastGameState() {
    // Skip if no players connected
    const roomSockets = io.sockets.adapter.rooms.get(this.matchId);
    if (!roomSockets || roomSockets.size === 0) return;
    
    const stateData = {
        ballX: Math.round(this.gameState.ballX),
        ballY: Math.round(this.gameState.ballY),
        player1Y: Math.round(this.gameState.player1Y),
        player2Y: Math.round(this.gameState.player2Y),
        score: this.score,
        serverTick: this.gameState.serverTick,
        rallyCount: this.rallyCount,
        goldenGoalMode: this.goldenGoalMode
    };
    
    // Only include velocity if clients support interpolation
    if (GAME_CONFIG.PERFORMANCE_MODES[this.performanceMode].INTERPOLATION) {
        stateData.ballVelocity = {
            x: Math.round(this.gameState.ballSpeedX * 100) / 100,
            y: Math.round(this.gameState.ballSpeedY * 100) / 100
        };
    }
    
    io.to(this.matchId).emit('game-state-update-enhanced', stateData);
}

broadcastToAdmin() {
    // Send match updates to admin
    const adminSocket = Array.from(io.sockets.sockets.values())
        .find(s => connectedClients.get(s.id)?.isAdmin);
    
    if (adminSocket) {
        adminSocket.emit('admin-match-update', {
            matchId: this.matchId,
            score: this.score,
            timeLeft: this.timeLeft,
            gameActive: this.gameActive,
            goldenGoalMode: this.goldenGoalMode,
            player1: this.player1,
            player2: this.player2
        });
    }
}

    handlePlayerInput(playerName, input, clientTimestamp = Date.now()) {
        if (this.playerInputs[playerName]) {
            const serverTimestamp = Date.now();
            const inputLag = serverTimestamp - clientTimestamp;
            
            this.playerInputs[playerName] = {
                ...input,
                timestamp: serverTimestamp,
                lag: inputLag
            };
            
            this.playerLatency[playerName] = inputLag;
            
            if (inputLag > 200) {
                this.connectionQuality[playerName] = 'poor';
            } else if (inputLag > 100) {
                this.connectionQuality[playerName] = 'ok';
            } else {
                this.connectionQuality[playerName] = 'good';
            }
        }
    }


// In GameInstance class, update endGame method:
endGame(reason = 'time') {
    // Prevent double cleanup
    if (this.cleanedUp) return;
    this.cleanedUp = true;
    
    this.gameActive = false;
    
    // Clear all timers safely
    const timers = [this.gameTimer, this.loopTimeout, this.monitoringInterval];
    timers.forEach(timer => {
        if (timer) {
            try {
                clearInterval(timer);
                clearTimeout(timer);
            } catch (e) {
                // Ignore timer clear errors
            }
        }
    });

    
    this.gameTimer = null;
    this.loopTimeout = null;
    this.monitoringInterval = null;

    const matchDuration = (Date.now() - this.matchStartTime) / 1000;
    
    // Safely update statistics
    try {
        gameState.statistics.averageMatchDuration = 
            (gameState.statistics.averageMatchDuration * gameState.completedMatches + matchDuration) / 
            (gameState.completedMatches + 1);
        
        this.updatePlayerStats();
    } catch (e) {
        console.error('Error updating stats:', e.message);
    }
    
    let winner = null;
    if (this.score[this.player1] > this.score[this.player2]) {
        winner = this.player1;
    } else if (this.score[this.player2] > this.score[this.player1]) {
        winner = this.player2;
    }
    
    // Safely emit to room
    try {
        const roomSockets = io.sockets.adapter.rooms.get(this.matchId);
        if (roomSockets && roomSockets.size > 0) {
            io.to(this.matchId).emit('match-finished-enhanced', {
                finalScore: this.score,
                winner: winner || 'draw',
                reason: reason,
                duration: Math.round(matchDuration),
                maxRally: this.maxRally,
                playerLatency: this.playerLatency,
                connectionQuality: this.connectionQuality,
                goldenGoal: reason === 'golden-goal',
                statistics: {
                    totalHits: this.rallyCount,
                    averageLatency: (this.playerLatency[this.player1] + this.playerLatency[this.player2]) / 2
                }
            });
        }
    } catch (e) {
        console.error('Error emitting match finish:', e.message);
    }

    // Clean up from active games
    gameState.activeGames.delete(this.matchId);
    
    // Update match record
    try {
        const match = gameState.matches.get(this.matchId);
        if (match) {
            match.finished = true;
            match.finalScore = { ...this.score };
            match.duration = matchDuration;
            match.maxRally = this.maxRally;
            match.winner = winner;
            
            if (this.isTournamentMatch && winner) {
                if (gameState.tournamentBracket) {
                    gameState.tournamentBracket.advanceMatch(this.matchId, winner, this.score);
                    
                    io.emit('tournament-bracket-updated', {
                        bracket: gameState.tournamentBracket.getBracketStructure(),
                        matchCompleted: {
                            id: this.matchId,
                            winner: winner,
                            score: this.score
                        }
                    });
                }
            } else {
                updatePlayerStats(match);
                checkMatchdayComplete();
            }
        }
    } catch (e) {
        console.error('Error updating match record:', e.message);
    }
    
    gameState.completedMatches++;
    
    // Force cleanup of room
    setTimeout(() => {
        try {
            const roomSockets = io.sockets.adapter.rooms.get(this.matchId);
            if (roomSockets) {
                roomSockets.forEach(socketId => {
                    const socket = io.sockets.sockets.get(socketId);
                    if (socket) socket.leave(this.matchId);
                });
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    }, 5000);
}

    updatePlayerStats() {
        [this.player1, this.player2].forEach(playerName => {
            const player = gameState.players.get(playerName);
            if (!player) return;
            
            player.matches++;
            player.totalPlayTime = (player.totalPlayTime || 0) + (Date.now() - this.matchStartTime);
            
            if (player.shots > 0) {
                player.accuracy = player.goalsFor / player.shots;
            }
            
            const playerScore = this.score[playerName];
            const opponentName = playerName === this.player1 ? this.player2 : this.player1;
            const opponentScore = this.score[opponentName];
            
            if (playerScore > opponentScore) {
                player.wins++;
                player.points += 3;
            } else if (playerScore < opponentScore) {
                player.losses++;
            } else {
                player.draws++;
                player.points += 1;
            }
            
            player.averageGoalsPerMatch = player.goalsFor / Math.max(player.matches, 1);
            player.averageConcededPerMatch = player.goalsAgainst / Math.max(player.matches, 1);
            player.formGuide = player.formGuide || [];
            
            const result = playerScore > opponentScore ? 'W' : 
                          playerScore < opponentScore ? 'L' : 'D';
            player.formGuide.unshift(result);
            if (player.formGuide.length > 5) {
                player.formGuide = player.formGuide.slice(0, 5);
            }
        });
    }

    // In GameInstance, add connection monitoring
monitorConnections() {
    if (!this.gameActive) return;
    
    const poorQualityThreshold = 300; // ms
    let poorConnections = 0;
    
    for (const player of [this.player1, this.player2]) {
        if (this.playerLatency[player] > poorQualityThreshold) {
            poorConnections++;
        }
    }
    
    // Downgrade performance if both players have poor connection
    if (poorConnections === 2 && this.performanceMode !== 'LOW') {
        this.performanceMode = 'LOW';
        this.frameInterval = 1000 / GAME_CONFIG.PERFORMANCE_MODES[this.performanceMode].FPS;
        this.broadcastInterval = 50;
        console.log(`Downgrading performance for match ${this.matchId} due to poor connections`);
    }
}
}

// Connection tracking
const connectedClients = new Map();
const disconnectionTimeouts = new Map();

// Safe socket event handler wrapper
function safeSocketHandler(socket, eventName, handler) {
    socket.on(eventName, async (...args) => {
        try {
            await handler(...args);
        } catch (error) {
            console.error(`Error in ${eventName} handler for ${socket.id}:`, error.message);
            socket.emit('error', {
                type: 'handler_error',
                message: 'An error occurred processing your request',
                event: eventName
            });
        }
    });
}

// Connection pool management
// Connection pool management
const connectionPool = {
    maxSize: 100,
    connections: new Map(),
    
    add(socket) {
        if (this.connections.size >= this.maxSize) {
            // Remove oldest inactive connection
            let oldestTime = Date.now();
            let oldestId = null;
            
            for (const [id, data] of this.connections.entries()) {
                if (data.lastActivity < oldestTime && !data.inGame) {
                    oldestTime = data.lastActivity;
                    oldestId = id;
                }
            }
            
            if (oldestId) {
                const oldSocket = io.sockets.sockets.get(oldestId);
                if (oldSocket) {
                    oldSocket.emit('error', 'Connection pool full');
                    oldSocket.disconnect();
                }
                this.connections.delete(oldestId);
            }
        }
        
        this.connections.set(socket.id, {
            socket: socket,
            lastActivity: Date.now(),
            inGame: false
        });
    },
    
    remove(socketId) {
        this.connections.delete(socketId);
    },
    
    updateActivity(socketId) {
        const conn = this.connections.get(socketId);
        if (conn) {
            conn.lastActivity = Date.now();
        }
    },
    
    setInGame(socketId, inGame) {
        const conn = this.connections.get(socketId);
        if (conn) {
            conn.inGame = inGame;
        }
    }
};



// Enhanced socket connection handling
io.on('connection', (socket) => {
    try {
        const clientIP = socket.handshake.address;
        
        if (!checkConnectionLimit(clientIP)) {
            console.log(`Connection limit exceeded for IP: ${clientIP}`);
            socket.emit('error', 'Connection limit exceeded. Please try again later.');
            socket.disconnect();
            return;
        }
        
        connectedClients.set(socket.id, {
            ip: clientIP,
            connectedAt: Date.now(),
            playerName: null,
            isAdmin: isHostIP({ connection: { remoteAddress: clientIP } }),
            lastActivity: Date.now()
        });
        
        console.log(`Enhanced connection: ${socket.id} from ${clientIP}`);
        
        socket.emit('server-info', {
            version: '2.0',
            serverTime: Date.now(),
            gameConfig: GAME_CONFIG,
            features: ['enhanced-ui', 'tournament-mode', 'golden-goal', 'bracket-system']
        });

        // Set socket timeout
        socket.timeout(90000); // 90 second timeout
        
        // Handle socket errors
        socket.on('error', (error) => {
            console.error(`Socket error for ${socket.id}:`, error.message);
        });

    // Enhanced player join
    socket.on('join-league', (data) => {
        try {
            const { playerName, deviceInfo } = data;
            
            if (!gameState.league) {
                socket.emit('error', { type: 'no_league', message: 'No league created yet' });
                return;
            }

            if (gameState.leagueStarted) {
                socket.emit('error', { type: 'league_started', message: 'League already started' });
                return;
            }

            if (!playerName || typeof playerName !== 'string') {
                socket.emit('error', { type: 'invalid_name', message: 'Invalid player name' });
                return;
            }
            
            const trimmedName = playerName.trim();
            if (trimmedName.length < 2 || trimmedName.length > 20) {
                socket.emit('error', { type: 'name_length', message: 'Name must be 2-20 characters' });
                return;
            }
            
            if (!/^[a-zA-Z0-9_\-\s]+$/.test(trimmedName)) {
                socket.emit('error', { type: 'invalid_chars', message: 'Name contains invalid characters' });
                return;
            }

            if (gameState.players.has(trimmedName)) {
                socket.emit('error', { type: 'name_taken', message: 'Player name already taken' });
                return;
            }

            if (gameState.players.size >= gameState.league.maxPlayers) {
                socket.emit('error', { type: 'league_full', message: 'League is full' });
                return;
            }

            gameState.players.set(trimmedName, {
                id: socket.id,
                name: trimmedName,
                matches: 0,
                wins: 0,
                draws: 0,
                losses: 0,
                goalsFor: 0,
                goalsAgainst: 0,
                saves: 0,
                shots: 0,
                accuracy: 0,
                points: 0,
                joinedAt: Date.now(),
                deviceInfo: deviceInfo || {},
                totalPlayTime: 0,
                averageGoalsPerMatch: 0,
                averageConcededPerMatch: 0,
                formGuide: [],
                connectionQuality: 'good',
                latency: 0,
                eliminated: false
            });

            const clientData = connectedClients.get(socket.id);
            if (clientData) {
                clientData.playerName = trimmedName;
            }

            socket.playerName = trimmedName;
            
socket.emit('joined-league-enhanced', {
    playerName: trimmedName,
    league: gameState.league,
    playersCount: gameState.players.size,
    serverInfo: {
        version: '2.0',
        features: ['tournament-bracket', 'golden-goal', 'fair-byes', 'custom-duration']
    }
});

            io.emit('player-joined-enhanced', {
                playerName: trimmedName,
                playersCount: gameState.players.size,
                maxPlayers: gameState.league.maxPlayers,
                deviceInfo: deviceInfo || {}
            });

            console.log(`${trimmedName} joined the league (${gameState.players.size}/${gameState.league.maxPlayers})`);
        } catch (error) {
            console.error('Error in join-league:', error);
            socket.emit('error', { type: 'server_error', message: 'Internal server error' });
        }
    });

    // Enhanced admin league creation
socket.on('create-league', (leagueData) => {
    try {
        const clientData = connectedClients.get(socket.id);
        if (!clientData || !clientData.isAdmin) {
            socket.emit('error', { type: 'unauthorized', message: 'Admin access required' });
            return;
        }

        // Check if a league exists and is still ongoing
        if (gameState.league && gameState.leagueStarted && !gameState.leagueFinished) {
            socket.emit('error', { 
                type: 'league_in_progress', 
                message: 'Cannot create a new championship while one is in progress.' 
            });
            return;
        }

        // If a league is finished, reset game state for new championship
        if (gameState.leagueFinished) {
            console.log('Resetting completed championship for new one...');
            resetGameState();
        }

        // Rest of the create-league handler remains the same...
        const { name, maxPlayers, gameMode, matchDuration } = leagueData;
        
        if (!name || name.trim().length === 0) {
            socket.emit('error', { type: 'invalid_name', message: 'League name required' });
            return;
        }

        const validDurations = [60, 90, 120, 150, 180, 210, 240];
        const duration = parseInt(matchDuration) || GAME_CONFIG.DEFAULT_MATCH_DURATION;
        const finalDuration = validDurations.includes(duration) ? duration : GAME_CONFIG.DEFAULT_MATCH_DURATION;

        gameState.league = {
            name: name.trim(),
            maxPlayers: Math.min(Math.max(parseInt(maxPlayers) || 8, 2), 48),
            gameMode: gameMode || 'classic',
            matchDuration: finalDuration,
            createdAt: new Date(),
            version: '2.0'
        };

        socket.emit('league-created-enhanced', {
            league: gameState.league,
            serverCapabilities: {
                maxPlayers: 48,
                supportedModes: ['classic', 'tournament'],
                features: ['tournament-bracket', 'golden-goal', 'fair-bye-system', 'custom-duration']
            }
        });
        
        console.log(`Enhanced league "${name}" created (${gameMode} mode)`);
    } catch (error) {
        console.error('Error creating league:', error);
        socket.emit('error', { type: 'server_error', message: 'Failed to create league' });
    }
});

    // Enhanced league start
    socket.on('start-league', () => {
        try {
            const clientData = connectedClients.get(socket.id);
            if (!clientData || !clientData.isAdmin) {
                socket.emit('error', { type: 'unauthorized', message: 'Admin access required' });
                return;
            }

            if (!gameState.league) {
                socket.emit('error', { type: 'no_league', message: 'No league to start' });
                return;
            }

            if (gameState.players.size < 2) {
                socket.emit('error', { type: 'insufficient_players', message: 'Need at least 2 players to start' });
                return;
            }
            gameState.leagueStarted = true;
            
            if (gameState.league.gameMode === 'tournament') {
                startTournamentEnhanced();
            } else {
                generateEnhancedFixtures();
                gameState.totalMatches = gameState.fixtures.flat().length;
                startNextMatchdayEnhanced();
            }
            
io.emit('league-started-enhanced', {
    playersCount: gameState.players.size,
    gameMode: gameState.league.gameMode,
    matchDuration: gameState.league.matchDuration,
    totalMatchdays: gameState.league.gameMode === 'tournament' ? null : gameState.fixtures.length,
    totalMatches: gameState.totalMatches,
    startTime: Date.now()
});
            
            console.log(`Enhanced ${gameState.league.gameMode} started with ${gameState.players.size} players`);
        } catch (error) {
            console.error('Error starting league:', error);
            socket.emit('error', { type: 'server_error', message: 'Failed to start league' });
        }
    });

    // Enhanced player input
socket.on('player-input-enhanced', (data) => {
    try {
        const playerName = socket.playerName;
        if (!playerName || !data) return;

        const { input, clientTimestamp, frameNumber } = data;
        
        // Validate input structure
        if (!input || typeof input !== 'object') return;
        if (typeof input.up !== 'boolean' || typeof input.down !== 'boolean') return;
        
        const clientData = connectedClients.get(socket.id);
        if (clientData) {
            clientData.lastActivity = Date.now();
        }

        // Find active game more efficiently
        let gameFound = false;
        for (const [matchId, game] of gameState.activeGames) {
            if (game.player1 === playerName || game.player2 === playerName) {
                game.handlePlayerInput(playerName, input, clientTimestamp || Date.now());
                gameFound = true;
                break;
            }
        }
    } catch (error) {
        console.error(`Error in player-input-enhanced for ${socket.id}:`, error.message);
    }
});

    // Network monitoring
    socket.on('ping', (timestamp) => {
        socket.emit('pong', timestamp);
    });

    // Enhanced admin requests
    socket.on('get-league-stats', () => {
        try {
            const clientData = connectedClients.get(socket.id);
            if (!clientData || !clientData.isAdmin) {
                socket.emit('error', { type: 'unauthorized', message: 'Admin access required' });
                return;
            }
            
            updateLeagueTableEnhanced();
            
            const stats = {
                leagueTable: gameState.leagueTable,
                globalStats: gameState.statistics,
                bracket: gameState.tournamentBracket ? gameState.tournamentBracket.getBracketStructure() : null,
                serverInfo: {
                    uptime: Date.now() - gameState.serverStartTime,
                    activeConnections: io.engine.clientsCount,
                    activeGames: gameState.activeGames.size,
                    completedMatches: gameState.completedMatches,
                    totalMatches: gameState.totalMatches,
                    eliminatedPlayers: Array.from(gameState.eliminatedPlayers)
                },
                playerDetails: Array.from(gameState.players.values()).map(player => ({
                    ...player,
                    averageLatency: connectedClients.get(player.id)?.averageLatency || 0
                }))
            };
            
            socket.emit('league-stats-enhanced', stats);
        } catch (error) {
            console.error('Error getting league stats:', error);
            socket.emit('error', { type: 'server_error', message: 'Failed to get statistics' });
        }
    });

    // Enhanced disconnection handling
    socket.on('disconnect', (reason) => {
        try {
            const clientData = connectedClients.get(socket.id);
            console.log(`Enhanced disconnect: ${socket.id} (${reason})`);
            
            if (socket.playerName && gameState.players.has(socket.playerName)) {
                if (!gameState.leagueStarted) {
                    gameState.players.delete(socket.playerName);
                    io.emit('player-left-enhanced', {
                        playerName: socket.playerName,
                        playersCount: gameState.players.size,
                        reason: reason
                    });
                } else {
                    const player = gameState.players.get(socket.playerName);
                    if (player) {
                        player.disconnected = true;
                        player.disconnectedAt = Date.now();
                    }
                    
                    disconnectionTimeouts.set(socket.playerName, setTimeout(() => {
                        handlePlayerDisconnection(socket.playerName);
                    }, 60000));
                }
            }
            
            connectedClients.delete(socket.id);
        } catch (error) {
            console.error('Error handling disconnect:', error);
        }
        if (socket.id === commentaryState.adminSocketId) {
    commentaryState.isActive = false;
    commentaryState.adminSocketId = null;
    io.emit('commentary-stopped', { timestamp: Date.now() });
}
    });

    // Enhanced reconnection
    socket.on('reconnect-player', (data) => {
        try {
            const { playerName, reconnectToken } = data;
            
            if (!gameState.players.has(playerName)) {
                socket.emit('error', { type: 'player_not_found', message: 'Player not found' });
                return;
            }
            
            const player = gameState.players.get(playerName);
            if (player.disconnected) {
                if (disconnectionTimeouts.has(playerName)) {
                    clearTimeout(disconnectionTimeouts.get(playerName));
                    disconnectionTimeouts.delete(playerName);
                }
                
                player.id = socket.id;
                player.disconnected = false;
                player.reconnectedAt = Date.now();
                socket.playerName = playerName;
                
                connectedClients.set(socket.id, {
                    ip: socket.handshake.address,
                    connectedAt: Date.now(),
                    playerName: playerName,
                    isAdmin: false,
                    lastActivity: Date.now()
                });
                
                socket.emit('reconnect-success', {
                    playerName: playerName,
                    currentState: getCurrentPlayerState(playerName)
                });
                
                console.log(`Player ${playerName} reconnected successfully`);
            }
        } catch (error) {
            console.error('Error handling reconnection:', error);
            socket.emit('error', { type: 'server_error', message: 'Reconnection failed' });
        }
    });
    // Admin starts commentary
    socket.on('start-commentary', () => {
    const clientData = connectedClients.get(socket.id);
    if (!clientData || !clientData.isAdmin) {
        socket.emit('error', { type: 'unauthorized', message: 'Admin access required for commentary' });
        return;
    }
    
    commentaryState.isActive = true;
    commentaryState.adminSocketId = socket.id;
    
    console.log('Admin started voice commentary');
    
    // Notify all clients that commentary has started
    io.emit('commentary-started', {
        timestamp: Date.now()
    });
});

// Admin stops commentary
    socket.on('stop-commentary', () => {
        if (socket.id === commentaryState.adminSocketId) {
            commentaryState.isActive = false;
            commentaryState.adminSocketId = null;
        
        console.log('Admin stopped voice commentary');
        
        // Notify all clients that commentary has stopped
        io.emit('commentary-stopped', {
            timestamp: Date.now()
        });
    }
});

// Receive and broadcast audio chunks
    socket.on('commentary-chunk', (audioData) => {
    // Verify this is from the admin
    if (socket.id !== commentaryState.adminSocketId || !commentaryState.isActive) {
        return;
    }
    
    // Broadcast to all clients except the admin
    socket.broadcast.emit('commentary-chunk', {
        data: audioData,
        timestamp: Date.now()
    });
});
    } catch (error) {
        console.error('Connection setup error:', error);
        socket.disconnect();
    }
});


setInterval(() => {
    const rooms = io.sockets.adapter.rooms;
    for (const [roomId, sockets] of rooms) {
        if (roomId.startsWith('md') || roomId.startsWith('r')) {
            if (sockets.size === 0) {
                // Room is empty, check if game is still active
                const game = gameState.activeGames.get(roomId);
                if (game && game.gameActive) {
                    console.log(`Ending orphaned game ${roomId}`);
                    game.endGame('no_players');
                }
            }
        }
    }
}, 60000);

// Tournament-specific functions
function startTournamentEnhanced() {
    const playerNames = Array.from(gameState.players.keys());
    gameState.tournamentBracket = new TournamentBracket(playerNames);
    
    console.log('Tournament bracket created:', gameState.tournamentBracket.getBracketStructure());
    
    // Send bracket structure to all clients
    io.emit('tournament-bracket-created', {
        bracket: gameState.tournamentBracket.getBracketStructure(),
        totalRounds: gameState.tournamentBracket.totalRounds,
        currentRound: gameState.tournamentBracket.currentRound
    });
    
    // Start first round
    startTournamentRound();
}

function startTournamentRound() {
    const currentRoundMatches = gameState.tournamentBracket.getCurrentRoundMatches();
    
    console.log(`Starting tournament round ${gameState.tournamentBracket.currentRound}`);
    
    // Send round start notification
    io.emit('tournament-round-started', {
        round: gameState.tournamentBracket.currentRound,
        totalRounds: gameState.tournamentBracket.totalRounds,
        matches: currentRoundMatches.map(match => ({
            id: match.id,
            player1: match.player1,
            player2: match.player2,
            isBye: match.isBye
        }))
    });
    
    // Process bye matches immediately
    currentRoundMatches.forEach(match => {
        if (match.isBye) {
            console.log(`${match.player1} receives bye in round ${gameState.tournamentBracket.currentRound}`);
            gameState.tournamentBracket.advanceMatch(match.id, match.player1);
            
            // Notify player of bye
            const playerSocket = Array.from(io.sockets.sockets.values())
                .find(s => s.playerName === match.player1);
            if (playerSocket) {
                playerSocket.emit('tournament-bye', {
                    round: gameState.tournamentBracket.currentRound,
                    message: `You received a bye in round ${gameState.tournamentBracket.currentRound}`
                });
            }
        }
    });
    
    // Start actual matches after a brief delay
    setTimeout(() => {
        const realMatches = currentRoundMatches.filter(match => !match.isBye);
        createMatchesSafely(realMatches);
    }, 3000);
}

const matchCreationQueue = [];
let isCreatingMatches = false;

async function createMatchesSafely(matches) {
    if (isCreatingMatches) {
        return new Promise((resolve) => {
            matchCreationQueue.push({ matches, resolve });
        });
    }
    
    isCreatingMatches = true;
    
    try {
        // Call the actual match creation
        await startTournamentMatches(matches);
    } finally {
        isCreatingMatches = false;
        
        // Process queue
        if (matchCreationQueue.length > 0) {
            const next = matchCreationQueue.shift();
            createMatchesSafely(next.matches).then(next.resolve);
        }
    }
}
function startTournamentMatches(matches) {
    const matchPromises = matches.map((match, index) => {
        return new Promise((resolve) => {
            const matchId = match.id;
            
            gameState.matches.set(matchId, {
                id: matchId,
                player1: match.player1,
                player2: match.player2,
                score: { [match.player1]: 0, [match.player2]: 0 },
                events: [],
                started: false,
                finished: false,
                isTournamentMatch: true,
                round: gameState.tournamentBracket.currentRound,
                createdAt: Date.now()
            });

            const gameInstance = new GameInstance(matchId, match.player1, match.player2, true);
            gameState.activeGames.set(matchId, gameInstance);
            
            const player1Socket = Array.from(io.sockets.sockets.values())
                .find(s => s.playerName === match.player1);
            const player2Socket = Array.from(io.sockets.sockets.values())
                .find(s => s.playerName === match.player2);
                
            if (player1Socket) player1Socket.join(matchId);
            if (player2Socket) player2Socket.join(matchId);
            
            resolve();
        });
    });
    
    Promise.all(matchPromises).then(() => {
        // Start games with staggered timing
        let gameStartDelay = 0;
        gameState.activeGames.forEach((game) => {
            if (!game.gameActive && game.isTournamentMatch) {
                setTimeout(() => {
                    game.start();
                }, gameStartDelay);
                gameStartDelay += 500;
            }
        });
    });
}

function endTournamentEnhanced(champion) {
    gameState.leagueFinished = true;
    
    console.log('Tournament completed! Champion:', champion);
    
    // Get final bracket structure
    const bracketStructure = gameState.tournamentBracket.getBracketStructure();
    
    // Calculate tournament statistics
    const tournamentStats = {
        totalRounds: gameState.tournamentBracket.totalRounds,
        totalMatches: gameState.completedMatches,
        byesAwarded: gameState.statistics.byesAwarded,
        goldenGoalMatches: gameState.statistics.goldenGoalMatches,
        participantCount: gameState.tournamentBracket.originalPlayerCount,
        duration: Date.now() - gameState.serverStartTime,
        eliminatedPlayers: Array.from(gameState.eliminatedPlayers)
    };
    
    // Calculate ALL tournament awards
    const championPlayer = gameState.players.get(champion);
    const topScorer = Array.from(gameState.players.values())
        .filter(p => p.matches > 0)
        .reduce((prev, curr) => curr.goalsFor > prev.goalsFor ? curr : prev);
    const bestPlayer = calculateBestPlayerEnhanced();
    const bestDefense = calculateBestDefenseEnhanced();
    
    const tournamentAwards = {
        champion: championPlayer,
        topScorer: topScorer,
        bestPlayer: bestPlayer,
        bestDefense: bestDefense,
        // Special recognition for perfect runs
        isPerfectRun: championPlayer && championPlayer.losses === 0,
        // Check if champion won all awards
        isGrandSlam: championPlayer && topScorer && bestPlayer && bestDefense &&
                     championPlayer.name === topScorer.name &&
                     championPlayer.name === bestPlayer.name &&
                     championPlayer.name === bestDefense.name
    };
    
    // IMPORTANT: DO NOT send league table for tournaments
    // Only send tournament-specific data
    io.emit('tournament-finished-enhanced', {
        bracket: bracketStructure,
        champion: champion,
        awards: tournamentAwards,
        statistics: gameState.statistics,
        tournamentSummary: tournamentStats,
        // Explicitly mark as tournament mode
        gameMode: 'tournament',
        // NO leagueTable property here - pure tournament data only
        finalResults: {
            winner: champion,
            eliminated: Array.from(gameState.eliminatedPlayers),
            totalRounds: gameState.tournamentBracket.totalRounds,
            perfectRun: tournamentAwards.isPerfectRun,
            grandSlam: tournamentAwards.isGrandSlam
        }
    });
    
    console.log('Tournament awards calculated:', {
        champion: championPlayer?.name,
        topScorer: topScorer?.name,
        bestPlayer: bestPlayer?.name,
        bestDefense: bestDefense?.name,
        grandSlam: tournamentAwards.isGrandSlam
    });
}

// League-specific functions (unchanged core logic but enhanced)
function generateEnhancedFixtures() {
    const players = Array.from(gameState.players.keys());
    const fixtures = [];
    const n = players.length;
    
    if (n % 2 === 1) {
        players.push('BYE');
    }
    
    const rounds = players.length - 1;
    const matchesPerRound = players.length / 2;
    
    for (let round = 0; round < rounds; round++) {
        const roundMatches = [];
        
        for (let match = 0; match < matchesPerRound; match++) {
            const home = players[match];
            const away = players[players.length - 1 - match];
            
            if (home !== 'BYE' && away !== 'BYE') {
                roundMatches.push({
                    home,
                    away,
                    round: round + 1,
                    estimatedDuration: GAME_CONFIG.MATCH_DURATION,
                    priority: calculateMatchPriority(home, away, round)
                });
            }
        }
        
        fixtures.push(roundMatches);
        players.splice(1, 0, players.pop());
    }
    
    const returnFixtures = fixtures.map((round, roundIndex) => 
        round.map(match => ({
            home: match.away,
            away: match.home,
            round: roundIndex + rounds + 1,
            estimatedDuration: GAME_CONFIG.MATCH_DURATION,
            priority: calculateMatchPriority(match.away, match.home, roundIndex + rounds)
        }))
    );
    
    gameState.fixtures = [...fixtures, ...returnFixtures];
}

// Add this function before the socket.io connection handler
function resetGameState() {
    console.log('Resetting game state for new championship...');
    
    // Disconnect all players gracefully
    gameState.players.forEach((player, name) => {
        const playerSocket = Array.from(io.sockets.sockets.values())
            .find(s => s.playerName === name);
        if (playerSocket) {
            playerSocket.emit('championship-reset', { message: 'Championship completed. Server ready for new championship.' });
        }
    });
    
    // Clear all active games
    gameState.activeGames.forEach(game => {
        if (game.gameActive) {
            game.endGame('reset');
        }
    });
    
    // Reset state
    gameState = {
        league: null,
        players: new Map(),
        matches: new Map(),
        currentMatchday: 0,
        leagueStarted: false,
        leagueFinished: false,
        fixtures: [],
        results: [],
        leagueTable: [],
        activeGames: new Map(),
        serverStartTime: Date.now(),
        totalMatches: 0,
        completedMatches: 0,
        tournamentBracket: null,
        currentRound: 0,
        totalRounds: 0,
        eliminatedPlayers: new Set(),
        byeHistory: new Map(),
        goldenGoalMatches: new Set(),
        statistics: {
            totalGoals: 0,
            totalShots: 0,
            totalSaves: 0,
            averageMatchDuration: 0,
            longestRally: 0,
            byesAwarded: 0,
            goldenGoalMatches: 0
        }
    };
    
    // Clear disconnection timeouts
    disconnectionTimeouts.forEach(timeout => clearTimeout(timeout));
    disconnectionTimeouts.clear();
    
    console.log('Game state reset completed');
}

function calculateMatchPriority(player1, player2, round) {
    return Math.random();
}

function startNextMatchdayEnhanced() {
    if (gameState.currentMatchday >= gameState.fixtures.length) {
        endLeagueEnhanced();
        return;
    }
    
    const matchdayFixtures = gameState.fixtures[gameState.currentMatchday];
    const matchday = gameState.currentMatchday + 1;
    
    const matchPromises = matchdayFixtures.map((fixture, index) => {
        return new Promise((resolve) => {
            const matchId = `md${matchday}-${index}-${Date.now()}`;
            
            gameState.matches.set(matchId, {
                id: matchId,
                player1: fixture.home,
                player2: fixture.away,
                score: { [fixture.home]: 0, [fixture.away]: 0 },
                events: [],
                started: false,
                finished: false,
                matchday: matchday,
                isTournamentMatch: false,
                createdAt: Date.now(),
                estimatedDuration: fixture.estimatedDuration
            });

            const gameInstance = new GameInstance(matchId, fixture.home, fixture.away, false);
            gameState.activeGames.set(matchId, gameInstance);
            
            const player1Socket = Array.from(io.sockets.sockets.values())
                .find(s => s.playerName === fixture.home);
            const player2Socket = Array.from(io.sockets.sockets.values())
                .find(s => s.playerName === fixture.away);
                
            if (player1Socket) player1Socket.join(matchId);
            if (player2Socket) player2Socket.join(matchId);
            
            resolve();
        });
    });
    
    Promise.all(matchPromises).then(() => {
        io.emit('matchday-started-enhanced', {
            matchday: matchday,
            fixtures: matchdayFixtures,
            totalMatchdays: gameState.fixtures.length,
            progress: (matchday / gameState.fixtures.length) * 100,
            matches: Array.from(gameState.matches.values()).filter(m => m.matchday === matchday),
            serverTime: Date.now()
        });
        
        setTimeout(() => {
            let gameStartDelay = 0;
            gameState.activeGames.forEach((game) => {
                if (!game.gameActive && !game.isTournamentMatch) {
                    setTimeout(() => {
                        game.start();
                    }, gameStartDelay);
                    gameStartDelay += 500;
                }
            });
        }, 3000);
        
        console.log(`Enhanced matchday ${matchday} started with ${matchdayFixtures.length} matches`);
    });
}

function handlePlayerDisconnection(playerName) {
    console.log(`Handling prolonged disconnection for ${playerName}`);
    
    for (const [matchId, game] of gameState.activeGames) {
        if (game.player1 === playerName || game.player2 === playerName) {
            game.endGame('disconnection');
            break;
        }
    }
    
    io.emit('player-disconnected', {
        playerName: playerName,
        reason: 'timeout'
    });
}

function getCurrentPlayerState(playerName) {
    const player = gameState.players.get(playerName);
    if (!player) return null;
    
    let currentMatch = null;
    for (const [matchId, game] of gameState.activeGames) {
        if (game.player1 === playerName || game.player2 === playerName) {
            currentMatch = {
                matchId: matchId,
                opponent: game.player1 === playerName ? game.player2 : game.player1,
                score: game.score,
                timeLeft: game.timeLeft,
                gameActive: game.gameActive,
                isTournamentMatch: game.isTournamentMatch,
                goldenGoalMode: game.goldenGoalMode
            };
            break;
        }
    }
    
    return {
        player: player,
        currentMatch: currentMatch,
        leagueStatus: {
            started: gameState.leagueStarted,
            finished: gameState.leagueFinished,
            gameMode: gameState.league?.gameMode || 'classic',
            currentMatchday: gameState.currentMatchday + 1,
            totalMatchdays: gameState.fixtures.length,
            eliminated: gameState.eliminatedPlayers.has(playerName),
            bracket: gameState.tournamentBracket ? gameState.tournamentBracket.getBracketStructure() : null
        }
    };
}

function updatePlayerStats(match) {
    const player1Score = match.finalScore[match.player1];
    const player2Score = match.finalScore[match.player2];
    
    const player1 = gameState.players.get(match.player1);
    const player2 = gameState.players.get(match.player2);
    
    if (!player1 || !player2) return;
    
    gameState.results.push({
        matchId: match.id,
        player1: match.player1,
        player2: match.player2,
        score: match.finalScore,
        matchday: match.matchday,
        duration: match.duration || GAME_CONFIG.MATCH_DURATION,
        maxRally: match.maxRally || 0,
        timestamp: Date.now()
    });
}

function checkMatchdayComplete() {
    const currentMatches = Array.from(gameState.matches.values())
        .filter(m => m.matchday === gameState.currentMatchday + 1);
    
    const allFinished = currentMatches.every(m => m.finished);
    
    if (allFinished) {
        updateLeagueTableEnhanced();
        
        io.emit('matchday-finished-enhanced', {
            matchday: gameState.currentMatchday + 1,
            results: currentMatches.map(m => ({
                player1: m.player1,
                player2: m.player2,
                score: m.finalScore,
                duration: m.duration,
                maxRally: m.maxRally
            })),
            leagueTable: gameState.leagueTable.slice(0, 5),
            progress: ((gameState.currentMatchday + 1) / gameState.fixtures.length) * 100,
            nextMatchday: gameState.currentMatchday + 2 <= gameState.fixtures.length ? 
                gameState.currentMatchday + 2 : null
        });
        
        gameState.currentMatchday++;
        
        const serverLoad = gameState.activeGames.size;
        const delay = Math.max(5000, serverLoad * 1000);
        
        setTimeout(() => {
            startNextMatchdayEnhanced();
        }, delay);
    }
}

function updateLeagueTableEnhanced() {
    const table = Array.from(gameState.players.values())
        .map(player => ({
            name: player.name,
            matches: player.matches,
            wins: player.wins,
            draws: player.draws,
            losses: player.losses,
            goalsFor: player.goalsFor,
            goalsAgainst: player.goalsAgainst,
            goalDifference: player.goalsFor - player.goalsAgainst,
            points: player.points,
            saves: player.saves,
            shots: player.shots,
            accuracy: (player.accuracy * 100).toFixed(1),
            averageGoalsPerMatch: player.averageGoalsPerMatch?.toFixed(2) || '0.00',
            formGuide: player.formGuide || [],
            totalPlayTime: player.totalPlayTime || 0,
            disconnected: player.disconnected || false,
            eliminated: player.eliminated || false,
            lastActivity: player.lastActivity || player.joinedAt
        }))
        .sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
            if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
            if (b.wins !== a.wins) return b.wins - a.wins;
            return a.name.localeCompare(b.name);
        });
    
    gameState.leagueTable = table;
}

function calculateBestPlayerEnhanced() {
    const players = Array.from(gameState.players.values())
        .filter(player => player.matches > 0);
    
    if (players.length === 0) return null;
    
    return players.map(player => {
        let score = 0;
        const matches = Math.max(player.matches, 1);
        
        score += (player.goalsFor / matches) * 2.5;
        score += (player.accuracy || 0) * 2.0;
        
        const winRate = player.wins / matches;
        score += winRate * 2.0;
        
        const avgGD = (player.goalsFor - player.goalsAgainst) / matches;
        score += Math.max(avgGD, 0) * 1.5;
        
        score += (player.saves / matches) * 1.0;
        
        const recentForm = player.formGuide?.slice(0, 3) || [];
        const formScore = recentForm.filter(result => result === 'W').length / Math.max(recentForm.length, 1);
        score += formScore * 1.0;
        
        return {
            ...player,
            bestPlayerScore: score.toFixed(3)
        };
    }).sort((a, b) => b.bestPlayerScore - a.bestPlayerScore)[0];
}

function calculateBestDefenseEnhanced() {
    const players = Array.from(gameState.players.values())
        .filter(player => player.matches > 0);
    
    if (players.length === 0) return null;
    
    return players.map(player => {
        let defenseScore = 0;
        const matches = Math.max(player.matches, 1);
        
        // Lower goals conceded is better
        const avgConceded = player.goalsAgainst / matches;
        defenseScore += Math.max(0, (5 - avgConceded)) * 3.0;
        
        // Saves are good
        defenseScore += (player.saves / matches) * 2.5;
        
        // Positive goal difference
        const avgGD = (player.goalsFor - player.goalsAgainst) / matches;
        defenseScore += Math.max(avgGD, 0) * 2.0;
        
        // Clean sheets (estimated from low goals conceded)
        const estimatedCleanSheets = Math.floor((matches - player.goalsAgainst) / 2);
        defenseScore += estimatedCleanSheets * 1.5;
        
        // Wins contribute to defense
        const winRate = player.wins / matches;
        defenseScore += winRate * 1.0;
        
        return {
            ...player,
            defenseScore: defenseScore.toFixed(3),
            avgConceded: avgConceded.toFixed(2),
            avgGD: avgGD.toFixed(2)
        };
    }).sort((a, b) => b.defenseScore - a.defenseScore)[0];
}



function endLeagueEnhanced() {
    gameState.leagueFinished = true;
    updateLeagueTableEnhanced();
    
    const winner = gameState.leagueTable[0];
    const bestGoalDifference = gameState.leagueTable.reduce((prev, curr) => 
        curr.goalDifference > prev.goalDifference ? curr : prev
    );
    const bestPlayer = calculateBestPlayerEnhanced();
    const topScorer = gameState.leagueTable.reduce((prev, curr) => 
        curr.goalsFor > prev.goalsFor ? curr : prev
    );
    
    const awards = {
        winner,
        bestGoalDifference,
        bestPlayer,
        topScorer,
        isTripleWinner: winner && bestPlayer && winner.name === bestGoalDifference.name && winner.name === bestPlayer.name,
        isQuadrupleWinner: winner && bestPlayer && topScorer && 
            winner.name === bestGoalDifference.name && 
            winner.name === bestPlayer.name && 
            winner.name === topScorer.name
    };
    
    io.emit('league-finished-enhanced', {
        leagueTable: gameState.leagueTable,
        awards,
        statistics: gameState.statistics,
        leagueSummary: {
            duration: Date.now() - gameState.serverStartTime,
            totalMatches: gameState.completedMatches,
            totalGoals: gameState.statistics.totalGoals,
            averageMatchDuration: gameState.statistics.averageMatchDuration,
            longestRally: gameState.statistics.longestRally,
            participantCount: gameState.players.size
        }
    });
    
    console.log('Enhanced league finished with comprehensive statistics!');
}

// Enhanced error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    
    // Log to file if possible
    const errorLog = `[${new Date().toISOString()}] Uncaught: ${error.stack}\n`;
    require('fs').appendFile('error.log', errorLog, () => {});
    
    // Try recovery instead of exit
    try {
        // Pause all games
        for (const [matchId, game] of gameState.activeGames.entries()) {
            try {
                game.gameActive = false;
                if (game.gameTimer) clearInterval(game.gameTimer);
                if (game.loopTimeout) clearTimeout(game.loopTimeout);
            } catch (e) {
                gameState.activeGames.delete(matchId);
            }
        }
        
        // Notify clients but don't exit
        io.emit('server-warning', { 
            message: 'Server recovered from error. Some games may be affected.',
            severity: 'warning'
        });
        
        console.log('Recovered from uncaught exception');
    } catch (recoveryError) {
        console.error('Recovery failed:', recoveryError);
        // Only exit if recovery fails
        setTimeout(() => process.exit(1), 5000);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
    // Log but don't exit
    const errorLog = `[${new Date().toISOString()}] Unhandled Rejection: ${reason}\n`;
    require('fs').appendFile('error.log', errorLog, () => {});
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server gracefully...');
    
    // Stop accepting new connections
    server.close(() => {
        console.log('Server closed to new connections');
    });
    
    // Clean up games
    for (const [matchId, game] of gameState.activeGames.entries()) {
        try {
            game.endGame('shutdown');
        } catch (e) {
            // Ignore errors during shutdown
        }
    }
    
    // Notify all clients
    io.emit('server-shutdown', {
        message: 'Server is shutting down for maintenance',
        timestamp: Date.now()
    });
    
    // Give time for cleanup
    setTimeout(() => {
        console.log('Shutdown complete');
        process.exit(0);
    }, 5000);
});

// Enhanced memory management and cleanup
setInterval(() => {
    try {
        const memUsage = process.memoryUsage();
        const heapUsedMB = memUsage.heapUsed / 1024 / 1024;
        
        if (heapUsedMB > 400) {
            console.log(`Memory usage: ${heapUsedMB.toFixed(2)}MB - Running cleanup`);
            
            // Clean up old match data
            if (gameState.results.length > 500) {
                gameState.results = gameState.results.slice(-250);
            }
            
            // Clean up old matches
            const now = Date.now();
            const oldMatchThreshold = 30 * 60 * 1000; // 30 minutes
            
            for (const [matchId, match] of gameState.matches.entries()) {
                if (match.finished && (now - match.createdAt) > oldMatchThreshold) {
                    gameState.matches.delete(matchId);
                }
            }
            
            // Clean up disconnected clients
            for (const [socketId, clientData] of connectedClients.entries()) {
                if ((now - clientData.lastActivity) > 5 * 60 * 1000) {
                    connectedClients.delete(socketId);
                }
            }
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
                console.log('Forced garbage collection');
            }
        }
        
        // Check and clean zombie games
        for (const [matchId, game] of gameState.activeGames.entries()) {
            const gameAge = Date.now() - game.matchStartTime;
            if (gameAge > 10 * 60 * 1000) { // 10 minutes
                console.warn(`Cleaning zombie game ${matchId}`);
                try {
                    game.endGame('timeout');
                } catch (e) {
                    // Force removal if endGame fails
                    gameState.activeGames.delete(matchId);
                }
            }
        }
    } catch (error) {
        console.error('Memory cleanup error:', error.message);
    }
}, 30000);

// Enhanced error handling
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    
    // Log to file if possible
    const errorLog = `[${new Date().toISOString()}] Uncaught: ${error.stack}\n`;
    require('fs').appendFile('error.log', errorLog, () => {});
    
    // Try recovery instead of exit
    try {
        // Pause all games
        for (const [matchId, game] of gameState.activeGames.entries()) {
            try {
                game.gameActive = false;
                if (game.gameTimer) clearInterval(game.gameTimer);
                if (game.loopTimeout) clearTimeout(game.loopTimeout);
            } catch (e) {
                gameState.activeGames.delete(matchId);
            }
        }
        
        // Notify clients but don't exit
        io.emit('server-warning', { 
            message: 'Server recovered from error. Some games may be affected.',
            severity: 'warning'
        });
        
        console.log('Recovered from uncaught exception');
    } catch (recoveryError) {
        console.error('Recovery failed:', recoveryError);
        // Only exit if recovery fails
        setTimeout(() => process.exit(1), 5000);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
    // Log but don't exit
    const errorLog = `[${new Date().toISOString()}] Unhandled Rejection: ${reason}\n`;
    require('fs').appendFile('error.log', errorLog, () => {});
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server gracefully...');
    
    // Stop accepting new connections
    server.close(() => {
        console.log('Server closed to new connections');
    });
    
    // Clean up games
    for (const [matchId, game] of gameState.activeGames.entries()) {
        try {
            game.endGame('shutdown');
        } catch (e) {
            // Ignore errors during shutdown
        }
    }
    
    // Notify all clients
    io.emit('server-shutdown', {
        message: 'Server is shutting down for maintenance',
        timestamp: Date.now()
    });
    
    // Give time for cleanup
    setTimeout(() => {
        console.log('Shutdown complete');
        process.exit(0);
    }, 5000);
});


server.listen(PORT, () => {
    console.log('\n' + '='.repeat(80));
    console.log('                    PONG LEAGUE 2.0 SERVER - STARTED');
    console.log('='.repeat(80));
    
    console.log('\n[SERVER INFO]');
    console.table({
        'Server Address': `http://${HOST_IP}:${PORT}`,
        'Version': '2.0',
        'Node Version': process.version,
        'Started At': new Date().toLocaleString(),
        'Environment': process.env.NODE_ENV || 'development'
    });

    console.log('\n[PRIMARY ENDPOINTS]');
    console.table([
        { Type: 'Web', Endpoint: '/', Description: 'Main player interface', URL: `http://${HOST_IP}:${PORT}/` },
        { Type: 'Admin', Endpoint: '/admin', Description: 'Admin control panel (host only)', URL: `http://${HOST_IP}:${PORT}/admin` },
        { Type: 'Health', Endpoint: '/health', Description: 'Server health monitor', URL: `http://${HOST_IP}:${PORT}/health` }
    ]);

    console.log('\n[API ENDPOINTS - STATS & DATA]');
    console.table([
        { Method: 'GET', Endpoint: '/api/stats', Description: 'Server statistics', URL: `http://${HOST_IP}:${PORT}/api/stats` },
        { Method: 'GET', Endpoint: '/api/stats/summary', Description: 'League summary with leaders', URL: `http://${HOST_IP}:${PORT}/api/stats/summary` },
        { Method: 'GET', Endpoint: '/api/leaderboard', Description: 'Full league table', URL: `http://${HOST_IP}:${PORT}/api/leaderboard` },
        { Method: 'GET', Endpoint: '/api/players', Description: 'List all players', URL: `http://${HOST_IP}:${PORT}/api/players` },
        { Method: 'GET', Endpoint: '/api/player/:name', Description: 'Individual player profile', URL: `http://${HOST_IP}:${PORT}/api/player/[name]` },
        { Method: 'GET', Endpoint: '/api/matchdays', Description: 'All matchdays (classic mode)', URL: `http://${HOST_IP}:${PORT}/api/matchdays` },
        { Method: 'GET', Endpoint: '/api/matchdays/:num', Description: 'Specific matchday details', URL: `http://${HOST_IP}:${PORT}/api/matchdays/[num]` }
    ]);

    console.log('\n[API ENDPOINTS - SYSTEM]');
    console.table([
        { Method: 'POST', Endpoint: '/api/auth', Description: 'Authentication endpoint', URL: `http://${HOST_IP}:${PORT}/api/auth` },
        { Method: 'GET', Endpoint: '/api/avatar/:name', Description: 'Player avatar generator', URL: `http://${HOST_IP}:${PORT}/api/avatar/[name]` }
    ]);

    console.log('\n[BROWSER ALIASES]');
    console.table([
        { Alias: '/leaderboard', Redirects: '/api/leaderboard', URL: `http://${HOST_IP}:${PORT}/leaderboard` },
        { Alias: '/player/:name', Redirects: '/api/player/:name', URL: `http://${HOST_IP}:${PORT}/player/[name]` }
    ]);

    console.log('\n[ENHANCED FEATURES]');
    console.table({
        'Game Modes': 'Classic League, Tournament (Single Elimination)',
        'Tournament Features': 'Fair Bye System, Golden Goal, Real-time Bracket',
        'Match Features': '3-min matches, Speed progression, Rally tracking',
        'Network': 'WebSocket (Socket.io), Auto-reconnection, Latency monitoring',
        'Performance': 'Adaptive FPS (60/45/30), Client interpolation',
        'Web Interface': 'JSON API + Styled HTML responses'
    });

    console.log('\n[SOCKET.IO EVENTS]');
    console.log('  Client Events: join-league, player-input-enhanced, ping, reconnect-player');
    console.log('  Server Events: game-state-update-enhanced, goal-scored-enhanced, match-finished-enhanced');
    console.log('  Admin Events: create-league, start-league, get-league-stats, start-commentary');

    console.log('\n[CONNECTION LIMITS]');
    console.table({
        'Max Connections/IP': MAX_CONNECTIONS_PER_IP + ' per minute',
        'Max Players': gameState.league?.maxPlayers || 'Not set (3-48)',
        'Admin Access': 'Localhost only',
        'Ping Timeout': '60 seconds',
        'Ping Interval': '25 seconds'
    });

    console.log('\n' + '='.repeat(80));
    console.log('  Ready to accept connections. Press Ctrl+C to stop server.');
    console.log('='.repeat(80) + '\n');
});