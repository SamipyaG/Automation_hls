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

  // Track if any segments have been received
  let segmentReceived = false;

  // Store seen manifest keys to avoid duplicates (mediaSequence + hash)
  const seenManifestKeys = new Set();
  // Store seen segment IDs to avoid duplicates
  const seenSegmentIds = new Set();

  // Add after manifestTableBody is defined
  const waitingManifestMsg = document.createElement('div');
  waitingManifestMsg.id = 'waitingManifestMsg';
  waitingManifestMsg.style.color = 'orange';
  waitingManifestMsg.style.textAlign = 'center';
  waitingManifestMsg.style.margin = '0.5em 0';
  waitingManifestMsg.style.display = 'none';
  waitingManifestMsg.textContent = '⏳ Waiting for new manifest update...';
  manifestTableBody.parentElement.parentElement.appendChild(waitingManifestMsg);

  let manifestWaitingTimer = null;
  function resetManifestWaitingTimer() {
    if (manifestWaitingTimer) clearTimeout(manifestWaitingTimer);
    waitingManifestMsg.style.display = 'none';
    manifestWaitingTimer = setTimeout(() => {
      waitingManifestMsg.style.display = 'block';
    }, 10000); // 10 seconds
  }

  // Fast JS hash function (djb2)
  function hashString(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return hash >>> 0; // unsigned
  }

  // Listen for manifest-update events
  socket.on('manifest-update', (data) => {
    console.log('📋 Received manifest-update event:', data);
    if (!data) {
      console.error('❌ Received empty manifest data');
      return;
    }
    // Always append a new row for every manifest-update event (show every poll)
    manifestCountValue++;
    addToManifestTable(data);
    updateCounters();
    console.log(`📋 Manifest #${data.mediaSequence}: ${formatSize(data.size)} | Time: ${data.timestamp}`);
    resetManifestWaitingTimer();

    // NEW: Always update manifest table for continuous monitoring
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

  // Listen for segment-update events (not new-segment)
  socket.on('segment-update', (data) => {
    segmentReceived = true;
    console.log('🎬 Received segment-update event:', data);
    if (!data) {
      console.error('❌ Received empty segment data');
      return;
    }

    // Only append if this segment is truly new (by unique id)
    if (!seenSegmentIds.has(data.id)) {
      seenSegmentIds.add(data.id);
      segmentCountValue++;
      addToSegmentTable(data);
      updateCounters();
      console.log(`📊 Segment #${data.sequence}: ${formatSize(data.size)} | Download: ${data.downloadTime}ms`);
    } else {
      console.log('⏭️ Skipping duplicate segment row for id:', data.id);
    }
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

    // Auto-select the first profile and emit selection
    if (profiles && profiles.length > 0) {
      const firstProfile = profiles[0];
      console.log('⚡ Auto-selecting first profile:', firstProfile);
      socket.emit('select-profile', firstProfile.uri);
      // Optionally, update the selector UI
      const select = profileSelector.querySelector('select');
      if (select) select.selectedIndex = 0;
    }
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

    // NEW: Set manifest status indicator to active
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

    // NEW: Set manifest status indicator to inactive
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

    // NEW: Reset manifest status indicator
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

    // NEW: Set manifest status indicator to inactive
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

  // NEW: DevTools-style table management functions
  function addToManifestTable(data) {
    // Only keep last 20 rows
    while (manifestTableBody.children.length >= 20) {
      manifestTableBody.removeChild(manifestTableBody.firstChild);
    }
    const row = createManifestRow(data);
    manifestTableBody.appendChild(row);
  }

  function addToSegmentTable(data) {
    console.log('🔍 addToSegmentTable: Appending new segment row');
    const row = createSegmentRow(data);
    segmentTableBody.appendChild(row);
    // Optionally, scroll to bottom for new row
    segmentTableBody.parentElement.scrollTop = segmentTableBody.parentElement.scrollHeight;
  }

  let lastManifestSequence = null;
  function createManifestRow(data) {
    const row = document.createElement('tr');
    // Highlight row red for any error: statusCode >= 400, high download time, or sequence jump
    const statusCode = data.statusCode !== undefined ? data.statusCode : (data.status !== undefined ? data.status : 200);
    let errorTooltip = '';
    if (statusCode >= 400) {
      row.style.backgroundColor = '#ffcccc';
      row.style.color = '#b71c1c';
      errorTooltip = `HTTP Error: ${statusCode}`;
    }
    if (data.downloadTime !== undefined && data.downloadTime > 1000) {
      row.style.backgroundColor = '#ffcccc';
      row.style.color = '#b71c1c';
      errorTooltip = errorTooltip ? errorTooltip + ' | ' : '';
      errorTooltip += `High Download Time: ${data.downloadTime}ms`;
    }
    if (typeof data.mediaSequence === 'number') {
      if (lastManifestSequence !== null && data.mediaSequence > lastManifestSequence + 1) {
        row.style.backgroundColor = '#ffcccc';
        row.style.color = '#b71c1c';
        errorTooltip = errorTooltip ? errorTooltip + ' | ' : '';
        errorTooltip += `Sequence Jump: ${lastManifestSequence} → ${data.mediaSequence}`;
      }
      lastManifestSequence = data.mediaSequence;
    }
    if (errorTooltip) row.title = errorTooltip;
    // Updated manifest table structure (no sequence jump column)
    const discoCell = (typeof data.discontinuityCount !== 'undefined') ? `<span class="disco-count" title="Number of #EXT-X-DISCONTINUITY tags">${data.discontinuityCount}</span>` : '-';
    const mediaSeqCell = (typeof data.mediaSequence !== 'undefined' && data.mediaSequence !== null) ? data.mediaSequence : '-';
    const cells = [
      `<i class=\"fas fa-file-code\"></i> ${data.type.toUpperCase()}`,
      `<span class=\"manifest-url\">${data.url.split('/').pop() || data.url}</span>`,
      mediaSeqCell,
      discoCell,
      formatSize(data.size),
      formatTime(data.timestamp),
      formatTime(data.timestamp),
      (typeof data.downloadTime !== 'undefined' ? data.downloadTime : '-'),
      (typeof data.statusCode !== 'undefined' ? data.statusCode : (typeof data.status !== 'undefined' ? data.status : '-')),
      createHeaderButton(data.headers),
      createManifestButton(data.content)
    ];
    cells.forEach((cellData) => {
      const cell = document.createElement('td');
      if (typeof cellData === 'string' || typeof cellData === 'number') {
        cell.innerHTML = cellData;
      } else if (cellData && typeof cellData === 'object' && cellData.nodeType) {
        cell.appendChild(cellData);
      } else {
        cell.textContent = String(cellData || '');
      }
      row.appendChild(cell);
    });
    row.classList.add('new-manifest');
    setTimeout(() => {
      row.classList.remove('new-manifest');
    }, 3000);
    return row;
  }

  function createSegmentRow(data) {
    console.log('🔍 Creating segment row with data:', data);
    const row = document.createElement('tr');
    row.className = 'segment-row';
    // Highlight row red for any error: statusCode >= 400 or high download time
    const statusCode = data.statusCode !== undefined ? data.statusCode : (data.status !== undefined ? data.status : 200);
    let errorTooltip = '';
    if (statusCode >= 400) {
      row.style.backgroundColor = '#ffcccc';
      row.style.color = '#b71c1c';
      errorTooltip = `HTTP Error: ${statusCode}`;
    }
    if (data.downloadTime !== undefined && data.downloadTime > 1000) {
      row.style.backgroundColor = '#ffcccc';
      row.style.color = '#b71c1c';
      errorTooltip = errorTooltip ? errorTooltip + ' | ' : '';
      errorTooltip += `High Download Time: ${data.downloadTime}ms`;
    }
    if (errorTooltip) row.title = errorTooltip;
    // Updated segment table structure with Download Time and Status Code
    const cells = [
      '<i class="fas fa-file-video"></i> SEGMENT',
      `<span class="segment-url">${data.url.split('/').pop()}</span>`,
      formatSize(data.size),
      formatTime(data.timestamp),
      data.downloadTime !== undefined ? data.downloadTime : '-', // Download Time (ms)
      data.statusCode !== undefined ? data.statusCode : (data.status !== undefined ? data.status : '-'), // Status Code
      createHeaderButton(data.headers)
    ];

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

    return row;
  }

  // At the end of DOMContentLoaded, start the waiting timer
  resetManifestWaitingTimer();

  // --- ALARM SYSTEM ---
  // Add alarm bell icon and sidebar
  const alarmBell = document.createElement('div');
  alarmBell.id = 'alarmBell';
  alarmBell.style.position = 'fixed';
  alarmBell.style.top = '18px';
  alarmBell.style.right = '32px';
  alarmBell.style.zIndex = '9999';
  alarmBell.style.cursor = 'pointer';
  alarmBell.innerHTML = '<i class="fas fa-bell"></i><span id="alarmCount" style="background:red;color:white;border-radius:50%;padding:2px 6px;font-size:0.8em;position:absolute;top:-8px;right:-8px;display:none;">0</span>';
  document.body.appendChild(alarmBell);

  const alarmSidebar = document.createElement('div');
  alarmSidebar.id = 'alarmSidebar';
  alarmSidebar.style.position = 'fixed';
  alarmSidebar.style.top = '0';
  alarmSidebar.style.right = '-400px';
  alarmSidebar.style.width = '400px';
  alarmSidebar.style.height = '100%';
  alarmSidebar.style.background = '#222';
  alarmSidebar.style.color = '#fff';
  alarmSidebar.style.overflowY = 'auto';
  alarmSidebar.style.transition = 'right 0.3s';
  alarmSidebar.style.zIndex = '10000';
  alarmSidebar.innerHTML = '<div style="padding:1em;font-size:1.2em;border-bottom:1px solid #444;display:flex;align-items:center;justify-content:space-between;"><span><i class="fas fa-bell"></i> Alarm History</span><button id="closeAlarmSidebar" style="background:none;border:none;color:#fff;font-size:1.2em;cursor:pointer;"><i class="fas fa-times"></i></button></div><div id="alarmHistory" style="padding:1em;"></div><div style="padding:1em;border-top:1px solid #444;"><label><input type="checkbox" id="alarmSoundToggle" checked> Sound Alerts</label></div>';
  document.body.appendChild(alarmSidebar);

  document.getElementById('closeAlarmSidebar').onclick = () => {
    alarmSidebar.style.right = '-400px';
  };
  alarmBell.onclick = () => {
    alarmSidebar.style.right = alarmSidebar.style.right === '0px' ? '-400px' : '0px';
    document.getElementById('alarmCount').style.display = 'none';
    unreadAlarmCount = 0;
    updateAlarmCount();
  };

  let alarmHistory = [];
  let unreadAlarmCount = 0;
  let alarmSoundEnabled = true;
  const alarmSound = new Audio('audio/alert.mp3');
  document.getElementById('alarmSoundToggle').onchange = (e) => {
    alarmSoundEnabled = e.target.checked;
  };
  function updateAlarmCount() {
    const countSpan = document.getElementById('alarmCount');
    if (unreadAlarmCount > 0) {
      countSpan.textContent = unreadAlarmCount;
      countSpan.style.display = 'inline-block';
    } else {
      countSpan.style.display = 'none';
    }
  }
  function showAlarmToast(alarm) {
    const toast = document.createElement('div');
    toast.className = 'alarm-toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '32px';
    toast.style.right = '32px';
    toast.style.background = alarm.type === 'error' ? '#e74c3c' : '#f1c40f';
    toast.style.color = '#fff';
    toast.style.padding = '1em 1.5em';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
    toast.style.zIndex = '10001';
    toast.style.fontSize = '1em';
    toast.style.display = 'flex';
    toast.style.alignItems = 'center';
    toast.innerHTML = `<span style="font-size:1.3em;margin-right:0.7em;">${alarm.type === 'error' ? '🔥' : '⚠️'}</span><b>${alarm.title}</b><span style="margin-left:1em;">${alarm.message}</span>`;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 4000); // 4 seconds
  }
  function addAlarmToSidebar(alarm) {
    alarmHistory.unshift(alarm);
    if (alarmHistory.length > 100) alarmHistory.pop();
    const historyDiv = document.getElementById('alarmHistory');
    historyDiv.innerHTML = alarmHistory.map(a =>
      `<div style="margin-bottom:1em;padding:0.7em 0.5em;border-bottom:1px solid #444;cursor:pointer;" onclick="this.querySelector('.alarm-context').style.display = this.querySelector('.alarm-context').style.display === 'block' ? 'none' : 'block';">
        <span style="font-size:1.1em;">${a.type === 'error' ? '🔴' : '⚠️'}</span>
        <b>${a.title}</b>
        <span style="color:#aaa;font-size:0.9em;margin-left:0.5em;">[${new Date(a.timestamp).toLocaleTimeString()}]</span>
        <div style="margin-top:0.3em;">${a.message}</div>
        <div class="alarm-context" style="display:none;margin-top:0.5em;background:#333;padding:0.5em;border-radius:4px;font-size:0.95em;white-space:pre-wrap;">${JSON.stringify(a.context, null, 2)}</div>
      </div>`
    ).join('');
  }
  socket.on('alarm', (alarm) => {
    unreadAlarmCount++;
    updateAlarmCount();
    showAlarmToast(alarm);
    addAlarmToSidebar(alarm);
    if (alarmSoundEnabled) {
      alarmSound.currentTime = 0;
      alarmSound.play().catch(() => { });
    }
  });
});