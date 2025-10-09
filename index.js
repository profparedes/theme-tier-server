import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import cors from 'cors'
import { gameHandlers } from './sockets/gameHandlers.js'

const app = express()
const httpServer = createServer(app)

// CORS configuration
app.use(cors())

// Socket.IO setup
const io = new Server(httpServer, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
})

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Theme Tier server is running' })
})

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log(`✅ Client connected: ${socket.id}`)

  // Register all game event handlers
  gameHandlers(io, socket)

  socket.on('disconnect', () => {
    console.log(`❌ Client disconnected: ${socket.id}`)
  })
})

const PORT = process.env.PORT || 3001

httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
})

