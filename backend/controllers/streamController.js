const hlsMonitorService = require('../services/hlsMonitorService');

class StreamController {
  constructor() {
    this.activeStreams = new Map(); // socket.id -> monitor instance
  }

  async startAnalysis(playerUrl, sourceType, liveType, channelName, socket) {
    try {
      console.log('🎯 Starting analysis for:', {
        playerUrl,
        sourceType,
        liveType,
        channelName
      });

      // Check if analysis is already running for this socket
      if (this.activeStreams.has(socket.id)) {
        throw new Error('Analysis already in progress for this session');
      }

      // Start the monitoring service
      const monitor = await hlsMonitorService.startMonitor(playerUrl, socket);

      // Store the monitor instance
      this.activeStreams.set(socket.id, monitor);

      console.log('✅ Analysis started successfully for socket:', socket.id);

    } catch (error) {
      console.error('❌ Failed to start analysis:', error);
      throw error;
    }
  }

  async selectProfile(profileUri, socket) {
    try {
      console.log('🎯 Selecting profile for socket:', socket.id, 'Profile:', profileUri);

      const monitor = this.activeStreams.get(socket.id);
      if (!monitor) {
        throw new Error('No active analysis session found');
      }

      await hlsMonitorService.selectProfile(monitor, profileUri);
      console.log('✅ Profile selected successfully');

    } catch (error) {
      console.error('❌ Failed to select profile:', error);
      throw error;
    }
  }

  stopAnalysis(socket) {
    try {
      console.log('🛑 Stopping analysis for socket:', socket.id);

      const monitor = this.activeStreams.get(socket.id);
      if (monitor) {
        hlsMonitorService.stopMonitor(monitor);
        this.activeStreams.delete(socket.id);
        console.log('✅ Analysis stopped successfully for socket:', socket.id);
      } else {
        console.log('ℹ️ No active analysis found for socket:', socket.id);
      }

    } catch (error) {
      console.error('❌ Error stopping analysis:', error);
      throw error;
    }
  }

  getActiveStreams() {
    return Array.from(this.activeStreams.keys());
  }

  getStreamCount() {
    return this.activeStreams.size;
  }
}

// Export singleton instance
module.exports = new StreamController(); 