import { v4 as uuidv4 } from 'uuid'

// In-memory storage for rooms
const rooms = new Map()

// Helper function to generate unique random numbers
function generateUniqueNumbers(count) {
  const numbers = []
  const available = Array.from({ length: 100 }, (_, i) => i + 1)
  
  for (let i = 0; i < count && available.length > 0; i++) {
    const randomIndex = Math.floor(Math.random() * available.length)
    numbers.push(available[randomIndex])
    available.splice(randomIndex, 1)
  }
  
  return numbers
}

// Helper function to get room data
function getRoomData(roomId) {
  return rooms.get(roomId)
}

// Helper function to create room
function createRoom(roomId, masterSocketId, masterName, theme) {
  const room = {
    id: roomId,
    master: masterSocketId,
    theme: theme,
    players: new Map(),
    cards: new Map(),
    gameStarted: false,
  }
  
  room.players.set(masterSocketId, {
    id: masterSocketId,
    name: masterName,
    isMaster: true,
  })
  
  rooms.set(roomId, room)
  return room
}

// Helper function to get players array
function getPlayersArray(room) {
  return Array.from(room.players.values())
}

export function gameHandlers(io, socket) {
  // Create room
  socket.on('create_room', ({ playerName, theme }) => {
    try {
      if (!playerName || playerName.trim() === '') {
        socket.emit('error', { message: 'Player name is required' })
        return
      }

      if (!theme || theme.trim() === '') {
        socket.emit('error', { message: 'Theme is required' })
        return
      }

      const roomId = uuidv4().substring(0, 8)
      const room = createRoom(roomId, socket.id, playerName.trim(), theme.trim())
      
      socket.join(roomId)
      socket.data.roomId = roomId
      socket.data.playerName = playerName.trim()
      
      socket.emit('room_created', { roomId, theme: room.theme })
      socket.emit('room_joined', {
        roomId,
        theme: room.theme,
        isMaster: true,
        players: getPlayersArray(room),
      })
      
      console.log(`🎮 Room created: ${roomId} by ${playerName} - Theme: ${theme}`)
      console.log(`📊 Room ${roomId} has ${room.players.size} players:`, Array.from(room.players.values()).map(p => p.name))
    } catch (error) {
      console.error('Error creating room:', error)
      socket.emit('error', { message: 'Failed to create room' })
    }
  })

  // Join room
  socket.on('join_room', ({ playerName, roomId }) => {
    try {
      if (!playerName || playerName.trim() === '') {
        socket.emit('error', { message: 'Player name is required' })
        return
      }

      if (!roomId || !rooms.has(roomId)) {
        socket.emit('error', { message: 'Room not found' })
        return
      }

      const room = getRoomData(roomId)
      
      // Add player to room
      room.players.set(socket.id, {
        id: socket.id,
        name: playerName.trim(),
        isMaster: false,
      })
      
      socket.join(roomId)
      socket.data.roomId = roomId
      socket.data.playerName = playerName.trim()
      
      const isMaster = room.master === socket.id
      
      // Notify the joining player
      socket.emit('room_joined', {
        roomId,
        theme: room.theme,
        isMaster,
        players: getPlayersArray(room),
      })
      
      // Notify all other players in the room (excluding the joining player)
      socket.to(roomId).emit('update_players', {
        players: getPlayersArray(room),
      })
      
      // If game already started, distribute new cards to include the new player
      if (room.gameStarted) {
        // Clear existing cards and redistribute to all players
        room.cards.clear()
        const playerCount = room.players.size
        const numbers = generateUniqueNumbers(playerCount)
        
        let index = 0
        room.players.forEach((player, socketId) => {
          const card = numbers[index]
          room.cards.set(socketId, card)
          
          // Send card to each player individually
          io.to(socketId).emit('card_distributed', { card })
          index++
        })
        
        console.log(`🎴 Cards redistributed in room ${roomId} for new player`)
      }
      
      console.log(`👤 ${playerName} joined room ${roomId}`)
      console.log(`📊 Room ${roomId} now has ${room.players.size} players:`, Array.from(room.players.values()).map(p => p.name))
    } catch (error) {
      console.error('Error joining room:', error)
      socket.emit('error', { message: 'Failed to join room' })
    }
  })

  // Distribute cards
  socket.on('distribute_cards', ({ roomId }) => {
    try {
      const room = getRoomData(roomId)
      
      if (!room) {
        socket.emit('error', { message: 'Room not found' })
        return
      }
      
      if (room.master !== socket.id) {
        socket.emit('error', { message: 'Only the master can distribute cards' })
        return
      }
      
      if (room.players.size < 1) {
        socket.emit('error', { message: 'Need at least one player to distribute cards' })
        return
      }
      
      // Clear existing cards
      room.cards.clear()
      
      const playerCount = room.players.size
      const numbers = generateUniqueNumbers(playerCount)
      
      if (numbers.length !== playerCount) {
        socket.emit('error', { message: 'Failed to generate unique numbers' })
        return
      }
      
      // Assign cards to players
      let index = 0
      room.players.forEach((player, socketId) => {
        const card = numbers[index]
        room.cards.set(socketId, card)
        
        // Send card to each player individually
        io.to(socketId).emit('card_distributed', { card })
        index++
      })
      
      room.gameStarted = true
      
      // Notify all players that the game has started
      io.to(roomId).emit('game_started', {
        players: getPlayersArray(room),
        playerCount: room.players.size
      })
      
      console.log(`🎴 Cards distributed in room ${roomId} to ${playerCount} players`)
    } catch (error) {
      console.error('Error distributing cards:', error)
      socket.emit('error', { message: 'Failed to distribute cards' })
    }
  })

  // Reset game
  socket.on('reset_game', ({ roomId }) => {
    try {
      const room = getRoomData(roomId)
      
      if (!room) {
        socket.emit('error', { message: 'Room not found' })
        return
      }
      
      if (room.master !== socket.id) {
        socket.emit('error', { message: 'Only the master can reset the game' })
        return
      }
      
      // Clear cards and reset game state
      room.cards.clear()
      room.gameStarted = false
      
      // Notify all players about the reset
      io.to(roomId).emit('game_reset')
      
      // Immediately distribute new cards
      const playerCount = room.players.size
      const numbers = generateUniqueNumbers(playerCount)
      
      if (numbers.length !== playerCount) {
        socket.emit('error', { message: 'Failed to generate unique numbers for reset' })
        return
      }
      
      let index = 0
      room.players.forEach((player, socketId) => {
        const card = numbers[index]
        room.cards.set(socketId, card)
        
        io.to(socketId).emit('card_distributed', { card })
        index++
      })
      
      room.gameStarted = true
      
      // Notify all players that the game has restarted
      io.to(roomId).emit('game_started', {
        players: getPlayersArray(room),
        playerCount: room.players.size
      })
      
      console.log(`🔄 Game reset in room ${roomId}`)
    } catch (error) {
      console.error('Error resetting game:', error)
      socket.emit('error', { message: 'Failed to reset game' })
    }
  })

  // Remove player handler
  socket.on('remove_player', ({ roomId, playerName }) => {
    try {
      if (!roomId || !playerName) return
      
      const room = getRoomData(roomId)
      if (!room) return
      
      // Verificar se quem está removendo é o master
      if (room.master !== socket.id) {
        socket.emit('error', { message: 'Only the master can remove players' })
        return
      }
      
      // Encontrar o jogador a ser removido
      const playerToRemove = Array.from(room.players.values()).find(p => p.name === playerName)
      if (!playerToRemove) {
        socket.emit('error', { message: 'Player not found' })
        return
      }
      
      // Não permitir que o master se remova
      if (playerToRemove.isMaster) {
        socket.emit('error', { message: 'Master cannot remove themselves' })
        return
      }
      
      // Remover jogador da sala
      room.players.delete(playerToRemove.id)
      room.cards.delete(playerToRemove.id)
      
      // Notificar todos os jogadores sobre a remoção
      io.to(roomId).emit('update_players', {
        players: getPlayersArray(room),
      })
      
      // Notificar o jogador removido
      io.to(playerToRemove.id).emit('player_removed', {
        message: 'You have been removed from the room by the master'
      })
      
      // Se o jogo já começou, redistribuir cartas
      if (room.gameStarted && room.players.size > 0) {
        room.cards.clear()
        const playerCount = room.players.size
        const numbers = generateUniqueNumbers(playerCount)
        
        if (numbers.length === playerCount) {
          let index = 0
          room.players.forEach((player, socketId) => {
            const card = numbers[index]
            room.cards.set(socketId, card)
            
            io.to(socketId).emit('card_distributed', { card })
            index++
          })
          
          console.log(`🎴 Cards redistributed in room ${roomId} after player removal`)
        }
      }
      
      console.log(`🗑️  Player ${playerName} removed from room ${roomId} by master`)
    } catch (error) {
      console.error('Error removing player:', error)
      socket.emit('error', { message: 'Failed to remove player' })
    }
  })

  // Request card redistribution handler
  socket.on('request_card_redistribution', ({ roomId }) => {
    try {
      if (!roomId) return
      
      const room = getRoomData(roomId)
      if (!room) return
      
      if (room.gameStarted && room.cards.has(socket.id)) {
        // Enviar carta atual do jogador
        socket.emit('card_distributed', {
          card: room.cards.get(socket.id),
        })
        
        console.log(`🎴 Card redistributed to ${socket.data.playerName} in room ${roomId}`)
      }
    } catch (error) {
      console.error('Error handling card redistribution request:', error)
    }
  })

  // Keep alive handler
  socket.on('keep_alive', ({ roomId }) => {
    try {
      if (!roomId) return
      
      const room = getRoomData(roomId)
      if (!room) return
      
      // Atualizar timestamp do jogador para indicar que está ativo
      if (room.players.has(socket.id)) {
        const player = room.players.get(socket.id)
        player.lastSeen = Date.now()
        player.disconnected = false
        player.disconnectedAt = null
        room.players.set(socket.id, player)
        
        console.log(`💓 Keep-alive received from ${socket.data.playerName} in room ${roomId}`)
      }
    } catch (error) {
      console.error('Error handling keep-alive:', error)
    }
  })

  // Reconnect handler
  socket.on('reconnect_player', ({ roomId, playerName }) => {
    try {
      if (!roomId || !playerName) return
      
      const room = getRoomData(roomId)
      if (!room) return
      
      // Verificar se o jogador já existe na sala
      const existingPlayer = Array.from(room.players.values()).find(p => p.name === playerName)
      
      if (existingPlayer) {
        // Atualizar socket ID do jogador existente
        room.players.delete(existingPlayer.id)
        room.players.set(socket.id, {
          ...existingPlayer,
          id: socket.id,
          disconnected: false,
          disconnectedAt: null,
          lastSeen: Date.now()
        })
        
        socket.data.roomId = roomId
        socket.data.playerName = playerName
        socket.join(roomId)
        
        // Notificar jogador que reconectou
        socket.emit('room_joined', {
          roomId,
          theme: room.theme,
          isMaster: existingPlayer.isMaster,
          players: getPlayersArray(room),
        })
        
        // Notificar outros jogadores
        socket.to(roomId).emit('update_players', {
          players: getPlayersArray(room),
        })
        
        // Se o jogo já começou, enviar carta
        if (room.gameStarted) {
          // Procurar carta do jogador pelo nome (já que o socket.id mudou)
          let playerCard = null
          
          // Primeiro, tentar encontrar pelo socket antigo
          const oldSocketId = existingPlayer.oldSocketId
          if (oldSocketId && room.cards.has(oldSocketId)) {
            playerCard = [oldSocketId, room.cards.get(oldSocketId)]
          } else {
            // Se não encontrar, procurar por nome
            playerCard = Array.from(room.cards.entries()).find(([socketId, card]) => {
              const player = room.players.get(socketId)
              return player && player.name === playerName
            })
          }
          
          if (playerCard) {
            // Atualizar o mapeamento da carta para o novo socket.id
            room.cards.delete(playerCard[0])
            room.cards.set(socket.id, playerCard[1])
            
            socket.emit('card_distributed', {
              card: playerCard[1],
            })
            
            console.log(`🎴 Card ${playerCard[1]} sent to reconnected player ${playerName}`)
          } else {
            console.log(`⚠️  No card found for reconnected player ${playerName}`)
            console.log(`📊 Available cards:`, Array.from(room.cards.entries()))
            console.log(`👥 Available players:`, Array.from(room.players.values()).map(p => ({ name: p.name, id: p.id, oldSocketId: p.oldSocketId })))
          }
        }
        
        console.log(`🔄 ${playerName} reconnected to room ${roomId}`)
      }
    } catch (error) {
      console.error('Error handling reconnect:', error)
    }
  })

  // Handle disconnect
  socket.on('disconnect', () => {
    try {
      const roomId = socket.data.roomId
      const playerName = socket.data.playerName
      
      if (!roomId) return
      
      const room = getRoomData(roomId)
      if (!room) return
      
      // Marcar jogador como desconectado temporariamente em vez de remover imediatamente
      if (room.players.has(socket.id)) {
        const player = room.players.get(socket.id)
        player.disconnected = true
        player.disconnectedAt = Date.now()
        player.oldSocketId = socket.id // Manter referência do socket antigo
        room.players.set(socket.id, player)
        
        console.log(`⚠️  ${playerName} disconnected from room ${roomId} (temporary)`)
        
        // Agendar remoção após 2 minutos de inatividade
        setTimeout(() => {
          const currentRoom = getRoomData(roomId)
          if (currentRoom && currentRoom.players.has(socket.id)) {
            const currentPlayer = currentRoom.players.get(socket.id)
            if (currentPlayer.disconnected && (Date.now() - currentPlayer.disconnectedAt) > 120000) {
              // Remover jogador após 2 minutos
              currentRoom.players.delete(socket.id)
              currentRoom.cards.delete(socket.id)
              
              console.log(`🗑️  ${playerName} permanently removed from room ${roomId}`)
              
              // Se sala ficou vazia, deletar
              if (currentRoom.players.size === 0) {
                rooms.delete(roomId)
                console.log(`🗑️  Room ${roomId} deleted (empty)`)
                return
              }
              
              // Se master saiu, atribuir novo master
              if (currentRoom.master === socket.id) {
                const newMaster = Array.from(currentRoom.players.keys())[0]
                currentRoom.master = newMaster
                
                const newMasterPlayer = currentRoom.players.get(newMaster)
                newMasterPlayer.isMaster = true
                
                console.log(`👑 New master assigned in room ${roomId}`)
              }
              
              // Notificar jogadores restantes
              io.to(roomId).emit('update_players', {
                players: getPlayersArray(currentRoom),
              })
              
              // Redistribuir cartas se necessário
              if (currentRoom.gameStarted && currentRoom.players.size > 0) {
                currentRoom.cards.clear()
                const playerCount = currentRoom.players.size
                const numbers = generateUniqueNumbers(playerCount)
                
                if (numbers.length === playerCount) {
                  let index = 0
                  currentRoom.players.forEach((player, socketId) => {
                    const card = numbers[index]
                    currentRoom.cards.set(socketId, card)
                    
                    io.to(socketId).emit('card_distributed', { card })
                    index++
                  })
                  
                  console.log(`🎴 Cards redistributed in room ${roomId} after player left`)
                }
              }
            }
          }
        }, 120000) // 2 minutos
      }
      
    } catch (error) {
      console.error('Error handling disconnect:', error)
    }
  })
}

