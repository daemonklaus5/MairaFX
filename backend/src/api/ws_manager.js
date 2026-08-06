const { WebSocketServer } = require('ws');

class WebSocketManager {
  constructor(server) {
    this.wss = new WebSocketServer({ server });
    this.clients = new Set();

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      console.log('Client connected to WebSocket');
      
      ws.on('close', () => {
        this.clients.delete(ws);
        console.log('Client disconnected');
      });
      
      ws.on('error', console.error);
    });
  }

  broadcast(data) {
    const payload = JSON.stringify(data);
    for (const client of this.clients) {
      if (client.readyState === 1) { // OPEN
        client.send(payload);
      }
    }
  }
}

module.exports = WebSocketManager;
