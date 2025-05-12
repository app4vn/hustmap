// DOM Elements
const campusMap = document.getElementById('campusMap');
const searchInput = document.getElementById('searchInput');
const searchResultsContainer = document.getElementById('searchResultsContainer');
const searchResultsList = document.getElementById('searchResultsList');
const resetZoomBtn = document.getElementById('resetZoomIconBtn');

// Bottom Sheet DOM Elements
const bottomSheet = document.getElementById('bottomSheet');
const bottomSheetBackdrop = document.getElementById('bottomSheetBackdrop');
const closeBottomSheetBtn = document.getElementById('closeBottomSheetBtn');
const bottomSheetContent = document.getElementById('bottomSheetContent');
const bottomSheetTitle = document.getElementById('bottomSheetTitle');
const toggleBottomSheetHeightBtn = document.getElementById('toggleBottomSheetHeightBtn'); // Nút gạt chiều cao

// SVG and Zoom Constants
const SVG_VIEWBOX_X = 5;
const SVG_VIEWBOX_Y = 5;
const SVG_IMAGE_FULL_WIDTH = 970;
const SVG_IMAGE_FULL_HEIGHT = 910;
const SVG_ORIGINAL_WIDTH = SVG_IMAGE_FULL_WIDTH - (2 * SVG_VIEWBOX_X);
const SVG_ORIGINAL_HEIGHT = SVG_IMAGE_FULL_HEIGHT - (2 * SVG_VIEWBOX_Y);
const SVG_ASPECT_RATIO = SVG_ORIGINAL_WIDTH / SVG_ORIGINAL_HEIGHT;

let currentViewBox = { x: SVG_VIEWBOX_X, y: SVG_VIEWBOX_Y, width: SVG_ORIGINAL_WIDTH, height: SVG_ORIGINAL_HEIGHT };
const ZOOM_FACTOR = 1.2;
const MIN_ZOOM_WIDTH = 30;
const MAX_ZOOM_WIDTH = SVG_ORIGINAL_WIDTH * 3;

// Interaction State Variables
let isPointerDown = false;
let pointerStartCoords = { x: 0, y: 0 };
let viewBoxOnPointerDown = { x: 0, y: 0 };
let initialPinchDistance = 0;
let isPinching = false;
let tapStart = { x:0, y:0, time:0 };
const TAP_THRESHOLD_MS = 250;
const TAP_MOVE_THRESHOLD_PX = 10;

// Timers and Animation State
let debounceTimer;
let highlightTimeout = null;
let autoZoomOutTimer = null;
let isAnimatingViewBox = false;
let animationFrameId = null;
let currentHighlightedRect = null;

// --- Bottom Sheet State & Constants ---
let isBottomSheetExpanded = false; // Theo dõi trạng thái mở rộng/thu gọn
const BOTTOM_SHEET_FULL_HEIGHT_VH = 90; // Chiều cao "Full" là 90% viewport height
const BOTTOM_SHEET_PEEK_MAX_VH = 70; // Chiều cao "Peek" tối đa 70% viewport height
const BOTTOM_SHEET_PEEK_MIN_PX = 150; // Chiều cao "Peek" tối thiểu 150px
const BOTTOM_SHEET_ANIMATION_DURATION = 300; // Phù hợp với transition CSS

// Search and Animation Constants
const AUTO_ZOOM_OUT_INITIAL_WAIT = 1800;
const INITIAL_ZOOM_TO_BUILDING_FACTOR = 0.5;
const OVERVIEW_ZOOM_OUT_FACTOR = 4.0;
const ANIMATION_DURATION = 700;
const HIGHLIGHT_DURATION_AFTER_ANIMATION = 2500;


// --- Utility Functions ---
function cancelAllAutomatedSequences() { /* ... giữ nguyên ... */ }
function clearSearchHighlightAndTimers() { /* ... giữ nguyên ... */ }
function setMapViewBox(vb, calledFromAnimation = false) { /* ... giữ nguyên ... */ }
function screenToSVGCoords(screenX, screenY) { /* ... giữ nguyên ... */ }
function easeInOutQuad(t) { /* ... giữ nguyên ... */ }
function animateViewBox(targetVb, duration, onCompleteCallback = null) { /* ... giữ nguyên ... */ }
function zoomViewBox(zoomRatio, pivotSVG) { /* ... giữ nguyên ... */ }

// --- Mouse Event Handlers & Touch Event Handlers (Giữ nguyên) ---
// ... (Toàn bộ code cho mouse và touch events không thay đổi so với phiên bản ổn định trước) ...
// Copy paste from previous stable version
function cancelAllAutomatedSequences() {
    clearTimeout(autoZoomOutTimer);
    if (isAnimatingViewBox) {
        cancelAnimationFrame(animationFrameId);
        isAnimatingViewBox = false;
    }
}

function clearSearchHighlightAndTimers() {
    if (currentHighlightedRect) {
        currentHighlightedRect.classList.remove('search-highlight');
        currentHighlightedRect = null;
    }
    clearTimeout(highlightTimeout);
}

function setMapViewBox(vb, calledFromAnimation = false) {
  if (!calledFromAnimation) {
    cancelAllAutomatedSequences();
    if(!isAnimatingViewBox) clearSearchHighlightAndTimers();
  }
  currentViewBox = { ...vb };
  const panLimitFactor = 0.25;
  const minPanX = SVG_VIEWBOX_X - SVG_ORIGINAL_WIDTH * panLimitFactor;
  const maxPanX = SVG_VIEWBOX_X + SVG_ORIGINAL_WIDTH * (1 + panLimitFactor) - currentViewBox.width;
  const minPanY = SVG_VIEWBOX_Y - SVG_ORIGINAL_HEIGHT * panLimitFactor;
  const maxPanY = SVG_VIEWBOX_Y + SVG_ORIGINAL_HEIGHT * (1 + panLimitFactor) - currentViewBox.height;
  currentViewBox.x = Math.max(minPanX, Math.min(currentViewBox.x, maxPanX));
  currentViewBox.y = Math.max(minPanY, Math.min(currentViewBox.y, maxPanY));
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
    if (isAnimatingViewBox) cancelAnimationFrame(animationFrameId);
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
            if (typeof onCompleteCallback === 'function') onCompleteCallback();
        }
    }
    animationFrameId = requestAnimationFrame(animationStep);
}

function zoomViewBox(zoomRatio, pivotSVG) {
    cancelAllAutomatedSequences();
    clearSearchHighlightAndTimers();
    let newWidth = currentViewBox.width * zoomRatio;
    newWidth = Math.max(MIN_ZOOM_WIDTH, Math.min(newWidth, MAX_ZOOM_WIDTH));
    if (newWidth === currentViewBox.width && currentViewBox.width === MIN_ZOOM_WIDTH && zoomRatio > 1) {}
    else if (newWidth === currentViewBox.width && currentViewBox.width === MAX_ZOOM_WIDTH && zoomRatio < 1) {}
    else if (newWidth === currentViewBox.width) return;
    let newHeight = newWidth / SVG_ASPECT_RATIO;
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
        if (initialPinchDistance === 0) { initialPinchDistance = currentPinchDistance; viewBoxOnPointerDown = { ...currentViewBox }; return; }
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
            if (targetElement && targetElement.closest) {
                targetElement = targetElement.closest('.building-rect');
                if (targetElement) {
                    const buildingId = targetElement.id;
                    if (buildingId && info[buildingId]) {
                        cancelAllAutomatedSequences();
                        clearSearchHighlightAndTimers();
                        targetElement.classList.add('search-highlight');
                        currentHighlightedRect = targetElement;
                        openBottomSheet(info[buildingId]);
                        searchResultsContainer.style.display = 'none';
                        searchInput.value = '';
                    }
                }
            }
        }
    }
    if (event.touches.length < 2) isPinching = false;
    if (event.touches.length === 0) { if(isPointerDown) { isPointerDown = false; campusMap.classList.remove('grabbing'); } }
});
campusMap.addEventListener('touchcancel', (event) => {
    isPointerDown = false; isPinching = false; campusMap.classList.remove('grabbing');
    cancelAllAutomatedSequences(); clearSearchHighlightAndTimers();
});


// --- Reset Zoom Button ---
resetZoomBtn.addEventListener('click', () => {
  cancelAllAutomatedSequences();
  clearSearchHighlightAndTimers();
  closeBottomSheet();
  setMapViewBox({ x: SVG_VIEWBOX_X, y: SVG_VIEWBOX_Y, width: SVG_ORIGINAL_WIDTH, height: SVG_ORIGINAL_HEIGHT });
});

// --- Building Data ---
const info = { /* ... Dữ liệu tòa nhà của bạn ... */
  toaC1: { name: "Tòa C1", detail: "Trung tâm hành chính và các phòng ban quản lý chính của trường. Nơi giải quyết các thủ tục sinh viên và công tác đối ngoại." },
  toaC2: { name: "Tòa C2", detail: "Gồm hội trường lớn cho các sự kiện quan trọng, các phòng thí nghiệm hiện đại về vật liệu xây dựng và công nghệ thông tin ứng dụng." },
  toaC7: { name: "Tòa C7", detail: "Viện Kinh tế & Quản lý, trung tâm đào tạo quản trị." },
  toaB1: { name: "Tòa B1", detail: "Trường Hóa học và Khoa học Sự sống, các phòng thí nghiệm sinh học." },
  toaKtx: { name: "Ký túc xá", detail: "Ký túc xá sinh viên với hơn 500 chỗ ở." },
  toaC9: { name: "Tòa C9", detail: "Tòa nhà đa năng, phòng học và văn phòng các khoa." },
  toaHoithao: { name: "Khu Hội thảo", detail: "Trung tâm tổ chức sự kiện, hội thảo quốc tế và trong nước." },
  toaC3: { name: "Tòa C3", detail: "Khoa Cơ khí, các xưởng thực hành và phòng thí nghiệm." },
  toaC4: { name: "Tòa C4", detail: "Khoa Điện, các phòng thí nghiệm chuyên ngành điện." },
  toaC5: { name: "Tòa C5", detail: "Khoa Điện tử Viễn thông, trung tâm nghiên cứu." },
  toaC10: { name: "Tòa C10", detail: "Giảng đường chung, phòng học lớn." },
  toaThuvien: { name: "Thư viện Tạ Quang Bửu", detail: "Thư viện trung tâm với hàng triệu đầu sách và tài liệu số." },
  toaHotien: { name: "Hồ Tiền", detail: "Khuôn viên cảnh quan, nơi thư giãn của sinh viên." },
  toaD6: { name: "Tòa D6", detail: "Viện Công nghệ Sinh học và Thực phẩm." },
  toaD8: { name: "Tòa D8", detail: "Viện Khoa học và Công nghệ Môi trường." },
  toaD2a: { name: "Tòa D2a", detail: "Phần của khu nhà D2, văn phòng và phòng học." },
  toaD2b: { name: "Tòa D2b", detail: "Phần của khu nhà D2, phòng thí nghiệm." },
  toaVietduc: { name: "Trung tâm Việt Đức (VDZ)", detail: "Trung tâm hợp tác đào tạo và nghiên cứu với CHLB Đức." },
  toaD2d: { name: "Tòa D2d", detail: "Phần của khu nhà D2, phòng nghiên cứu chuyên sâu." },
  toaC3b: { name: "Tòa C3b", detail: "Mở rộng của tòa C3, xưởng thực hành hiện đại." },
  toaC1b: { name: "Tòa C1b", detail: "Văn phòng các tổ chức sinh viên, đoàn thể." },
  toaD3: { name: "Tòa D3", detail: "Viện Toán ứng dụng và Tin học." },
  toaD5: { name: "Tòa D5", detail: "Viện Vật lý Kỹ thuật." },
  toaD35: { name: "Khối nhà D3-D5", detail: "Liên kết giữa D3 và D5, không gian học tập chung." },
  toaB6: { name: "Tòa B6", detail: "Trung tâm thể thao, nhà thi đấu đa năng." },
  toaB7: { name: "Tòa B7", detail: "Sân vận động và các sân thể thao ngoài trời." },
  toaB8: { name: "Tòa B8", detail: "Nhà ăn sinh viên và các dịch vụ tiện ích." },
  toaB5: { name: "Tòa B5", detail: "Khoa Giáo dục Quốc phòng và An ninh." },
  toaB9: { name: "Tòa B9", detail: "Trung tâm y tế của trường." },
  toaD4: { name: "Tòa D4", detail: "Viện Ngoại ngữ, trung tâm đào tạo ngôn ngữ." },
  toaVuonhoa: { name: "Vườn hoa trung tâm", detail: "Không gian xanh, nơi tổ chức các hoạt động ngoài trời." },
  toaD7: { name: "Tòa D7", detail: "Viện Sư phạm Kỹ thuật, đào tạo giáo viên kỹ thuật." }
};


// --- Bottom Sheet Functions ---
function setPeekHeight() {
    const mapContainerEl = campusMap.closest('.map-container');
    if (!mapContainerEl) { // Guard clause
        console.error("Map container not found for peek height calculation.");
        bottomSheet.style.height = BOTTOM_SHEET_PEEK_MIN_PX + 'px'; // Fallback to min height
        return;
    }

    const mapContainerRect = mapContainerEl.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    let sheetHeight = viewportHeight - mapContainerRect.bottom;

    sheetHeight = Math.max(BOTTOM_SHEET_PEEK_MIN_PX, Math.min(sheetHeight, viewportHeight * (BOTTOM_SHEET_PEEK_MAX_VH / 100) ));
    sheetHeight = Math.max(0, sheetHeight);
    bottomSheet.style.height = sheetHeight + 'px';
}

function openBottomSheet(buildingData) {
    if (!buildingData) return;

    bottomSheetTitle.textContent = buildingData.name || "Thông tin chi tiết";
    let detailHTML = `<h3>${buildingData.name}</h3><p>${buildingData.detail || "Chưa có thông tin cho tòa nhà này."}</p>`;
    // Để test cuộn khi mở rộng, bạn có thể thêm nội dung dài vào đây:
    // detailHTML += `<p style="margin-top:1em;">${'Nội dung dài để test scroll. '.repeat(50)}</p>`;
    bottomSheetContent.innerHTML = detailHTML;

    setPeekHeight(); // Đặt chiều cao "Peek" ban đầu
    isBottomSheetExpanded = false; // Reset trạng thái
    if (toggleBottomSheetHeightBtn) { // Kiểm tra nút có tồn tại không
        toggleBottomSheetHeightBtn.classList.remove('expanded');
        toggleBottomSheetHeightBtn.setAttribute('aria-label', 'Mở rộng');
    }


    bottomSheet.classList.add('open');
    bottomSheetBackdrop.classList.add('open');
    document.body.style.overflow = 'hidden';
}

function closeBottomSheet() {
    bottomSheet.classList.remove('open');
    bottomSheetBackdrop.classList.remove('open');
    document.body.style.overflow = '';
    bottomSheet.style.height = '';
    isBottomSheetExpanded = false;
    if (toggleBottomSheetHeightBtn) { // Kiểm tra nút có tồn tại không
        toggleBottomSheetHeightBtn.classList.remove('expanded');
        toggleBottomSheetHeightBtn.setAttribute('aria-label', 'Mở rộng');
    }

    setTimeout(() => {
        if (!bottomSheet.classList.contains('open')) {
            bottomSheetTitle.textContent = "Thông tin tòa nhà";
            bottomSheetContent.innerHTML = `<p class="placeholder">Chọn một tòa nhà trên bản đồ hoặc từ kết quả tìm kiếm để xem thông tin chi tiết.</p>`;
        }
    }, BOTTOM_SHEET_ANIMATION_DURATION);
}

function toggleBottomSheetExpansion() {
    if (!bottomSheet.classList.contains('open') || !toggleBottomSheetHeightBtn) return;

    if (isBottomSheetExpanded) { // Đang Full -> Thu về Peek
        setPeekHeight();
        isBottomSheetExpanded = false;
        toggleBottomSheetHeightBtn.classList.remove('expanded');
        toggleBottomSheetHeightBtn.setAttribute('aria-label', 'Mở rộng');
    } else { // Đang Peek -> Mở Full
        const fullHeight = window.innerHeight * (BOTTOM_SHEET_FULL_HEIGHT_VH / 100);
        bottomSheet.style.height = fullHeight + 'px';
        isBottomSheetExpanded = true;
        toggleBottomSheetHeightBtn.classList.add('expanded');
        toggleBottomSheetHeightBtn.setAttribute('aria-label', 'Thu gọn');
    }
}

// Event listeners for Bottom Sheet
closeBottomSheetBtn.addEventListener('click', closeBottomSheet);
bottomSheetBackdrop.addEventListener('click', closeBottomSheet);
if (toggleBottomSheetHeightBtn) { // Chỉ thêm listener nếu nút tồn tại
    toggleBottomSheetHeightBtn.addEventListener('click', toggleBottomSheetExpansion);
}


window.addEventListener('resize', () => {
    if (bottomSheet.classList.contains('open')) {
        if (isBottomSheetExpanded) {
            const fullHeight = window.innerHeight * (BOTTOM_SHEET_FULL_HEIGHT_VH / 100);
            bottomSheet.style.height = fullHeight + 'px';
        } else {
            setPeekHeight();
        }
    }
});

// --- Building Click Logic ---
document.querySelectorAll('.building-rect').forEach(el => {
    el.addEventListener('click', (event) => {
        const timeSinceTapStart = Date.now() - (tapStart.time || 0);
        const clientX = event.clientX;
        const clientY = event.clientY;
        const distMoved = Math.sqrt(Math.pow(clientX - (tapStart.x || clientX), 2) + Math.pow(clientY - (tapStart.y || clientY), 2));

        if (isPinching || isAnimatingViewBox || (isPointerDown && (timeSinceTapStart > TAP_THRESHOLD_MS || distMoved > TAP_MOVE_THRESHOLD_PX )) ){
            return;
        }
        const buildingRectEl = event.target;
        const buildingId = buildingRectEl.id;
        if (buildingId && info[buildingId] && buildingRectEl.classList.contains('building-rect')) {
            cancelAllAutomatedSequences();
            clearSearchHighlightAndTimers();
            buildingRectEl.classList.add('search-highlight');
            currentHighlightedRect = buildingRectEl;
            openBottomSheet(info[buildingId]);
            searchResultsContainer.style.display = 'none';
            searchInput.value = '';
        }
    });
});


// --- SEARCH FUNCTIONALITY ---
function normalizeString(str) {
  if (!str) return '';
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
}
function debounce(func, delay) {
  return function(...args) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => func.apply(this, args), delay);
  };
}

function performSearch() {
  cancelAllAutomatedSequences();
  clearSearchHighlightAndTimers();
  closeBottomSheet(); // Đóng bottom sheet khi bắt đầu tìm kiếm mới
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

    buildingRectEl.classList.add('search-highlight');
    currentHighlightedRect = buildingRectEl;
    
    openBottomSheet(buildingData); // Mở ở trạng thái Peek
    searchInput.value = '';
    searchResultsContainer.style.display = 'none';

    animateViewBox(initialZoomViewBox, ANIMATION_DURATION, () => {
        // Sau khi zoom, có thể tính lại chiều cao peek nếu cần,
        // nhưng nếu map-container có height cố định thì thường không cần thiết.
        // setPeekHeight();

        autoZoomOutTimer = setTimeout(() => {
            if (!currentHighlightedRect || currentHighlightedRect.id !== buildingId) return;
            const focusedVB = { ...currentViewBox };
            let overviewWidth = Math.min(SVG_ORIGINAL_WIDTH, focusedVB.width * OVERVIEW_ZOOM_OUT_FACTOR);
            let overviewHeight = overviewWidth / SVG_ASPECT_RATIO;
            if (overviewHeight > SVG_ORIGINAL_HEIGHT) {
                overviewHeight = SVG_ORIGINAL_HEIGHT;
                overviewWidth = overviewHeight * SVG_ASPECT_RATIO;
            }
            if (Math.abs(overviewWidth - focusedVB.width) < 10 && Math.abs(overviewHeight - focusedVB.height) < 10) {
                 if ((focusedVB.width < SVG_ORIGINAL_WIDTH || focusedVB.height < SVG_ORIGINAL_HEIGHT) && currentHighlightedRect) {
                    animateViewBox({x:SVG_VIEWBOX_X, y:SVG_VIEWBOX_Y, width: SVG_ORIGINAL_WIDTH, height: SVG_ORIGINAL_HEIGHT}, ANIMATION_DURATION, () => {
                        if (currentHighlightedRect) {
                            highlightTimeout = setTimeout(clearSearchHighlightAndTimers, HIGHLIGHT_DURATION_AFTER_ANIMATION);
                        }
                    });
                 } else if (currentHighlightedRect) {
                     highlightTimeout = setTimeout(clearSearchHighlightAndTimers, HIGHLIGHT_DURATION_AFTER_ANIMATION);
                 }
                return;
            }
            const overviewX = focusedVB.x + (focusedVB.width - overviewWidth) / 2;
            const overviewY = focusedVB.y + (focusedVB.height - overviewHeight) / 2;
            const targetOverviewVb = { x: overviewX, y: overviewY, width: overviewWidth, height: overviewHeight };
            animateViewBox(targetOverviewVb, ANIMATION_DURATION, () => {
                if (currentHighlightedRect) {
                    highlightTimeout = setTimeout(clearSearchHighlightAndTimers, HIGHLIGHT_DURATION_AFTER_ANIMATION);
                }
            });
        }, AUTO_ZOOM_OUT_INITIAL_WAIT);
    });
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
        closeBottomSheet();
    }
});
