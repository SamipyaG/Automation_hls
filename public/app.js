const socket = io();

const elements = {
  channelNameInput: document.getElementById('channelNameInput'),
  playerUrlInput: document.getElementById('playerUrlInput'),
  urlInput: document.getElementById('urlInput'), // (optional, if you keep it)
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  video: document.getElementById('hls-video'),
  manifestTableBody: document.getElementById('manifestTableBody'),
  segmentTableBody: document.getElementById('segmentTableBody'),
  manifestCount: document.getElementById('manifestCount'),
  segmentCount: document.getElementById('segmentCount')
};

let manifestRows = [];
let segmentRows = [];

function updateCounters() {
  if (elements.manifestCount) elements.manifestCount.textContent = `Manifests: ${manifestRows.length}`;
  if (elements.segmentCount) elements.segmentCount.textContent = `Segments: ${segmentRows.length}`;
}

function addRow(tableBody, type, url, size, time, headers, idx) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${type}</td>
    <td style="max-width:220px;word-break:break-all;">${url}</td>
    <td>${size}</td>
    <td>${time}</td>
    <td>
      <button class="expand-btn" onclick="toggleHeader('${tableBody.id}',${idx})">Show</button>
      <div id="${tableBody.id}-header-${idx}" class="header-details">${JSON.stringify(headers, null, 2)}</div>
    </td>
  `;
  tableBody.appendChild(tr);
}

function addManifestRow(
  tableBody, type, url, size, time, headers, idx,
  mediaSequence, discoIndexes, timestamp, status, method, requestHeaders, responseHeaders, manifestLines
) {
  const discoCell = (discoIndexes && discoIndexes.length > 0)
    ? '<span style="color:green;font-weight:bold;">V</span>'
    : '';
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${type}</td>
    <td style="max-width:220px;word-break:break-all;">${url}</td>
    <td>${size}</td>
    <td>${time}</td>
    <td>${mediaSequence !== undefined ? mediaSequence : ''}</td>
    <td>${discoCell}</td>
    <td>${timestamp ? new Date(timestamp).toLocaleTimeString() : ''}</td>
    <td>
      <button class="expand-btn" onclick="toggleHeader('${tableBody.id}','${idx}')">Show</button>
      <div id="${tableBody.id}-header-${idx}" class="header-details" style="display:none;">
        <b>Status:</b> ${status} <br>
        <b>Method:</b> ${method} <br>
        <b>Request Headers:</b><pre>${JSON.stringify(requestHeaders, null, 2)}</pre>
        <b>Response Headers:</b><pre>${JSON.stringify(responseHeaders, null, 2)}</pre>
        <b>Manifest Content:</b><pre>${manifestLines ? manifestLines.join('\n') : ''}</pre>
      </div>
    </td>
  `;
  tableBody.appendChild(tr);
}

function addSegmentRow(tableBody, type, url, size, time, headers, idx) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${type}</td>
    <td style="max-width:220px;word-break:break-all;">${url}</td>
    <td>${size}</td>
    <td>${time}</td>
    <td>
      <button class="expand-btn" onclick="toggleHeader('${tableBody.id}',${idx})">Show</button>
      <div id="${tableBody.id}-header-${idx}" class="header-details">${JSON.stringify(headers, null, 2)}</div>
    </td>
  `;
  tableBody.appendChild(tr);
}

window.toggleHeader = function(tableId, idx) {
  console.log(`Show button clicked for: ${tableId}-header-${idx}`); // <-- Add this line
  const el = document.getElementById(`${tableId}-header-${idx}`);
  if (el) el.classList.toggle('visible');
};

elements.startBtn.addEventListener('click', () => {
  const channelName = elements.channelNameInput.value.trim();
  const playerUrl = elements.playerUrlInput.value.trim();
  if (!channelName) return alert('Please enter a channel name.');
  if (!playerUrl) return alert('Please enter a player URL.');
  elements.startBtn.disabled = true;
  elements.stopBtn.disabled = false;
  fetch('/analyze/start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ channelName, manifestUrl: playerUrl })
  })
  .then(res => res.json())
  .then(data => { if (data.error) alert(data.error); });
  playHls(playerUrl);
});

elements.stopBtn.addEventListener('click', () => {
  elements.startBtn.disabled = false;
  elements.stopBtn.disabled = true;
  fetch('/analyze/stop', { method: 'POST' });
});

function playHls(url) {
  if (window.Hls && window.Hls.isSupported()) {
    const hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(elements.video);
  } else if (elements.video.canPlayType('application/vnd.apple.mpegurl')) {
    elements.video.src = url;
  }
}

// Socket events
// Manifest
socket.on('manifest', data => {
  // Try to find an existing row for this manifest URL
  let tr = elements.manifestTableBody.querySelector(`tr[data-url="${data.url}"]`);
  const discoCell = (data.disco ? '<span style="color:green;font-weight:bold;">V</span>' : '');
  const rowHtml = `
    <td>Manifest</td>
    <td style="max-width:220px;word-break:break-all;">${data.url}</td>
    <td>${data.size}</td>
    <td>${data.downloadTimeMs} ms</td>
    <td>${data.mediaSequence !== undefined ? data.mediaSequence : ''}</td>
    <td>${discoCell}</td>
    <td>${data.timestamp ? new Date(data.timestamp).toLocaleTimeString() : ''}</td>
    <td>
      <button class="expand-btn" onclick="toggleHeader('manifestTableBody','${data.url.replace(/[^a-zA-Z0-9]/g, '')}')">Show</button>
      <div id="manifestTableBody-header-${data.url.replace(/[^a-zA-Z0-9]/g, '')}" class="header-details">
        ${JSON.stringify(data.responseHeaders, null, 2)}
      </div>
    </td>
  `;
  if (tr) {
    tr.innerHTML = rowHtml;
  } else {
    tr = document.createElement('tr');
    tr.setAttribute('data-url', data.url);
    tr.innerHTML = rowHtml;
    elements.manifestTableBody.appendChild(tr);
  }
});

// Segment
socket.on('segment-new', data => {
  segmentRows.push(data);
  addSegmentRow(
    elements.segmentTableBody,
    'Segment',
    data.url,
    data.size,
    data.downloadTimeMs + ' ms',
    data.headers,
    segmentRows.length - 1
  );
  updateCounters();
});
socket.on('segment-update', data => {
  segmentRows.push(data.current);
  addSegmentRow(elements.segmentTableBody, 'Segment', data.current.url, data.current.size, data.current.downloadTimeMs + ' ms', data.current.headers, segmentRows.length - 1);
  updateCounters();
});
socket.on('manifest-update', data => {
  // Optionally highlight or update the manifest row
});
socket.on('segment-error', data => {
  addSegmentRow(elements.segmentTableBody, 'Error', data.url, '-', '-', { error: data.error }, segmentRows.length);
});
socket.on('error', data => {
  addSegmentRow(elements.segmentTableBody, 'Error', data.url || '', '-', '-', { error: data.error }, segmentRows.length);
});
socket.on('manifest-comparison', data => {
  // data.from, data.to, data.diff
  // You can display the diff in a table or modal as needed
  console.log(`Compared ${data.from} to ${data.to}`, data.diff);
});

// Pre-fill with test URL if in development
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  elements.urlInput.value = 'https://univ.g-mana.live/media/b8d16ae8-2f05-4062-b814-23e016fe20fb/mainManifest.m3u8';
}

function upsertManifestRow(tableBody, type, url, size, time, headers, mediaSequence, discoIndexes, timestamp) {
  // Try to find an existing row for this URL
  let tr = tableBody.querySelector(`tr[data-url="${url}"]`);
  const discoCell = (discoIndexes && discoIndexes.length > 0)
    ? '<span style="color:green;font-weight:bold;">V</span>'
    : '';
  const rowHtml = `
    <td>${type}</td>
    <td style="max-width:220px;word-break:break-all;">${url}</td>
    <td>${size}</td>
    <td>${time}</td>
    <td>${mediaSequence !== undefined ? mediaSequence : ''}</td>
    <td>${discoCell}</td>
    <td>${timestamp ? new Date(timestamp).toLocaleTimeString() : ''}</td>
    <td>
      <button class="expand-btn" onclick="toggleHeader('manifestTableBody','${url.replace(/[^a-zA-Z0-9]/g, '')}')">Show</button>
      <div id="manifestTableBody-header-${data.url.replace(/[^a-zA-Z0-9]/g, '')}" class="header-details">
        ${JSON.stringify(data.responseHeaders, null, 2)}
      </div>
    </td>
  `;
  if (tr) {
    tr.innerHTML = rowHtml;
  } else {
    tr = document.createElement('tr');
    tr.setAttribute('data-url', url);
    tr.innerHTML = rowHtml;
    tableBody.appendChild(tr);
  }
}

// New manifest event handler
socket.on('manifest', function(manifestInfo) {
  console.log('Received manifest:', manifestInfo); // For debugging

  // Clear previous rows if you want only one manifest at a time
  const tableBody = document.getElementById('manifestTableBody');
  tableBody.innerHTML = '';

  // Use sanitized URL as unique index
  const urlIdx = manifestInfo.url.replace(/[^a-zA-Z0-9]/g, '');

  // Add the manifest row
  addManifestRow(
    tableBody,
    'main',
    manifestInfo.url,
    manifestInfo.size,
    manifestInfo.downloadTimeMs + ' ms',
    manifestInfo.responseHeaders,
    urlIdx,
    manifestInfo.mediaSequence,
    manifestInfo.disco ? [1] : [],
    manifestInfo.timestamp,
    manifestInfo.status,
    manifestInfo.method,
    manifestInfo.requestHeaders,
    manifestInfo.responseHeaders,
    manifestInfo.manifestLines // <-- pass lines here
  );
});