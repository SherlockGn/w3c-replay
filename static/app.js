const { createApp, ref, computed, onMounted, onUnmounted, watch } = Vue

createApp({
    setup() {
        // Reactive state
        const currentPath = ref('')
        const currentItems = ref([])
        const searchTerm = ref('')
        const loading = ref(false)
        const error = ref('')
        const showModal = ref(false)
        const selectedFile = ref(null)
        const isClosing = ref(false)
        const analysisData = ref(null)
        const analyzing = ref(false)
        const converting = ref(false)
        const conversionReport = ref(null)
        const showConversionReport = ref(false)
        const dashboardStats = ref(null)
        const loadingDashboard = ref(false)
        const selectedAction = ref('Right click')

        // Computed properties
        const breadcrumbParts = computed(() => {
            return currentPath.value ? currentPath.value.split('/').filter(part => part) : []
        })

        const filteredItems = computed(() => {
            if (!searchTerm.value) return currentItems.value
            
            const term = searchTerm.value.toLowerCase()
            return currentItems.value.filter(item =>
                item.name.toLowerCase().includes(term) ||
                item.path.toLowerCase().includes(term)
            )
        })

        const activePlayers = computed(() => {
            if (!analysisData.value || !analysisData.value.teams) return []
            
            const players = []
            
            // Process each team in the teams array
            analysisData.value.teams.forEach(team => {
                if (team !== null && typeof team === 'object') {
                    // Each team object contains player objects with player IDs as keys
                    Object.values(team).forEach(player => {
                        if (player && player.actions > 0) {
                            players.push(player)
                        }
                    })
                }
            })
            
            return players
        })

        const availableActions = computed(() => {
            if (!analysisData.value || !activePlayers.value.length) return ['Right click', 'Select / deselect', 'APM', 'Total Actions']
            
            // Get all unique action types from all players
            const actions = new Set()
            activePlayers.value.forEach(player => {
                console.log('Player data:', player) // Debug log
                if (player.actions_details) {
                    Object.keys(player.actions_details).forEach(action => {
                        actions.add(action)
                    })
                }
                // Always add these basic metrics
                actions.add('Total Actions')
                actions.add('APM')
            })
            
            console.log('Available actions:', Array.from(actions)) // Debug log
            return Array.from(actions).sort()
        })

        // Watch for data changes to update selectedAction
        watch(availableActions, (newActions) => {
            if (newActions.length > 0 && !newActions.includes(selectedAction.value)) {
                selectedAction.value = newActions[0]
            }
        })

        // Methods
        const loadDirectory = async (path = '') => {
            loading.value = true
            error.value = ''
            
            try {
                const response = await fetch(
                    `/api/browse?path=${encodeURIComponent(path)}`
                )
                const data = await response.json()

                if (response.ok) {
                    currentPath.value = data.currentPath
                    currentItems.value = data.items
                } else {
                    error.value = data.error || 'Failed to load directory'
                }
            } catch (err) {
                error.value = 'Network error: ' + err.message
            } finally {
                loading.value = false
            }
        }

        const formatFileSize = (bytes) => {
            if (bytes === 0) return '0 Bytes'
            const k = 1024
            const sizes = ['Bytes', 'KB', 'MB', 'GB']
            const i = Math.floor(Math.log(bytes) / Math.log(k))
            return (
                parseFloat((bytes / Math.pow(k, i)).toFixed(2)) +
                ' ' +
                sizes[i]
            )
        }

        const formatDate = (dateString) => {
            return new Date(dateString).toLocaleDateString()
        }

        const downloadFile = (filePath) => {
            window.open(
                `/api/download?path=${encodeURIComponent(filePath)}`,
                '_blank'
            )
        }

        const handleItemClick = (item) => {
            if (item.type === 'folder') {
                loadDirectory(item.path)
            } else {
                // Directly select file, close modal, and analyze
                selectedFile.value = item
                closeModal()
                analyzeFile()
            }
        }

        const selectFile = (file) => {
            selectedFile.value = file
            closeModal()
            analyzeFile()
        }

        const closeModal = () => {
            isClosing.value = true
            document.body.classList.remove('modal-open')
            setTimeout(() => {
                showModal.value = false
                isClosing.value = false
            }, 200) // Match animation duration
        }

        const openModal = () => {
            showModal.value = true
            isClosing.value = false
            document.body.classList.add('modal-open')
        }

        const analyzeFile = async () => {
            if (!selectedFile.value) return
            
            analyzing.value = true
            try {
                // Simulate API call to analyze the file
                const response = await fetch(
                    `/api/analyze?path=${encodeURIComponent(selectedFile.value.path)}`
                )
                
                if (response.ok) {
                    const data = await response.json()
                    analysisData.value = data
                } else {
                    // For demo purposes, load example data
                    const exampleResponse = await fetch('/example.json')
                    analysisData.value = await exampleResponse.json()
                }
            } catch (err) {
                console.error('Analysis failed:', err)
                // Load example data as fallback
                try {
                    const exampleResponse = await fetch('/example.json')
                    analysisData.value = await exampleResponse.json()
                } catch (fallbackErr) {
                    console.error('Failed to load example data:', fallbackErr)
                }
            } finally {
                analyzing.value = false
            }
        }

        const selectNewFile = () => {
            selectedFile.value = null
            analysisData.value = null
            openModal()
        }

        const exportAnalysis = () => {
            if (!analysisData.value) return
            
            const dataStr = JSON.stringify(analysisData.value, null, 2)
            const dataBlob = new Blob([dataStr], { type: 'application/json' })
            const url = URL.createObjectURL(dataBlob)
            const link = document.createElement('a')
            link.href = url
            link.download = `${selectedFile.value.name}_analysis.json`
            link.click()
            URL.revokeObjectURL(url)
        }

        const convertAllFiles = async () => {
            converting.value = true
            
            try {
                const response = await fetch(`/api/convert?path=${encodeURIComponent(currentPath.value)}`, {
                    method: 'POST'
                })
                
                if (response.ok) {
                    const result = await response.json()
                    
                    // Set conversion report data
                    conversionReport.value = {
                        success: true,
                        totalFiles: result.result.totalFiles,
                        convertedFiles: result.result.convertedFiles,
                        skippedFiles: result.result.skippedFiles,
                        errorFiles: result.result.errorFiles,
                        message: result.message
                    }
                    
                    // Show the report modal
                    showConversionReport.value = true
                    document.body.classList.add('modal-open')
                    
                    // Refresh the current directory to update file status
                    if (showModal.value) {
                        await loadDirectory(currentPath.value)
                    }
                } else {
                    const errorData = await response.json()
                    
                    // Set error report data
                    conversionReport.value = {
                        success: false,
                        error: errorData.error || 'Conversion failed'
                    }
                    
                    showConversionReport.value = true
                    document.body.classList.add('modal-open')
                }
            } catch (err) {
                console.error('Conversion failed:', err)
                
                // Set error report data
                conversionReport.value = {
                    success: false,
                    error: err.message
                }
                
                showConversionReport.value = true
                document.body.classList.add('modal-open')
            } finally {
                converting.value = false
            }
        }

        const closeConversionReport = () => {
            showConversionReport.value = false
            conversionReport.value = null
            document.body.classList.remove('modal-open')
        }

        const loadDashboard = async () => {
            loadingDashboard.value = true
            
            try {
                const response = await fetch('/api/dashboard')
                
                if (response.ok) {
                    const data = await response.json()
                    dashboardStats.value = data
                } else {
                    console.error('Failed to load dashboard stats')
                    dashboardStats.value = null
                }
            } catch (err) {
                console.error('Dashboard loading failed:', err)
                dashboardStats.value = null
            } finally {
                loadingDashboard.value = false
            }
        }

        // Dashboard utility functions
        const getPlayerRankings = () => {
            if (!dashboardStats.value || !dashboardStats.value.playerStats) return []
            
            return Object.entries(dashboardStats.value.playerStats)
                .map(([name, stats]) => {
                    const totalGames = stats.wins + stats.losses
                    const winRate = totalGames > 0 ? ((stats.wins / totalGames) * 100).toFixed(1) : 0
                    
                    return {
                        name,
                        wins: stats.wins,
                        losses: stats.losses,
                        totalGames,
                        winRate: parseFloat(winRate)
                    }
                })
                .sort((a, b) => {
                    // Sort by win rate first, then by total wins
                    if (b.winRate !== a.winRate) {
                        return b.winRate - a.winRate
                    }
                    return b.wins - a.wins
                })
        }

        const getPlayerRaceStats = (playerName) => {
            if (!dashboardStats.value || !dashboardStats.value.playerStats[playerName]) return []
            
            return Object.entries(dashboardStats.value.playerStats[playerName].races)
                .map(([race, stats]) => {
                    const totalGames = stats.wins + stats.losses
                    const winRate = totalGames > 0 ? ((stats.wins / totalGames) * 100).toFixed(1) : 0
                    
                    return {
                        race,
                        wins: stats.wins,
                        losses: stats.losses,
                        games: totalGames,
                        winRate: parseFloat(winRate)
                    }
                })
                .sort((a, b) => b.games - a.games)
        }

        const getPlayerHeroStats = (playerName, race = null) => {
            if (!dashboardStats.value || !dashboardStats.value.playerStats[playerName]) return []
            
            const playerStats = dashboardStats.value.playerStats[playerName]
            
            // If a specific race is requested
            if (race && playerStats.heroes[race]) {
                const raceHeroes = playerStats.heroes[race]
                const heroEntries = Object.entries(raceHeroes)
                    .map(([heroName, count]) => ({
                        heroName,
                        games: count,
                        wins: 0, // We don't track hero-specific wins in the new structure
                        winRate: 0, // We don't track hero-specific wins in the new structure
                        percentage: 0 // Will be calculated below
                    }))
                    .sort((a, b) => b.games - a.games)
                
                // Calculate percentages
                const totalGames = heroEntries.reduce((sum, hero) => sum + hero.games, 0)
                return heroEntries.map(hero => ({
                    ...hero,
                    percentage: totalGames > 0 ? ((hero.games / totalGames) * 100).toFixed(1) : 0
                }))
            }
            
            // If no specific race, aggregate all heroes across all races
            const allHeroes = {}
            Object.values(playerStats.heroes).forEach(raceHeroes => {
                Object.entries(raceHeroes).forEach(([heroName, count]) => {
                    if (!allHeroes[heroName]) {
                        allHeroes[heroName] = 0
                    }
                    allHeroes[heroName] += count
                })
            })
            
            const heroEntries = Object.entries(allHeroes)
                .map(([heroName, count]) => ({
                    heroName,
                    games: count,
                    wins: 0, // We don't track hero-specific wins in the new structure
                    winRate: 0, // We don't track hero-specific wins in the new structure
                    percentage: 0 // Will be calculated below
                }))
                .sort((a, b) => b.games - a.games)
            
            // Calculate percentages
            const totalGames = heroEntries.reduce((sum, hero) => sum + hero.games, 0)
            return heroEntries.map(hero => ({
                ...hero,
                percentage: totalGames > 0 ? ((hero.games / totalGames) * 100).toFixed(1) : 0
            }))
        }

        // Utility functions
        const getMapName = (mapPath) => {
            if (!mapPath) return 'Unknown'
            return mapPath.split('\\').pop().replace('.w3x', '')
        }

        const formatGameTime = (milliseconds) => {
            if (!milliseconds) return '0:00'
            const seconds = Math.floor(milliseconds / 1000)
            const minutes = Math.floor(seconds / 60)
            const remainingSeconds = seconds % 60
            return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`
        }

        const getPlayerColor = (colorName) => {
            const colors = {
                red: '#ff0000',
                blue: '#0080ff',
                green: '#00ff00',
                cyan: '#00ffff',
                purple: '#8000ff',
                yellow: '#ffff00',
                orange: '#ff8000',
                pink: '#ff80ff',
                gray: '#808080',
                light_blue: '#80c0ff',
                dark_green: '#008000',
                brown: '#804000',
                maroon: '#800000',
                observer: '#666666'
            }
            return colors[colorName] || colorName
        }

        const getTeamName = (teamId) => {
            if (teamId === 12) return 'Observer'
            return `Team ${teamId + 1}`
        }

        const getWinnerTeamName = (winnerTeamId) => {
            if (!analysisData.value || !analysisData.value.teams || winnerTeamId === null || winnerTeamId === undefined) {
                return 'Unknown'
            }
            
            // Find any player from the winning team to verify the team exists
            let teamExists = false
            analysisData.value.teams.forEach(team => {
                if (team !== null && typeof team === 'object') {
                    Object.values(team).forEach(player => {
                        if (player && player.team === winnerTeamId) {
                            teamExists = true
                        }
                    })
                }
            })
            
            if (teamExists) {
                return getTeamName(winnerTeamId)
            }
            
            return 'Unknown'
        }

        const getWinners = () => {
            if (!analysisData.value || !analysisData.value.teams || analysisData.value.game.winner_team === null || analysisData.value.game.winner_team === undefined) {
                return []
            }
            
            const winnerTeamId = analysisData.value.game.winner_team
            const winners = []
            
            // Find all players on the winning team
            analysisData.value.teams.forEach(team => {
                if (team !== null && typeof team === 'object') {
                    Object.values(team).forEach(player => {
                        if (player && player.team === winnerTeamId && player.actions > 0) {
                            winners.push({
                                player_id: player.player_id,
                                name: player.name,
                                color: player.color
                            })
                        }
                    })
                }
            })
            
            return winners
        }

        // Data filtering and processing functions
        const getFilteredUnits = (units) => {
            if (!units) return {}
            const filtered = { ...units }
            delete filtered.order
            return filtered
        }

        const getTotalUnits = (units) => {
            if (!units) return 0
            const filtered = getFilteredUnits(units)
            return Object.values(filtered).reduce((total, count) => total + (typeof count === 'number' ? count : 0), 0)
        }

        const getFilteredHeroes = (heroes) => {
            if (!heroes) return []
            const heroList = []
            Object.entries(heroes).forEach(([name, data]) => {
                if (name !== 'order' && data && typeof data === 'object') {
                    heroList.push({
                        name,
                        level: data.level || 1,
                        revivals: data.revivals || 0,
                        retraining_time: data.retraining_time || 0,
                        abilities: data.abilities || {}
                    })
                }
            })
            return heroList
        }

        const getAbilityCount = (abilities) => {
            if (!abilities || !abilities['0']) return 0
            return Object.keys(abilities['0']).length
        }

        const getHeroAbilities = (abilities) => {
            if (!abilities || !abilities['0']) return []
            
            const abilityList = []
            Object.entries(abilities['0']).forEach(([name, level]) => {
                abilityList.push({
                    name,
                    level
                })
            })
            
            return abilityList.sort((a, b) => b.level - a.level) // Sort by level descending
        }

        const getFilteredBuildings = (buildings) => {
            if (!buildings) return {}
            const filtered = { ...buildings }
            delete filtered.order
            return filtered
        }

        const getTotalBuildings = (buildings) => {
            if (!buildings) return 0
            const filtered = getFilteredBuildings(buildings)
            return Object.values(filtered).reduce((total, count) => total + (typeof count === 'number' ? count : 0), 0)
        }

        const getFilteredItems = (items) => {
            if (!items) return {}
            const filtered = { ...items }
            delete filtered.order
            return Object.keys(filtered).length > 0 ? filtered : {}
        }

        const getTotalItems = (items) => {
            if (!items) return 0
            const filtered = getFilteredItems(items)
            return Object.values(filtered).reduce((total, count) => total + (typeof count === 'number' ? count : 0), 0)
        }

        // Chart utility functions
        const getActionValue = (player, actionName) => {
            console.log('Getting action value for:', actionName, 'from player:', player) // Debug log
            
            if (player.actions_details && player.actions_details[actionName]) {
                return player.actions_details[actionName]
            }
            
            // Fallback for common metrics
            switch(actionName) {
                case 'Total Actions':
                    return player.actions || 0
                case 'APM':
                    return Math.round(player.apm || 0)
                case 'Right click':
                    return player.actions_details?.['Right click'] || 0
                default:
                    return 0
            }
        }

        const getBarHeight = (player, actionName) => {
            if (!analysisData.value || !activePlayers.value.length) return 0
            
            const value = getActionValue(player, actionName)
            const maxValue = Math.max(...activePlayers.value.map(p => getActionValue(p, actionName)))
            
            if (maxValue === 0) return 0
            return (value / maxValue) * 100
        }

        const updateChart = () => {
            // This function is called when the user changes the selected action
            // The chart will automatically update due to reactive data
        }

        const getTopActions = (actionDetails, limit = 6) => {
            if (!actionDetails) return {}
            
            // Sort actions by count and take top ones
            const sortedActions = Object.entries(actionDetails)
                .sort(([,a], [,b]) => b - a)
                .slice(0, limit)
                .reduce((obj, [key, value]) => {
                    obj[key] = value
                    return obj
                }, {})
            
            return sortedActions
        }

        const getBreadcrumbPath = (index) => {
            return breadcrumbParts.value.slice(0, index + 1).join('/')
        }

        const filterItems = () => {
            // This is handled by the computed property now
            // but we keep this method for consistency with the template
        }

        // Handle ESC key to close modal
        const handleKeydown = (event) => {
            if (event.key === 'Escape' && showModal.value && !isClosing.value) {
                closeModal()
            }
        }

        // Lifecycle
        onMounted(() => {
            loadDirectory()
            loadDashboard()
            document.addEventListener('keydown', handleKeydown)
        })

        // Cleanup
        onUnmounted(() => {
            document.removeEventListener('keydown', handleKeydown)
            document.body.classList.remove('modal-open')
        })

        // Return reactive data and methods for template
        return {
            currentPath,
            currentItems,
            searchTerm,
            loading,
            error,
            showModal,
            selectedFile,
            isClosing,
            analysisData,
            analyzing,
            converting,
            conversionReport,
            showConversionReport,
            dashboardStats,
            loadingDashboard,
            selectedAction,
            breadcrumbParts,
            filteredItems,
            activePlayers,
            availableActions,
            loadDirectory,
            formatFileSize,
            formatDate,
            downloadFile,
            handleItemClick,
            selectFile,
            closeModal,
            openModal,
            analyzeFile,
            selectNewFile,
            exportAnalysis,
            convertAllFiles,
            closeConversionReport,
            loadDashboard,
            getPlayerRankings,
            getPlayerRaceStats,
            getPlayerHeroStats,
            getMapName,
            formatGameTime,
            getPlayerColor,
            getTeamName,
            getWinnerTeamName,
            getWinners,
            getFilteredUnits,
            getTotalUnits,
            getFilteredHeroes,
            getAbilityCount,
            getHeroAbilities,
            getFilteredBuildings,
            getTotalBuildings,
            getFilteredItems,
            getTotalItems,
            getTopActions,
            getBreadcrumbPath,
            filterItems,
            getActionValue,
            getBarHeight,
            updateChart
        }
    }
}).mount('#app')
