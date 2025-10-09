# Theme Tier - Backend

Node.js + Express + Socket.IO backend server for the Theme Tier multiplayer card game.

## 🚀 Quick Start

```bash
npm install
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## 📡 API Endpoints

### HTTP

- `GET /health` - Health check endpoint

### WebSocket Events

#### Client → Server

**create_room**
```javascript
{
  playerName: string
}
```

**join_room**
```javascript
{
  playerName: string,
  roomId: string
}
```

**distribute_cards**
```javascript
{
  roomId: string
}
```

**reset_game**
```javascript
{
  roomId: string
}
```

#### Server → Client

**room_created**
```javascript
{
  roomId: string
}
```

**room_joined**
```javascript
{
  roomId: string,
  isMaster: boolean,
  players: Array<{id, name, isMaster}>
}
```

**update_players**
```javascript
{
  players: Array<{id, name, isMaster}>
}
```

**card_distributed**
```javascript
{
  card: number // 1-100
}
```

**game_reset**
```javascript
// No payload, signals game reset
```

**error**
```javascript
{
  message: string
}
```

## 🎮 Game Logic

### Room Management

- Rooms are stored in-memory using Map
- Each room has a unique UUID (shortened to 8 characters)
- Rooms are automatically deleted when empty

### Card Distribution

- Generates unique random numbers from 1 to 100
- No duplicates within a room
- Each player receives exactly one card
- Cards are redistributed on reset

### Master Assignment

- Room creator becomes the master
- If master leaves, the next player becomes master automatically
- Only master can distribute cards or reset game

## 🗄️ Data Structure

```javascript
Room {
  id: string,
  master: socketId,
  players: Map<socketId, Player>,
  cards: Map<socketId, number>,
  gameStarted: boolean
}

Player {
  id: socketId,
  name: string,
  isMaster: boolean
}
```

## 🔐 Security

- Validates player names (non-empty)
- Validates room existence before joining
- Only master can perform privileged actions
- Prevents duplicate room IDs

## 🌐 CORS

CORS is enabled for the frontend. Configure in `index.js`:

```javascript
CLIENT_URL=http://localhost:3000
```

## 📊 Logging

Console logs include:
- ✅ Client connections
- ❌ Client disconnections
- 🎮 Room creation
- 👤 Player joins
- 🎴 Card distribution
- 🔄 Game resets
- 🗑️ Room deletion
- 👑 Master reassignment

## 🚀 Deployment

The server is ready for deployment on:
- Render
- Heroku
- Railway
- Any Node.js hosting platform

Set environment variables:
- `PORT` - Server port (auto-set by most platforms)
- `CLIENT_URL` - Your frontend URL for CORS

## 📦 Dependencies

- `express` - Web framework
- `socket.io` - WebSocket server
- `cors` - CORS middleware
- `uuid` - Unique ID generation

