const infoPanel = document.getElementById('infoPanel');
const campusMap = document.getElementById('campusMap');
const searchInput = document.getElementById('searchInput');
const searchResultsContainer = document.getElementById('searchResultsContainer');
const searchResultsList = document.getElementById('searchResultsList');
const resetZoomBtn = document.getElementById('resetZoomIconBtn'); 

const SVG_ORIGINAL_WIDTH = 970;
const SVG_ORIGINAL_HEIGHT = 910;
const SVG_ASPECT_RATIO = SVG_ORIGINAL_WIDTH / SVG_ORIGINAL_HEIGHT;

let currentViewBox = { x: 0, y: 0, width: SVG_ORIGINAL_WIDTH, height: SVG_ORIGINAL_HEIGHT };
const ZOOM_FACTOR = 1.2; 
const MIN_ZOOM_WIDTH = 30; 
const MAX_ZOOM_WIDTH = SVG_ORIGINAL_WIDTH * 3;

let isPointerDown = false;
let pointerStartCoords = { x: 0, y: 0 };
let viewBoxOnPointerDown = { x: 0, y: 0 };
let initialPinchDistance = 0;
let isPinching = false;
let tapStart = { x:0, y:0, time:0 };
const TAP_THRESHOLD_MS = 250;
const TAP_MOVE_THRESHOLD_PX = 10;

let debounceTimer;
let highlightTimeout = null; 
let autoZoomOutTimer = null; 
let isAnimatingViewBox = false;
let animationFrameId = null;
let currentHighlightedRect = null; 
// Bỏ currentSearchAnimationSequence vì chúng ta đơn giản hóa lại auto zoom

const AUTO_ZOOM_OUT_INITIAL_WAIT = 1800; 
const INITIAL_ZOOM_TO_BUILDING_FACTOR = 0.5; 
const OVERVIEW_ZOOM_OUT_FACTOR = 4.0; 
const ANIMATION_DURATION = 700; 
const HIGHLIGHT_DURATION_AFTER_ANIMATION = 2500; 

function cancelAllAutomatedSequences() {
    clearTimeout(autoZoomOutTimer);
    if (isAnimatingViewBox) {
        cancelAnimationFrame(animationFrameId);
        isAnimatingViewBox = false;
    }
    // Không clear highlightTimeout ở đây trực tiếp, để clearSearchHighlightAndTimers quản lý
}

function clearSearchHighlightAndTimers() {
    if (currentHighlightedRect) {
        currentHighlightedRect.classList.remove('search-highlight');
        currentHighlightedRect = null;
    }
    clearTimeout(highlightTimeout);
    cancelAllAutomatedSequences(); 
}


function setMapViewBox(vb, calledFromAnimation = false) {
  if (!calledFromAnimation) {
    cancelAllAutomatedSequences();
    if(!isAnimatingViewBox) clearSearchHighlightAndTimers(); 
  }

  currentViewBox = { ...vb };
  const minX = -SVG_ORIGINAL_WIDTH * 0.25; 
  const maxX = SVG_ORIGINAL_WIDTH * 1.25 - currentViewBox.width;
  const minY = -SVG_ORIGINAL_HEIGHT * 0.25;
  const maxY = SVG_ORIGINAL_HEIGHT * 1.25 - currentViewBox.height;

  currentViewBox.x = Math.max(minX, Math.min(currentViewBox.x, maxX));
  currentViewBox.y = Math.max(minY, Math.min(currentViewBox.y, maxY));
  
  campusMap.setAttribute('viewBox', `${currentViewBox.x} ${currentViewBox.y} ${currentViewBox.width} ${currentViewBox.height}`);
}

function screenToSVGCoords(screenX, screenY) {
    const pt = campusMap.createSVGPoint();
    pt.x = screenX;
    pt.y = screenY;
    const CTM = campusMap.getScreenCTM();
    return CTM ? pt.matrixTransform(CTM.inverse()) : null;
}

function easeInOutQuad(t) { 
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function animateViewBox(targetVb, duration, onCompleteCallback = null) {
    if (isAnimatingViewBox) { 
        cancelAnimationFrame(animationFrameId);
    }
    isAnimatingViewBox = true;

    const startVb = { ...currentViewBox }; 
    const startTime = performance.now();

    function animationStep(currentTime) {
        if (!isAnimatingViewBox) return; 

        const elapsedTime = currentTime - startTime;
        let progress = Math.min(elapsedTime / duration, 1);
        const easedProgress = easeInOutQuad(progress);

        const interpolatedVb = {
            x: startVb.x + (targetVb.x - startVb.x) * easedProgress,
            y: startVb.y + (targetVb.y - startVb.y) * easedProgress,
            width: startVb.width + (targetVb.width - startVb.width) * easedProgress,
            height: startVb.height + (targetVb.height - startVb.height) * easedProgress,
        };
        setMapViewBox(interpolatedVb, true); 

        if (progress < 1) {
            animationFrameId = requestAnimationFrame(animationStep);
        } else {
            isAnimatingViewBox = false;
            setMapViewBox(targetVb, true); 
            if (typeof onCompleteCallback === 'function') {
                onCompleteCallback();
            }
        }
    }
    animationFrameId = requestAnimationFrame(animationStep);
}

function zoomViewBox(zoomRatio, pivotSVG) {
    cancelAllAutomatedSequences();
    clearSearchHighlightAndTimers(); 
    
    let newWidth = currentViewBox.width * zoomRatio;
    let newHeight = newWidth / SVG_ASPECT_RATIO; 

    if (newWidth < MIN_ZOOM_WIDTH) {
        newWidth = MIN_ZOOM_WIDTH;
        newHeight = newWidth / SVG_ASPECT_RATIO;
        if (zoomRatio > 1 && currentViewBox.width <= MIN_ZOOM_WIDTH) return;
    }
    if (newWidth > MAX_ZOOM_WIDTH) {
        newWidth = MAX_ZOOM_WIDTH;
        newHeight = newWidth / SVG_ASPECT_RATIO;
         if (zoomRatio < 1 && currentViewBox.width >= MAX_ZOOM_WIDTH) return;
    }
    
    let newX, newY;
    if (pivotSVG) {
        newX = pivotSVG.x - (pivotSVG.x - currentViewBox.x) * (newWidth / currentViewBox.width);
        newY = pivotSVG.y - (pivotSVG.y - currentViewBox.y) * (newHeight / currentViewBox.height);
    } else {
        newX = currentViewBox.x + (currentViewBox.width - newWidth) / 2;
        newY = currentViewBox.y + (currentViewBox.height - newHeight) / 2;
    }
    setMapViewBox({ x: newX, y: newY, width: newWidth, height: newHeight }); 
}

// --- Mouse Event Handlers ---
campusMap.addEventListener('mousedown', (event) => {
    cancelAllAutomatedSequences();
    clearSearchHighlightAndTimers(); 
    if (event.button !== 0) return; 
    isPointerDown = true;
    pointerStartCoords = { x: event.clientX, y: event.clientY };
    viewBoxOnPointerDown = { ...currentViewBox };
    campusMap.classList.add('grabbing');
    tapStart = { x: event.clientX, y: event.clientY, time: Date.now() };
});
campusMap.addEventListener('mousemove', (event) => {
    if (!isPointerDown || isPinching || isAnimatingViewBox) return;
    const dxScreen = event.clientX - pointerStartCoords.x;
    const dyScreen = event.clientY - pointerStartCoords.y;
    const clientRect = campusMap.getBoundingClientRect();
    if (clientRect.width === 0 || clientRect.height === 0) return; 
    const scaleX = currentViewBox.width / clientRect.width;
    const scaleY = currentViewBox.height / clientRect.height;
    const newX = viewBoxOnPointerDown.x - dxScreen * scaleX;
    const newY = viewBoxOnPointerDown.y - dyScreen * scaleY;
    setMapViewBox({ x: newX, y: newY, width: currentViewBox.width, height: currentViewBox.height });
});
function stopMousePan() { 
    if (isPointerDown && !isPinching) { 
        isPointerDown = false;
        campusMap.classList.remove('grabbing');
    }
}
campusMap.addEventListener('mouseup', stopMousePan);
campusMap.addEventListener('mouseleave', stopMousePan);
window.addEventListener('blur', stopMousePan); 

campusMap.addEventListener('wheel', (event) => {
  event.preventDefault(); 
  cancelAllAutomatedSequences();
  clearSearchHighlightAndTimers(); 
  const pivot = screenToSVGCoords(event.clientX, event.clientY);
  if (!pivot) return;
  const zoomRatio = event.deltaY < 0 ? (1 / ZOOM_FACTOR) : ZOOM_FACTOR;
  zoomViewBox(zoomRatio, pivot); 
});

// --- Touch Event Handlers ---
function getTouchDistance(t1, t2) { return Math.sqrt(Math.pow(t1.clientX - t2.clientX, 2) + Math.pow(t1.clientY - t2.clientY, 2)); }
function getTouchMidpoint(t1, t2) { return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 }; }

campusMap.addEventListener('touchstart', (event) => {
    cancelAllAutomatedSequences();
    clearSearchHighlightAndTimers(); 
    event.preventDefault();
    isPointerDown = true; 
    campusMap.classList.add('grabbing');
    if (event.touches.length === 1) {
        const touch = event.touches[0];
        pointerStartCoords = { x: touch.clientX, y: touch.clientY };
        viewBoxOnPointerDown = { ...currentViewBox };
        tapStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
        isPinching = false; 
    } else if (event.touches.length === 2) {
        isPinching = true;
        initialPinchDistance = getTouchDistance(event.touches[0], event.touches[1]);
        viewBoxOnPointerDown = { ...currentViewBox }; 
    }
}, { passive: false });

campusMap.addEventListener('touchmove', (event) => {
    event.preventDefault();
    if (!isPointerDown || isAnimatingViewBox) return; 

    if (isPinching && event.touches.length === 2) {
        const currentPinchDistance = getTouchDistance(event.touches[0], event.touches[1]);
        if (initialPinchDistance === 0) { 
            initialPinchDistance = currentPinchDistance;
            viewBoxOnPointerDown = { ...currentViewBox }; 
            return;
        }
        const zoomRatio = currentPinchDistance / initialPinchDistance; 
        const screenMidpoint = getTouchMidpoint(event.touches[0], event.touches[1]);
        const svgMidpoint = screenToSVGCoords(screenMidpoint.x, screenMidpoint.y);
        if (svgMidpoint) {
            let newWidth = viewBoxOnPointerDown.width / zoomRatio; 
            newWidth = Math.max(MIN_ZOOM_WIDTH, Math.min(newWidth, MAX_ZOOM_WIDTH));
            let newHeight = newWidth / SVG_ASPECT_RATIO;
            
            let newViewBoxX = svgMidpoint.x - (svgMidpoint.x - viewBoxOnPointerDown.x) * (newWidth / viewBoxOnPointerDown.width);
            let newViewBoxY = svgMidpoint.y - (svgMidpoint.y - viewBoxOnPointerDown.y) * (newHeight / viewBoxOnPointerDown.height);
            setMapViewBox({x: newViewBoxX, y: newViewBoxY, width: newWidth, height: newHeight});
        }
    } else if (!isPinching && event.touches.length === 1) { 
        const touch = event.touches[0];
        const dxScreen = touch.clientX - pointerStartCoords.x;
        const dyScreen = touch.clientY - pointerStartCoords.y;
        const clientRect = campusMap.getBoundingClientRect();
        if (clientRect.width === 0 || clientRect.height === 0) return;
        const scaleX = currentViewBox.width / clientRect.width;
        const scaleY = currentViewBox.height / clientRect.height;
        const newX = viewBoxOnPointerDown.x - dxScreen * scaleX;
        const newY = viewBoxOnPointerDown.y - dyScreen * scaleY;
        setMapViewBox({ x: newX, y: newY, width: currentViewBox.width, height: currentViewBox.height });
    }
}, { passive: false });

campusMap.addEventListener('touchend', (event) => {
    if (!isPinching && event.changedTouches.length === 1 && isPointerDown && !isAnimatingViewBox) {
        const touch = event.changedTouches[0];
        const timeElapsed = Date.now() - tapStart.time;
        const distMoved = Math.sqrt(Math.pow(touch.clientX - tapStart.x, 2) + Math.pow(touch.clientY - tapStart.y, 2));
        if (timeElapsed < TAP_THRESHOLD_MS && distMoved < TAP_MOVE_THRESHOLD_PX) {
            let targetElement = document.elementFromPoint(tapStart.x, tapStart.y);
            if (targetElement && targetElement.closest && targetElement.closest('.building-rect')) { 
                targetElement = targetElement.closest('.building-rect');
                const buildingId = targetElement.id;
                if (buildingId && info[buildingId]) {
                    cancelAllAutomatedSequences(); 
                    clearSearchHighlightAndTimers();  
                    displayBuildingInfo(info[buildingId], buildingId); 
                    // isPointerDown và grabbing sẽ được reset ở cuối hàm này nếu không còn touch nào
                    searchResultsContainer.style.display = 'none';
                    searchInput.value = ''; 
                }
            }
        }
    }
    if (event.touches.length < 2) isPinching = false;
    if (event.touches.length === 0) { 
        if(isPointerDown) { 
           isPointerDown = false;
           campusMap.classList.remove('grabbing');
        }
    }
});
campusMap.addEventListener('touchcancel', (event) => {
    isPointerDown = false;
    isPinching = false;
    campusMap.classList.remove('grabbing');
    cancelAllAutomatedSequences();
    clearSearchHighlightAndTimers(); 
});


// --- Reset Zoom Button ---
resetZoomBtn.addEventListener('click', () => {
  clearSearchHighlightAndTimers(); // Xóa highlight và hủy sequence nếu có
  setMapViewBox({ x: 0, y: 0, width: SVG_ORIGINAL_WIDTH, height: SVG_ORIGINAL_HEIGHT });
});

// --- Building Info and Click Logic ---
const info = {
  toaC1: { name: "Tòa C1", detail: "Trung tâm hành chính và các phòng ban quản lý chính của trường." },
  toaC2: { name: "Tòa C2", detail: "Gồm hội trường lớn, phòng thí nghiệm vật liệu, công nghệ thông tin." },
  toaC7: { name: "Tòa C7", detail: "Viện Kinh tế & Quản lý, trung tâm đào tạo quản trị." },
  toaB1: { name: "Tòa B1", detail: "Trường Hóa học và Khoa học Sự sống, các phòng thí nghiệm sinh học." },
  toaKtx: { name: "Ký túc xá", detail: "Ký túc xá sinh viên với hơn 500 chỗ ở." },
  toaC9: { name: "Tòa C9", detail: "Thông tin chi tiết về Tòa C9..." },
  toaHoithao: { name: "Khu Hội thảo", detail: "Thông tin chi tiết về Khu Hội thảo..." },
  toaC3: { name: "Tòa C3", detail: "Thông tin chi tiết về Tòa C3..." },
  toaC4: { name: "Tòa C4", detail: "Thông tin chi tiết về Tòa C4..." },
  toaC5: { name: "Tòa C5", detail: "Thông tin chi tiết về Tòa C5..." },
  toaC10: { name: "Tòa C10", detail: "Thông tin chi tiết về Tòa C10..." },
  toaThuvien: { name: "Thư viện", detail: "Thông tin chi tiết về Thư viện..." },
  toaHotien: { name: "Hồ Tiền", detail: "Thông tin chi tiết về Hồ Tiền..." },
  toaD6: { name: "Tòa D6", detail: "Thông tin chi tiết về Tòa D6..." },
  toaD8: { name: "Tòa D8", detail: "Thông tin chi tiết về Tòa D8..." },
  toaD2a: { name: "Tòa D2a", detail: "Thông tin chi tiết về Tòa D2a..." },
  toaD2b: { name: "Tòa D2b", detail: "Thông tin chi tiết về Tòa D2b..." },
  toaVietduc: { name: "Trung tâm Việt Đức", detail: "Thông tin chi tiết về Trung tâm Việt Đức..." },
  toaD2d: { name: "Tòa D2d", detail: "Thông tin chi tiết về Tòa D2d..." },
  toaC3b: { name: "Tòa C3b", detail: "Thông tin chi tiết về Tòa C3b..." },
  toaC1b: { name: "Tòa C1b", detail: "Thông tin chi tiết về Tòa C1b..." },
  toaD3: { name: "Tòa D3", detail: "Thông tin chi tiết về Tòa D3..." },
  toaD5: { name: "Tòa D5", detail: "Thông tin chi tiết về Tòa D5..." },
  toaD35: { name: "Khối nhà D3-D5", detail: "Thông tin chi tiết về Khối nhà D3-D5..." },
  toaB6: { name: "Tòa B6", detail: "Thông tin chi tiết về Tòa B6..." },
  toaB7: { name: "Tòa B7", detail: "Thông tin chi tiết về Tòa B7..." },
  toaB8: { name: "Tòa B8", detail: "Thông tin chi tiết về Tòa B8..." },
  toaB5: { name: "Tòa B5", detail: "Thông tin chi tiết về Tòa B5..." },
  toaB9: { name: "Tòa B9", detail: "Thông tin chi tiết về Tòa B9..." },
  toaD4: { name: "Tòa D4", detail: "Thông tin chi tiết về Tòa D4..." },
  toaVuonhoa: { name: "Vườn hoa", detail: "Thông tin chi tiết về Vườn hoa..." },
  toaD7: { name: "Tòa D7", detail: "Thông tin chi tiết về Tòa D7..." }
};

function displayBuildingInfo(data, buildingId) {
    if (data) {
        infoPanel.innerHTML = `<h3>${data.name}</h3><p>${data.detail}</p>`;
    } else {
        infoPanel.innerHTML = `<h3>Thông tin tòa nhà</h3><p class="placeholder">Chưa có thông tin chi tiết cho khu vực này (ID: ${buildingId}).</p>`;
    }
}

document.querySelectorAll('.building-rect').forEach(el => {
    el.addEventListener('click', (event) => {
        const timeSinceTapStart = Date.now() - tapStart.time;
        const clientX = event.clientX; 
        const clientY = event.clientY;
        const distMoved = Math.sqrt(Math.pow(clientX - tapStart.x, 2) + Math.pow(clientY - tapStart.y, 2));

        if (isPinching || isAnimatingViewBox || (isPointerDown && (timeSinceTapStart > TAP_THRESHOLD_MS || distMoved > TAP_MOVE_THRESHOLD_PX )) ){
            return;
        }
        
        const buildingId = event.target.id;
        if (buildingId && info[buildingId]) {
            cancelAllAutomatedSequences();
            clearSearchHighlightAndTimers(); 
            
            displayBuildingInfo(info[buildingId], buildingId); 
            searchResultsContainer.style.display = 'none';
            searchInput.value = ''; 
        }
    });
});


// --- SEARCH FUNCTIONALITY ---
function normalizeString(str) {
  if (!str) return '';
  return str.toLowerCase()
      .normalize("NFD") 
      .replace(/[\u0300-\u036f]/g, "") 
      .replace(/đ/g, "d"); 
}

function debounce(func, delay) {
  return function(...args) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => func.apply(this, args), delay);
  };
}

function clearSearchHighlight() { 
    if (currentHighlightedRect) {
        currentHighlightedRect.classList.remove('search-highlight');
        currentHighlightedRect = null;
    }
    clearTimeout(highlightTimeout); 
}

function performSearch() {
  cancelAllAutomatedSequences(); 
  clearSearchHighlightAndTimers(); 
  const query = searchInput.value;
  const normalizedQuery = normalizeString(query);
  searchResultsList.innerHTML = ''; 

  if (!query.trim()) {
    searchResultsContainer.style.display = 'none';
    return;
  }

  const matches = [];
  for (const id in info) {
    const building = info[id];
    const normalizedName = normalizeString(building.name);
    const normalizedId = normalizeString(id);

    if (normalizedName.includes(normalizedQuery) || normalizedId.includes(normalizedQuery)) {
      matches.push({ id, ...building });
    }
  }
  matches.sort((a, b) => a.name.localeCompare(b.name, 'vi')); 

  if (matches.length > 0) {
    matches.slice(0, 7).forEach(building => { 
      const li = document.createElement('li');
      const buildingNameNorm = normalizeString(building.name).replace(/\s+/g,'');
      const buildingIdNorm = normalizeString(building.id);
      li.textContent = building.name + (buildingIdNorm !== buildingNameNorm ? ` (${building.id.toUpperCase()})` : '');
      li.dataset.buildingId = building.id;
      li.addEventListener('click', () => handleSearchResultClick(building.id));
      searchResultsList.appendChild(li);
    });
    searchResultsContainer.style.display = 'block';
  } else {
    searchResultsList.innerHTML = '<li class="no-results">Không có kết quả phù hợp.</li>';
    searchResultsContainer.style.display = 'block';
  }
}

function handleSearchResultClick(buildingId) {
  cancelAllAutomatedSequences(); 
  clearSearchHighlightAndTimers(); 
  
  const buildingData = info[buildingId];
  const buildingRectEl = document.getElementById(buildingId);

  if (buildingData && buildingRectEl) {
    const rectCoords = buildingRectEl.getBBox(); 
    
    let targetInitialWidth, targetInitialHeight;

    if ((rectCoords.width / rectCoords.height) > SVG_ASPECT_RATIO) { 
        targetInitialWidth = rectCoords.width / INITIAL_ZOOM_TO_BUILDING_FACTOR;
        targetInitialHeight = targetInitialWidth / SVG_ASPECT_RATIO;
    } else { 
        targetInitialHeight = rectCoords.height / INITIAL_ZOOM_TO_BUILDING_FACTOR;
        targetInitialWidth = targetInitialHeight * SVG_ASPECT_RATIO;
    }
    
    targetInitialWidth = Math.max(MIN_ZOOM_WIDTH * 1.5, Math.min(targetInitialWidth, SVG_ORIGINAL_WIDTH * 0.9));
    targetInitialHeight = targetInitialWidth / SVG_ASPECT_RATIO;

    const initialZoomX = (rectCoords.x + rectCoords.width / 2) - targetInitialWidth / 2;
    const initialZoomY = (rectCoords.y + rectCoords.height / 2) - targetInitialHeight / 2;
    const initialZoomViewBox = { x: initialZoomX, y: initialZoomY, width: targetInitialWidth, height: targetInitialHeight };
    
    setMapViewBox(initialZoomViewBox); 

    buildingRectEl.classList.add('search-highlight');
    currentHighlightedRect = buildingRectEl; 

    displayBuildingInfo(buildingData, buildingId); 
    searchInput.value = '';
    searchResultsContainer.style.display = 'none';
    
    // Lên lịch cho lần zoom out tự động (chỉ 1 lần)
    autoZoomOutTimer = setTimeout(() => {
        const focusedVB = { ...currentViewBox }; 
        
        let overviewWidth = Math.min(SVG_ORIGINAL_WIDTH, focusedVB.width * OVERVIEW_ZOOM_OUT_FACTOR);
        let overviewHeight = overviewWidth / SVG_ASPECT_RATIO;

        if (overviewHeight > SVG_ORIGINAL_HEIGHT) {
            overviewHeight = SVG_ORIGINAL_HEIGHT;
            overviewWidth = overviewHeight * SVG_ASPECT_RATIO;
        }
        
        if (Math.abs(overviewWidth - focusedVB.width) < 10 && Math.abs(overviewHeight - focusedVB.height) < 10) {
             if ((focusedVB.width < SVG_ORIGINAL_WIDTH || focusedVB.height < SVG_ORIGINAL_HEIGHT) && currentHighlightedRect) { 
                // Nếu không zoom out nhiều nhưng chưa phải full view và có highlight
                animateViewBox({x:0, y:0, width: SVG_ORIGINAL_WIDTH, height: SVG_ORIGINAL_HEIGHT}, ANIMATION_DURATION, () => {
                    if (currentHighlightedRect) { 
                        highlightTimeout = setTimeout(clearSearchHighlight, HIGHLIGHT_DURATION_AFTER_ANIMATION);
                    }
                });
             } else if (currentHighlightedRect) { // Đã ở full view, chỉ cần hẹn giờ tắt highlight
                 highlightTimeout = setTimeout(clearSearchHighlight, HIGHLIGHT_DURATION_AFTER_ANIMATION);
             }
            return; 
        }

        const overviewX = focusedVB.x + (focusedVB.width - overviewWidth) / 2;
        const overviewY = focusedVB.y + (focusedVB.height - overviewHeight) / 2;
        const targetOverviewVb = { x: overviewX, y: overviewY, width: overviewWidth, height: overviewHeight };
        
        animateViewBox(targetOverviewVb, ANIMATION_DURATION, () => {
            // Khi animation zoom out tổng quan hoàn tất
            if (currentHighlightedRect) { 
                highlightTimeout = setTimeout(clearSearchHighlight, HIGHLIGHT_DURATION_AFTER_ANIMATION);
            }
        }); 
    }, AUTO_ZOOM_OUT_INITIAL_WAIT); 
  }
}

searchInput.addEventListener('input', debounce(performSearch, 300));

document.addEventListener('click', function(event) {
    if (searchResultsContainer.style.display === 'block' && 
        !searchInput.contains(event.target) && 
        !searchResultsContainer.contains(event.target)) {
        searchResultsContainer.style.display = 'none';
    }
});
searchInput.addEventListener('keydown', function(event) {
    if (event.key === "Escape") {
        searchInput.value = '';
        searchResultsContainer.style.display = 'none';
        searchInput.blur(); 
        cancelAllAutomatedSequences(); 
        clearSearchHighlightAndTimers(); 
    }
});
