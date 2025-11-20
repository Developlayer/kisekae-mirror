// KisekaeMirror - メインスクリプト

// グローバル変数
let camera = null;
let pose = null;
let canvas = null;
let canvasCtx = null;
let videoElement = null;

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

// 一時的に読み込んだ画像
let tempImage = null;

// 初期化
window.addEventListener('DOMContentLoaded', () => {
  console.log('KisekaeMirror 起動中...');
  initializeElements();
  initializeEventListeners();
  initializeCamera();
});

// DOM要素の初期化
function initializeElements() {
  canvas = document.getElementById('output-canvas');
  canvasCtx = canvas.getContext('2d');
  videoElement = document.getElementById('camera-video');
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
      tempImage = img;
      showCategorySelection();
      updateStatus('服の種類を選択してください');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
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
    id: Date.now() // 一意のID
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

  ['upper', 'lower', 'full'].forEach(category => {
    if (activeClothes[category]) {
      const item = document.querySelector(`.clothes-item[data-id="${activeClothes[category].id}"]`);
      if (item) {
        item.classList.add('active');
      }
    }
  });
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

// カメラの初期化
async function initializeCamera() {
  try {
    updateStatus('カメラにアクセス中...');

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    videoElement.srcObject = stream;

    videoElement.addEventListener('loadeddata', () => {
      console.log('カメラ映像取得成功');

      // Canvasのサイズを設定
      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;

      updateStatus('MediaPipeを初期化中...');
      initializeMediaPipe();
    });

  } catch (error) {
    console.error('カメラアクセスエラー:', error);
    updateStatus('カメラへのアクセスに失敗しました。権限を確認してください。');
  }
}

// MediaPipeの初期化
function initializeMediaPipe() {
  // MediaPipeライブラリが読み込まれているか確認
  if (typeof Pose === 'undefined') {
    console.error('MediaPipe Poseライブラリが読み込まれていません');
    updateStatus('エラー: MediaPipeライブラリの読み込みに失敗しました');
    // MediaPipeなしでカメラ映像のみ表示
    startCameraOnly();
    return;
  }

  try {
    pose = new Pose({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      }
    });

    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5
    });

    pose.onResults(onPoseResults);

    // カメラの開始
    if (typeof Camera === 'undefined') {
      console.error('MediaPipe Cameraが読み込まれていません');
      startCameraOnly();
      return;
    }

    camera = new Camera(videoElement, {
      onFrame: async () => {
        await pose.send({ image: videoElement });
      },
      width: 1280,
      height: 720
    });

    camera.start();
    updateStatus('準備完了！服を読み込んで着せ替えを楽しもう');
  } catch (error) {
    console.error('MediaPipe初期化エラー:', error);
    updateStatus('MediaPipeの初期化に失敗しました。カメラ映像のみ表示します。');
    startCameraOnly();
  }
}

// MediaPipeなしでカメラ映像のみ表示
function startCameraOnly() {
  updateStatus('カメラ映像のみ表示中（骨格検出は利用不可）');

  function drawFrame() {
    if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
      canvasCtx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

      // 服を描画（骨格検出なしの簡易版）
      drawClothesSimple();
    }
    requestAnimationFrame(drawFrame);
  }

  drawFrame();
}

// 簡易版の服描画（骨格検出なし、画面中央に固定）
function drawClothesSimple() {
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  if (activeClothes.full) {
    const clothWidth = canvas.width * 0.3;
    const clothHeight = clothWidth * (activeClothes.full.image.height / activeClothes.full.image.width);
    canvasCtx.drawImage(
      activeClothes.full.image,
      centerX - clothWidth / 2,
      centerY - clothHeight / 2,
      clothWidth,
      clothHeight
    );
  } else {
    if (activeClothes.upper) {
      const clothWidth = canvas.width * 0.25;
      const clothHeight = clothWidth * (activeClothes.upper.image.height / activeClothes.upper.image.width);
      canvasCtx.drawImage(
        activeClothes.upper.image,
        centerX - clothWidth / 2,
        centerY * 0.6,
        clothWidth,
        clothHeight
      );
    }

    if (activeClothes.lower) {
      const clothWidth = canvas.width * 0.25;
      const clothHeight = clothWidth * (activeClothes.lower.image.height / activeClothes.lower.image.width);
      canvasCtx.drawImage(
        activeClothes.lower.image,
        centerX - clothWidth / 2,
        centerY * 1.2,
        clothWidth,
        clothHeight
      );
    }
  }
}

// MediaPipe結果の処理
function onPoseResults(results) {
  // カメラ映像を描画
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  canvasCtx.drawImage(results.image, 0, 0, canvas.width, canvas.height);

  // 骨格が検出された場合
  if (results.poseLandmarks) {
    // デバッグ用：骨格を描画（drawConnectorsが利用可能な場合のみ）
    if (typeof drawConnectors !== 'undefined' && typeof POSE_CONNECTIONS !== 'undefined') {
      try {
        drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, {
          color: '#00FF00',
          lineWidth: 2
        });
      } catch (e) {
        console.warn('骨格の線の描画に失敗:', e);
      }
    }

    if (typeof drawLandmarks !== 'undefined') {
      try {
        drawLandmarks(canvasCtx, results.poseLandmarks, {
          color: '#FF0000',
          lineWidth: 1
        });
      } catch (e) {
        console.warn('骨格の点の描画に失敗:', e);
      }
    }

    // 服を描画
    drawClothes(results.poseLandmarks);
  }

  canvasCtx.restore();
}

// 服の描画
function drawClothes(landmarks) {
  // 全身が選択されている場合
  if (activeClothes.full) {
    drawFullBodyCloth(landmarks, activeClothes.full);
  } else {
    // 上半身
    if (activeClothes.upper) {
      drawUpperBodyCloth(landmarks, activeClothes.upper);
    }

    // 下半身
    if (activeClothes.lower) {
      drawLowerBodyCloth(landmarks, activeClothes.lower);
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

  // 肩の中心点
  const centerX = (leftShoulder.x + rightShoulder.x) / 2 * canvas.width;
  const centerY = (leftShoulder.y + rightShoulder.y) / 2 * canvas.height;

  // 肩幅を計算
  const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x) * canvas.width;

  // 上半身の高さ（肩から腰まで）
  const bodyHeight = Math.abs(leftHip.y - leftShoulder.y) * canvas.height;

  // 服のサイズを調整（肩幅の1.5倍程度）
  const clothWidth = shoulderWidth * 1.5;
  const clothHeight = clothWidth * (clothItem.image.height / clothItem.image.width);

  // 描画
  canvasCtx.drawImage(
    clothItem.image,
    centerX - clothWidth / 2,
    centerY - clothHeight * 0.1, // 少し上に配置
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
  const rightKnee = landmarks[27];

  if (!leftHip || !rightHip || !leftKnee || !rightKnee) return;

  // 腰の中心点
  const centerX = (leftHip.x + rightHip.x) / 2 * canvas.width;
  const centerY = (leftHip.y + rightHip.y) / 2 * canvas.height;

  // 腰幅を計算
  const hipWidth = Math.abs(rightHip.x - leftHip.x) * canvas.width;

  // 下半身の高さ（腰から膝まで）
  const legHeight = Math.abs(leftKnee.y - leftHip.y) * canvas.height;

  // 服のサイズを調整
  const clothWidth = hipWidth * 1.8;
  const clothHeight = clothWidth * (clothItem.image.height / clothItem.image.width);

  // 描画
  canvasCtx.drawImage(
    clothItem.image,
    centerX - clothWidth / 2,
    centerY,
    clothWidth,
    clothHeight
  );
}

// 全身の服を描画
function drawFullBodyCloth(landmarks, clothItem) {
  // 肩と足首の位置を取得
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftAnkle = landmarks[27];
  const rightAnkle = landmarks[29];

  if (!leftShoulder || !rightShoulder || !leftAnkle || !rightAnkle) return;

  // 中心点（肩の中心）
  const centerX = (leftShoulder.x + rightShoulder.x) / 2 * canvas.width;
  const topY = (leftShoulder.y + rightShoulder.y) / 2 * canvas.height;

  // 全身の高さ（肩から足首まで）
  const fullHeight = Math.abs((leftAnkle.y + rightAnkle.y) / 2 - (leftShoulder.y + rightShoulder.y) / 2) * canvas.height;

  // 肩幅
  const shoulderWidth = Math.abs(rightShoulder.x - leftShoulder.x) * canvas.width;

  // 服のサイズを調整
  const clothHeight = fullHeight * 1.2;
  const clothWidth = clothHeight * (clothItem.image.width / clothItem.image.height);

  // 描画
  canvasCtx.drawImage(
    clothItem.image,
    centerX - clothWidth / 2,
    topY - clothHeight * 0.1,
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
