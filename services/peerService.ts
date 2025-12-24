import Peer, { DataConnection } from 'peerjs';
import { NetworkMessage } from '../types';

// Singleton-ish pattern for managing the peer connection
class PeerService {
  peer: Peer | null = null;
  connections: DataConnection[] = []; // For Host: list of clients
  hostConnection: DataConnection | null = null; // For Client: connection to host
  myId: string = '';
  
  onMessage: (data: NetworkMessage, sourceId: string) => void = () => {};
  onConnection: (conn: DataConnection) => void = () => {};

  initialize(id?: string): Promise<string> {
    return new Promise((resolve, reject) => {
      // Create a peer. If ID is not provided, one is generated.
      // Using standard public PeerJS cloud.
      this.peer = new Peer(id, {
        debug: 1
      });

      this.peer.on('open', (id) => {
        this.myId = id;
        console.log('My Peer ID is: ' + id);
        resolve(id);
      });

      this.peer.on('connection', (conn) => {
        this.connections.push(conn);
        this.setupConnection(conn);
        this.onConnection(conn);
      });

      this.peer.on('error', (err) => {
        console.error('PeerJS Error:', err);
        // reject(err); // Usually don't reject init on minor errors, but handle disconnects
      });
    });
  }

  connectToHost(hostId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.peer) return reject("Peer not initialized");
      
      const conn = this.peer.connect(hostId, { reliable: true });
      
      conn.on('open', () => {
        this.hostConnection = conn;
        this.setupConnection(conn);
        resolve();
      });

      conn.on('error', (err) => {
        reject(err);
      });
    });
  }

  setupConnection(conn: DataConnection) {
    conn.on('data', (data) => {
      this.onMessage(data as NetworkMessage, conn.peer);
    });
    
    conn.on('close', () => {
      // Handle disconnect
      this.connections = this.connections.filter(c => c.peer !== conn.peer);
      if (this.hostConnection?.peer === conn.peer) {
        this.hostConnection = null;
      }
    });
  }

  broadcast(msg: NetworkMessage) {
    this.connections.forEach(conn => {
      if (conn.open) conn.send(msg);
    });
  }

  sendToHost(msg: NetworkMessage) {
    if (this.hostConnection && this.hostConnection.open) {
      this.hostConnection.send(msg);
    }
  }
  
  sendToPeer(peerId: string, msg: NetworkMessage) {
      const conn = this.connections.find(c => c.peer === peerId);
      if (conn && conn.open) conn.send(msg);
  }

  cleanup() {
    this.connections.forEach(c => c.close());
    this.hostConnection?.close();
    this.peer?.destroy();
    this.peer = null;
    this.connections = [];
  }
}

export const peerService = new PeerService();
