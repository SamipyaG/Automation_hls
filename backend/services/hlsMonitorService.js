const axios = require('axios');
const M3U8Parser = require('../utils/m3u8Parser');
const { EventEmitter } = require('events');

class HLSMonitorService extends EventEmitter {
  constructor() {
    super();
    this.activeMonitors = new Map(); // socket.id -> monitor instance
  }

  async startMonitor(playerUrl, socket) {
    try {
      console.log('🎯 Starting HLS monitor for:', playerUrl);

      const monitor = new StreamMonitor(playerUrl, socket);
      this.activeMonitors.set(socket.id, monitor);

      await monitor.start();
      return monitor;

    } catch (error) {
      console.error('❌ Failed to start HLS monitor:', error);
      throw error;
    }
  }

  stopMonitor(monitor) {
    try {
      if (monitor) {
        monitor.stop();
        this.activeMonitors.delete(monitor.socket.id);
        console.log('✅ HLS monitor stopped for socket:', monitor.socket.id);
      }
    } catch (error) {
      console.error('❌ Error stopping HLS monitor:', error);
    }
  }

  async switchProfile(monitor, profileUrl) {
    try {
      if (monitor) {
        await monitor.switchProfile(profileUrl);
      }
    } catch (error) {
      console.error('❌ Error switching profile:', error);
      throw error;
    }
  }

  async selectProfile(monitor, profileUri) {
    try {
      if (monitor) {
        await monitor.selectProfile(profileUri);
      }
    } catch (error) {
      console.error('❌ Error selecting profile:', error);
      throw error;
    }
  }
}

class StreamMonitor extends EventEmitter {
  constructor(playerUrl, socket) {
    super();
    this.playerUrl = playerUrl;
    this.socket = socket;
    this.isRunning = false;
    this.currentProfileUrl = null;
    this.lastMediaSeq = null;
    this.lastSegmentUrl = null;
    this.lastProcessedSegmentUri = null; // Track last processed segment URI
    this.baseUrl = M3U8Parser.getBaseUrl(playerUrl);
    this.profiles = [];
    this.segmentHistory = [];
    this.manifestHistory = [];
    this.selectedProfile = null; // Track the user-selected profile
  }

  async start() {
    try {
      this.isRunning = true;
      console.log('🚀 Starting stream analysis...');

      // Step 1: Fetch and parse master playlist
      await this.fetchMasterPlaylist();

      // Step 2: Wait for user to select a profile (don't auto-select)
      console.log('⏳ Waiting for user to select a profile...');

    } catch (error) {
      console.error('❌ Failed to start stream monitor:', error);
      this.socket.emit('error', { message: error.message });
      throw error;
    }
  }

  stop() {
    this.isRunning = false;
    console.log('🛑 Stream monitor stopped');
  }

  async fetchMasterPlaylist() {
    try {
      console.log('📡 Fetching master playlist from:', this.playerUrl);

      const response = await axios.get(this.playerUrl, {
        timeout: 10000,
        maxRedirects: 5,
        headers: { 'User-Agent': 'HLS-Analyzer/1.0' }
      });

      // Get the final URL after redirects
      const requestUrl = response.request?.res?.responseUrl || this.playerUrl;

      // Parse master playlist
      this.profiles = M3U8Parser.parseMasterPlaylist(response.data);

      // Emit profiles to frontend for selection
      this.socket.emit('profiles-available', this.profiles);

      // Emit manifest data for master playlist
      const manifestData = {
        type: 'MASTER_MANIFEST',
        url: this.playerUrl,
        requestUrl: requestUrl, // Add the final resolved URL
        size: response.headers['content-length'],
        time: new Date().toISOString(),
        headers: {
          ...response.headers,
          'request-url': requestUrl // Include in headers for frontend display
        },
        profiles: this.profiles.length,
        content: response.data,
        fetchedAt: new Date().toISOString()
      };

      this.socket.emit('manifestData', manifestData);
      this.manifestHistory.push(manifestData);

      console.log('✅ Master playlist fetched and parsed successfully');
      console.log(`📋 Found ${this.profiles.length} profiles available for selection`);

    } catch (error) {
      console.error('❌ Failed to fetch master playlist:', error);
      throw error;
    }
  }

  async selectProfile(profileUri) {
    try {
      console.log('🔄 User selected profile:', profileUri);

      this.selectedProfile = this.profiles.find(p => p.uri === profileUri);
      if (!this.selectedProfile) {
        throw new Error('Selected profile not found in available profiles');
      }

      // Resolve the full URL for the selected profile
      this.currentProfileUrl = M3U8Parser.resolveUrl(this.playerUrl, profileUri);
      this.lastMediaSeq = null;
      this.lastSegmentUrl = null;
      this.lastProcessedSegmentUri = null; // Reset when switching profiles

      console.log('✅ Profile selected:', {
        uri: profileUri,
        resolvedUrl: this.currentProfileUrl,
        bandwidth: this.selectedProfile.bandwidth,
        resolution: this.selectedProfile.resolution
      });

      // Start monitoring the selected profile
      this.startChildManifestPolling();

    } catch (error) {
      console.error('❌ Failed to select profile:', error);
      throw error;
    }
  }

  async startChildManifestPolling() {
    console.log('📡 Starting child manifest polling for:', this.currentProfileUrl);

    while (this.isRunning) {
      try {
        console.log('📡 Fetching child manifest from:', this.currentProfileUrl);

        const startTime = Date.now();
        const response = await axios.get(this.currentProfileUrl, {
          timeout: 10000,
          maxRedirects: 5,
          headers: { 'User-Agent': 'HLS-Analyzer/1.0' }
        });
        const fetchTime = Date.now() - startTime;

        // Get the final URL after redirects
        const requestUrl = response.request?.res?.responseUrl || this.currentProfileUrl;

        // Parse child manifest
        const mediaPlaylist = M3U8Parser.parseMediaPlaylist(response.data);

        // Emit manifest data for child manifest
        const manifestData = {
          type: 'CHILD_MANIFEST',
          url: this.currentProfileUrl,
          requestUrl: requestUrl, // Add the final resolved URL
          size: response.headers['content-length'],
          time: new Date().toISOString(),
          headers: {
            ...response.headers,
            'request-url': requestUrl // Include in headers for frontend display
          },
          mediaSeq: mediaPlaylist.mediaSequence,
          segments: mediaPlaylist.segments.length,
          targetDuration: mediaPlaylist.targetDuration,
          playlistType: mediaPlaylist.playlistType,
          fetchTime,
          content: response.data,
          fetchedAt: new Date().toISOString()
        };

        this.socket.emit('manifestData', manifestData);
        this.manifestHistory.push(manifestData);

        // Process only new segments
        await this.processNewSegments(mediaPlaylist);

        // Poll every 2 seconds for live streams
        await new Promise(resolve => setTimeout(resolve, 2000));

      } catch (error) {
        console.error('❌ Error monitoring child manifest:', error);
        this.socket.emit('error', { message: error.message });
        await new Promise(resolve => setTimeout(resolve, 5000)); // Slower retry on error
      }
    }
  }

  async switchProfile(profileUrl) {
    try {
      console.log('🔄 Switching to profile:', profileUrl);

      // Find the profile by URI
      const profile = this.profiles.find(p => p.uri === profileUrl);
      if (!profile) {
        throw new Error('Profile not found in available profiles');
      }

      await this.selectProfile(profileUrl);

    } catch (error) {
      console.error('❌ Failed to switch profile:', error);
      throw error;
    }
  }

  async processNewSegments(mediaPlaylist) {
    try {
      console.log(`📋 Processing ${mediaPlaylist.segments.length} segments, checking for new ones...`);

      // Filter only new segments that haven't been processed
      const newSegments = mediaPlaylist.segments.filter(
        segment => segment.uri !== this.lastProcessedSegmentUri
      );

      if (newSegments.length > 0) {
        console.log(`🆕 Found ${newSegments.length} new segments to process`);

        // Option 1: Process all new segments (current behavior)
        // Option 2: Process only the latest segment (Dev Tools style) - uncomment below
        // const newSegments = newSegments.slice(-1); // Only the latest segment

        // Update last processed segment URI to the latest one
        this.lastProcessedSegmentUri = newSegments[newSegments.length - 1].uri;

        // Process each new segment
        for (const segment of newSegments) {
          if (!this.isRunning) break;

          const segmentUrl = M3U8Parser.resolveUrl(this.currentProfileUrl, segment.uri);
          await this.analyzeSegment(segment, segmentUrl, mediaPlaylist.mediaSequence);
        }
      } else {
        console.log('⏭️ No new segments found, skipping processing');
      }

    } catch (error) {
      console.error('❌ Error processing new segments:', error);
      this.socket.emit('error', { message: error.message });
    }
  }

  async analyzeSegment(segment, segmentUrl, mediaSequence) {
    try {
      console.log('🔍 Analyzing NEW segment:', segmentUrl);

      const startTime = Date.now();
      const response = await axios.head(segmentUrl, {
        timeout: 10000,
        maxRedirects: 5,
        headers: { 'User-Agent': 'HLS-Analyzer/1.0' }
      });
      const downloadTime = Date.now() - startTime;

      // Get the final URL after redirects
      const requestUrl = response.request?.res?.responseUrl || segmentUrl;

      // Detect media sequence jumps
      const mediaSeqJump = this.lastMediaSeq !== null &&
        mediaSequence !== this.lastMediaSeq + 1;

      // Detect discontinuity issues
      const discontinuityIssue = mediaSeqJump && !segment.discontinuity;

      const segmentData = {
        type: 'SEGMENT',
        url: segmentUrl,
        requestUrl: requestUrl, // Add the final resolved URL
        size: response.headers['content-length'],
        time: new Date().toISOString(),
        headers: {
          ...response.headers,
          'request-url': requestUrl // Include in headers for frontend display
        },
        mediaSeq: mediaSequence,
        duration: segment.duration,
        discontinuity: segment.discontinuity,
        downloadTime,
        mediaSeqJump,
        discontinuityIssue,
        isNew: true, // Flag to indicate this is a fresh segment
        fetchedAt: new Date().toISOString()
      };

      this.socket.emit('segmentData', segmentData);
      this.segmentHistory.push(segmentData);

      // Keep only last 50 segments
      if (this.segmentHistory.length > 50) {
        this.segmentHistory = this.segmentHistory.slice(-50);
      }

      this.lastMediaSeq = mediaSequence;
      this.lastSegmentUrl = segmentUrl;

      console.log('✅ NEW segment analyzed:', {
        url: segmentUrl,
        requestUrl: requestUrl,
        size: response.headers['content-length'],
        downloadTime,
        isNew: true
      });

    } catch (error) {
      console.error('❌ Error analyzing segment:', error);
      this.socket.emit('error', {
        message: `Failed to analyze segment: ${error.message}`,
        segmentUrl
      });
    }
  }
}

// Export singleton instance
module.exports = new HLSMonitorService(); 