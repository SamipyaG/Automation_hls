const streamController = require('../controllers/streamController');

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);

    // Handle start monitoring request
    socket.on('start-monitor', async (data) => {
      try {
        console.log('📡 Start monitor request:', data);
        const { playerUrl, sourceType, liveType, channelName } = data;

        if (!playerUrl) {
          socket.emit('error', { message: 'Player URL is required' });
          return;
        }

        await streamController.startAnalysis(playerUrl, sourceType, liveType, channelName, socket);
        socket.emit('monitor-started', { message: 'Analysis started successfully' });

      } catch (error) {
        console.error('❌ Start monitor error:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Handle profile selection
    socket.on('select-profile', async (data) => {
      try {
        console.log('🎯 Profile selection request:', data);
        const { profileUri } = data;

        if (!profileUri) {
          socket.emit('error', { message: 'Profile URI is required' });
          return;
        }

        await streamController.selectProfile(profileUri, socket);
        socket.emit('profile-selected', { message: 'Profile selected successfully', profileUri });

      } catch (error) {
        console.error('❌ Profile selection error:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Handle stop monitoring request
    socket.on('stop-monitor', () => {
      try {
        console.log('🛑 Stop monitor request from:', socket.id);
        streamController.stopAnalysis(socket);
        socket.emit('monitor-stopped', { message: 'Analysis stopped successfully' });
      } catch (error) {
        console.error('❌ Stop monitor error:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Handle profile switching
    socket.on('switch-profile', async (data) => {
      try {
        console.log('🔄 Profile switch request:', data);
        const { profileUrl } = data;
        await streamController.switchProfile(profileUrl, socket);
        socket.emit('profile-switched', { message: 'Profile switched successfully' });
      } catch (error) {
        console.error('❌ Profile switch error:', error);
        socket.emit('error', { message: error.message });
      }
    });

    // Handle client disconnect
    socket.on('disconnect', () => {
      console.log(`🔌 Client disconnected: ${socket.id}`);
      streamController.stopAnalysis(socket);
    });

    // Send connection status
    socket.emit('connection-status', {
      status: 'connected',
      socketId: socket.id,
      timestamp: new Date().toISOString()
    });
  });
}; 