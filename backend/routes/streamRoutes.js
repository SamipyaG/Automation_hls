const express = require('express');
const router = express.Router();
const streamController = require('../controllers/streamController');

// Get server status
router.get('/status', (req, res) => {
  try {
    const status = {
      status: 'running',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      activeStreams: streamController.getStreamCount(),
      memory: process.memoryUsage(),
      version: process.version
    };
    res.json(status);
  } catch (error) {
    console.error('Status endpoint error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Get active streams
router.get('/streams', (req, res) => {
  try {
    const streams = streamController.getActiveStreams();
    res.json({
      activeStreams: streams,
      count: streams.length
    });
  } catch (error) {
    console.error('Streams endpoint error:', error);
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

module.exports = router; 