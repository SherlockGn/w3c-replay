const express = require('express')
const fs = require('fs')
const path = require('path')
const W3GReplay = require('w3g')

const app = express()
const PORT = 3000

// Player Name Mapper - Edit this object to map different names to the same player
// This affects dashboard statistics and file previews by grouping name variations
// Example: If a player uses "playa", "playAB", and "PlayerA", you can map the first two to "PlayerA"
const PLAYER_NAME_MAPPER = {
    'NekoChan': 'Neko'
}

// Function to normalize player names using the mapper
function normalizePlayerName(playerName) {
    if (!playerName) return playerName
    
    // Convert to lowercase for case-insensitive matching
    const lowerName = playerName.toLowerCase()
    
    // Check if there's a mapping for this name
    for (const [variation, mainName] of Object.entries(PLAYER_NAME_MAPPER)) {
        if (variation.toLowerCase() === lowerName) {
            return mainName
        }
    }
    
    // If no mapping found, return original name
    return playerName
}

// Serve static files
app.use(express.static('static'))

// Function to convert W3G file to JSON
function convertW3GToJSON(w3gFilePath) {
    const jsonFilePath = w3gFilePath.replace(/\.w3g$/i, '.w3g_analysis.json')
    
    try {
        // Check if JSON file already exists and is newer than W3G file
        if (fs.existsSync(jsonFilePath)) {
            const w3gStat = fs.statSync(w3gFilePath)
            const jsonStat = fs.statSync(jsonFilePath)
            
            if (jsonStat.mtime >= w3gStat.mtime) {
                console.log(`Skipping ${path.basename(w3gFilePath)} - JSON file is up to date`)
                return true
            }
        }
        
        console.log(`Converting ${path.basename(w3gFilePath)} to JSON...`)
        const replayData = new W3GReplay(w3gFilePath)
        fs.writeFileSync(jsonFilePath, JSON.stringify(replayData, null, 2))
        console.log(`✓ Converted ${path.basename(w3gFilePath)}`)
        return true
    } catch (error) {
        console.error(`✗ Failed to convert ${path.basename(w3gFilePath)}:`, error.message)
        return false
    }
}

// Function to convert all W3G files in a directory to JSON
function convertAllW3GInDirectory(dir) {
    let totalFiles = 0
    let convertedFiles = 0
    let skippedFiles = 0
    let errorFiles = 0
    
    function processDirectory(currentDir) {
        try {
            const items = fs.readdirSync(currentDir)
            
            for (const item of items) {
                const fullPath = path.join(currentDir, item)
                const stat = fs.statSync(fullPath)
                
                if (stat.isDirectory()) {
                    processDirectory(fullPath)
                } else if (item.toLowerCase().endsWith('.w3g')) {
                    totalFiles++
                    const jsonPath = fullPath.replace(/\.w3g$/i, '.w3g_analysis.json')
                    
                    if (fs.existsSync(jsonPath)) {
                        const w3gStat = fs.statSync(fullPath)
                        const jsonStat = fs.statSync(jsonPath)
                        
                        if (jsonStat.mtime >= w3gStat.mtime) {
                            skippedFiles++
                            continue
                        }
                    }
                    
                    if (convertW3GToJSON(fullPath)) {
                        convertedFiles++
                    } else {
                        errorFiles++
                    }
                }
            }
        } catch (error) {
            console.error(`Error processing directory ${currentDir}:`, error.message)
        }
    }
    
    console.log('🔄 Starting W3G to JSON conversion...')
    processDirectory(dir)
    console.log(`📊 Conversion complete: ${totalFiles} total, ${convertedFiles} converted, ${skippedFiles} skipped, ${errorFiles} errors`)
    
    return { totalFiles, convertedFiles, skippedFiles, errorFiles }
}

// Function to get preview data from JSON file
function getPreviewData(jsonPath) {
    try {
        if (!fs.existsSync(jsonPath)) return null
        
        const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
        
        // Extract preview information
        const preview = {
            players: [],
            winners: [],
            gameInfo: {}
        }
        
        // Extract game info
        if (jsonData.game) {
            preview.gameInfo = {
                playerCount: jsonData.game.player_count,
                map: jsonData.game.map ? jsonData.game.map.split('\\').pop().replace('.w3x', '') : 'Unknown',
                duration: jsonData.header ? jsonData.header.length : 0,
                winnerTeam: jsonData.game.winner_team
            }
        }
        
        // Extract player information
        if (jsonData.teams && Array.isArray(jsonData.teams)) {
            jsonData.teams.forEach(team => {
                if (team !== null && typeof team === 'object') {
                    Object.values(team).forEach(player => {
                        if (player && player.actions > 0) {
                            const originalName = player.name
                            const normalizedName = normalizePlayerName(originalName)
                            
                            preview.players.push({
                                name: originalName,
                                normalizedName: normalizedName !== originalName ? normalizedName : null,
                                race: player.race,
                                raceDetected: player.race_detected,
                                color: player.color,
                                team: player.team,
                                apm: Math.round(player.apm || 0)
                            })
                            
                            // Check if this player is a winner
                            if (player.team === jsonData.game.winner_team) {
                                preview.winners.push({
                                    name: originalName,
                                    normalizedName: normalizedName !== originalName ? normalizedName : null,
                                    color: player.color
                                })
                            }
                        }
                    })
                }
            })
        }
        
        return preview
    } catch (error) {
        console.error(`Error reading preview from ${jsonPath}:`, error.message)
        return null
    }
}
// Function to get contents of a specific directory
function getDirectoryContents(dir, basePath = '') {
    const items = []

    try {
        const dirItems = fs.readdirSync(dir)

        for (const item of dirItems) {
            const fullPath = path.join(dir, item)
            const relativePath = path.join(basePath, item)
            const stat = fs.statSync(fullPath)

            if (stat.isDirectory()) {
                items.push({
                    name: item,
                    path: relativePath.replace(/\\/g, '/'),
                    type: 'folder',
                    size: null,
                    modified: stat.mtime
                })
            } else if (item.toLowerCase().endsWith('.w3g')) {
                const jsonPath = fullPath.replace(/\.w3g$/i, '.w3g_analysis.json')
                const hasJsonFile = fs.existsSync(jsonPath)
                const preview = hasJsonFile ? getPreviewData(jsonPath) : null
                
                items.push({
                    name: item,
                    path: relativePath.replace(/\\/g, '/'),
                    type: 'file',
                    size: stat.size,
                    modified: stat.mtime,
                    hasAnalysis: hasJsonFile,
                    preview: preview
                })
            }
        }
    } catch (error) {
        console.error(`Error reading directory ${dir}:`, error.message)
        throw error
    }

    return items
}

// API endpoint to browse folders and files
app.get('/api/browse', (req, res) => {
    const requestedPath = req.query.path || ''
    const targetDir = path.join(__dirname, 'replay', requestedPath)

    // Security check to ensure the path is within the replay directory
    if (!targetDir.startsWith(path.join(__dirname, 'replay'))) {
        return res.status(403).json({ error: 'Access denied' })
    }

    if (!fs.existsSync(targetDir)) {
        return res.status(404).json({ error: 'Directory not found' })
    }

    const stat = fs.statSync(targetDir)
    if (!stat.isDirectory()) {
        return res.status(400).json({ error: 'Path is not a directory' })
    }

    try {
        const items = getDirectoryContents(targetDir, requestedPath)

        // Add parent directory navigation (except for root)
        const response = {
            currentPath: requestedPath,
            items: items
        }

        if (requestedPath !== '') {
            const parentPath = path.dirname(requestedPath)
            response.parentPath =
                parentPath === '.' ? '' : parentPath.replace(/\\/g, '/')
        }

        res.json(response)
    } catch (error) {
        res.status(500).json({
            error: 'Failed to read directory: ' + error.message
        })
    }
})

// API endpoint to serve a specific .w3g file
app.get('/api/download', (req, res) => {
    const requestedPath = req.query.path

    if (!requestedPath) {
        return res.status(400).json({ error: 'Path parameter is required' })
    }

    const filePath = path.join(__dirname, 'replay', requestedPath)

    // Security check to ensure the file is within the replay directory
    if (!filePath.startsWith(path.join(__dirname, 'replay'))) {
        return res.status(403).json({ error: 'Access denied' })
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' })
    }

    res.download(filePath)
})

// API endpoint to analyze a .w3g file
app.get('/api/analyze', (req, res) => {
    const requestedPath = req.query.path

    if (!requestedPath) {
        return res.status(400).json({ error: 'Path parameter is required' })
    }

    const filePath = path.join(__dirname, 'replay', requestedPath)
    const jsonFilePath = filePath.replace(/\.w3g$/i, '.w3g_analysis.json')

    // Security check to ensure the file is within the replay directory
    if (!filePath.startsWith(path.join(__dirname, 'replay'))) {
        return res.status(403).json({ error: 'Access denied' })
    }

    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File not found' })
    }

    try {
        // Try to read from JSON file first
        if (fs.existsSync(jsonFilePath)) {
            const w3gStat = fs.statSync(filePath)
            const jsonStat = fs.statSync(jsonFilePath)
            
            // If JSON is newer than W3G, use JSON file
            if (jsonStat.mtime >= w3gStat.mtime) {
                console.log(`Reading analysis from JSON file: ${path.basename(jsonFilePath)}`)
                const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'))
                return res.json(jsonData)
            }
        }
        
        // If no JSON file or it's outdated, convert W3G file
        console.log(`Converting W3G file: ${path.basename(filePath)}`)
        const replayData = new W3GReplay(filePath)
        
        // Save JSON file for future use
        try {
            fs.writeFileSync(jsonFilePath, JSON.stringify(replayData, null, 2))
            console.log(`Saved analysis to: ${path.basename(jsonFilePath)}`)
        } catch (saveError) {
            console.warn(`Failed to save JSON file: ${saveError.message}`)
        }
        
        res.json(replayData)
    } catch (error) {
        console.error('Error parsing W3G file:', error)
        res.status(500).json({
            error: 'Failed to parse W3G file',
            details: error.message
        })
    }
})

// API endpoint to trigger conversion of all W3G files
app.post('/api/convert', (req, res) => {
    const requestedPath = req.query.path || ''
    const targetDir = path.join(__dirname, 'replay', requestedPath)

    // Security check to ensure the path is within the replay directory
    if (!targetDir.startsWith(path.join(__dirname, 'replay'))) {
        return res.status(403).json({ error: 'Access denied' })
    }

    if (!fs.existsSync(targetDir)) {
        return res.status(404).json({ error: 'Directory not found' })
    }

    try {
        const result = convertAllW3GInDirectory(targetDir)
        res.json({
            message: 'Conversion process completed',
            result: result
        })
    } catch (error) {
        console.error('Error during conversion:', error)
        res.status(500).json({
            error: 'Failed to convert files',
            details: error.message
        })
    }
})

// API endpoint to get dashboard statistics
app.get('/api/dashboard', (req, res) => {
    try {
        const replayDir = path.join(__dirname, 'replay')
        const stats = generateDashboardStats(replayDir)
        res.json(stats)
    } catch (error) {
        console.error('Error generating dashboard stats:', error)
        res.status(500).json({
            error: 'Failed to generate dashboard statistics',
            details: error.message
        })
    }
})

// Function to generate dashboard statistics
function generateDashboardStats(dir) {
    const stats = {
        totalGames: 0,
        playerStats: {}
    }
    
    function processDirectory(currentDir) {
        try {
            const items = fs.readdirSync(currentDir)
            
            for (const item of items) {
                const fullPath = path.join(currentDir, item)
                const stat = fs.statSync(fullPath)
                
                if (stat.isDirectory()) {
                    processDirectory(fullPath)
                } else if (item.toLowerCase().endsWith('.w3g_analysis.json')) {
                    try {
                        const jsonData = JSON.parse(fs.readFileSync(fullPath, 'utf8'))
                        processGameData(jsonData, stats)
                        stats.totalGames++
                    } catch (parseError) {
                        console.warn(`Failed to parse ${fullPath}:`, parseError.message)
                    }
                }
            }
        } catch (error) {
            console.error(`Error processing directory ${currentDir}:`, error.message)
        }
    }
    
    processDirectory(dir)
    
    return stats
}

function processGameData(gameData, stats) {
    if (!gameData.teams || !Array.isArray(gameData.teams)) return
    
    const winnerTeam = gameData.game.winner_team
    
    gameData.teams.forEach(team => {
        if (team !== null && typeof team === 'object') {
            Object.values(team).forEach(player => {
                if (player && player.actions > 0) {
                    const originalPlayerName = player.name
                    const playerName = normalizePlayerName(originalPlayerName)  // Use normalized name
                    const isWinner = player.team === winnerTeam
                    const race = player.race_detected || player.race
                    
                    // Initialize player stats with minimal structure
                    if (!stats.playerStats[playerName]) {
                        stats.playerStats[playerName] = {
                            wins: 0,
                            losses: 0,
                            races: {},
                            heroes: {}
                        }
                    }
                    
                    const playerStat = stats.playerStats[playerName]
                    
                    if (isWinner) {
                        playerStat.wins++
                    } else {
                        playerStat.losses++
                    }
                    
                    // Race statistics - only wins and losses
                    if (!playerStat.races[race]) {
                        playerStat.races[race] = {
                            wins: 0,
                            losses: 0
                        }
                    }
                    
                    if (isWinner) {
                        playerStat.races[race].wins++
                    } else {
                        playerStat.races[race].losses++
                    }
                    
                    // Hero statistics - organized by race
                    if (player.heroes) {
                        // Initialize heroes object for this race if it doesn't exist
                        if (!playerStat.heroes[race]) {
                            playerStat.heroes[race] = {}
                        }
                        
                        Object.keys(player.heroes).forEach(heroName => {
                            if (heroName !== 'order') {
                                // Count hero usage for this specific race
                                if (!playerStat.heroes[race][heroName]) {
                                    playerStat.heroes[race][heroName] = 0
                                }
                                playerStat.heroes[race][heroName]++
                            }
                        })
                    }
                }
            })
        }
    })
}

// Start the server
app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`)
    console.log('Browse and select .w3g files from the replay folder')
    
    // Convert all W3G files to JSON on startup
    const replayDir = path.join(__dirname, 'replay')
    if (fs.existsSync(replayDir)) {
        console.log('Converting existing W3G files to JSON...')
        convertAllW3GInDirectory(replayDir)
    } else {
        console.log('Replay directory not found, creating it...')
        fs.mkdirSync(replayDir, { recursive: true })
    }
})
