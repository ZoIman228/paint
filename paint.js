(() => {
  "use strict";

  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const stage = document.getElementById("canvasStage");
  const colorInput = document.getElementById("color");
  const colorHex = document.getElementById("colorHex");
  const colorName = document.getElementById("colorName");
  const lineWInput = document.getElementById("lineW");
  const lineWeightValue = document.getElementById("lineWeightValue");
  const opacityInput = document.getElementById("opacity");
  const opacityValue = document.getElementById("opacityValue");
  const undoBtn = document.getElementById("undoBtn");
  const redoBtn = document.getElementById("redoBtn");
  const saveBtn = document.getElementById("saveBtn");
  const clearBtn = document.getElementById("clearBtn");
  const fillBtn = document.getElementById("fillBtn");
  const clearDialog = document.getElementById("clearDialog");
  const cancelClearBtn = document.getElementById("cancelClearBtn");
  const confirmClearBtn = document.getElementById("confirmClearBtn");
  const toast = document.getElementById("toast");
  const canvasHint = document.getElementById("canvasHint");
  const canvasStatus = document.getElementById("canvasStatus");
  const canvasSize = document.getElementById("canvasSize");
  const documentStatus = document.getElementById("documentStatus");
  const toolButtons = [...document.querySelectorAll("[data-tool]")];
  const swatches = [...document.querySelectorAll("[data-color]")];

  const MAX_HISTORY = 35;
  let tool = "brush";
  let drawing = false;
  let strokeMoved = false;
  let activePointerId = null;
  let lastPoint = null;
  let undoStack = [];
  let redoStack = [];
  let hasArtwork = false;
  let toastTimer = null;
  let resizeObserver = null;
  let lastCanvasWidth = 0;
  let lastCanvasHeight = 0;
  let lastDpr = 1;

  const colorLabels = {
    "#111827": "Графітовий", "#f43f5e": "Рожевий", "#f97316": "Помаранчевий",
    "#eab308": "Жовтий", "#22c55e": "Зелений", "#06b6d4": "Бірюзовий",
    "#3b82f6": "Синій", "#4f46e5": "Індиго", "#a855f7": "Фіолетовий",
    "#ec4899": "Малиновий", "#ffffff": "Білий", "#94a3b8": "Сірий",
  };

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2300);
  }

  function updateHistoryButtons() {
    undoBtn.disabled = undoStack.length === 0;
    redoBtn.disabled = redoStack.length === 0;
  }

  function updateStatus(message = "Полотно готове") {
    canvasStatus.textContent = message;
    documentStatus.textContent = hasArtwork ? "Є незбережені зміни" : "Нова робота";
    canvasHint.classList.toggle("is-hidden", hasArtwork);
  }

  function updateCanvasDimensions() {
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    if (width === lastCanvasWidth && height === lastCanvasHeight && dpr === lastDpr) return;

    let previous = null;
    if (canvas.width && canvas.height && lastCanvasWidth && lastCanvasHeight) {
      previous = document.createElement("canvas");
      previous.width = canvas.width;
      previous.height = canvas.height;
      previous.getContext("2d").drawImage(canvas, 0, 0);
    }

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    if (previous) {
      ctx.drawImage(previous, 0, 0, previous.width / lastDpr, previous.height / lastDpr);
    }

    lastCanvasWidth = width;
    lastCanvasHeight = height;
    lastDpr = dpr;
    canvasSize.textContent = `${width} × ${height}`;
    setRangeProgress(lineWInput);
    setRangeProgress(opacityInput);

    // History uses the old canvas dimensions; establish a clean baseline after resizing.
    undoStack = [];
    redoStack = [];
    updateHistoryButtons();
  }

  function setRangeProgress(input) {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const value = Number(input.value);
    const percent = ((value - min) / (max - min)) * 100;
    input.style.setProperty("--range-progress", `${percent}%`);
  }

  function snapshot() {
    const image = document.createElement("canvas");
    image.width = canvas.width;
    image.height = canvas.height;
    image.getContext("2d").drawImage(canvas, 0, 0);
    return { image, width: lastCanvasWidth, height: lastCanvasHeight, dpr: lastDpr, hasArtwork };
  }

  function restoreSnapshot(state) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.setTransform(lastDpr, 0, 0, lastDpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, lastCanvasWidth, lastCanvasHeight);
    // Re-scale history snapshots if the canvas density changed since the snapshot.
    ctx.drawImage(state.image, 0, 0, state.width, state.height);
    hasArtwork = Boolean(state.hasArtwork);
    updateStatus("Зміни відновлено");
  }

  function pushHistory() {
    undoStack.push(snapshot());
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
    updateHistoryButtons();
  }

  function undo() {
    if (!undoStack.length) return;
    redoStack.push(snapshot());
    restoreSnapshot(undoStack.pop());
    updateHistoryButtons();
  }

  function redo() {
    if (!redoStack.length) return;
    undoStack.push(snapshot());
    restoreSnapshot(redoStack.pop());
    updateHistoryButtons();
  }

  function setTool(nextTool) {
    tool = nextTool;
    toolButtons.forEach((button) => {
      const active = button.dataset.tool === tool;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    canvas.classList.toggle("tool-eraser", tool === "eraser");
    canvas.classList.toggle("tool-eyedropper", tool === "eyedropper");
    canvasStatus.textContent = tool === "eraser" ? "Гумка активна" : tool === "eyedropper" ? "Обери колір на малюнку" : "Полотно готове";
  }

  function normalizeHex(value) { return value.toUpperCase(); }

  function updateColorUI() {
    const hex = colorInput.value.toLowerCase();
    colorHex.textContent = normalizeHex(hex);
    colorName.textContent = colorLabels[hex] || "Власний колір";
    document.querySelector(".color-well").style.background = hex;
    swatches.forEach((swatch) => {
      swatch.classList.toggle("is-selected", swatch.dataset.color.toLowerCase() === hex);
    });
  }

  function getPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function setStrokeStyle() {
    ctx.lineWidth = Number(lineWInput.value);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = Number(opacityInput.value) / 100;
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = tool === "eraser" ? "#ffffff" : colorInput.value;
    ctx.fillStyle = ctx.strokeStyle;
  }

  function pickColor(point) {
    const x = Math.min(canvas.width - 1, Math.max(0, Math.floor(point.x * lastDpr)));
    const y = Math.min(canvas.height - 1, Math.max(0, Math.floor(point.y * lastDpr)));
    const pixel = ctx.getImageData(x, y, 1, 1).data;
    const toHex = (n) => n.toString(16).padStart(2, "0");
    colorInput.value = `#${toHex(pixel[0])}${toHex(pixel[1])}${toHex(pixel[2])}`;
    updateColorUI();
    setTool("brush");
    showToast(`Колір обрано: ${colorInput.value.toUpperCase()}`);
  }

  function beginStroke(event) {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    const point = getPoint(event);
    if (tool === "eyedropper") {
      pickColor(point);
      return;
    }

    drawing = true;
    strokeMoved = false;
    activePointerId = event.pointerId;
    lastPoint = point;
    pushHistory();
    setStrokeStyle();
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    try { canvas.setPointerCapture(event.pointerId); } catch (_) { /* Pointer capture may be unavailable. */ }
  }

  function moveStroke(event) {
    if (!drawing || event.pointerId !== activePointerId) return;
    event.preventDefault();
    const point = getPoint(event);
    if (!lastPoint) lastPoint = point;
    setStrokeStyle();
    // Render only the newest segment so reduced opacity doesn't darken old segments repeatedly.
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastPoint = point;
    strokeMoved = true;
    hasArtwork = true;
    updateStatus(tool === "eraser" ? "Стираю зайве…" : "Малюю…");
  }

  function endStroke(event) {
    if (!drawing || (event && event.pointerId !== undefined && event.pointerId !== activePointerId)) return;
    if (!strokeMoved && lastPoint) {
      setStrokeStyle();
      ctx.beginPath();
      ctx.arc(lastPoint.x, lastPoint.y, Math.max(0.5, Number(lineWInput.value) / 2), 0, Math.PI * 2);
      ctx.fill();
    }
    drawing = false;
    activePointerId = null;
    lastPoint = null;
    ctx.globalAlpha = 1;
    hasArtwork = true;
    updateStatus("Малюнок оновлено");
    updateHistoryButtons();
  }

  function fillCanvas() {
    pushHistory();
    ctx.save();
    ctx.setTransform(lastDpr, 0, 0, lastDpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = colorInput.value;
    ctx.fillRect(0, 0, lastCanvasWidth, lastCanvasHeight);
    ctx.restore();
    hasArtwork = colorInput.value.toLowerCase() !== "#ffffff";
    updateStatus("Полотно залито кольором");
    showToast("Полотно залито кольором");
  }

  function clearCanvas() {
    pushHistory();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    ctx.setTransform(lastDpr, 0, 0, lastDpr, 0, 0);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, lastCanvasWidth, lastCanvasHeight);
    hasArtwork = false;
    updateStatus("Полотно очищено");
    showToast("Полотно очищено — можна починати заново");
    updateHistoryButtons();
  }

  function saveImage() {
    saveBtn.disabled = true;
    saveBtn.querySelector("span").textContent = "Готую файл…";
    canvas.toBlob((blob) => {
      saveBtn.disabled = false;
      saveBtn.querySelector("span").textContent = "Зберегти PNG";
      if (!blob) {
        showToast("Не вдалося створити PNG. Спробуй ще раз.");
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
      link.href = url;
      link.download = `paintbox-${stamp}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      documentStatus.textContent = "PNG збережено";
      showToast("Готово! Малюнок збережено у PNG ✨");
    }, "image/png");
  }

  // UI events
  toolButtons.forEach((button) => button.addEventListener("click", () => setTool(button.dataset.tool)));
  colorInput.addEventListener("input", updateColorUI);
  swatches.forEach((swatch) => swatch.addEventListener("click", () => {
    colorInput.value = swatch.dataset.color;
    updateColorUI();
  }));
  lineWInput.addEventListener("input", () => {
    lineWeightValue.textContent = lineWInput.value;
    setRangeProgress(lineWInput);
  });
  opacityInput.addEventListener("input", () => {
    opacityValue.textContent = opacityInput.value;
    setRangeProgress(opacityInput);
  });
  canvas.addEventListener("pointerdown", beginStroke);
  canvas.addEventListener("pointermove", moveStroke);
  canvas.addEventListener("pointerup", endStroke);
  canvas.addEventListener("pointercancel", endStroke);
  canvas.addEventListener("lostpointercapture", endStroke);
  undoBtn.addEventListener("click", undo);
  redoBtn.addEventListener("click", redo);
  fillBtn.addEventListener("click", fillCanvas);
  saveBtn.addEventListener("click", saveImage);
  clearBtn.addEventListener("click", () => {
    if (typeof clearDialog.showModal === "function") clearDialog.showModal();
    else if (window.confirm("Очистити полотно? Дію можна скасувати.")) clearCanvas();
  });
  cancelClearBtn.addEventListener("click", () => clearDialog.close());
  confirmClearBtn.addEventListener("click", () => {
    clearDialog.close();
    clearCanvas();
  });
  clearDialog.addEventListener("click", (event) => {
    if (event.target === clearDialog) clearDialog.close();
  });

  document.addEventListener("keydown", (event) => {
    const target = event.target;
    const editing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    const key = event.key.toLowerCase();
    if ((event.ctrlKey || event.metaKey) && key === "z") {
      event.preventDefault();
      if (event.shiftKey) redo(); else undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "y") {
      event.preventDefault(); redo(); return;
    }
    if ((event.ctrlKey || event.metaKey) && key === "s") {
      event.preventDefault(); saveImage(); return;
    }
    if (editing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (key === "b") setTool("brush");
    else if (key === "e") setTool("eraser");
    else if (key === "i") setTool("eyedropper");
    else if (key === "g") fillCanvas();
    else if (key === "[") lineWInput.value = String(Math.max(Number(lineWInput.min), Number(lineWInput.value) - 1));
    else if (key === "]") lineWInput.value = String(Math.min(Number(lineWInput.max), Number(lineWInput.value) + 1));
    else return;
    if (key === "[" || key === "]") {
      lineWeightValue.textContent = lineWInput.value;
      setRangeProgress(lineWInput);
    }
  });

  // Initialise a sharp canvas and keep artwork when the workspace changes size.
  updateCanvasDimensions();
  updateColorUI();
  setRangeProgress(lineWInput);
  setRangeProgress(opacityInput);
  updateHistoryButtons();
  updateStatus();
  setTool("brush");

  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(() => {
      if (drawing) endStroke();
      updateCanvasDimensions();
    });
    resizeObserver.observe(stage);
  } else {
    window.addEventListener("resize", () => {
      if (drawing) endStroke();
      updateCanvasDimensions();
    });
  }
})();
