// DocumentReader.js - PDF, Image and Office File Viewer
// Based on the pattern from LibraryScript.js

// ============================================================
// PDF VIEWER - Using Native Browser PDF Viewer
// ============================================================
function openPdfReader(pdfUrl, title = "") {
  if (!pdfUrl) {
    alert('PDF URL is missing');
    return;
  }

  const oldModal = document.getElementById("pdfModal");
  if (oldModal) oldModal.remove();
  
  let zoom = 1;
  const minZoom = 0.5;
  const maxZoom = 3;
  
  const modal = document.createElement("div");
  modal.id = "pdfModal";
  modal.style.cssText = `
    position:fixed;
    top:0;
    left:0;
    width:100%;
    height:100%;
    background:rgba(0,0,0,.85);
    z-index:99999;
    display:flex;
    flex-direction:column;
  `;
  
  // Toolbar
  const toolbar = document.createElement("div");
  toolbar.style.cssText = `
    display:flex;
    justify-content:space-between;
    align-items:center;
    padding:10px 15px;
    background:#222;
    flex-shrink:0;
  `;
  
  const titleDiv = document.createElement("div");
  titleDiv.textContent = title || 'PDF Document';
  titleDiv.style.color = "white";
  titleDiv.style.fontSize = "18px";
  titleDiv.style.overflow = "hidden";
  titleDiv.style.textOverflow = "ellipsis";
  titleDiv.style.whiteSpace = "nowrap";
  titleDiv.style.maxWidth = "50%";
  
  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.gap = "10px";
  controls.style.alignItems = "center";
  
  // Zoom level display
  const zoomLevel = document.createElement("span");
  zoomLevel.textContent = "100%";
  zoomLevel.style.color = "white";
  zoomLevel.style.fontSize = "14px";
  zoomLevel.style.minWidth = "45px";
  zoomLevel.style.textAlign = "center";
  
  const btnZoomOut = document.createElement("button");
  btnZoomOut.textContent = "−";
  btnZoomOut.title = "Zoom Out";
  
  const btnZoomIn = document.createElement("button");
  btnZoomIn.textContent = "+";
  btnZoomIn.title = "Zoom In";
  
  const btnClose = document.createElement("button");
  btnClose.textContent = "✕";
  btnClose.title = "Close";
  
  [btnZoomOut, btnZoomIn, btnClose].forEach(btn => {
    btn.style.padding = "8px 14px";
    btn.style.fontSize = "18px";
    btn.style.fontWeight = "bold";
    btn.style.cursor = "pointer";
    btn.style.border = "none";
    btn.style.borderRadius = "5px";
    btn.style.background = "#555";
    btn.style.color = "white";
    btn.style.transition = "all 0.2s ease";
  });
  
  btnZoomOut.onmouseenter = () => { btnZoomOut.style.background = "blue"; btnZoomOut.style.color = "yellow"; };
  btnZoomOut.onmouseleave = () => { btnZoomOut.style.background = "#555"; btnZoomOut.style.color = "white"; };
  btnZoomIn.onmouseenter = () => { btnZoomIn.style.background = "green"; btnZoomIn.style.color = "yellow"; };
  btnZoomIn.onmouseleave = () => { btnZoomIn.style.background = "#555"; btnZoomIn.style.color = "white"; };
  btnClose.onmouseenter = () => { btnClose.style.background = "red"; btnClose.style.color = "yellow"; };
  btnClose.onmouseleave = () => { btnClose.style.background = "#555"; btnClose.style.color = "white"; };
  
  btnClose.onclick = () => modal.remove();
  
  // Container for the viewer
  const container = document.createElement("div");
  container.style.cssText = `
    flex: 1;
    overflow: auto;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 20px;
    background: #1a1a2e;
  `;
  
  // Wrapper for the PDF
  const wrapper = document.createElement("div");
  wrapper.style.cssText = `
    width: 100%;
    max-width: 900px;
    height: 85vh;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3);
    transition: width 0.2s ease;
  `;
  
  // Fix Cloudinary URL for PDF
  let displayUrl = pdfUrl;
  if (pdfUrl.includes('/image/upload/')) {
    displayUrl = pdfUrl.replace('/image/upload/', '/raw/upload/');
  }
  
  // Use <object> tag for native PDF rendering (no external APIs)
  const pdfObject = document.createElement("object");
  pdfObject.data = displayUrl;
  pdfObject.type = "application/pdf";
  pdfObject.style.cssText = `
    width: 100%;
    height: 100%;
    display: block;
  `;
  
  // Fallback content if PDF can't be rendered
  pdfObject.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:40px;text-align:center;background:#f8f9fa;">
      <i class="fas fa-file-pdf" style="font-size:4rem;color:#dc3545;margin-bottom:20px;"></i>
      <h3 style="color:#1a1a2e;margin-bottom:10px;">PDF Preview Unavailable</h3>
      <p style="color:#6c757d;margin-bottom:20px;">Your browser cannot display this PDF directly.</p>
      <div style="display:flex;gap:15px;flex-wrap:wrap;justify-content:center;">
        <a href="${displayUrl}" target="_blank" style="padding:12px 28px;background:#4a9eff;color:white;border-radius:8px;text-decoration:none;font-weight:500;">
          <i class="fas fa-external-link-alt"></i> Open in New Tab
        </a>
        <a href="${displayUrl}" download style="padding:12px 28px;background:#28a745;color:white;border-radius:8px;text-decoration:none;font-weight:500;">
          <i class="fas fa-download"></i> Download
        </a>
      </div>
    </div>
  `;
  
  wrapper.appendChild(pdfObject);
  container.appendChild(wrapper);
  
  // Zoom functions
  function updateZoom() {
    const percent = Math.round(zoom * 100);
    wrapper.style.transform = `scale(${zoom})`;
    wrapper.style.transformOrigin = "top center";
    zoomLevel.textContent = percent + '%';
    
    // Adjust wrapper width when zoomed
    if (zoom > 1) {
      wrapper.style.width = (100 / zoom) + '%';
    } else {
      wrapper.style.width = '100%';
    }
  }
  
  btnZoomIn.onclick = () => {
    if (zoom < maxZoom) {
      zoom = Math.min(zoom + 0.1, maxZoom);
      updateZoom();
    }
  };
  
  btnZoomOut.onclick = () => {
    if (zoom > minZoom) {
      zoom = Math.max(zoom - 0.1, minZoom);
      updateZoom();
    }
  };
  
  // Mouse wheel zoom
  container.addEventListener('wheel', function(e) {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        zoom = Math.min(zoom + 0.1, maxZoom);
      } else {
        zoom = Math.max(zoom - 0.1, minZoom);
      }
      updateZoom();
    }
  }, { passive: false });
  
  // Keyboard shortcuts
  const keyHandler = function(e) {
    if (!document.getElementById('pdfModal')) {
      document.removeEventListener('keydown', keyHandler);
      return;
    }
    if (e.key === 'Escape') {
      modal.remove();
    }
    if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      zoom = Math.min(zoom + 0.1, maxZoom);
      updateZoom();
    }
    if (e.key === '-') {
      e.preventDefault();
      zoom = Math.max(zoom - 0.1, minZoom);
      updateZoom();
    }
    if (e.key === '0') {
      e.preventDefault();
      zoom = 1;
      updateZoom();
    }
  };
  document.addEventListener('keydown', keyHandler);
  
  controls.append(zoomLevel, btnZoomOut, btnZoomIn, btnClose);
  toolbar.append(titleDiv, controls);
  modal.append(toolbar, container);
  document.body.appendChild(modal);
  
  // Initial zoom update
  setTimeout(updateZoom, 100);
}

// ============================================================
// IMAGE VIEWER - Full Screen with Zoom and Pan
// ============================================================
function showPictureViewer(imageUrl, imageTitle = "") {
  if (!imageUrl) {
    alert('Image URL is missing');
    return;
  }

  const oldViewer = document.getElementById("pictureViewer");
  if (oldViewer) oldViewer.remove();
  
  let zoom = 1;
  const minZoom = 0.5;
  const maxZoom = 5;
  
  const overlay = document.createElement("div");
  overlay.id = "pictureViewer";
  overlay.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background: rgba(0,0,0,0.92);
    z-index: 99999;
    display: flex;
    flex-direction: column;
  `;
  
  // Toolbar
  const toolbar = document.createElement("div");
  toolbar.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: rgba(0,0,0,0.7);
    flex-shrink: 0;
    min-height: 56px;
  `;
  
  const title = document.createElement("div");
  title.textContent = imageTitle || 'Image Viewer';
  title.style.cssText = `
    color: white;
    font-size: 16px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 40%;
  `;
  
  const controls = document.createElement("div");
  controls.style.display = "flex";
  controls.style.gap = "8px";
  controls.style.alignItems = "center";
  
  const zoomLevel = document.createElement("span");
  zoomLevel.style.cssText = `
    color: white;
    font-size: 14px;
    min-width: 50px;
    text-align: center;
    font-weight: 500;
  `;
  zoomLevel.textContent = "100%";
  
  const btnZoomOut = document.createElement("button");
  btnZoomOut.textContent = "−";
  btnZoomOut.title = "Zoom Out";
  
  const btnZoomIn = document.createElement("button");
  btnZoomIn.textContent = "+";
  btnZoomIn.title = "Zoom In";
  
  const btnReset = document.createElement("button");
  btnReset.textContent = "⟲";
  btnReset.title = "Reset Zoom";
  
  const btnClose = document.createElement("button");
  btnClose.textContent = "✕";
  btnClose.title = "Close";
  
  [btnZoomIn, btnZoomOut, btnReset, btnClose].forEach(btn => {
    btn.style.cssText = `
      padding: 8px 14px;
      font-size: 18px;
      cursor: pointer;
      border: none;
      border-radius: 6px;
      background: rgba(255,255,255,0.15);
      color: white;
      transition: all 0.2s ease;
      font-weight: bold;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
  });
  
  btnZoomIn.onmouseenter = () => { btnZoomIn.style.background = "rgba(40,167,69,0.8)"; };
  btnZoomIn.onmouseleave = () => { btnZoomIn.style.background = "rgba(255,255,255,0.15)"; };
  btnZoomOut.onmouseenter = () => { btnZoomOut.style.background = "rgba(0,123,255,0.8)"; };
  btnZoomOut.onmouseleave = () => { btnZoomOut.style.background = "rgba(255,255,255,0.15)"; };
  btnReset.onmouseenter = () => { btnReset.style.background = "rgba(255,193,7,0.8)"; };
  btnReset.onmouseleave = () => { btnReset.style.background = "rgba(255,255,255,0.15)"; };
  btnClose.onmouseenter = () => { btnClose.style.background = "rgba(220,53,69,0.8)"; };
  btnClose.onmouseleave = () => { btnClose.style.background = "rgba(255,255,255,0.15)"; };
  
  const imageContainer = document.createElement("div");
  imageContainer.style.cssText = `
    flex: 1;
    overflow: auto;
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 20px;
    background: #000;
    cursor: default;
  `;
  
  const img = document.createElement("img");
  img.src = imageUrl;
  img.style.cssText = `
    max-width: 100%;
    max-height: 100%;
    height: auto;
    width: auto;
    transform-origin: center center;
    transition: transform 0.15s ease;
    border-radius: 4px;
    box-shadow: 0 4px 30px rgba(0,0,0,0.3);
    object-fit: contain;
    display: block;
  `;
  
  img.onload = function() {
    updateZoom();
  };
  
  function updateZoom() {
    const percent = Math.round(zoom * 100);
    img.style.transform = `scale(${zoom})`;
    zoomLevel.textContent = percent + '%';
    
    if (zoom > 1) {
      imageContainer.style.cursor = 'grab';
    } else {
      imageContainer.style.cursor = 'default';
    }
  }
  
  function zoomIn() {
    zoom = Math.min(zoom + 0.25, maxZoom);
    updateZoom();
  }
  
  function zoomOut() {
    zoom = Math.max(zoom - 0.25, minZoom);
    updateZoom();
  }
  
  function resetZoom() {
    zoom = 1;
    updateZoom();
    imageContainer.scrollTop = 0;
    imageContainer.scrollLeft = 0;
  }
  
  btnZoomIn.onclick = zoomIn;
  btnZoomOut.onclick = zoomOut;
  btnReset.onclick = resetZoom;
  btnClose.onclick = () => overlay.remove();
    
  // Drag to pan when zoomed
  let isDragging = false;
  let startX, startY, scrollLeft, scrollTop;
  
  imageContainer.addEventListener('mousedown', function(e) {
    if (zoom > 1) {
      isDragging = true;
      startX = e.pageX - this.offsetLeft;
      startY = e.pageY - this.offsetTop;
      scrollLeft = this.scrollLeft;
      scrollTop = this.scrollTop;
      this.style.cursor = 'grabbing';
    }
  });
  
  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - imageContainer.offsetLeft;
    const y = e.pageY - imageContainer.offsetTop;
    imageContainer.scrollLeft = scrollLeft - (x - startX);
    imageContainer.scrollTop = scrollTop - (y - startY);
  });
  
  document.addEventListener('mouseup', function() {
    if (isDragging) {
      isDragging = false;
      imageContainer.style.cursor = zoom > 1 ? 'grab' : 'default';
    }
  });
  
  // Keyboard shortcuts
  const keyHandler = function(e) {
    if (!document.getElementById('pictureViewer')) {
      document.removeEventListener('keydown', keyHandler);
      return;
    }
    switch(e.key) {
      case 'Escape': overlay.remove(); break;
      case '+':
      case '=': e.preventDefault(); zoomIn(); break;
      case '-': e.preventDefault(); zoomOut(); break;
      case '0': e.preventDefault(); resetZoom(); break;
    }
  };
  document.addEventListener('keydown', keyHandler);
  
  controls.appendChild(zoomLevel);
  controls.appendChild(btnZoomOut);
  controls.appendChild(btnZoomIn);
  controls.appendChild(btnReset);
  controls.appendChild(btnClose);
  toolbar.appendChild(title);
  toolbar.appendChild(controls);
  imageContainer.appendChild(img);
  overlay.appendChild(toolbar);
  overlay.appendChild(imageContainer);
  document.body.appendChild(overlay);
  
  overlay.setAttribute('tabindex', '0');
  overlay.focus();
}

// ============================================================
// OFFICE FILE VIEWER - Using Microsoft Office Online
// ============================================================
function openOfficeFile(fileUrl, title = "") {
  const oldModal = document.getElementById("officeModal");
  if (oldModal) oldModal.remove();
  
  const modal = document.createElement("div");
  modal.id = "officeModal";
  modal.style.cssText = `
    position:fixed;
    top:0;
    left:0;
    width:100%;
    height:100%;
    background:rgba(0,0,0,.85);
    z-index:99999;
    display:flex;
    flex-direction:column;
  `;
  
  const toolbar = document.createElement("div");
  toolbar.style.cssText = `
    display:flex;
    justify-content:space-between;
    align-items:center;
    padding:10px 15px;
    background:#222;
    flex-shrink:0;
  `;
  
  const titleDiv = document.createElement("div");
  titleDiv.textContent = title || 'Office Document';
  titleDiv.style.color = "white";
  titleDiv.style.fontSize = "18px";
  titleDiv.style.overflow = "hidden";
  titleDiv.style.textOverflow = "ellipsis";
  titleDiv.style.whiteSpace = "nowrap";
  titleDiv.style.maxWidth = "50%";
  
  const btnClose = document.createElement("button");
  btnClose.textContent = "✕";
  btnClose.style.cssText = `
    padding:8px 14px;
    font-size:18px;
    font-weight:bold;
    cursor:pointer;
    border:none;
    border-radius:5px;
    background:#555;
    color:white;
    transition: all 0.2s ease;
  `;
  btnClose.onmouseenter = () => {
    btnClose.style.background = "red";
    btnClose.style.color = "yellow";
  };
  btnClose.onmouseleave = () => {
    btnClose.style.background = "#555";
    btnClose.style.color = "white";
  };
  btnClose.onclick = () => modal.remove();
  
  toolbar.append(titleDiv, btnClose);
  
  const iframe = document.createElement("iframe");
  iframe.src = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
  iframe.style.cssText = `
    width:100%;
    height:100%;
    border:none;
    flex:1;
  `;
  
  modal.append(toolbar, iframe);
  document.body.appendChild(modal);
}

// ============================================================
// DOWNLOAD HELPER
// ============================================================
async function downloadFile(btn, url, fileName) {
  if (!btn) return;
  try {
    btn.innerText = "Downloading...";
    btn.disabled = true;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Network error");
    const blob = await response.blob();
    const a = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    a.href = objectUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
    btn.innerText = "✅ Downloaded";
    setTimeout(() => {
      btn.innerText = "Download";
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error("Download failed", err);
    btn.innerText = "⚠️ Failed";
    setTimeout(() => {
      btn.innerText = "Download";
      btn.disabled = false;
    }, 2000);
    alert("Download failed. You can try right-click and 'Save link as'.");
  }
}