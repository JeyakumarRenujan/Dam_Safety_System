const socket = io();

let deviceConnected = false;
let gateStatus = "CLOSED";
let controlMode = "AUTO";
let isAdmin = false;
let previousRiskState = null;
let previousGateStatus = null;
let previousDeviceStatus = null;

/* EXISTING ELEMENTS */
const levelEl = document.getElementById("level");
const stateEl = document.getElementById("state");
const gateText = document.getElementById("gateText");
const modeText = document.getElementById("modeText");

const deviceBadge = document.getElementById("deviceBadge");
const gateBadge = document.getElementById("gateBadge");

const openBtn = document.getElementById("openBtn");
const closeBtn = document.getElementById("closeBtn");
const autoBtn = document.getElementById("autoBtn");

const controlPanel = document.getElementById("controlPanel");
const controlMessage = document.getElementById("controlMessage");

const loginModal = document.getElementById("loginModal");
const loginMessage = document.getElementById("loginMessage");
const adminPasswordInput = document.getElementById("adminPassword");

/* CARD ELEMENTS */
const levelValue = document.getElementById("levelValue");
const stateValue = document.getElementById("stateValue");
const modeValue = document.getElementById("modeValue");
const modeNote = document.getElementById("modeNote");
const gateMainText = document.getElementById("gateMainText");

const stateCard = document.getElementById("stateCard");
const stateChip = document.getElementById("stateChip");
const heroRiskText = document.getElementById("heroRiskText");
const heroModeText = document.getElementById("heroModeText");
const globalAlertBanner = document.getElementById("globalAlertBanner");
const loggedOutPanel = document.getElementById("loggedOutPanel");

const infoConnection = document.getElementById("infoConnection");
const infoState = document.getElementById("infoState");
const infoGate = document.getElementById("infoGate");
const infoMode = document.getElementById("infoMode");
const infoPrediction = document.getElementById("infoPrediction");

const rainForecastValue = document.getElementById("rainForecastValue");
const rainForecastText = document.getElementById("rainForecastText");
const rainForecastIcon = document.getElementById("rainForecastIcon");
const predictedLevelValue = document.getElementById("predictedLevelValue");
const predictedStateText = document.getElementById("predictedStateText");
const recommendationText = document.getElementById("recommendationText");
const predictionCard = document.getElementById("predictionCard");
const predictionChip = document.getElementById("predictionChip");

const gaugeWater = document.getElementById("gaugeWater");
const gaugePercent = document.getElementById("gaugePercent");

const gateLeaf = document.getElementById("gateLeaf");
const flowEffect = document.getElementById("flowEffect");

const toastContainer = document.getElementById("toastContainer");
const readingsTableBody = document.getElementById("readingsTableBody");
const readingsHistory = [];

/* CHART */
const ctx = document.getElementById("levelChart").getContext("2d");
const gradient = ctx.createLinearGradient(0, 0, 0, 360);
gradient.addColorStop(0, "rgba(59, 130, 246, 0.34)");
gradient.addColorStop(1, "rgba(59, 130, 246, 0.02)");

const levelChart = new Chart(ctx, {
  type: "line",
  data: {
    labels: [],
    datasets: [
      {
        label: "Water Level (cm)",
        data: [],
        borderColor: "#60a5fa",
        backgroundColor: gradient,
        pointBackgroundColor: "#93c5fd",
        pointBorderColor: "#60a5fa",
        pointRadius: 3,
        pointHoverRadius: 5,
        borderWidth: 3,
        tension: 0.35,
        fill: true
      }
    ]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "rgba(9,16,28,0.96)",
        titleColor: "#ffffff",
        bodyColor: "#dbeafe",
        borderColor: "rgba(148,163,184,0.2)",
        borderWidth: 1,
        padding: 12
      }
    },
    scales: {
      x: {
        ticks: { color: "#9fb1c9" },
        grid: { color: "rgba(148,163,184,0.08)" },
        title: { display: true, text: "Time", color: "#9fb1c9" }
      },
      y: {
        beginAtZero: true,
        ticks: { color: "#9fb1c9" },
        grid: { color: "rgba(148,163,184,0.08)" },
        title: { display: true, text: "Water Level (cm)", color: "#9fb1c9" }
      }
    }
  }
});

/* HELPERS */
function setText(el, value) {
  if (el) el.innerText = value;
}

function removeClasses(el, classes) {
  if (!el) return;
  classes.forEach((c) => el.classList.remove(c));
}

function showToast(type, title, message) {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <div class="toast-title">${title}</div>
    <div class="toast-msg">${message}</div>
  `;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    toast.style.transition = "0.35s ease";
    setTimeout(() => toast.remove(), 350);
  }, 3500);
}

function getRainIcon(mm) {
  if (mm <= 5) return "🌤️";
  if (mm <= 20) return "🌦️";
  if (mm <= 50) return "🌧️";
  return "⛈️";
}

function buildFallbackPrediction(level, state) {
  let rainfallTomorrow = 0;
  let predictedLevel = level;
  let predictedState = state;
  let recommendation = "No action needed";

  if (state === "SAFE") {
    rainfallTomorrow = 8;
    predictedLevel = level + 5;
    predictedState = "SAFE";
    recommendation = "Continue automatic monitoring";
  } else if (state === "ALARM") {
    rainfallTomorrow = 28;
    predictedLevel = level + 12;
    predictedState = "ALARM";
    recommendation = "Prepare preventive discharge and monitor closely";
  } else {
    rainfallTomorrow = 55;
    predictedLevel = level + 18;
    predictedState = "DANGER";
    recommendation = "Immediate response recommended";
  }

  return {
    rainfallTomorrow,
    predictedLevel,
    predictedState,
    recommendation
  };
}

function updateGauge(distanceCm) {
  const maxDistance = 100; // <-- change based on your sensor height

  let percent = 100 - (distanceCm / maxDistance) * 100;

  // clamp between 0 and 100
  percent = Math.max(0, Math.min(100, Math.round(percent)));

  gaugeWater.style.height = percent + "%";
  gaugePercent.innerText = percent + "%";
}

function updateGateAnimation() {
  gateLeaf.classList.remove("opened", "moving");
  flowEffect.classList.add("hidden");

  if (gateStatus === "OPEN") {
    gateLeaf.classList.add("opened");
    flowEffect.classList.remove("hidden");
  } else if (gateStatus === "MOVING") {
    gateLeaf.classList.add("moving");
  }
}

function setRiskTheme(state) {
  removeClasses(stateCard, ["state-safe", "state-alarm", "state-danger"]);
  removeClasses(heroRiskText, ["safe-text", "alarm-text", "danger-text"]);
  removeClasses(globalAlertBanner, ["safe-banner", "alarm-banner", "danger-banner"]);

  if (state === "SAFE") {
    stateCard.classList.add("state-safe");
    heroRiskText.classList.add("safe-text");
    globalAlertBanner.classList.add("safe-banner");
    setText(stateChip, "Normal");
    setText(heroRiskText, "SAFE");
    globalAlertBanner.querySelector(".banner-icon").innerText = "🟢";
    globalAlertBanner.querySelector(".banner-title").innerText = "System Stable";
    globalAlertBanner.querySelector(".banner-subtitle").innerText =
      "All monitored conditions are within normal operating range.";
  } else if (state === "ALARM") {
    stateCard.classList.add("state-alarm");
    heroRiskText.classList.add("alarm-text");
    globalAlertBanner.classList.add("alarm-banner");
    setText(stateChip, "Warning");
    setText(heroRiskText, "ALARM");
    globalAlertBanner.querySelector(".banner-icon").innerText = "🟠";
    globalAlertBanner.querySelector(".banner-title").innerText = "Preventive Attention Required";
    globalAlertBanner.querySelector(".banner-subtitle").innerText =
      "Reservoir conditions indicate elevated risk. Monitoring and preventive action may be required.";
  } else {
    stateCard.classList.add("state-danger");
    heroRiskText.classList.add("danger-text");
    globalAlertBanner.classList.add("danger-banner");
    setText(stateChip, "Critical");
    setText(heroRiskText, "DANGER");
    globalAlertBanner.querySelector(".banner-icon").innerText = "🔴";
    globalAlertBanner.querySelector(".banner-title").innerText = "Critical Flood Risk Detected";
    globalAlertBanner.querySelector(".banner-subtitle").innerText =
      "Immediate response is recommended due to critical overflow risk conditions.";
  }

  setText(infoState, state);
}

function setPredictionTheme(predictedState) {
  removeClasses(predictionCard, ["prediction-safe", "prediction-alarm", "prediction-danger"]);

  if (predictedState === "SAFE") {
    predictionCard.classList.add("prediction-safe");
    setText(predictionChip, "Low Risk");
    setText(infoPrediction, "SAFE");
  } else if (predictedState === "ALARM") {
    predictionCard.classList.add("prediction-alarm");
    setText(predictionChip, "Watch");
    setText(infoPrediction, "ALARM");
  } else {
    predictionCard.classList.add("prediction-danger");
    setText(predictionChip, "Critical");
    setText(infoPrediction, "DANGER");
  }
}

function updatePredictionUI(prediction, level, state) {
  const p = prediction || buildFallbackPrediction(level, state);

  setText(rainForecastValue, p.rainfallTomorrow + " mm");
  setText(rainForecastText, "Forecast rainfall");
  setText(rainForecastIcon, getRainIcon(Number(p.rainfallTomorrow || 0)));

  setText(predictedLevelValue, p.predictedLevel + " cm");
  setText(predictedStateText, "Predicted state: " + p.predictedState);
  setText(recommendationText, "Recommendation: " + p.recommendation);

  setPredictionTheme(p.predictedState);
}

function getStateClass(state) {
  if (state === "SAFE") return "reading-safe";
  if (state === "ALARM") return "reading-alarm";
  return "reading-danger";
}

function renderReadingsTable() {
  if (!readingsTableBody) return;

  if (readingsHistory.length === 0) {
    readingsTableBody.innerHTML = `
      <tr>
        <td colspan="5">No readings available yet</td>
      </tr>
    `;
    return;
  }

  readingsTableBody.innerHTML = readingsHistory.map((reading) => `
    <tr>
      <td>${reading.time}</td>
      <td>${reading.level}</td>
      <td class="${getStateClass(reading.state)}">${reading.state}</td>
      <td>${reading.gate}</td>
      <td>${reading.mode}</td>
    </tr>
  `).join("");
}

async function clearReadingsHistory() {
  try {
    const response = await fetch("/api/history", {
      method: "DELETE"
    });

    const result = await response.json();

    if (result.success) {
      readingsHistory.length = 0;
      renderReadingsTable();
      showToast("warning", "History Cleared", "Recent readings table has been cleared.");
    } else {
      showToast("danger", "Clear Failed", "Could not clear readings history.");
    }
  } catch (error) {
    showToast("danger", "Clear Failed", "Server error while clearing history.");
  }
}

function downloadPDFReport() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast("danger", "PDF Error", "PDF library not loaded.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.text("Smart Dam Safety System", 14, 18);

  doc.setFontSize(11);
  doc.text("Monitoring Report", 14, 26);
  doc.text("Generated: " + new Date().toLocaleString(), 14, 33);

  doc.setFontSize(10);
  doc.text("Current Water Level: " + (levelValue?.innerText || "--"), 14, 45);
  doc.text("Current State: " + (stateValue?.innerText || "--"), 14, 52);
  doc.text("Gate Status: " + (gateMainText?.innerText || "--"), 14, 59);
  doc.text("Control Mode: " + (modeValue?.innerText || "--"), 14, 66);

  const rows = readingsHistory.map((r) => [
    r.time,
    String(r.level),
    r.state,
    r.gate,
    r.mode
  ]);

  doc.autoTable({
    head: [["Time", "Water Level (cm)", "State", "Gate", "Mode"]],
    body: rows.length ? rows : [["No readings available", "-", "-", "-", "-"]],
    startY: 76,
    styles: {
      fontSize: 9,
      cellPadding: 3
    },
    headStyles: {
      fillColor: [37, 99, 235]
    }
  });

  doc.save("smart-dam-report.pdf");
  showToast("safe", "PDF Downloaded", "Monitoring report PDF has been generated.");
}

function updateDeviceUI() {
  if (deviceConnected) {
    deviceBadge.innerHTML = `<span class="badge-dot"></span> Device Online`;
    deviceBadge.className = "badge online";
    setText(infoConnection, "Online");
  } else {
    deviceBadge.innerHTML = `<span class="badge-dot"></span> Device Offline`;
    deviceBadge.className = "badge offline";
    setText(infoConnection, "Offline");
  }

  if (previousDeviceStatus !== null && previousDeviceStatus !== deviceConnected) {
    showToast(
      deviceConnected ? "safe" : "danger",
      deviceConnected ? "Device Connected" : "Device Offline",
      deviceConnected
        ? "Embedded monitoring device is now online."
        : "Live device connection lost. Monitoring updates may be interrupted."
    );
  }

  previousDeviceStatus = deviceConnected;
  updateButtonState();
}

function updateGateUI() {
  if (gateStatus === "OPEN") {
    gateBadge.innerHTML = `<span class="badge-dot"></span> Gate Open`;
    gateBadge.className = "badge open";
    setText(gateText, "🚪 Gate: OPEN");
    setText(gateMainText, "OPEN");
    setText(infoGate, "OPEN");
  } else if (gateStatus === "CLOSED") {
    gateBadge.innerHTML = `<span class="badge-dot"></span> Gate Closed`;
    gateBadge.className = "badge closed";
    setText(gateText, "🚪 Gate: CLOSED");
    setText(gateMainText, "CLOSED");
    setText(infoGate, "CLOSED");
  } else {
    gateBadge.innerHTML = `<span class="badge-dot"></span> Gate Moving`;
    gateBadge.className = "badge moving";
    setText(gateText, "⚙ Gate: MOVING");
    setText(gateMainText, "MOVING");
    setText(infoGate, "MOVING");
  }

  updateGateAnimation();

  if (previousGateStatus && previousGateStatus !== gateStatus) {
    if (gateStatus === "OPEN") {
      showToast("warning", "Gate Opened", "Spillway gate is open for controlled discharge.");
    } else if (gateStatus === "CLOSED") {
      showToast("safe", "Gate Closed", "Spillway gate has been closed.");
    } else if (gateStatus === "MOVING") {
      showToast("warning", "Gate Moving", "Gate mechanism is currently in motion.");
    }
  }

  previousGateStatus = gateStatus;

  setText(modeText, "Mode: " + controlMode);
  setText(modeValue, controlMode);
  setText(heroModeText, controlMode);
  setText(infoMode, controlMode);

  removeClasses(heroModeText, ["safe-text", "alarm-text", "danger-text", "neutral-text"]);

  if (controlMode === "MANUAL") {
    setText(modeText, "Mode: MANUAL OVERRIDE");
    modeText.style.color = "#fecaca";
    heroModeText.classList.add("danger-text");
    modeNote.innerText = "⚠ Engineer emergency control active";
    modeNote.classList.add("manual-warning");
  } else {
    modeText.style.color = "";
    heroModeText.classList.add("neutral-text");
    modeNote.innerText = "Automatic gate control active";
    modeNote.classList.remove("manual-warning");
  }

  updateButtonState();
}

function updateAdminUI() {
  if (isAdmin) {
    controlPanel.classList.remove("hidden");
    loggedOutPanel.classList.add("hidden");
  } else {
    controlPanel.classList.add("hidden");
    loggedOutPanel.classList.remove("hidden");
  }

  updateButtonState();
}

function updateButtonState() {
  if (!isAdmin || !deviceConnected) {
    openBtn.disabled = true;
    closeBtn.disabled = true;
    autoBtn.disabled = true;

    if (!isAdmin) {
      controlMessage.innerText = "Admin login required for manual control";
    } else if (!deviceConnected) {
      controlMessage.innerText = "Device offline - manual control unavailable";
    }
    return;
  }

  if (controlMode === "MANUAL") {
    if (gateStatus === "CLOSED") {
      openBtn.disabled = false;
      closeBtn.disabled = true;
      autoBtn.disabled = false;
      controlMessage.innerText = "Manual mode active: gate is closed. Open gate or return to AUTO.";
    } else if (gateStatus === "OPEN") {
      openBtn.disabled = true;
      closeBtn.disabled = false;
      autoBtn.disabled = true;
      controlMessage.innerText = "Manual mode active: gate is open. Close the gate before AUTO.";
    } else {
      openBtn.disabled = true;
      closeBtn.disabled = true;
      autoBtn.disabled = true;
      controlMessage.innerText = "Gate is moving. Controls are temporarily locked.";
    }
    return;
  }

  if (gateStatus === "CLOSED") {
    openBtn.disabled = false;
    closeBtn.disabled = true;
    autoBtn.disabled = true;
    controlMessage.innerText = "AUTO mode: gate is closed. OPEN command is available.";
  } else if (gateStatus === "OPEN") {
    openBtn.disabled = true;
    closeBtn.disabled = false;
    autoBtn.disabled = true;
    controlMessage.innerText = "AUTO mode: gate is open. CLOSE command is available.";
  } else {
    openBtn.disabled = true;
    closeBtn.disabled = true;
    autoBtn.disabled = true;
    controlMessage.innerText = "Gate is moving. Controls are temporarily disabled.";
  }
}

socket.on("update", (data) => {
  const level = Number(data.level || 0);
  const state = data.state || "SAFE";

  setText(levelEl, "Water Level: " + level + " cm");
  setText(levelValue, level + " cm");

  gateStatus = data.gate || "CLOSED";
  controlMode = data.mode || "AUTO";

  setText(stateValue, state);

  if (state === "SAFE") {
    setText(stateEl, "🟢 Status: SAFE");
    stateEl.style.color = "#86efac";
  } else if (state === "ALARM") {
    setText(stateEl, "🟠 Status: ALARM");
    stateEl.style.color = "#fdba74";
  } else {
    setText(stateEl, "🔴 Status: DANGER");
    stateEl.style.color = "#fca5a5";
  }

  if (previousRiskState && previousRiskState !== state) {
    if (state === "ALARM") {
      showToast("warning", "Warning", "Reservoir conditions have moved to ALARM level.");
    } else if (state === "DANGER") {
      showToast("danger", "Danger", "Critical flood risk detected. Immediate attention required.");
    } else if (state === "SAFE") {
      showToast("safe", "Safe", "System has returned to safe operating condition.");
    }
  }
  previousRiskState = state;

  setRiskTheme(state);
  updateGateUI();
  updatePredictionUI(data.prediction, level, state);
  updateGauge(level);

  if (Array.isArray(data.history)) {
    readingsHistory.length = 0;
    data.history.forEach((item) => readingsHistory.push(item));
    renderReadingsTable();
  }

  const now = new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

  levelChart.data.labels.push(now);
  levelChart.data.datasets[0].data.push(level);

  if (levelChart.data.labels.length > 20) {
    levelChart.data.labels.shift();
    levelChart.data.datasets[0].data.shift();
  }

  levelChart.update();
});

socket.on("device-status", (data) => {
  deviceConnected = data.connected;
  updateDeviceUI();
});

socket.on("history-cleared", () => {
  readingsHistory.length = 0;
  renderReadingsTable();
});

function showLoginModal() {
  loginModal.classList.remove("hidden");
  loginMessage.innerText = "";
  adminPasswordInput.value = "";
  adminPasswordInput.focus();
}

function hideLoginModal() {
  loginModal.classList.add("hidden");
}

async function loginAdmin() {
  const password = adminPasswordInput.value.trim();

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ password })
    });

    const result = await response.json();

    if (result.success) {
      isAdmin = true;
      sessionStorage.setItem("isAdmin", "true");
      updateAdminUI();
      hideLoginModal();
      showToast("safe", "Login Successful", "Engineer access granted.");
    } else {
      loginMessage.innerText = "Wrong password";
      showToast("danger", "Login Failed", "Incorrect engineer password.");
    }
  } catch (error) {
    loginMessage.innerText = "Login failed";
    showToast("danger", "Login Error", "Unable to complete authentication.");
  }
}

function logoutAdmin() {
  isAdmin = false;
  sessionStorage.removeItem("isAdmin");
  updateAdminUI();
  showToast("warning", "Logged Out", "Engineer manual control session ended.");
}

function openGate() {
  if (!isAdmin || !deviceConnected || gateStatus !== "CLOSED") return;
  socket.emit("manual-control", "OPEN");
  showToast("warning", "Open Command Sent", "Opening command has been sent to gate controller.");
}

function closeGate() {
  if (!isAdmin || !deviceConnected || gateStatus !== "OPEN") return;
  socket.emit("manual-control", "CLOSE");
  showToast("warning", "Close Command Sent", "Closing command has been sent to gate controller.");
}

function returnToAuto() {
  if (!isAdmin || !deviceConnected) return;
  if (controlMode !== "MANUAL") return;
  if (gateStatus !== "CLOSED") return;

  socket.emit("manual-control", "AUTO");
  showToast("safe", "Auto Mode Enabled", "System returned to automatic control mode.");
}

adminPasswordInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loginAdmin();
  }
});

window.addEventListener("load", () => {
  isAdmin = sessionStorage.getItem("isAdmin") === "true";
  hideLoginModal();
  updateAdminUI();
  updateDeviceUI();
  updateGateUI();
  updateGauge(0);
  renderReadingsTable();
  socket.emit("request-status");
});