// KisekaeMirror - MediaPipe Pose対応版

import { PoseLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';

// グローバル変数
let poseLandmarker = null;
let canvas = null;
let canvasCtx = null;
let videoElement = null;
let drawingUtils = null;
let lastVideoTime = -1;

// 服のデータを保持
const clothesData = {
  upper: [], // 上半身の服
  lower: [], // 下半身の服
  full: []   // 全身の服
};

// 現在選択中の服
const activeClothes = {
  upper: null,
  lower: null,
  full: null
};

// 重ね順設定（'upper-on-top' または 'lower-on-top'）
let layerOrder = 'upper-on-top';

// デバッグモード
let debugMode = false;

// 一時的に読み込んだ画像
let tempImage = null;

// トリミング用の変数
let trimCanvas = null;
let trimCtx = null;
let trimImage = null;
let trimSelection = { x: 0, y: 0, width: 0, height: 0 };
let isDragging = false;
let dragHandle = null; // 'nw', 'ne', 'sw', 'se', 'n', 's', 'w', 'e', 'move'
let dragStartX = 0;
let dragStartY = 0;
let dragStartSelection = null;
const handleSize = 10; // ハンドルのサイズ

// 初期化
window.addEventListener('DOMContentLoaded', () => {
  console.log('KisekaeMirror 起動中...');
  initializeElements();
  initializeEventListeners();
  initializeApp();
});

// DOM要素の初期化
function initializeElements() {
  canvas = document.getElementById('output-canvas');
  canvasCtx = canvas.getContext('2d');
  videoElement = document.getElementById('camera-video');
  trimCanvas = document.getElementById('trim-canvas');
  trimCtx = trimCanvas.getContext('2d');
}

// イベントリスナーの設定
function initializeEventListeners() {
  // ファイル選択ボタン
  const fileButton = document.getElementById('file-button');
  const fileInput = document.getElementById('file-input');

  fileButton.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', (e) => {
    handleFileSelect(e.target.files[0]);
  });

  // ドラッグ&ドロップ
  const dropZone = document.getElementById('drop-zone');

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });

  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      handleFileSelect(file);
    }
  });

  // カテゴリ確定ボタン
  const categoryConfirm = document.getElementById('category-confirm');
  categoryConfirm.addEventListener('click', handleCategoryConfirm);

  // トリミング関連のイベント
  trimCanvas.addEventListener('mousedown', onTrimMouseDown);
  trimCanvas.addEventListener('mousemove', onTrimMouseMove);
  trimCanvas.addEventListener('mouseup', onTrimMouseUp);
  trimCanvas.addEventListener('mouseleave', onTrimMouseUp);

  document.getElementById('trim-reset').addEventListener('click', resetTrimSelection);
  document.getElementById('trim-confirm').addEventListener('click', confirmTrim);
  document.getElementById('trim-skip').addEventListener('click', skipTrim);

  // 重ね順設定
  document.querySelectorAll('input[name="layer-order"]').forEach(radio => {
    radio.addEventListener('change', (e) => {
      layerOrder = e.target.value;
      console.log('重ね順を変更:', layerOrder);
    });
  });

  // デバッグモード切り替え
  document.getElementById('debug-mode').addEventListener('change', (e) => {
    debugMode = e.target.checked;
    console.log('デバッグモード:', debugMode ? 'ON' : 'OFF');
  });

  // 縦横比固定チェックボックス
  document.getElementById('lock-aspect-ratio').addEventListener('change', (e) => {
    const isLocked = e.target.checked;
    const unifiedControl = document.getElementById('unified-scale-control');
    const individualControls = document.getElementById('individual-scale-controls');

    if (isLocked) {
      // 縦横比固定モード：全体スケールを表示
      unifiedControl.style.display = 'flex';
      individualControls.style.display = 'none';
      // 現在の横幅の値を全体スケールに適用
      const currentScale = parseInt(document.getElementById('width-scale').value);
      document.getElementById('unified-scale').value = currentScale;
      document.getElementById('unified-value').textContent = currentScale + '%';
    } else {
      // 個別調整モード：横幅・縦幅を表示
      unifiedControl.style.display = 'none';
      individualControls.style.display = 'block';
    }
  });

  // 全体スケールスライダー（縦横比固定時）
  document.getElementById('unified-scale').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    document.getElementById('unified-value').textContent = value + '%';
    const scale = value / 100;
    // 縦横両方に同じスケールを適用
    updateActiveClothScale('width', scale);
    updateActiveClothScale('height', scale);
    // 個別スライダーの値も同期
    document.getElementById('width-scale').value = value;
    document.getElementById('height-scale').value = value;
    document.getElementById('width-value').textContent = value + '%';
    document.getElementById('height-value').textContent = value + '%';
  });

  // サイズ調整スライダー（個別調整時）
  document.getElementById('width-scale').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    document.getElementById('width-value').textContent = value + '%';
    updateActiveClothScale('width', value / 100);
  });

  document.getElementById('height-scale').addEventListener('input', (e) => {
    const value = parseInt(e.target.value);
    document.getElementById('height-value').textContent = value + '%';
    updateActiveClothScale('height', value / 100);
  });

  document.getElementById('reset-size').addEventListener('click', () => {
    // 全体スケールをリセット
    document.getElementById('unified-scale').value = 100;
    document.getElementById('unified-value').textContent = '100%';
    // 個別スケールをリセット
    document.getElementById('width-scale').value = 100;
    document.getElementById('height-scale').value = 100;
    document.getElementById('width-value').textContent = '100%';
    document.getElementById('height-value').textContent = '100%';
    // スケールを適用
    updateActiveClothScale('width', 1.0);
    updateActiveClothScale('height', 1.0);
  });
}

// 選択中の服のスケールを更新
function updateActiveClothScale(dimension, scale) {
  ['upper', 'lower', 'full'].forEach(category => {
    if (activeClothes[category]) {
      if (dimension === 'width') {
        activeClothes[category].widthScale = scale;
      } else {
        activeClothes[category].heightScale = scale;
      }
    }
  });
}

// ファイル選択時の処理
function handleFileSelect(file) {
  if (!file || !file.type.startsWith('image/')) {
    updateStatus('画像ファイルを選択してください');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      trimImage = img;
      showTrimEditor();
      updateStatus('トリミング範囲をドラッグで選択してください');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// トリミング編集画面を表示
function showTrimEditor() {
  document.getElementById('trim-section').style.display = 'block';

  // Canvasのサイズを設定（最大300pxの高さに収まるように）
  const maxHeight = 300;
  const scale = Math.min(1, maxHeight / trimImage.height);
  trimCanvas.width = trimImage.width * scale;
  trimCanvas.height = trimImage.height * scale;

  // 初期選択範囲を画像全体に設定
  trimSelection = {
    x: 0,
    y: 0,
    width: trimCanvas.width,
    height: trimCanvas.height
  };

  drawTrimPreview();
}

// トリミングプレビューを描画
function drawTrimPreview() {
  // 画像を描画
  trimCtx.clearRect(0, 0, trimCanvas.width, trimCanvas.height);
  trimCtx.drawImage(trimImage, 0, 0, trimCanvas.width, trimCanvas.height);

  // 選択範囲以外を暗くする
  trimCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  trimCtx.fillRect(0, 0, trimCanvas.width, trimSelection.y);
  trimCtx.fillRect(0, trimSelection.y, trimSelection.x, trimSelection.height);
  trimCtx.fillRect(trimSelection.x + trimSelection.width, trimSelection.y, trimCanvas.width - trimSelection.x - trimSelection.width, trimSelection.height);
  trimCtx.fillRect(0, trimSelection.y + trimSelection.height, trimCanvas.width, trimCanvas.height - trimSelection.y - trimSelection.height);

  // 選択範囲の枠を描画
  trimCtx.strokeStyle = '#00FF00';
  trimCtx.lineWidth = 2;
  trimCtx.strokeRect(trimSelection.x, trimSelection.y, trimSelection.width, trimSelection.height);

  // ハンドルを描画
  drawTrimHandles();
}

// トリミングのハンドルを描画
function drawTrimHandles() {
  const handles = getTrimHandles();

  trimCtx.fillStyle = '#00FF00';
  trimCtx.strokeStyle = '#FFFFFF';
  trimCtx.lineWidth = 1;

  handles.forEach(handle => {
    trimCtx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
    trimCtx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
  });
}

// ハンドルの位置を取得
function getTrimHandles() {
  const x1 = trimSelection.x;
  const y1 = trimSelection.y;
  const x2 = trimSelection.x + trimSelection.width;
  const y2 = trimSelection.y + trimSelection.height;
  const cx = trimSelection.x + trimSelection.width / 2;
  const cy = trimSelection.y + trimSelection.height / 2;

  return [
    { type: 'nw', x: x1, y: y1 }, // 左上
    { type: 'ne', x: x2, y: y1 }, // 右上
    { type: 'sw', x: x1, y: y2 }, // 左下
    { type: 'se', x: x2, y: y2 }, // 右下
    { type: 'n', x: cx, y: y1 },  // 上
    { type: 's', x: cx, y: y2 },  // 下
    { type: 'w', x: x1, y: cy },  // 左
    { type: 'e', x: x2, y: cy },  // 右
  ];
}

// マウスダウン
function onTrimMouseDown(e) {
  const rect = trimCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // どのハンドルをクリックしたか判定
  const handles = getTrimHandles();
  for (const handle of handles) {
    const dx = mouseX - handle.x;
    const dy = mouseY - handle.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= handleSize) {
      dragHandle = handle.type;
      isDragging = true;
      dragStartX = mouseX;
      dragStartY = mouseY;
      dragStartSelection = { ...trimSelection };
      return;
    }
  }

  // ハンドル以外をクリックした場合、選択範囲内なら移動
  if (mouseX >= trimSelection.x && mouseX <= trimSelection.x + trimSelection.width &&
      mouseY >= trimSelection.y && mouseY <= trimSelection.y + trimSelection.height) {
    dragHandle = 'move';
    isDragging = true;
    dragStartX = mouseX;
    dragStartY = mouseY;
    dragStartSelection = { ...trimSelection };
  }
}

// マウス移動
function onTrimMouseMove(e) {
  if (!isDragging) return;

  const rect = trimCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const dx = mouseX - dragStartX;
  const dy = mouseY - dragStartY;

  // ハンドルの種類に応じて選択範囲を調整
  switch (dragHandle) {
    case 'nw': // 左上
      trimSelection.x = Math.max(0, Math.min(dragStartSelection.x + dx, dragStartSelection.x + dragStartSelection.width - 10));
      trimSelection.y = Math.max(0, Math.min(dragStartSelection.y + dy, dragStartSelection.y + dragStartSelection.height - 10));
      trimSelection.width = dragStartSelection.width - (trimSelection.x - dragStartSelection.x);
      trimSelection.height = dragStartSelection.height - (trimSelection.y - dragStartSelection.y);
      break;
    case 'ne': // 右上
      trimSelection.y = Math.max(0, Math.min(dragStartSelection.y + dy, dragStartSelection.y + dragStartSelection.height - 10));
      trimSelection.width = Math.max(10, Math.min(dragStartSelection.width + dx, trimCanvas.width - dragStartSelection.x));
      trimSelection.height = dragStartSelection.height - (trimSelection.y - dragStartSelection.y);
      break;
    case 'sw': // 左下
      trimSelection.x = Math.max(0, Math.min(dragStartSelection.x + dx, dragStartSelection.x + dragStartSelection.width - 10));
      trimSelection.width = dragStartSelection.width - (trimSelection.x - dragStartSelection.x);
      trimSelection.height = Math.max(10, Math.min(dragStartSelection.height + dy, trimCanvas.height - dragStartSelection.y));
      break;
    case 'se': // 右下
      trimSelection.width = Math.max(10, Math.min(dragStartSelection.width + dx, trimCanvas.width - dragStartSelection.x));
      trimSelection.height = Math.max(10, Math.min(dragStartSelection.height + dy, trimCanvas.height - dragStartSelection.y));
      break;
    case 'n': // 上
      trimSelection.y = Math.max(0, Math.min(dragStartSelection.y + dy, dragStartSelection.y + dragStartSelection.height - 10));
      trimSelection.height = dragStartSelection.height - (trimSelection.y - dragStartSelection.y);
      break;
    case 's': // 下
      trimSelection.height = Math.max(10, Math.min(dragStartSelection.height + dy, trimCanvas.height - dragStartSelection.y));
      break;
    case 'w': // 左
      trimSelection.x = Math.max(0, Math.min(dragStartSelection.x + dx, dragStartSelection.x + dragStartSelection.width - 10));
      trimSelection.width = dragStartSelection.width - (trimSelection.x - dragStartSelection.x);
      break;
    case 'e': // 右
      trimSelection.width = Math.max(10, Math.min(dragStartSelection.width + dx, trimCanvas.width - dragStartSelection.x));
      break;
    case 'move': // 移動
      trimSelection.x = Math.max(0, Math.min(dragStartSelection.x + dx, trimCanvas.width - dragStartSelection.width));
      trimSelection.y = Math.max(0, Math.min(dragStartSelection.y + dy, trimCanvas.height - dragStartSelection.height));
      break;
  }

  drawTrimPreview();
}

// マウスアップ
function onTrimMouseUp() {
  isDragging = false;
  dragHandle = null;
}

// マウスカーソルを変更
trimCanvas.addEventListener('mousemove', (e) => {
  if (isDragging) return;

  const rect = trimCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // ハンドルの上にカーソルがあるか判定
  const handles = getTrimHandles();
  for (const handle of handles) {
    const dx = mouseX - handle.x;
    const dy = mouseY - handle.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance <= handleSize) {
      // ハンドルの種類に応じてカーソルを変更
      const cursorMap = {
        'nw': 'nw-resize',
        'ne': 'ne-resize',
        'sw': 'sw-resize',
        'se': 'se-resize',
        'n': 'n-resize',
        's': 's-resize',
        'w': 'w-resize',
        'e': 'e-resize',
      };
      trimCanvas.style.cursor = cursorMap[handle.type] || 'default';
      return;
    }
  }

  // 選択範囲内なら移動カーソル
  if (mouseX >= trimSelection.x && mouseX <= trimSelection.x + trimSelection.width &&
      mouseY >= trimSelection.y && mouseY <= trimSelection.y + trimSelection.height) {
    trimCanvas.style.cursor = 'move';
  } else {
    trimCanvas.style.cursor = 'default';
  }
});

// トリミング範囲をリセット
function resetTrimSelection() {
  trimSelection = {
    x: 0,
    y: 0,
    width: trimCanvas.width,
    height: trimCanvas.height
  };
  drawTrimPreview();
}

// トリミング確定
function confirmTrim() {
  // 実際の画像サイズに変換
  const scale = trimImage.width / trimCanvas.width;
  const actualX = trimSelection.x * scale;
  const actualY = trimSelection.y * scale;
  const actualWidth = trimSelection.width * scale;
  const actualHeight = trimSelection.height * scale;

  // トリミング後の画像を作成
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');

  tempCanvas.width = actualWidth;
  tempCanvas.height = actualHeight;

  tempCtx.drawImage(
    trimImage,
    actualX, actualY, actualWidth, actualHeight,
    0, 0, actualWidth, actualHeight
  );

  // Imageに変換
  const trimmedImage = new Image();
  trimmedImage.onload = () => {
    tempImage = trimmedImage;
    document.getElementById('trim-section').style.display = 'none';
    showCategorySelection();
    updateStatus('服の種類を選択してください');
  };
  trimmedImage.src = tempCanvas.toDataURL('image/png');
}

// トリミングをスキップ
function skipTrim() {
  tempImage = trimImage;
  document.getElementById('trim-section').style.display = 'none';
  showCategorySelection();
  updateStatus('服の種類を選択してください');
}

// カテゴリ選択画面を表示
function showCategorySelection() {
  const categorySelection = document.getElementById('category-selection');
  categorySelection.style.display = 'block';

  // ラジオボタンをリセット
  const radios = document.querySelectorAll('input[name="category"]');
  radios.forEach(radio => radio.checked = false);
}

// カテゴリ確定処理
function handleCategoryConfirm() {
  const selectedCategory = document.querySelector('input[name="category"]:checked');

  if (!selectedCategory) {
    alert('服の種類を選択してください');
    return;
  }

  if (!tempImage) {
    alert('画像が読み込まれていません');
    return;
  }

  const category = selectedCategory.value;

  // 服データに追加
  const clothItem = {
    image: tempImage,
    id: Date.now(), // 一意のID
    widthScale: 1.0,  // 横幅のスケール（1.0 = 100%）
    heightScale: 1.0  // 縦幅のスケール（1.0 = 100%）
  };

  clothesData[category].push(clothItem);

  // UIに追加
  addClothToUI(clothItem, category);

  // リセット
  tempImage = null;
  document.getElementById('category-selection').style.display = 'none';
  document.getElementById('file-input').value = '';

  updateStatus(`${getCategoryName(category)}の服を追加しました`);
}

// UIに服を追加
function addClothToUI(clothItem, category) {
  const container = document.querySelector(`#${category}-clothes .clothes-items`);

  const itemDiv = document.createElement('div');
  itemDiv.className = 'clothes-item';
  itemDiv.dataset.id = clothItem.id;
  itemDiv.dataset.category = category;

  const img = document.createElement('img');
  img.src = clothItem.image.src;

  const removeBtn = document.createElement('button');
  removeBtn.className = 'remove-btn';
  removeBtn.textContent = '×';
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    removeCloth(clothItem.id, category);
  });

  itemDiv.appendChild(img);
  itemDiv.appendChild(removeBtn);

  // クリックで着用/脱衣
  itemDiv.addEventListener('click', () => {
    toggleCloth(clothItem, category);
  });

  container.appendChild(itemDiv);
}

// 服の着脱
function toggleCloth(clothItem, category) {
  if (category === 'full') {
    // 全身の場合は上下を解除
    if (activeClothes.full && activeClothes.full.id === clothItem.id) {
      activeClothes.full = null;
    } else {
      activeClothes.upper = null;
      activeClothes.lower = null;
      activeClothes.full = clothItem;
    }
  } else {
    // 上半身・下半身の場合は全身を解除
    if (activeClothes[category] && activeClothes[category].id === clothItem.id) {
      activeClothes[category] = null;
    } else {
      activeClothes.full = null;
      activeClothes[category] = clothItem;
    }
  }

  updateClothesUI();
}

// UI更新（選択状態の表示）
function updateClothesUI() {
  const allItems = document.querySelectorAll('.clothes-item');
  allItems.forEach(item => {
    item.classList.remove('active');
  });

  let hasActiveCloth = false;
  let activeClothName = '';

  ['upper', 'lower', 'full'].forEach(category => {
    if (activeClothes[category]) {
      const item = document.querySelector(`.clothes-item[data-id="${activeClothes[category].id}"]`);
      if (item) {
        item.classList.add('active');
        hasActiveCloth = true;
        activeClothName = getCategoryName(category);

        // サイズ調整スライダーの値を更新
        const widthPercent = Math.round(activeClothes[category].widthScale * 100);
        const heightPercent = Math.round(activeClothes[category].heightScale * 100);

        // 個別スライダーの値を更新
        document.getElementById('width-scale').value = widthPercent;
        document.getElementById('height-scale').value = heightPercent;
        document.getElementById('width-value').textContent = widthPercent + '%';
        document.getElementById('height-value').textContent = heightPercent + '%';

        // 全体スケールスライダーの値も更新（横幅の値を使用）
        document.getElementById('unified-scale').value = widthPercent;
        document.getElementById('unified-value').textContent = widthPercent + '%';
      }
    }
  });

  // サイズ調整セクションの表示/非表示
  const sizeAdjustSection = document.getElementById('size-adjust-section');
  if (hasActiveCloth) {
    sizeAdjustSection.style.display = 'block';
    document.getElementById('adjusting-cloth-name').textContent = `${activeClothName}の服を調整中`;
  } else {
    sizeAdjustSection.style.display = 'none';
  }
}

// 服を削除
function removeCloth(id, category) {
  clothesData[category] = clothesData[category].filter(item => item.id !== id);

  if (activeClothes[category] && activeClothes[category].id === id) {
    activeClothes[category] = null;
  }

  const item = document.querySelector(`.clothes-item[data-id="${id}"]`);
  if (item) {
    item.remove();
  }

  updateStatus(`${getCategoryName(category)}の服を削除しました`);
}

// カテゴリ名を取得
function getCategoryName(category) {
  const names = {
    upper: '上半身',
    lower: '下半身',
    full: '全身'
  };
  return names[category] || category;
}

// アプリケーションの初期化
async function initializeApp() {
  try {
    updateStatus('MediaPipeを初期化中...');
    await initializeMediaPipe();

    updateStatus('カメラにアクセス中...');
    await initializeCamera();

    updateStatus('準備完了！服を読み込んで着せ替えを楽しもう');
  } catch (error) {
    console.error('初期化エラー:', error);
    updateStatus('初期化に失敗しました: ' + error.message);
  }
}

// MediaPipeの初期化
async function initializeMediaPipe() {
  try {
    // MediaPipe Visionのファイルセットを読み込み
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );

    // PoseLandmarkerを作成
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    console.log('MediaPipe初期化完了');
  } catch (error) {
    console.error('MediaPipe初期化エラー:', error);
    throw new Error('MediaPipeの初期化に失敗しました');
  }
}

// カメラの初期化
async function initializeCamera() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    videoElement.srcObject = stream;

    return new Promise((resolve) => {
      videoElement.addEventListener('loadeddata', () => {
        console.log('カメラ映像取得成功');

        // Canvasのサイズを設定
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        // DrawingUtilsを初期化
        drawingUtils = new DrawingUtils(canvasCtx);

        // 描画ループを開始
        startDrawing();
        resolve();
      });
    });

  } catch (error) {
    console.error('カメラアクセスエラー:', error);
    throw new Error('カメラへのアクセスに失敗しました');
  }
}

// 描画ループ
function startDrawing() {
  async function drawFrame() {
    if (videoElement && videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
      const startTimeMs = performance.now();

      // 同じフレームを再処理しないようにチェック
      if (lastVideoTime !== videoElement.currentTime) {
        lastVideoTime = videoElement.currentTime;

        // カメラ映像を描画
        canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
        canvasCtx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        try {
          // MediaPipeで骨格検出
          const results = poseLandmarker.detectForVideo(videoElement, startTimeMs);

          // 骨格が検出された場合
          if (results.landmarks && results.landmarks.length > 0) {
            const landmarks = results.landmarks[0];

            // デバッグモードの場合のみ骨格を描画
            if (debugMode) {
              drawSkeleton(landmarks);
            }

            // 服を描画
            drawClothes(landmarks);
          }
        } catch (error) {
          console.error('骨格検出エラー:', error);
        }
      }
    }

    requestAnimationFrame(drawFrame);
  }

  drawFrame();
}

// 骨格の描画（デバッグ用）
function drawSkeleton(landmarks) {
  // 骨格の線を描画
  const connections = [
    [11, 12], // 肩
    [11, 13], [13, 15], // 左腕
    [12, 14], [14, 16], // 右腕
    [11, 23], [12, 24], // 胴体
    [23, 24], // 腰
    [23, 25], [25, 27], [27, 29], [29, 31], // 左脚
    [24, 26], [26, 28], [28, 30], [30, 32], // 右脚
  ];

  canvasCtx.strokeStyle = '#00FF00';
  canvasCtx.lineWidth = 2;

  connections.forEach(([start, end]) => {
    const startPoint = landmarks[start];
    const endPoint = landmarks[end];

    if (startPoint && endPoint) {
      canvasCtx.beginPath();
      canvasCtx.moveTo(startPoint.x * canvas.width, startPoint.y * canvas.height);
      canvasCtx.lineTo(endPoint.x * canvas.width, endPoint.y * canvas.height);
      canvasCtx.stroke();
    }
  });

  // ランドマークの点を描画
  canvasCtx.fillStyle = '#FF0000';
  landmarks.forEach((landmark, index) => {
    if (landmark) {
      canvasCtx.beginPath();
      canvasCtx.arc(
        landmark.x * canvas.width,
        landmark.y * canvas.height,
        3,
        0,
        2 * Math.PI
      );
      canvasCtx.fill();
    }
  });

  // 重要なランドマークにラベルを表示（デバッグ用）
  const importantPoints = {
    11: '左肩',
    12: '右肩',
    23: '左腰',
    24: '右腰',
    25: '左膝',
    26: '右膝',
    27: '左足首',
    28: '右足首'
  };

  canvasCtx.fillStyle = '#FFFF00';
  canvasCtx.font = '14px sans-serif';
  canvasCtx.strokeStyle = '#000000';
  canvasCtx.lineWidth = 3;

  Object.entries(importantPoints).forEach(([index, label]) => {
    const landmark = landmarks[parseInt(index)];
    if (landmark) {
      const x = landmark.x * canvas.width;
      const y = landmark.y * canvas.height;
      // 背景として黒い縁取り
      canvasCtx.strokeText(label, x + 5, y - 5);
      // 黄色のテキスト
      canvasCtx.fillText(label, x + 5, y - 5);
    }
  });
}

// 服の描画
function drawClothes(landmarks) {
  // 全身が選択されている場合
  if (activeClothes.full) {
    drawFullBodyCloth(landmarks, activeClothes.full);
  } else {
    // 重ね順に応じて描画順序を変更
    if (layerOrder === 'upper-on-top') {
      // 下半身を先に描画（下に配置）
      if (activeClothes.lower) {
        drawLowerBodyCloth(landmarks, activeClothes.lower);
      }
      // 上半身を後に描画（上に配置）
      if (activeClothes.upper) {
        drawUpperBodyCloth(landmarks, activeClothes.upper);
      }
    } else {
      // 上半身を先に描画（下に配置）
      if (activeClothes.upper) {
        drawUpperBodyCloth(landmarks, activeClothes.upper);
      }
      // 下半身を後に描画（上に配置）
      if (activeClothes.lower) {
        drawLowerBodyCloth(landmarks, activeClothes.lower);
      }
    }
  }
}

// 上半身の服を描画
function drawUpperBodyCloth(landmarks, clothItem) {
  // 肩の位置を取得（ランドマーク11: 左肩, 12: 右肩）
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return;

  // 肩の位置（ピクセル座標）
  const leftShoulderX = leftShoulder.x * canvas.width;
  const leftShoulderY = leftShoulder.y * canvas.height;
  const rightShoulderX = rightShoulder.x * canvas.width;
  const rightShoulderY = rightShoulder.y * canvas.height;

  // 腰の位置（ピクセル座標）
  const leftHipX = leftHip.x * canvas.width;
  const leftHipY = leftHip.y * canvas.height;
  const rightHipX = rightHip.x * canvas.width;
  const rightHipY = rightHip.y * canvas.height;

  // 中心位置を計算
  const shoulderCenterX = (leftShoulderX + rightShoulderX) / 2;
  const shoulderCenterY = (leftShoulderY + rightShoulderY) / 2;
  const hipCenterY = (leftHipY + rightHipY) / 2;

  // 肩幅を計算
  const shoulderWidth = Math.abs(rightShoulderX - leftShoulderX);

  // 上半身の高さ（肩の中心から腰の中心まで）
  const bodyHeight = Math.abs(hipCenterY - shoulderCenterY);

  // 服のサイズを調整（体を完全に覆うサイズ）
  const baseClothWidth = shoulderWidth * 1.715;  // 肩幅の1.715倍（2.45 * 0.7）
  const baseClothHeight = bodyHeight * 1.4;      // 上半身の高さの1.4倍

  // ユーザー調整を反映
  const clothWidth = baseClothWidth * clothItem.widthScale;
  const clothHeight = baseClothHeight * clothItem.heightScale;

  // 描画位置を計算
  // 上端：肩より上に配置（肩を完全に隠す）
  // 余分な高さ（clothHeight - bodyHeight）の大部分を上に配置
  const extraHeight = clothHeight - bodyHeight;
  const topY = shoulderCenterY - extraHeight * 0.65;  // 余分な高さの65%を上に配置
  const drawX = shoulderCenterX - clothWidth / 2;

  // デバッグモードの場合のみ服の領域を示す矩形を描画
  if (debugMode) {
    canvasCtx.strokeStyle = '#FF00FF';
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeRect(drawX, topY, clothWidth, clothHeight);
  }

  // 服を描画
  canvasCtx.drawImage(
    clothItem.image,
    drawX,
    topY,
    clothWidth,
    clothHeight
  );
}

// 下半身の服を描画
function drawLowerBodyCloth(landmarks, clothItem) {
  // 腰の位置を取得（ランドマーク23: 左腰, 24: 右腰）
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];  // 修正：26が右膝
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];  // 修正：28が右足首

  if (!leftHip || !rightHip || !leftKnee || !rightKnee) return;

  // 腰の中心点
  const hipCenterX = (leftHip.x + rightHip.x) / 2 * canvas.width;
  const hipCenterY = (leftHip.y + rightHip.y) / 2 * canvas.height;

  // 腰幅を計算
  const hipWidth = Math.abs(rightHip.x - leftHip.x) * canvas.width;

  // 下半身の高さ（腰から足首まで）
  let lowerBodyHeight;
  if (leftAnkle && rightAnkle) {
    const ankleCenterY = (leftAnkle.y + rightAnkle.y) / 2 * canvas.height;
    lowerBodyHeight = Math.abs(ankleCenterY - hipCenterY);
  } else {
    const kneeCenterY = (leftKnee.y + rightKnee.y) / 2 * canvas.height;
    lowerBodyHeight = Math.abs(kneeCenterY - hipCenterY) * 2; // 膝までの2倍で推定
  }

  // 服のサイズを調整（体を完全に覆うサイズ）
  const baseClothWidth = hipWidth * 3.0;  // 腰幅の3倍に拡大
  const baseClothHeight = lowerBodyHeight * 1.15;  // 高さを1.15倍に調整

  // ユーザー調整を反映
  const clothWidth = baseClothWidth * clothItem.widthScale;
  const clothHeight = baseClothHeight * clothItem.heightScale;

  // 描画（腰の位置から下に配置）
  canvasCtx.drawImage(
    clothItem.image,
    hipCenterX - clothWidth / 2,
    hipCenterY - clothHeight * 0.05, // 腰の位置から少し上
    clothWidth,
    clothHeight
  );
}

// 全身の服を描画
function drawFullBodyCloth(landmarks, clothItem) {
  // 肩と足首の位置を取得
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[28];  // 修正：28が右足首

  if (!leftShoulder || !rightShoulder || !leftAnkle || !rightAnkle) return;

  // 中心点（肩の中心）
  const shoulderCenterX = (leftShoulder.x + rightShoulder.x) / 2 * canvas.width;
  const shoulderCenterY = (leftShoulder.y + rightShoulder.y) / 2 * canvas.height;

  // 腰の位置
  const hipCenterY = (leftHip.y + rightHip.y) / 2 * canvas.height;

  // 肩幅を計算
  const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x) * canvas.width;

  // 全身の高さ（肩から足首まで）
  const ankleCenterY = (leftAnkle.y + rightAnkle.y) / 2 * canvas.height;
  const fullHeight = Math.abs(ankleCenterY - shoulderCenterY);

  // 上半身の高さを計算
  const upperBodyHeight = Math.abs(hipCenterY - shoulderCenterY);

  // 下半身の高さを計算（下半身の下端と合わせるため）
  const lowerBodyHeight = Math.abs(ankleCenterY - hipCenterY);

  // 上半身の上端位置を計算（上半身の服と同じロジック）
  const upperClothHeight = upperBodyHeight * 1.4;
  const upperExtraHeight = upperClothHeight - upperBodyHeight;
  const topY = shoulderCenterY - upperExtraHeight * 0.65;  // 上半身と同じ65%

  // 下半身の下端位置を計算
  const lowerBodyEnd = hipCenterY + lowerBodyHeight * 1.15 * 0.95;

  // 全身の服の高さ = 上端から下端まで
  const baseClothHeight = lowerBodyEnd - topY;

  const aspectRatio = clothItem.image.width / clothItem.image.height;
  const baseClothWidth = Math.max(shoulderWidth * 3.0, baseClothHeight * aspectRatio);  // 肩幅の3倍または比率に応じた幅

  // ユーザー調整を反映
  const clothWidth = baseClothWidth * clothItem.widthScale;
  const clothHeight = baseClothHeight * clothItem.heightScale;

  // 描画
  canvasCtx.drawImage(
    clothItem.image,
    shoulderCenterX - clothWidth / 2,
    topY,
    clothWidth,
    clothHeight
  );
}

// ステータス更新
function updateStatus(message) {
  const statusText = document.getElementById('status-text');
  statusText.textContent = message;
  console.log('[Status]', message);
}
