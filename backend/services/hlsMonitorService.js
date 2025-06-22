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
    this.baseUrl = M3U8Parser.getBaseUrl(playerUrl);
    this.profiles = [];
    this.selectedProfile = null;

    // 🔥 NEW: DevTools-style tracking (exact Chrome DevTools behavior)
    this.manifests = new Map(); // Tracks .m3u8 URLs to avoid duplicates (like DevTools)
    this.segments = new Map(); // Tracks .ts URLs + mediaSequence (like DevTools)
    this.manifestHistory = []; // Stores last 10 manifests (like DevTools XHR/fetch)
    this.segmentHistory = []; // Stores last 20 segments (like DevTools Media)
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

      const startTime = Date.now();
      const response = await axios.get(this.playerUrl, {
        timeout: 10000,
        maxRedirects: 5,
        headers: { 'User-Agent': 'HLS-Analyzer/1.0' }
      });
      const fetchTime = Date.now() - startTime;

      // Get the final URL after redirects
      const requestUrl = response.request?.res?.responseUrl || this.playerUrl;

      // Parse master playlist
      this.profiles = M3U8Parser.parseMasterPlaylist(response.data);

      // 🔥 NEW: DevTools-style manifest processing
      this.processManifest({
        url: this.playerUrl,
        requestUrl: requestUrl,
        type: 'master',
        status: response.status,
        headers: response.headers,
        content: response.data,
        fetchTime,
        profiles: this.profiles.length,
        isMaster: true
      });

      // Emit profiles to frontend for selection
      this.socket.emit('profiles-available', this.profiles);

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

      console.log('✅ Profile selected:', {
        uri: profileUri,
        resolvedUrl: this.currentProfileUrl,
        bandwidth: this.selectedProfile.bandwidth,
        resolution: this.selectedProfile.resolution
      });

      // Start reactive monitoring of the selected profile
      this.lastMediaSequence = null;
      this.seenSegments = new Set();
      this.isRunning = true;
      this.reactiveManifestLoop();

    } catch (error) {
      console.error('❌ Failed to select profile:', error);
      throw error;
    }
  }

  // --- REACTIVE, EVENT-DRIVEN MANIFEST LOOP ---
  async reactiveManifestLoop() {
    while (this.isRunning) {
      try {
        // Fetch the child manifest
        const startTime = Date.now();
        const response = await axios.get(this.currentProfileUrl, {
          timeout: 10000,
          maxRedirects: 5,
          headers: { 'User-Agent': 'HLS-Analyzer/1.0' }
        });
        const fetchTime = Date.now() - startTime;
        const requestUrl = response.request?.res?.responseUrl || this.currentProfileUrl;
        const mediaPlaylist = M3U8Parser.parseMediaPlaylist(response.data);
        const newMediaSequence = mediaPlaylist.mediaSequence;

        // Only emit manifest-update if media sequence changed
        if (this.lastMediaSequence === null || newMediaSequence !== this.lastMediaSequence) {
          this.lastMediaSequence = newMediaSequence;
          // Emit only 1 new manifest row
          const manifestEntry = {
            url: this.currentProfileUrl,
            requestUrl: requestUrl,
            type: 'variant',
            status: response.status,
            size: response.headers['content-length'],
            timing: fetchTime,
            mediaSequence: newMediaSequence,
            discontinuity: false,
            headers: response.headers,
            content: response.data,
            timestamp: new Date().toISOString(),
            id: Date.now() + Math.random(),
            isNew: true
          };
          this.socket.emit('manifest-update', manifestEntry);
        }

        // Process segments reactively
        await this.reactiveSegmentCheck(mediaPlaylist, requestUrl);

        // Immediately fetch again (no delay, no polling)
        // If the playlist is unchanged, this will be a fast loop, but only emits on real change
      } catch (error) {
        console.error('❌ Error in reactive manifest loop:', error);
        this.socket.emit('error', { message: error.message });
        // Optional: add a short delay on error to avoid hammering
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  // --- REACTIVE SEGMENT EMISSION ---
  async reactiveSegmentCheck(mediaPlaylist, requestUrl) {
    for (let i = 0; i < mediaPlaylist.segments.length; i++) {
      const segment = mediaPlaylist.segments[i];
      const segmentSequence = mediaPlaylist.mediaSequence + i;
      const segmentUrl = M3U8Parser.resolveUrl(this.currentProfileUrl, segment.uri);
      const segmentKey = `${segmentUrl}-${segmentSequence}`;
      if (!this.seenSegments.has(segmentKey)) {
        this.seenSegments.add(segmentKey);
        // Fetch segment HEAD for details
        try {
          const startTime = Date.now();
          const response = await axios.head(segmentUrl, {
            timeout: 10000,
            maxRedirects: 5,
            headers: { 'User-Agent': 'HLS-Analyzer/1.0' }
          });
          const downloadTime = Date.now() - startTime;
          const finalUrl = response.request?.res?.responseUrl || segmentUrl;
          // Emit only new segment
          const segmentEntry = {
            url: segmentUrl,
            requestUrl: finalUrl,
            sequence: segmentSequence,
            discontinuity: segment.discontinuity,
            size: response.headers['content-length'],
            downloadTime: downloadTime,
            status: response.status,
            headers: response.headers,
            timestamp: new Date().toISOString(),
            id: Date.now() + Math.random()
          };
          this.socket.emit('segment-update', segmentEntry);
        } catch (err) {
          console.error('❌ Error fetching segment HEAD:', segmentUrl, err.message);
        }
      }
    }
  }

  // 🔥 NEW: DevTools-style manifest processing (exact Chrome DevTools behavior)
  processManifest(manifestData) {
    console.log('🔍 processManifest called with:', manifestData);

    // Check if this is a new unique manifest (like DevTools)
    const isNewManifest = !this.manifests.has(manifestData.url);

    if (isNewManifest) {
      console.log('✅ New unique manifest found, processing...');
      this.manifests.set(manifestData.url, manifestData);
    } else {
      console.log('🔄 Processing existing manifest for continuous monitoring...');
    }

    const entry = {
      url: manifestData.url,
      requestUrl: manifestData.requestUrl,
      type: manifestData.isMaster ? 'master' : 'variant',
      status: manifestData.status,
      size: manifestData.headers['content-length'],
      timing: manifestData.fetchTime,
      mediaSequence: manifestData.mediaSequence || null,
      discontinuity: false, // Manifests don't have discontinuities
      headers: manifestData.headers,
      content: manifestData.content,
      timestamp: new Date().toISOString(),
      id: Date.now() + Math.random(),
      isNew: isNewManifest
    };

    // Add to history (newest at bottom, like DevTools)
    this.manifestHistory.push(entry);

    // Keep only last 10 manifests (like DevTools XHR/fetch)
    if (this.manifestHistory.length > 10) {
      this.manifestHistory.shift(); // Remove oldest
    }

    // Emit to frontend (always emit for continuous monitoring like segments)
    console.log('📡 Emitting manifest-update event to socket:', this.socket.id);
    this.socket.emit('manifest-update', entry);

    console.log('📋 Logged manifest:', {
      type: entry.type,
      url: entry.url.split('/').pop(),
      mediaSeq: entry.mediaSequence || 'N/A',
      historySize: this.manifestHistory.length,
      isNew: isNewManifest
    });
  }

  // 🔥 NEW: DevTools-style segment processing (exact Chrome DevTools behavior)
  processSegment(segmentData) {
    console.log('🔍 processSegment called with:', segmentData);

    // Use the requestUrl (final URL after redirects) for a reliable key
    const segmentKey = `${segmentData.requestUrl}-${segmentData.mediaSequence}`;

    // Check if this is a new unique segment (like DevTools)
    if (!this.segments.has(segmentKey)) {
      console.log('✅ New unique segment found, processing...');
      this.segments.set(segmentKey, true);

      const entry = {
        url: segmentData.url,
        requestUrl: segmentData.requestUrl,
        sequence: segmentData.mediaSequence,
        discontinuity: segmentData.discontinuity,
        size: segmentData.size,
        downloadTime: segmentData.downloadTime,
        status: segmentData.status,
        headers: segmentData.headers,
        timestamp: new Date().toISOString(),
        id: Date.now() + Math.random()
      };

      // Add to history (newest at bottom, like DevTools)
      this.segmentHistory.push(entry);

      // Keep only last 20 segments (like DevTools Media)
      if (this.segmentHistory.length > 20) {
        this.segmentHistory.shift(); // Remove oldest
      }

      // Emit to frontend
      console.log('📡 Emitting new-segment event to socket:', this.socket.id);
      this.socket.emit('new-segment', entry);

      console.log('🎬 Logged new segment:', {
        sequence: entry.sequence,
        url: entry.url.split('/').pop(),
        size: entry.size,
        downloadTime: entry.downloadTime,
        historySize: this.segmentHistory.length
      });
    } else {
      console.log(`⏭️ Skipping duplicate segment: #${segmentData.mediaSequence} - ${segmentData.url.split('/').pop()}`);
    }
  }
}

// Export singleton instance
module.exports = new HLSMonitorService(); 