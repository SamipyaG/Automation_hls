const { server } = require('./app');

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 HLS Automation Dashboard Server running on port ${PORT}`);
  console.log(`📱 Frontend available at: http://localhost:${PORT}`);
  console.log(`🔌 Socket.IO endpoint: http://localhost:${PORT}`);
  console.log(`📊 API Status: http://localhost:${PORT}/api/status`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
}); 