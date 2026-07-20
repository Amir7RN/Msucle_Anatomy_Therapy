/**
 * signaling-server.js
 *
 * Minimal WebSocket signaling relay for the webrtc-call example. WebRTC needs
 * SOME channel to exchange SDP offers/answers and ICE candidates before the
 * peer-to-peer connection exists — this is that channel. It relays raw JSON
 * messages between everyone connected to the same `?room=` id; it never looks
 * at (or needs to understand) the WebRTC payloads themselves.
 *
 * This is a REFERENCE implementation for local testing, not a production
 * server: no auth, no room-membership limits, no TLS. If you already have a
 * real-time channel in your own stack (a WebSocket gateway, Firebase, Pusher,
 * Supabase Realtime, etc), use that instead and skip this file entirely — the
 * client-side code in index.html only assumes "send a JSON message to the
 * other peer in this room" and "receive one back," which any of those can do.
 *
 * Run:
 *   npm install ws
 *   node signaling-server.js
 */
import { WebSocketServer } from 'ws'

const PORT = process.env.PORT || 8080
const wss = new WebSocketServer({ port: PORT })
const rooms = new Map() // roomId -> Set<WebSocket>

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost')
  const room = url.searchParams.get('room') || 'default'
  if (!rooms.has(room)) rooms.set(room, new Set())
  rooms.get(room).add(ws)

  ws.on('message', (data) => {
    for (const peer of rooms.get(room)) {
      if (peer !== ws && peer.readyState === peer.OPEN) peer.send(data.toString())
    }
  })

  ws.on('close', () => {
    rooms.get(room)?.delete(ws)
    if (rooms.get(room)?.size === 0) rooms.delete(room)
  })
})

console.log(`Signaling server listening on ws://localhost:${PORT}`)
