const { Parser } = require('m3u8-parser');
const axios = require('axios');
const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

class HLSController {
  constructor(io, config) {
    this.io = io;
    this.config = config;
    this.activeStreams = new Map();
    this.manifestHistory = new Map(); // Store last 3 manifests per stream

    // Ensure cache directory exists
    if (!fs.existsSync(this.config.CACHE_DIR)) {
      fs.mkdirSync(this.config.CACHE_DIR, { recursive: true });
    }
  }

  async startAnalysis(url, sourceType, liveType, channelName, socket) {
    if (this.activeStreams.has(socket.id)) {
      throw new Error('Analysis already in progress');
    }

    console.log('Starting analysis for:', { url, sourceType, liveType, channelName });
    const streamAnalyzer = new StreamAnalyzer(url, sourceType, liveType, channelName, socket, this.config);
    this.activeStreams.set(socket.id, streamAnalyzer);
    await streamAnalyzer.start();
  }

  stopAnalysis(socket) {
    const analyzer = this.activeStreams.get(socket.id);
    if (analyzer) {
      analyzer.stop();
      this.activeStreams.delete(socket.id);
    }
  }
}

class StreamAnalyzer extends EventEmitter {
  constructor(url, sourceType, liveType, channelName, socket, config) {
    super();
    this.url = url;
    this.sourceType = sourceType;
    this.liveType = liveType;
    this.channelName = channelName;
    this.socket = socket;
    this.config = config;
    this.isRunning = false;
    this.segments = [];
    this.manifests = [];
    this.lastMediaSeq = null;
    this.lastSegmentUrl = null;
    this.baseUrl = this.getBaseUrl(url);
  }

  getBaseUrl(url) {
    const lastSlashIndex = url.lastIndexOf('/');
    return url.substring(0, lastSlashIndex + 1);
  }

  getCacheKey(url) {
    return Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '_');
  }

  async fetchWithCache(url, options = {}) {
    const cacheKey = this.getCacheKey(url);
    const cacheFile = path.join(this.config.CACHE_DIR, cacheKey);

    try {
      // Try to read from cache first
      if (fs.existsSync(cacheFile)) {
        const cacheContent = fs.readFileSync(cacheFile, 'utf8');
        if (cacheContent) {
          try {
            const cachedData = JSON.parse(cacheContent);
            if (Date.now() - cachedData.timestamp < 30000) { // 30s cache validity
              console.log('Using cached data for:', url);
              return cachedData;
            }
          } catch (e) {
            console.warn('Invalid cache data for:', url);
          }
        }
      }

      // Remove cache validation headers if present
      const cleanHeaders = { ...(options.headers || { 'User-Agent': 'HLS-Analyzer/1.0' }) };
      delete cleanHeaders['If-None-Match'];
      delete cleanHeaders['If-Modified-Since'];

      console.log('Fetching fresh data for:', url);
      const startTime = performance.now();
      const response = await axios({
        method: options.method || 'get',
        url,
        responseType: options.responseType || 'text',
        headers: cleanHeaders,
        timeout: this.config.REQUEST_TIMEOUT
      });
      const endTime = performance.now();

      const result = {
        data: response.data,
        headers: response.headers,
        status: response.status,
        duration: endTime - startTime,
        timestamp: Date.now(),
        requestHeaders: cleanHeaders,
        method: options.method || 'GET',
        url: url
      };

      // Cache the result
      try {
        fs.writeFileSync(cacheFile, JSON.stringify(result), 'utf8');
        console.log('Cached data for:', url);
      } catch (e) {
        console.warn('Failed to cache data for:', url, e);
      }

      return result;
    } catch (error) {
      console.error('Error fetching data for:', url, error.message);
      if (error.response && error.response.status === 304) {
        // Load from cache file
        if (fs.existsSync(cacheFile)) {
          const cacheContent = fs.readFileSync(cacheFile, 'utf8');
          if (cacheContent) {
            try {
              const cachedData = JSON.parse(cacheContent);
              console.log('Using cached data after 304 for:', url);
              return cachedData;
            } catch (e) {
              console.warn('Invalid cache data after 304 for:', url);
            }
          }
        }
      }
      throw error;
    }
  }

  async start() {
    this.isRunning = true;
    await this.analyzeStream();
  }

  stop() {
    this.isRunning = false;
  }

  async analyzeStream() {
    while (this.isRunning) {
      try {
        console.log('Fetching manifest from:', this.url);
        const manifestResponse = await this.fetchWithCache(this.url);
        console.log('Manifest fetched successfully, size:', manifestResponse.data.length);

        // Parse the manifest
        const manifestData = this.parseManifest(manifestResponse.data);
        console.log('Manifest parsed successfully:', {
          segments: manifestData.segments?.length || 0,
          playlists: manifestData.playlists?.length || 0,
          mediaSequence: manifestData.mediaSequence
        });

        // Check if this is a master playlist
        if (manifestData.playlists) {
          console.log('Master playlist detected, found', manifestData.playlists.length, 'profiles');
          // Emit available profiles
          const profiles = manifestData.playlists.map(playlist => ({
            bandwidth: playlist.attributes.BANDWIDTH,
            resolution: playlist.attributes.RESOLUTION,
            codec: playlist.attributes.CODECS,
            url: this.resolveUrl(playlist.uri)
          }));
          this.socket.emit('profiles', profiles);
        }

        // Emit manifest data
        const manifestInfo = {
          type: 'MANIFEST',
          url: this.url,
          size: manifestResponse.headers['content-length'],
          time: new Date().toISOString(),
          headers: manifestResponse.headers,
          mediaSeq: manifestData.mediaSequence,
          disco: manifestData.discontinuity,
          manifestContent: manifestResponse.data,
          fetchedAt: new Date().toISOString()
        };
        console.log('Emitting manifest data:', manifestInfo);
        this.socket.emit('manifestData', manifestInfo);

        // Process segments
        if (manifestData.segments) {
          console.log('Processing', manifestData.segments.length, 'segments');
          for (const segment of manifestData.segments) {
            if (!this.isRunning) break;

            const segmentUrl = this.resolveUrl(segment.uri);
            console.log('Fetching segment:', segmentUrl);
            const segmentData = await this.fetchWithCache(segmentUrl);
            this.processSegment(segment, segmentData, segmentUrl);
          }
        }

        // Keep only last 20 segments
        if (this.segments.length > 20) {
          this.segments = this.segments.slice(-20);
        }

        // Wait before next manifest fetch
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        console.error('Stream analysis error:', error);
        this.socket.emit('error', { message: error.message });
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  }

  resolveUrl(uri) {
    if (uri.startsWith('http')) return uri;
    return this.baseUrl + uri;
  }

  parseManifest(manifestContent) {
    try {
      // Create a new parser instance
      const parser = new Parser();

      // Parse the manifest content
      parser.push(manifestContent);
      parser.end();

      // Get the parsed manifest
      const parsedManifest = parser.manifest;

      // Log the parsed manifest for debugging
      console.log('Parsed manifest:', {
        segments: parsedManifest.segments?.length || 0,
        playlists: parsedManifest.playlists?.length || 0,
        mediaSequence: parsedManifest.mediaSequence
      });

      return parsedManifest;
    } catch (error) {
      console.error('Error parsing manifest:', error);
      throw new Error('Failed to parse manifest: ' + error.message);
    }
  }

  processSegment(segment, segmentData, segmentUrl) {
    try {
      const isNewSegment = segmentUrl !== this.lastSegmentUrl;
      const mediaSeqJump = this.lastMediaSeq !== null &&
        segment.mediaSequence !== this.lastMediaSeq + 1;

      const segmentInfo = {
        type: 'TS',
        url: segmentUrl,
        size: segmentData.headers['content-length'],
        time: new Date().toISOString(),
        headers: segmentData.headers,
        mediaSeq: segment.mediaSequence,
        disco: segment.discontinuity,
        fetchedAt: new Date().toISOString(),
        downloadTime: segmentData.duration,
        isNewSegment,
        discoOk: !mediaSeqJump || segment.discontinuity
      };

      this.segments.push(segmentInfo);
      this.lastMediaSeq = segment.mediaSequence;
      this.lastSegmentUrl = segmentUrl;

      console.log('Emitting segment data:', segmentInfo);
      // Emit segment data
      this.socket.emit('segmentData', segmentInfo);
    } catch (error) {
      console.error('Error processing segment:', error);
      this.socket.emit('error', { message: 'Failed to process segment: ' + error.message });
    }
  }
}

module.exports = HLSController; 