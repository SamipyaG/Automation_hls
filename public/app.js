document.addEventListener('DOMContentLoaded', () => {
  const connectionStatus = document.getElementById('connectionStatus');

  // Initialize socket connection
  const socket = io({
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });

  // Connection status handling
  socket.on('connect', () => {
    console.log('Socket connected with ID:', socket.id);
    connectionStatus.innerHTML = '<i class="fas fa-wifi"></i> Connected';
    connectionStatus.style.color = '#4CAF50';
    document.body.classList.add('connected');
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
    connectionStatus.innerHTML = '<i class="fas fa-wifi-slash"></i> Disconnected';
    connectionStatus.style.color = '#f44336';
    document.body.classList.remove('connected');
  });

  socket.on('connect_error', (error) => {
    console.error('Socket connection error:', error);
    connectionStatus.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Connection Error';
    connectionStatus.style.color = '#f44336';
    document.body.classList.remove('connected');
  });

  socket.on('connectionStatus', (status) => {
    console.log('Connection status:', status);
    connectionStatus.innerHTML = `<i class="fas fa-wifi"></i> Connected (${status.id})`;
    connectionStatus.style.color = '#4CAF50';
  });

  // Check server status
  fetch('/api/status')
    .then(response => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return response.json();
    })
    .then(data => {
      console.log('✅ Server status:', data);
    })
    .catch(error => {
      console.error('❌ Server status check failed:', error);
      connectionStatus.innerHTML = '<i class="fas fa-server"></i> Server Error: ' + error.message;
      connectionStatus.style.color = '#e74c3c';
    });

  const startBtn = document.getElementById('startBtn');
  const stopBtn = document.getElementById('stopBtn');
  const sourceTypeSelect = document.getElementById('sourceType');
  const liveTypeSelect = document.getElementById('liveType');
  const channelNameInput = document.getElementById('channelNameInput');
  const playerUrlInput = document.getElementById('playerUrlInput');
  const manifestTableBody = document.getElementById('manifestTableBody');
  const segmentTableBody = document.getElementById('segmentTableBody');
  const manifestCount = document.getElementById('manifestCount');
  const segmentCount = document.getElementById('segmentCount');
  const videoPlayer = document.getElementById('hls-video');
  const manifestStatusIndicator = document.getElementById('manifestStatusIndicator');

  // Verify DOM elements
  console.log('DOM Elements:', {
    startBtn: !!startBtn,
    stopBtn: !!stopBtn,
    manifestTableBody: !!manifestTableBody,
    segmentTableBody: !!segmentTableBody,
    manifestCount: !!manifestCount,
    segmentCount: !!segmentCount,
    videoPlayer: !!videoPlayer,
    connectionStatus: !!connectionStatus,
    manifestStatusIndicator: !!manifestStatusIndicator
  });

  let manifestCountValue = 0;
  let segmentCountValue = 0;
  let hls = null;
  let currentUrl = null;

  // Initialize HLS.js
  if (Hls.isSupported()) {
    console.log('HLS.js is supported');
    hls = new Hls({
      debug: true,
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 90
    });
    hls.attachMedia(videoPlayer);

    // Add HLS.js event listeners
    hls.on(Hls.Events.ERROR, (event, data) => {
      console.error('HLS.js error:', data);
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.log('Fatal network error, trying to recover...');
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.log('Fatal media error, trying to recover...');
            hls.recoverMediaError();
            break;
          default:
            console.log('Fatal error, cannot recover');
            hls.destroy();
            break;
        }
      }
    });
  } else {
    console.warn('HLS.js is not supported');
  }

  function formatSize(size) {
    if (!size) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = parseInt(size);
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }
    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }

  function formatTime(time) {
    if (!time) return '-';
    return new Date(time).toLocaleTimeString();
  }

  function createHeaderButton(headers) {
    const button = document.createElement('button');
    button.className = 'expand-btn';
    button.innerHTML = '<i class="fas fa-eye"></i> Show Headers';
    button.onclick = (e) => {
      e.stopPropagation();

      // Remove any existing modals
      const existingModal = document.querySelector('.header-details.visible');
      if (existingModal) {
        existingModal.remove();
      }

      // Create beautiful modal structure
      const modal = document.createElement('div');
      modal.className = 'header-details visible';

      // Create modal header
      const modalHeader = document.createElement('div');
      modalHeader.className = 'header-details-header';

      const modalTitle = document.createElement('h3');
      modalTitle.className = 'header-details-title';
      modalTitle.innerHTML = '<i class="fas fa-headers"></i> HTTP Headers';

      const closeButton = document.createElement('button');
      closeButton.className = 'header-details-close';
      closeButton.innerHTML = '<i class="fas fa-times"></i>';
      closeButton.onclick = () => modal.remove();

      modalHeader.appendChild(modalTitle);
      modalHeader.appendChild(closeButton);

      // Create modal content
      const modalContent = document.createElement('div');
      modalContent.className = 'header-details-content';

      // Create formatted headers display with request URL highlighted
      let headersText = '';

      // Show request URL prominently if available
      if (headers['request-url']) {
        headersText += `🔗 REQUEST URL:\n`;
        headersText += `${headers['request-url']}\n`;
        headersText += '─'.repeat(80) + '\n\n';
      }

      // Add all other headers with beautiful formatting
      Object.entries(headers).forEach(([key, value]) => {
        if (key !== 'request-url') { // Skip request-url as it's already shown above
          headersText += `📋 ${key.toUpperCase()}:\n`;
          headersText += `${value}\n\n`;
        }
      });

      modalContent.textContent = headersText;

      modal.appendChild(modalHeader);
      modal.appendChild(modalContent);
      document.body.appendChild(modal);

      // Add click outside to close
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });

      // Add escape key to close
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          modal.remove();
          document.removeEventListener('keydown', handleEscape);
        }
      };
      document.addEventListener('keydown', handleEscape);
    };
    return button;
  }

  function createManifestButton(content) {
    const button = document.createElement('button');
    button.className = 'expand-btn';
    button.innerHTML = '<i class="fas fa-file-code"></i> Show Manifest';
    button.onclick = (e) => {
      e.stopPropagation();

      // Remove any existing modals
      const existingModal = document.querySelector('.manifest-details.visible');
      if (existingModal) {
        existingModal.remove();
      }

      // Create beautiful modal structure
      const modal = document.createElement('div');
      modal.className = 'manifest-details visible';

      // Create modal header
      const modalHeader = document.createElement('div');
      modalHeader.className = 'header-details-header';

      const modalTitle = document.createElement('h3');
      modalTitle.className = 'header-details-title';
      modalTitle.innerHTML = '<i class="fas fa-file-code"></i> HLS Manifest Content';

      const closeButton = document.createElement('button');
      closeButton.className = 'header-details-close';
      closeButton.innerHTML = '<i class="fas fa-times"></i>';
      closeButton.onclick = () => modal.remove();

      modalHeader.appendChild(modalTitle);
      modalHeader.appendChild(closeButton);

      // Create modal content
      const modalContent = document.createElement('div');
      modalContent.className = 'manifest-details-content';
      modalContent.textContent = content;

      modal.appendChild(modalHeader);
      modal.appendChild(modalContent);
      document.body.appendChild(modal);

      // Add click outside to close
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.remove();
        }
      });

      // Add escape key to close
      const handleEscape = (e) => {
        if (e.key === 'Escape') {
          modal.remove();
          document.removeEventListener('keydown', handleEscape);
        }
      };
      document.addEventListener('keydown', handleEscape);
    };
    return button;
  }

  function updateCounters() {
    manifestCount.textContent = `Manifests: ${manifestCountValue}`;
    segmentCount.textContent = `Segments: ${segmentCountValue}`;
  }

  function createProfileSelector(profiles) {
    const container = document.createElement('div');
    container.className = 'profile-selector';

    const label = document.createElement('label');
    label.textContent = 'Select Profile:';
    container.appendChild(label);

    const select = document.createElement('select');
    select.id = 'profileSelect';

    // Add a default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = '-- Select a profile --';
    select.appendChild(defaultOption);

    profiles.forEach((profile, index) => {
      const option = document.createElement('option');
      option.value = profile.uri;
      const resolution = profile.resolution ? `${profile.resolution.width}x${profile.resolution.height}` : 'Unknown';
      const bandwidth = profile.bandwidth ? formatBandwidth(profile.bandwidth) : 'Unknown';
      option.textContent = `${resolution} (${bandwidth})`;
      select.appendChild(option);
    });

    select.onchange = () => {
      const selectedUri = select.value;
      if (selectedUri) {
        console.log('🎯 User selected profile:', selectedUri);
        socket.emit('select-profile', { profileUri: selectedUri });

        // Don't update video player here - let the backend handle the full URL resolution
        // The backend will emit the proper manifest data with the full resolved URL
      }
    };

    container.appendChild(select);
    return container;
  }

  function formatBandwidth(bandwidth) {
    if (!bandwidth) return 'Unknown';
    if (bandwidth >= 1000000) {
      return `${(bandwidth / 1000000).toFixed(1)} Mbps`;
    } else if (bandwidth >= 1000) {
      return `${(bandwidth / 1000).toFixed(1)} Kbps`;
    } else {
      return `${bandwidth} bps`;
    }
  }

  // Socket event handlers
  socket.on('manifest-update', (data) => {
    console.log('📋 Received manifest-update event:', data);
    if (!data) {
      console.error('❌ Received empty manifest data');
      return;
    }

    console.log('✅ Processing manifest for:', data.url);
    console.log('📊 Manifest details:', {
      type: data.type,
      isNew: data.isNew,
      mediaSequence: data.mediaSequence,
      timestamp: data.timestamp,
      url: data.url.split('/').pop()
    });

    // Only increment counter for new manifests, but always update table
    if (data.isNew !== false) {
      manifestCountValue++;
    }

    addToManifestTable(data);
    updateCounters();

    // 🔥 NEW: Always update manifest table for continuous monitoring
    if (manifestStatusIndicator) {
      const now = new Date().toLocaleTimeString();
      manifestStatusIndicator.textContent = `🔄 Live (${now})`;
      manifestStatusIndicator.classList.remove('inactive');
      manifestStatusIndicator.classList.add('active');
    }

    // Update video player if this is a variant manifest (selected profile)
    if (data.type === 'variant' && hls) {
      console.log('🎥 Updating video player with selected profile:', data.url);
      currentUrl = data.url;
      hls.loadSource(data.url);
    }
  });

  // Add a catch-all event logger for debugging
  socket.onAny((event, ...args) => {
    console.log(`[SOCKET DEBUG] Event: ${event}`, ...args);
  });

  // Track if any segments have been received
  let segmentReceived = false;

  socket.on('new-segment', (data) => {
    segmentReceived = true;
    console.log('🎬 Received new-segment event:', data);
    if (!data) {
      console.error('❌ Received empty segment data');
      return;
    }

    console.log('✅ Processing segment for:', data.url);
    segmentCountValue++;
    addToSegmentTable(data);
    updateCounters();

    // 🔥 NEW: Log segment info like developer tools
    console.log(`📊 Segment #${data.sequence}: ${formatSize(data.size)} | Download: ${data.downloadTime}ms`);
  });

  socket.on('profiles-available', (profiles) => {
    console.log('📋 Received available profiles:', profiles);
    const profileSelector = createProfileSelector(profiles);
    const rightPanel = document.querySelector('.right-panel section');
    const existingSelector = rightPanel.querySelector('.profile-selector');
    if (existingSelector) {
      existingSelector.remove();
    }
    rightPanel.insertBefore(profileSelector, videoPlayer);
  });

  socket.on('profile-selected', (data) => {
    console.log('✅ Profile selected:', data);
    startBtn.disabled = true;
    stopBtn.disabled = false;
  });

  socket.on('monitor-started', (data) => {
    console.log('✅ Monitor started:', data);
    startBtn.disabled = true;
    stopBtn.disabled = false;

    // 🔥 NEW: Set manifest status indicator to active
    if (manifestStatusIndicator) {
      const now = new Date().toLocaleTimeString();
      manifestStatusIndicator.textContent = `🔄 Live (${now})`;
      manifestStatusIndicator.classList.remove('inactive');
      manifestStatusIndicator.classList.add('active');
    }
  });

  socket.on('monitor-stopped', (data) => {
    console.log('🛑 Monitor stopped:', data);
    startBtn.disabled = false;
    stopBtn.disabled = true;

    // 🔥 NEW: Set manifest status indicator to inactive
    if (manifestStatusIndicator) {
      manifestStatusIndicator.textContent = '⏸️ Stopped';
      manifestStatusIndicator.classList.add('inactive');
      manifestStatusIndicator.classList.remove('active');
    }
  });

  socket.on('error', (error) => {
    console.error('❌ Server error:', error);
    alert(`Error: ${error.message}`);
  });

  // Button event handlers with validation
  startBtn.addEventListener('click', () => {
    if (!socket.connected) {
      alert('Not connected to server. Please refresh the page and try again.');
      return;
    }

    const playerUrl = playerUrlInput.value.trim();
    if (!playerUrl) {
      alert('Please enter a valid HLS URL');
      return;
    }

    console.log('🚀 Starting analysis with:', {
      playerUrl,
      sourceType: sourceTypeSelect.value,
      liveType: liveTypeSelect.value,
      channelName: channelNameInput.value.trim()
    });

    // Clear existing data
    manifestCountValue = 0;
    segmentCountValue = 0;
    manifestTableBody.innerHTML = '';
    segmentTableBody.innerHTML = '';
    updateCounters();

    // 🔥 NEW: Reset manifest status indicator
    if (manifestStatusIndicator) {
      manifestStatusIndicator.textContent = '⏳ Starting...';
      manifestStatusIndicator.classList.remove('inactive');
      manifestStatusIndicator.classList.add('active');
    }

    // Emit start monitor event
    socket.emit('start-monitor', {
      playerUrl,
      sourceType: sourceTypeSelect.value,
      liveType: liveTypeSelect.value,
      channelName: channelNameInput.value.trim()
    });

    startBtn.disabled = true;
    stopBtn.disabled = false;

    // Start video playback
    if (hls) {
      currentUrl = playerUrl;
      hls.loadSource(playerUrl);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('✅ HLS manifest parsed, starting playback');
        videoPlayer.play().catch(error => {
          console.error('❌ Error starting video playback:', error);
        });
      });
    }

    segmentReceived = false;

    // Show a warning if no segments are received after 5 seconds
    setTimeout(() => {
      if (!segmentReceived) {
        segmentTableBody.innerHTML = '<tr><td colspan="5" style="color:red;text-align:center;">No segments received. Check backend and profile selection.</td></tr>';
      }
    }, 5000);
  });

  stopBtn.addEventListener('click', () => {
    console.log('🛑 Stopping analysis');
    socket.emit('stop-monitor');
    startBtn.disabled = false;
    stopBtn.disabled = true;

    // 🔥 NEW: Set manifest status indicator to inactive
    if (manifestStatusIndicator) {
      manifestStatusIndicator.textContent = '⏸️ Stopped';
      manifestStatusIndicator.classList.add('inactive');
      manifestStatusIndicator.classList.remove('active');
    }

    if (hls) {
      hls.stopLoad();
      videoPlayer.pause();
    }
  });

  // Close header details when clicking outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.expand-btn')) {
      document.querySelectorAll('.header-details.visible').forEach(details => {
        details.remove();
      });
    }
  });

  // Log initial state
  console.log('Initial state:', {
    manifestTableBody: manifestTableBody,
    segmentTableBody: segmentTableBody,
    manifestCount: manifestCount,
    segmentCount: segmentCount
  });

  // Update video source when URL changes
  playerUrlInput.addEventListener('change', (e) => {
    const url = e.target.value;
    if (url) {
      if (Hls.isSupported()) {
        hls.loadSource(url);
        hls.attachMedia(videoPlayer);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          videoPlayer.play();
        });
      } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
        videoPlayer.src = url;
        videoPlayer.addEventListener('loadedmetadata', () => {
          videoPlayer.play();
        });
      }
    }
  });

  // 🔥 NEW: DevTools-style table management functions
  function addToManifestTable(data) {
    console.log('�� addToManifestTable: Appending new manifest row');
    const row = createManifestRow(data);

    // Keep only last 50 manifests (like DevTools)
    const maxManifests = 50;
    if (manifestTableBody.children.length >= maxManifests) {
      manifestTableBody.removeChild(manifestTableBody.firstChild);
    }

    manifestTableBody.appendChild(row);
    console.log(`✅ Manifest table updated. Total rows: ${manifestTableBody.children.length}`);
  }

  function addToSegmentTable(data) {
    console.log('🔍 addToSegmentTable: Appending new segment row');
    const row = createSegmentRow(data);

    // Keep only last 100 segments to prevent performance issues
    const maxSegments = 100;
    if (segmentTableBody.children.length >= maxSegments) {
      segmentTableBody.removeChild(segmentTableBody.firstChild);
    }

    segmentTableBody.appendChild(row);
    console.log(`✅ Segment table updated. Total rows: ${segmentTableBody.children.length}`);
  }

  function createManifestRow(data) {
    console.log('🔍 Creating manifest row with data:', data);
    const row = document.createElement('tr');

    // Original manifest table structure
    const cells = [
      `<i class="fas fa-file-code"></i> ${data.type.toUpperCase()}`,
      `<span class="manifest-url">${data.url.split('/').pop() || data.url}</span>`,
      formatSize(data.size),
      formatTime(data.timestamp),
      data.mediaSequence || '',
      data.discontinuity ? '✓' : '',
      formatTime(data.timestamp),
      createHeaderButton(data.headers),
      createManifestButton(data.content)
    ];

    console.log('📋 Manifest cells:', cells);

    cells.forEach((cellData, index) => {
      const cell = document.createElement('td');
      if (typeof cellData === 'string') {
        cell.innerHTML = cellData;
      } else if (cellData && typeof cellData === 'object' && cellData.nodeType) {
        cell.appendChild(cellData);
      } else {
        cell.textContent = String(cellData || '');
      }
      row.appendChild(cell);
    });

    // Add highlighting for new manifests
    row.classList.add('new-manifest');
    setTimeout(() => {
      row.classList.remove('new-manifest');
    }, 3000);

    console.log('✅ Manifest row created successfully');
    return row;
  }

  function createSegmentRow(data) {
    console.log('🔍 Creating segment row with data:', data);
    const row = document.createElement('tr');

    // Original segment table structure
    const cells = [
      `<i class="fas fa-file-video"></i> SEGMENT`,
      `<span class="segment-url">${data.url.split('/').pop() || data.url}</span>`,
      formatSize(data.size),
      formatTime(data.timestamp),
      createHeaderButton(data.headers)
    ];

    console.log('📋 Segment cells:', cells);

    cells.forEach((cellData, index) => {
      const cell = document.createElement('td');
      if (typeof cellData === 'string') {
        cell.innerHTML = cellData;
      } else if (cellData && typeof cellData === 'object' && cellData.nodeType) {
        cell.appendChild(cellData);
      } else {
        cell.textContent = String(cellData || '');
      }
      row.appendChild(cell);
    });

    // Add highlighting for new segments
    row.classList.add('new-segment');
    setTimeout(() => {
      row.classList.remove('new-segment');
    }, 3000);

    console.log('✅ Segment row created successfully');
    return row;
  }
});