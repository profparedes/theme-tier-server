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
      
      // Notify all other players in the room
      io.to(roomId).emit('update_players', {
        players: getPlayersArray(room),
      })
      
      // If game already started, send card to the new player
      if (room.gameStarted && room.cards.has(socket.id)) {
        socket.emit('card_distributed', {
          card: room.cards.get(socket.id),
        })
      }
      
      console.log(`👤 ${playerName} joined room ${roomId}`)
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
      
      const playerCount = room.players.size
      const numbers = generateUniqueNumbers(playerCount)
      
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
      
      console.log(`🎴 Cards distributed in room ${roomId}`)
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
      
      let index = 0
      room.players.forEach((player, socketId) => {
        const card = numbers[index]
        room.cards.set(socketId, card)
        
        io.to(socketId).emit('card_distributed', { card })
        index++
      })
      
      room.gameStarted = true
      
      console.log(`🔄 Game reset in room ${roomId}`)
    } catch (error) {
      console.error('Error resetting game:', error)
      socket.emit('error', { message: 'Failed to reset game' })
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
      
      // Remove player from room
      room.players.delete(socket.id)
      room.cards.delete(socket.id)
      
      // If room is empty, delete it
      if (room.players.size === 0) {
        rooms.delete(roomId)
        console.log(`🗑️  Room ${roomId} deleted (empty)`)
        return
      }
      
      // If master left, assign new master
      if (room.master === socket.id) {
        const newMaster = Array.from(room.players.keys())[0]
        room.master = newMaster
        
        const newMasterPlayer = room.players.get(newMaster)
        newMasterPlayer.isMaster = true
        
        console.log(`👑 New master assigned in room ${roomId}`)
      }
      
      // Notify remaining players
      io.to(roomId).emit('update_players', {
        players: getPlayersArray(room),
      })
      
      console.log(`👋 ${playerName} left room ${roomId}`)
    } catch (error) {
      console.error('Error handling disconnect:', error)
    }
  })
}

