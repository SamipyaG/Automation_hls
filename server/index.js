const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const fs = require('fs');
const HLSController = require('./controllers/hlsController');

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with CORS and other options
const io = socketIO(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 60000,
  pingInterval: 25000,
  serveClient: true // Explicitly serve the client
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../public')));
app.use(express.json());

// Add a route to check server status
app.get('/status', (req, res) => {
  try {
    console.log('Status endpoint called');
    res.setHeader('Content-Type', 'application/json');
    const status = {
      status: 'ok',
      socketIO: true,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      connections: io.engine.clientsCount
    };
    console.log('Sending status:', status);
    res.json(status);
  } catch (error) {
    console.error('Error in status endpoint:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Add a route for favicon
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // No content
});

// Server configuration
const CACHE_DIR = path.join(__dirname, '../cache');
if (!fs.existsSync(CACHE_DIR)) {
  console.log('Creating cache directory:', CACHE_DIR);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

const config = {
  CACHE_DIR,
  REQUEST_TIMEOUT: 10000
};

// Initialize HLS Controller
const hlsController = new HLSController(io, config);

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send initial connection success message
  socket.emit('connectionStatus', { status: 'connected', id: socket.id });

  socket.on('startAnalysis', async (data, callback) => {
    console.log('Received startAnalysis request:', {
      url: data.url,
      sourceType: data.sourceType,
      liveType: data.liveType,
      channelName: data.channelName
    });

    try {
      // Validate URL
      if (!data.url || !data.url.includes('.m3u8')) {
        throw new Error('Invalid HLS URL');
      }

      // Start analysis
      await hlsController.startAnalysis(data.url, data.sourceType, data.liveType, data.channelName, socket);
      console.log('Analysis started successfully for:', data.url);
      callback({ success: true, message: 'Analysis started' });
    } catch (error) {
      console.error('Error starting analysis:', error);
      callback({ success: false, message: error.message });
    }
  });

  socket.on('stopAnalysis', (callback) => {
    console.log('Received stopAnalysis request');
    try {
      hlsController.stopAnalysis(socket);
      callback({ success: true, message: 'Analysis stopped' });
    } catch (error) {
      console.error('Error stopping analysis:', error);
      callback({ success: false, message: error.message });
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    hlsController.stopAnalysis(socket);
  });

  // Handle errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    status: 'error',
    message: err.message
  });
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Socket.IO server initialized`);
  console.log(`Socket.IO client available at: http://localhost:${PORT}/socket.io/socket.io.js`);
  console.log(`Cache directory: ${CACHE_DIR}`);
}); 