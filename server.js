const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const axios = require('axios');
const diff = require('diff');
const { URL } = require('url');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Configuration
const CONFIG = {
  POLL_INTERVAL: 1000,
  MAX_MANIFESTS: 50,
  MAX_SEGMENTS: 200,
  SEGMENT_SAMPLE_SIZE: 10240, // First 10KB for comparison
  CACHE_DIR: './cache',
  REQUEST_TIMEOUT: 10000
};

// Ensure cache directory exists
if (!fs.existsSync(CONFIG.CACHE_DIR)) {
  fs.mkdirSync(CONFIG.CACHE_DIR, { recursive: true });
}

app.use(express.static('public'));
app.use(express.json());

const manifestsData = new Map();
const segmentsData = new Map();
let analysisInterval = null;
let activeAnalysisUrl = null;
let mainManifestContent = null;
let mainManifestUrl = null;

// Enhanced logger
function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${level.toUpperCase()}] ${message}`);
  io.emit('log', { timestamp, level, message });
}

// Cache management
function getCacheKey(url) {
  return Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '_');
}

async function fetchWithCache(url, options = {}) {
  const cacheKey = getCacheKey(url);
  const cacheFile = path.join(CONFIG.CACHE_DIR, cacheKey);

  try {
    // Try to read from cache first
    if (fs.existsSync(cacheFile)) {
      const cacheContent = fs.readFileSync(cacheFile, 'utf8');
      if (cacheContent) {
        try {
          const cachedData = JSON.parse(cacheContent);
          if (Date.now() - cachedData.timestamp < 30000) { // 30s cache validity
            return cachedData;
          }
        } catch (e) {
          // Invalid cache, ignore and fetch fresh
        }
      }
    }

    // Remove cache validation headers if present
    const cleanHeaders = { ...(options.headers || { 'User-Agent': 'MyCustomAgent/1.0' }) };
    delete cleanHeaders['If-None-Match'];
    delete cleanHeaders['If-Modified-Since'];

    // Fetch fresh data
    const startTime = Date.now();
    const response = await axios({
      method: options.method || 'get',
      url,
      responseType: options.responseType || 'text',
      headers: cleanHeaders,
      timeout: CONFIG.REQUEST_TIMEOUT
    });

    io.emit('manifest-details', {
      request: {
        url,
        method: options.method || 'GET',
        headers: options.headers || { 'User-Agent': 'MyCustomAgent/1.0' }
      },
      response: {
        status: response.status,
        headers: response.headers,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        remoteAddress: response.request?.socket?.remoteAddress || ''
      }
    });

    const result = {
      data: response.data,
      headers: response.headers,
      responseHeaders: response.headers, // always include this!
      status: response.status,
      duration: Date.now() - startTime,
      timestamp: Date.now(),
      requestHeaders: cleanHeaders, // or options.headers
      method: options.method || 'GET',
      url: url,
      remoteAddress: response.request?.socket?.remoteAddress || '',
      responseType: options.responseType || 'text'
    };

    // Cache the result
    fs.writeFileSync(cacheFile, JSON.stringify(result), 'utf8');

    return result;
  } catch (error) {
    if (error.response && error.response.status === 304) {
      // Load from your cache file
      if (fs.existsSync(cacheFile)) {
        const cacheContent = fs.readFileSync(cacheFile, 'utf8');
        if (cacheContent) {
          try {
            const cachedData = JSON.parse(cacheContent);
            return cachedData;
          } catch (e) {
            // Invalid cache, throw error
          }
        }
      }
    }
    log(`Failed to fetch ${url}: ${error.message}`, 'error');
    throw error;
  }
}

async function analyzeManifest(url, visited = new Set(), depth = 0, parentUrl = null, requestHeadersIn = { 'User-Agent': 'MyCustomAgent/1.0' }) {
  try {
    // Fetch the manifest
    const {
      data: content,
      headers,
      responseHeaders,
      duration,
      status,
      method,
      requestHeaders,
      remoteAddress
    } = await fetchWithCache(url, { headers: requestHeadersIn });

    // Parse manifest for media sequence and discontinuity positions
    let mediaSequence = null;
    const discoIndexes = [];
    const lines = content.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('#EXT-X-MEDIA-SEQUENCE')) {
        // Extract the exact value
        const parts = trimmed.split(':');
        if (parts.length > 1) {
          mediaSequence = parseInt(parts[1]);
        }
      }
      if (trimmed.startsWith('#EXT-X-DISCONTINUITY')) {
        // Record the line index of each discontinuity
        discoIndexes.push(idx);
      }
    });

    // Only emit if this is the main manifest (depth 0)
    if (depth === 0) {
      const manifestInfo = {
        url,
        parentUrl,
        size: content.length,
        downloadTimeMs: duration,
        status,
        method,
        requestHeaders: requestHeaders || {},
        responseHeaders: responseHeaders || headers || {},
        remoteAddress,
        depth,
        timestamp: new Date().toISOString(),
        mediaSequence,
        disco: discoIndexes.length > 0,
        manifestLines: lines // <-- Add this line
      };
      log(`Emitting manifest: ${JSON.stringify(manifestInfo, null, 2)}`);
      io.emit('manifest', manifestInfo);
    }

    // Do NOT process variants or segments
    // (Remove or comment out any code that parses and recurses into variants)

  } catch (error) {
    log(`Manifest analysis failed for ${url}: ${error.message}`, 'error');
    io.emit('error', {
      type: 'manifest',
      url,
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
  }
}

async function analyzeSegments(segments, headers) {
  const analysisResults = await Promise.allSettled(
    segments.map(segment => processSegment(segment, headers))
  );

  // Report failed segments
  analysisResults.forEach(result => {
    if (result.status === 'rejected') {
      log(`Segment analysis failed: ${result.reason.message}`, 'warn');
    }
  });
}

async function processSegment(segment, headers) {
  const { url, manifestUrl } = segment;
  try {
    // Pass headers to fetchWithCache for HEAD request
    const headResult = await fetchWithCache(url, { method: 'head', headers });

    // Emit segment details for UI
    io.emit('segment-details', {
      request: {
        url,
        method: 'HEAD',
        headers: headers
      },
      response: {
        status: headResult.status,
        headers: headResult.headers,
        duration: headResult.duration,
        timestamp: new Date().toISOString()
      }
    });

    const segmentInfo = {
      url,
      manifestUrl,
      headers: headResult.headers,
      headTimeMs: headResult.duration,
      available: true,
      timestamp: new Date().toISOString()
    };
    io.emit('segment-headers', segmentInfo);

    // Check if we need full analysis
    const oldData = segmentsData.get(url);
    const contentLength = parseInt(headResult.headers['content-length']) || 0;
    const lastModified = headResult.headers['last-modified'];

    if (!oldData || oldData.size !== contentLength || oldData.lastModified !== lastModified) {
      // Download segment sample
      const rangeEnd = Math.min(CONFIG.SEGMENT_SAMPLE_SIZE, contentLength - 1);
      const rangeHeader = contentLength > 0 ? `bytes=0-${rangeEnd}` : 'bytes=0-*';
      // Merge Range header with existing headers
      const sampleHeaders = { ...headers, Range: rangeHeader };

      const { data, headers: sampleRespHeaders, duration } = await fetchWithCache(url, {
        headers: sampleHeaders,
        responseType: 'arraybuffer'
      });

      const segmentData = {
        url,
        manifestUrl,
        size: contentLength,
        sampleSize: data.byteLength,
        headers: sampleRespHeaders,
        downloadTimeMs: duration,
        lastModified,
        timestamp: Date.now()
      };

      // Compare with previous version
      if (oldData) {
        const sizeDiff = contentLength - oldData.size;
        const downloadDiff = duration - oldData.downloadTimeMs;

        io.emit('segment-update', {
          url,
          changes: {
            size: sizeDiff,
            downloadTime: downloadDiff,
            headers: diff.diffJson(
              JSON.stringify(oldData.headers, null, 2),
              JSON.stringify(sampleRespHeaders, null, 2)
            )
          },
          previous: oldData,
          current: segmentData
        });
      } else {
        io.emit('segment-new', segmentData);
      }

      segmentsData.set(url, segmentData);
    }
  } catch (error) {
    io.emit('segment-error', {
      url,
      manifestUrl,
      error: error.message,
      timestamp: new Date().toISOString()
    });
    throw error;
  }
}

// API Endpoints
app.post('/analyze/start', async (req, res) => {
  log(`Received /analyze/start with body: ${JSON.stringify(req.body)}`);
  const url = req.body.manifestUrl || req.body.playerUrl;
  const customHeaders = req.body.headers || { 'User-Agent': 'MyCustomAgent/1.0' };

  if (!url) {
    return res.status(400).json({
      error: 'Missing URL parameter',
      hint: 'Use either "manifestUrl" or "playerUrl"',
      receivedBody: req.body
    });
  }

  try {
    new URL(url);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid URL format' });
  }

  if (!url.includes('.m3u8')) {
    return res.status(400).json({ error: 'URL must contain ".m3u8" to be a manifest' });
  }

  // Prevent multiple analyses (optional: you can remove this if you want to allow multiple one-time analyses)
  if (analysisInterval) {
    clearInterval(analysisInterval);
    analysisInterval = null;
    activeAnalysisUrl = null;
  }

  activeAnalysisUrl = url;
  log(`Starting one-time analysis for ${url}`);

  // Run analyzeManifest only once
  try {
    await analyzeManifest(url, new Set(), 0, null, customHeaders);
    res.json({
      status: 'completed',
      manifestUrl: url,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    log(`Analysis error: ${err.message}`, 'error');
    res.status(500).json({ error: err.message });
  }
});

// Store the polling interval ID so you can stop it later if needed
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  log(`Server running on port ${PORT}`);
  log(`Cache directory: ${path.resolve(CONFIG.CACHE_DIR)}`);
});
