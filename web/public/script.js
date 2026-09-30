/* ==========================================================================
   SMART DAM SAFETY SYSTEM - SCADA CLIENT APPLICATION LOGIC
   Production-grade WebSocket, UI updates, chart rendering & supervisory control
   ========================================================================== */

const socket = (typeof io === "function") ? io() : null;

// State variables
let deviceConnected = false;
let gateStatus = "CLOSED";
let controlMode = "AUTO";
let isAdmin = false;
let previousRiskState = null;
let previousGateStatus = null;
let previousDeviceStatus = null;
const readingsHistory = [];

/* --------------------------------------------------------------------------
   DOM ELEMENT SELECTORS
   -------------------------------------------------------------------------- */
// Status & Header Elements
const levelEl = document.getElementById("level");
const stateEl = document.getElementById("state");
const gateText = document.getElementById("gateText");
const modeText = document.getElementById("modeText");
const liveSystemClock = document.getElementById("liveSystemClock");
const heroRiskText = document.getElementById("heroRiskText");
const heroModeText = document.getElementById("heroModeText");
const globalAlertBanner = document.getElementById("globalAlertBanner");
const bannerLastUpdated = document.getElementById("bannerLastUpdated");

// Badges
const deviceBadge = document.getElementById("deviceBadge");
const mobileDeviceBadge = document.getElementById("mobileDeviceBadge");
const gateBadge = document.getElementById("gateBadge");
const gateVisualBadge = document.getElementById("gateVisualBadge");
const capacityStatusText = document.getElementById("capacityStatusText");

// Metric Cards Elements
const levelValue = document.getElementById("levelValue");
const stateCard = document.getElementById("stateCard");
const stateChip = document.getElementById("stateChip");
const stateValue = document.getElementById("stateValue");
const gateMainText = document.getElementById("gateMainText");
const modeValue = document.getElementById("modeValue");
const modeNote = document.getElementById("modeNote");

const rainForecastValue = document.getElementById("rainForecastValue");
const rainForecastText = document.getElementById("rainForecastText");
const rainForecastIcon = document.getElementById("rainForecastIcon");

const predictionCard = document.getElementById("predictionCard");
const predictionChip = document.getElementById("predictionChip");
const predictedLevelValue = document.getElementById("predictedLevelValue");
const predictedStateText = document.getElementById("predictedStateText");
const recommendationText = document.getElementById("recommendationText");

// Visual Gauge & Actuators
const gaugeWater = document.getElementById("gaugeWater");
const gaugePercent = document.getElementById("gaugePercent");
const gaugeCapacityLabel = document.getElementById("gaugeCapacityLabel");
const gateLeaf = document.getElementById("gateLeaf");
const flowEffect = document.getElementById("flowEffect");

// Operational Snapshot
const infoConnection = document.getElementById("infoConnection");
const infoState = document.getElementById("infoState");
const infoGate = document.getElementById("infoGate");
const infoMode = document.getElementById("infoMode");
const infoPrediction = document.getElementById("infoPrediction");

// Engineer Control Panel
const controlPanel = document.getElementById("controlPanel");
const controlMessage = document.getElementById("controlMessage");
const loggedOutPanel = document.getElementById("loggedOutPanel");
const openBtn = document.getElementById("openBtn");
const closeBtn = document.getElementById("closeBtn");
const autoBtn = document.getElementById("autoBtn");
const adminLogoutBtn = document.getElementById("adminLogoutBtn");
const adminIconBtn = document.getElementById("adminIconBtn");

// Theme Toggle Elements
const themeToggleBtn = document.getElementById("themeToggleBtn");
const themeToggleLabel = document.getElementById("themeToggleLabel");
const sidebarDarkBtn = document.getElementById("sidebarDarkBtn");
const sidebarLightBtn = document.getElementById("sidebarLightBtn");
const mobileThemeToggleBtn = document.getElementById("mobileThemeToggleBtn");

// Login Modal
const loginModal = document.getElementById("loginModal");
const loginMessage = document.getElementById("loginMessage");
const adminPasswordInput = document.getElementById("adminPassword");

// Mobile Drawer Elements
const menuToggleBtn = document.getElementById("menuToggleBtn");
const appSidebar = document.getElementById("appSidebar");
const sidebarBackdrop = document.getElementById("sidebarBackdrop");
const navItems = document.querySelectorAll(".nav-item");

// Table & Toast
const toastContainer = document.getElementById("toastContainer");
const readingsTableBody = document.getElementById("readingsTableBody");

/* --------------------------------------------------------------------------
   LIVE SYSTEM CLOCK
   -------------------------------------------------------------------------- */
function updateSystemClock() {
  if (!liveSystemClock) return;
  const now = new Date();
  liveSystemClock.innerText = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}
setInterval(updateSystemClock, 1000);
updateSystemClock();

/* --------------------------------------------------------------------------
   CHART SETUP (Chart.js)
   -------------------------------------------------------------------------- */
const chartCanvas = document.getElementById("levelChart");
const ctx = chartCanvas ? chartCanvas.getContext("2d") : null;

let levelChart = null;

if (ctx) {
  const gradient = ctx.createLinearGradient(0, 0, 0, 320);
  gradient.addColorStop(0, "rgba(59, 130, 246, 0.35)");
  gradient.addColorStop(1, "rgba(59, 130, 246, 0.02)");

  levelChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label: "Water Distance (cm)",
          data: [],
          borderColor: "#60a5fa",
          backgroundColor: gradient,
          pointBackgroundColor: "#93c5fd",
          pointBorderColor: "#3b82f6",
          pointRadius: 4,
          pointHoverRadius: 6,
          borderWidth: 2.5,
          tension: 0.38,
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
          backgroundColor: "rgba(10, 21, 38, 0.94)",
          titleColor: "#ffffff",
          bodyColor: "#93c5fd",
          borderColor: "rgba(148, 163, 184, 0.2)",
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            label: (context) => `Distance: ${context.parsed.y} cm`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#64748b", font: { family: "'JetBrains Mono', monospace", size: 11 } },
          grid: { color: "rgba(148, 163, 184, 0.06)" }
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#64748b", font: { family: "'JetBrains Mono', monospace", size: 11 } },
          grid: { color: "rgba(148, 163, 184, 0.06)" },
          title: {
            display: true,
            text: "Distance to Surface (cm)",
            color: "#64748b",
            font: { size: 11, weight: "600" }
          }
        }
      }
    }
  });
}

/* --------------------------------------------------------------------------
   THEME MANAGEMENT (DARK / LIGHT SCADA MODE)
   -------------------------------------------------------------------------- */
function applyChartTheme(theme) {
  if (!levelChart) return;
  const isLight = theme === "light";

  // Scales & Gridlines
  if (levelChart.options && levelChart.options.scales) {
    if (levelChart.options.scales.x) {
      levelChart.options.scales.x.ticks.color = isLight ? "#475569" : "#64748b";
      levelChart.options.scales.x.grid.color = isLight ? "rgba(15, 23, 42, 0.08)" : "rgba(148, 163, 184, 0.06)";
    }
    if (levelChart.options.scales.y) {
      levelChart.options.scales.y.ticks.color = isLight ? "#475569" : "#64748b";
      levelChart.options.scales.y.grid.color = isLight ? "rgba(15, 23, 42, 0.08)" : "rgba(148, 163, 184, 0.06)";
      if (levelChart.options.scales.y.title) {
        levelChart.options.scales.y.title.color = isLight ? "#475569" : "#64748b";
      }
    }
  }

  // Tooltip
  if (levelChart.options && levelChart.options.plugins && levelChart.options.plugins.tooltip) {
    levelChart.options.plugins.tooltip.backgroundColor = isLight ? "rgba(15, 23, 42, 0.94)" : "rgba(10, 21, 38, 0.94)";
    levelChart.options.plugins.tooltip.titleColor = "#ffffff";
    levelChart.options.plugins.tooltip.bodyColor = isLight ? "#60a5fa" : "#93c5fd";
    levelChart.options.plugins.tooltip.borderColor = isLight ? "rgba(255, 255, 255, 0.15)" : "rgba(148, 163, 184, 0.2)";
  }

  // Dataset Colors & Gradient
  if (ctx && levelChart.data && levelChart.data.datasets && levelChart.data.datasets.length > 0) {
    const gradient = ctx.createLinearGradient(0, 0, 0, 320);
    if (isLight) {
      gradient.addColorStop(0, "rgba(37, 99, 235, 0.28)");
      gradient.addColorStop(1, "rgba(37, 99, 235, 0.02)");
      levelChart.data.datasets[0].borderColor = "#2563eb";
      levelChart.data.datasets[0].pointBackgroundColor = "#3b82f6";
      levelChart.data.datasets[0].pointBorderColor = "#1d4ed8";
    } else {
      gradient.addColorStop(0, "rgba(59, 130, 246, 0.35)");
      gradient.addColorStop(1, "rgba(59, 130, 246, 0.02)");
      levelChart.data.datasets[0].borderColor = "#60a5fa";
      levelChart.data.datasets[0].pointBackgroundColor = "#93c5fd";
      levelChart.data.datasets[0].pointBorderColor = "#3b82f6";
    }
    levelChart.data.datasets[0].backgroundColor = gradient;
  }

  levelChart.update("none");
}

function updateThemeUI(theme) {
  const isLight = theme === "light";
  if (themeToggleLabel) {
    themeToggleLabel.textContent = isLight ? "Light Mode" : "Dark Mode";
  }
  if (sidebarDarkBtn) {
    sidebarDarkBtn.classList.toggle("active", !isLight);
  }
  if (sidebarLightBtn) {
    sidebarLightBtn.classList.toggle("active", isLight);
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem("dam_safety_theme", theme);
  } catch (e) {}

  updateThemeUI(theme);
  applyChartTheme(theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "light" ? "dark" : "light";
  setTheme(next);
}

// Expose globally so inline onclick handlers always work
window.applyChartTheme = applyChartTheme;
window.setTheme = setTheme;
window.toggleTheme = toggleTheme;

function initTheme() {
  let theme = "dark";
  try {
    const saved = localStorage.getItem("dam_safety_theme");
    if (saved) {
      theme = saved;
    } else if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      theme = "light";
    }
  } catch (e) {}

  setTheme(theme);

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener("click", toggleTheme);
  }
  if (mobileThemeToggleBtn) {
    mobileThemeToggleBtn.addEventListener("click", toggleTheme);
  }
  if (sidebarDarkBtn) {
    sidebarDarkBtn.addEventListener("click", () => setTheme("dark"));
  }
  if (sidebarLightBtn) {
    sidebarLightBtn.addEventListener("click", () => setTheme("light"));
  }

  // Listen to OS theme changes if user has no saved preference
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
      try {
        if (!localStorage.getItem("dam_safety_theme")) {
          setTheme(e.matches ? "dark" : "light");
        }
      } catch (err) {}
    });
  }
}

// Initialize Theme immediately
initTheme();

/* --------------------------------------------------------------------------
   MOBILE DRAWER & NAVIGATION
   -------------------------------------------------------------------------- */
function openSidebar() {
  if (appSidebar) appSidebar.classList.add("open");
  if (sidebarBackdrop) sidebarBackdrop.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeSidebar() {
  if (appSidebar) appSidebar.classList.remove("open");
  if (sidebarBackdrop) sidebarBackdrop.classList.remove("active");
  document.body.style.overflow = "";
}

if (menuToggleBtn) {
  menuToggleBtn.addEventListener("click", () => {
    if (appSidebar && appSidebar.classList.contains("open")) {
      closeSidebar();
    } else {
      openSidebar();
    }
  });
}

if (sidebarBackdrop) {
  sidebarBackdrop.addEventListener("click", closeSidebar);
}

// Nav link click & active state handling
navItems.forEach((item) => {
  item.addEventListener("click", (e) => {
    navItems.forEach((n) => n.classList.remove("active"));
    item.classList.add("active");
    if (window.innerWidth <= 1080) {
      closeSidebar();
    }
  });
});

// Scrollspy for active navigation tracking
window.addEventListener("scroll", () => {
  const scrollPosition = window.scrollY + 160;
  const sections = ["overview", "analytics", "operations", "forecast", "logs"];

  for (const id of sections) {
    const section = document.getElementById(id);
    if (section) {
      const top = section.offsetTop;
      const height = section.offsetHeight;
      if (scrollPosition >= top && scrollPosition < top + height) {
        navItems.forEach((link) => {
          if (link.getAttribute("href") === `#${id}`) {
            link.classList.add("active");
          } else {
            link.classList.remove("active");
          }
        });
        break;
      }
    }
  }
});

/* --------------------------------------------------------------------------
   UI HELPERS & TOASTS
   -------------------------------------------------------------------------- */
function setText(el, value) {
  if (el) el.innerText = value;
}

function removeClasses(el, classes) {
  if (!el) return;
  classes.forEach((c) => el.classList.remove(c));
}

function showToast(type, title, message) {
  if (!toastContainer) return;

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
    toast.style.transition = "0.3s ease";
    setTimeout(() => toast.remove(), 320);
  }, 4500);
}

function getRainIcon(mm) {
  if (mm <= 5) return "🌤️";
  if (mm <= 20) return "🌦️";
  if (mm <= 40) return "🌧️";
  return "⛈️";
}

function buildFallbackPrediction(level, state) {
  let rainfallTomorrow = 0;
  let predictedLevel = level;
  let predictedState = state;
  let recommendation = "Standard telemetry monitoring";

  if (state === "SAFE") {
    rainfallTomorrow = 8;
    predictedLevel = Math.max(0, level - 4);
    predictedState = "SAFE";
    recommendation = "Normal conditions: continue automated monitoring.";
  } else if (state === "ALARM") {
    rainfallTomorrow = 28;
    predictedLevel = Math.max(0, level - 8);
    predictedState = "ALARM";
    recommendation = "Elevated reservoir inflow: prepare controlled release.";
  } else {
    rainfallTomorrow = 55;
    predictedLevel = Math.max(0, level - 14);
    predictedState = "DANGER";
    recommendation = "Critical flood risk: immediate spillway gate discharge advised.";
  }

  return { rainfallTomorrow, predictedLevel, predictedState, recommendation };
}

/* --------------------------------------------------------------------------
   RESERVOIR LIQUID GAUGE LOGIC
   Sensor mounted 30cm above bed.
   Distance > 25cm -> <17% (Safe)
   Distance 10-25cm -> 17-67% (Alarm)
   Distance < 10cm -> >67% (Danger)
   -------------------------------------------------------------------------- */
function updateGauge(distanceCm) {
  if (!gaugeWater || !gaugePercent) return;

  if (!deviceConnected && distanceCm === 0) {
    gaugeWater.style.height = "0%";
    gaugePercent.innerText = "0%";
    if (gaugeCapacityLabel) gaugeCapacityLabel.innerText = "Offline";
    if (capacityStatusText) {
      capacityStatusText.innerText = "Standby";
      capacityStatusText.className = "chip";
    }
    return;
  }

  const maxSensorDepth = 30; // Total depth from sensor to dam bottom (cm)
  const waterDepth = Math.max(0, maxSensorDepth - distanceCm);
  let percent = Math.round((waterDepth / maxSensorDepth) * 100);
  percent = Math.max(0, Math.min(100, percent));

  gaugeWater.style.height = `${percent}%`;
  gaugePercent.innerText = `${percent}%`;

  if (percent > 67) {
    gaugeWater.style.background = "linear-gradient(180deg, #ef4444 0%, #dc2626 100%)";
    if (gaugeCapacityLabel) gaugeCapacityLabel.innerText = "Critical Level";
    if (capacityStatusText) {
      capacityStatusText.innerText = "Danger";
      capacityStatusText.className = "chip chip-danger";
    }
  } else if (percent >= 17) {
    gaugeWater.style.background = "linear-gradient(180deg, #f59e0b 0%, #d97706 100%)";
    if (gaugeCapacityLabel) gaugeCapacityLabel.innerText = "Elevated Inflow";
    if (capacityStatusText) {
      capacityStatusText.innerText = "Alarm";
      capacityStatusText.className = "chip chip-alarm";
    }
  } else {
    gaugeWater.style.background = "linear-gradient(180deg, #3b82f6 0%, #1d4ed8 100%)";
    if (gaugeCapacityLabel) gaugeCapacityLabel.innerText = "Safe Capacity";
    if (capacityStatusText) {
      capacityStatusText.innerText = "Optimal";
      capacityStatusText.className = "chip chip-normal";
    }
  }
}

/* --------------------------------------------------------------------------
   SLUICE GATE MECHANICAL ANIMATION
   -------------------------------------------------------------------------- */
function updateGateAnimation() {
  if (!gateLeaf || !flowEffect) return;

  gateLeaf.classList.remove("opened", "moving");
  flowEffect.classList.add("hidden");

  if (gateStatus === "OPEN") {
    gateLeaf.classList.add("opened");
    flowEffect.classList.remove("hidden");
    if (gateVisualBadge) {
      gateVisualBadge.innerText = "Open (Discharging)";
      gateVisualBadge.className = "badge-mini online";
    }
  } else if (gateStatus === "MOVING") {
    gateLeaf.classList.add("moving");
    if (gateVisualBadge) {
      gateVisualBadge.innerText = "Actuating...";
      gateVisualBadge.className = "badge-mini closed";
    }
  } else {
    if (gateVisualBadge) {
      gateVisualBadge.innerText = "Closed";
      gateVisualBadge.className = "badge-mini closed";
    }
  }
}

/* --------------------------------------------------------------------------
   RISK THEME & ALERT BANNER
   -------------------------------------------------------------------------- */
function setRiskTheme(state) {
  removeClasses(globalAlertBanner, ["safe-banner", "alarm-banner", "danger-banner"]);
  removeClasses(heroRiskText, ["safe-text", "alarm-text", "danger-text"]);
  removeClasses(stateValue, ["state-safe-text", "state-alarm-text", "state-danger-text"]);
  removeClasses(stateChip, ["chip-normal", "chip-alarm", "chip-danger"]);

  const bannerTitle = globalAlertBanner?.querySelector(".banner-title");
  const bannerSubtitle = globalAlertBanner?.querySelector(".banner-subtitle");

  if (state === "SAFE") {
    globalAlertBanner?.classList.add("safe-banner");
    heroRiskText?.classList.add("safe-text");
    stateValue?.classList.add("state-safe-text");
    stateChip?.classList.add("chip-normal");

    setText(stateChip, "Normal");
    setText(heroRiskText, "SAFE");
    if (bannerTitle) bannerTitle.innerText = "System Stable - Normal Operating Limit";
    if (bannerSubtitle) bannerSubtitle.innerText = "All monitored reservoir parameters are operating within safe baseline limits.";
  } else if (state === "ALARM") {
    globalAlertBanner?.classList.add("alarm-banner");
    heroRiskText?.classList.add("alarm-text");
    stateValue?.classList.add("state-alarm-text");
    stateChip?.classList.add("chip-alarm");

    setText(stateChip, "Warning");
    setText(heroRiskText, "ALARM");
    if (bannerTitle) bannerTitle.innerText = "Preventive Attention Required";
    if (bannerSubtitle) bannerSubtitle.innerText = "Elevated reservoir level detected. Continuous monitoring and spillway preparation active.";
  } else {
    globalAlertBanner?.classList.add("danger-banner");
    heroRiskText?.classList.add("danger-text");
    stateValue?.classList.add("state-danger-text");
    stateChip?.classList.add("chip-danger");

    setText(stateChip, "Critical");
    setText(heroRiskText, "DANGER");
    if (bannerTitle) bannerTitle.innerText = "Critical Flood Risk Detected";
    if (bannerSubtitle) bannerSubtitle.innerText = "Spillway discharge active or recommended to prevent reservoir overtopping.";
  }

  setText(infoState, state);
  if (infoState) {
    infoState.className = `info-val ${state === "SAFE" ? "val-safe" : state === "ALARM" ? "val-alarm" : "val-danger"}`;
  }
}

function setPredictionTheme(predictedState) {
  removeClasses(predictionCard, ["prediction-safe", "prediction-alarm", "prediction-danger"]);

  if (predictedState === "SAFE") {
    predictionCard?.classList.add("prediction-safe");
    setText(predictionChip, "Low Risk");
    setText(infoPrediction, "SAFE");
    if (infoPrediction) infoPrediction.className = "info-val val-safe";
  } else if (predictedState === "ALARM") {
    predictionCard?.classList.add("prediction-alarm");
    setText(predictionChip, "Watch Alert");
    setText(infoPrediction, "ALARM");
    if (infoPrediction) infoPrediction.className = "info-val val-alarm";
  } else {
    predictionCard?.classList.add("prediction-danger");
    setText(predictionChip, "Severe Risk");
    setText(infoPrediction, "DANGER");
    if (infoPrediction) infoPrediction.className = "info-val val-danger";
  }
}

function updatePredictionUI(prediction, level, state) {
  const p = prediction || buildFallbackPrediction(level, state);

  setText(rainForecastValue, `${p.rainfallTomorrow} mm`);
  setText(rainForecastText, "Expected rainfall next 24h");
  setText(rainForecastIcon, getRainIcon(Number(p.rainfallTomorrow || 0)));

  setText(predictedLevelValue, `${p.predictedLevel} cm`);
  setText(predictedStateText, `Forecast State: ${p.predictedState}`);
  setText(recommendationText, `Recommendation: ${p.recommendation}`);

  setPredictionTheme(p.predictedState);
}

/* --------------------------------------------------------------------------
   TELEMETRY LOGS TABLE
   -------------------------------------------------------------------------- */
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
        <td colspan="5" class="empty-table-cell">
          <div class="empty-state-box">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
            <p>No telemetry readings recorded yet. Awaiting packets from ESP8266.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  readingsTableBody.innerHTML = readingsHistory.map((reading) => `
    <tr>
      <td>${reading.time}</td>
      <td><strong>${reading.level}</strong> cm</td>
      <td class="${getStateClass(reading.state)}">${reading.state}</td>
      <td>${reading.gate}</td>
      <td>${reading.mode}</td>
    </tr>
  `).join("");
}

async function clearReadingsHistory() {
  try {
    const response = await fetch("/api/history", { method: "DELETE" });
    const result = await response.json();

    if (result.success) {
      readingsHistory.length = 0;
      renderReadingsTable();
      showToast("warning", "History Cleared", "Telemetry logs have been cleared from memory.");
    } else {
      showToast("danger", "Clear Failed", "Could not clear readings history.");
    }
  } catch (error) {
    showToast("danger", "Clear Failed", "Server error while clearing logs.");
  }
}

function downloadPDFReport() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    showToast("danger", "PDF Error", "PDF generation library failed to load.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();

  doc.setFontSize(18);
  doc.setTextColor(30, 41, 59);
  doc.text("Intelligent Dam Safety System", 14, 20);

  doc.setFontSize(11);
  doc.setTextColor(71, 85, 105);
  doc.text("SCADA Operational Telemetry & Safety Report", 14, 28);
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 35);

  doc.setFontSize(10);
  doc.text(`Current Water Distance: ${levelValue?.innerText || "--"}`, 14, 46);
  doc.text(`System Safety State: ${stateValue?.innerText || "--"}`, 14, 53);
  doc.text(`Sluice Gate Status: ${gateMainText?.innerText || "--"}`, 14, 60);
  doc.text(`Supervisory Mode: ${modeValue?.innerText || "--"}`, 14, 67);

  const rows = readingsHistory.map((r) => [
    r.time,
    `${r.level} cm`,
    r.state,
    r.gate,
    r.mode
  ]);

  doc.autoTable({
    head: [["Timestamp", "Water Distance", "Safety State", "Gate Position", "Mode"]],
    body: rows.length ? rows : [["No readings recorded", "-", "-", "-", "-"]],
    startY: 76,
    theme: "striped",
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontStyle: "bold"
    },
    styles: {
      fontSize: 9,
      cellPadding: 4
    }
  });

  doc.save("dam-safety-scada-report.pdf");
  showToast("safe", "Report Generated", "PDF telemetry report downloaded successfully.");
}

/* --------------------------------------------------------------------------
   HARDWARE & ACTUATOR SYNCHRONIZATION
   -------------------------------------------------------------------------- */
function updateDeviceUI() {
  const text = deviceConnected ? "Device Online" : "Device Offline";
  const badgeClass = deviceConnected ? "badge online" : "badge offline";
  const miniClass = deviceConnected ? "badge-mini online" : "badge-mini offline";

  if (deviceBadge) {
    deviceBadge.innerHTML = `<span class="badge-dot"></span> <span class="badge-text">${text}</span>`;
    deviceBadge.className = badgeClass;
  }

  if (mobileDeviceBadge) {
    mobileDeviceBadge.innerHTML = `<span class="badge-dot"></span> <span class="badge-mini-text">${deviceConnected ? "Online" : "Offline"}</span>`;
    mobileDeviceBadge.className = miniClass;
  }

  setText(infoConnection, deviceConnected ? "Online" : "Offline");
  if (infoConnection) {
    infoConnection.className = `info-val ${deviceConnected ? "val-safe" : "val-offline"}`;
  }

  if (previousDeviceStatus !== null && previousDeviceStatus !== deviceConnected) {
    showToast(
      deviceConnected ? "safe" : "danger",
      deviceConnected ? "ESP8266 Connected" : "ESP8266 Disconnected",
      deviceConnected
        ? "Wireless telemetry link established with embedded controller."
        : "Heartbeat lost. Check ESP8266 WiFi power and serial link."
    );
  }

  previousDeviceStatus = deviceConnected;
  updateButtonState();
}

function updateGateUI() {
  if (gateStatus === "OPEN") {
    if (gateBadge) {
      gateBadge.innerHTML = `<span class="badge-dot"></span> <span class="badge-text">Gate Open</span>`;
      gateBadge.className = "badge open";
    }
    setText(gateText, "Gate: OPEN (Discharge)");
    setText(gateMainText, "OPEN");
    setText(infoGate, "OPEN");
  } else if (gateStatus === "CLOSED") {
    if (gateBadge) {
      gateBadge.innerHTML = `<span class="badge-dot"></span> <span class="badge-text">Gate Closed</span>`;
      gateBadge.className = "badge closed";
    }
    setText(gateText, "Gate: CLOSED (Holding)");
    setText(gateMainText, "CLOSED");
    setText(infoGate, "CLOSED");
  } else {
    if (gateBadge) {
      gateBadge.innerHTML = `<span class="badge-dot"></span> <span class="badge-text">Gate Moving</span>`;
      gateBadge.className = "badge moving";
    }
    setText(gateText, "Gate: MOVING...");
    setText(gateMainText, "MOVING");
    setText(infoGate, "MOVING");
  }

  updateGateAnimation();

  if (previousGateStatus && previousGateStatus !== gateStatus) {
    if (gateStatus === "OPEN") {
      showToast("warning", "Spillway Gate Opened", "Sluice gate actuator engaged for reservoir discharge.");
    } else if (gateStatus === "CLOSED") {
      showToast("safe", "Spillway Gate Closed", "Gate is sealed in safe holding position.");
    }
  }

  previousGateStatus = gateStatus;

  setText(modeText, `Mode: ${controlMode}`);
  setText(modeValue, controlMode);
  setText(heroModeText, controlMode);
  setText(infoMode, controlMode);

  removeClasses(heroModeText, ["safe-text", "alarm-text", "danger-text", "neutral-text"]);

  if (controlMode === "MANUAL") {
    heroModeText?.classList.add("danger-text");
    if (modeNote) {
      modeNote.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <span>Manual Emergency Override Active</span>
      `;
      modeNote.className = "mode-note manual-warning";
    }
  } else {
    heroModeText?.classList.add("neutral-text");
    if (modeNote) {
      modeNote.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <span>Automatic supervisory control active</span>
      `;
      modeNote.className = "mode-note";
    }
  }

  updateButtonState();
}

/* --------------------------------------------------------------------------
   SUPERVISORY ACCESS & ACTUATOR COMMANDS
   -------------------------------------------------------------------------- */
function updateAdminUI() {
  if (isAdmin) {
    controlPanel?.classList.remove("hidden");
    loggedOutPanel?.classList.add("hidden");
    if (adminIconBtn) {
      adminIconBtn.innerHTML = `
        <span class="btn-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="8.5" cy="7" r="4"></circle>
            <line x1="18" y1="8" x2="23" y2="13"></line>
            <line x1="23" y1="8" x2="18" y2="13"></line>
          </svg>
        </span>
        <span class="btn-text">Logout (${sessionStorage.getItem("adminUser") || "Admin"})</span>
      `;
      adminIconBtn.onclick = logoutAdmin;
    }
  } else {
    controlPanel?.classList.add("hidden");
    loggedOutPanel?.classList.remove("hidden");
    if (adminIconBtn) {
      adminIconBtn.innerHTML = `
        <span class="btn-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </span>
        <span class="btn-text">Engineer Login</span>
      `;
      adminIconBtn.onclick = showLoginModal;
    }
  }

  updateButtonState();
}

function updateButtonState() {
  if (!openBtn || !closeBtn || !autoBtn) return;

  if (!isAdmin || !deviceConnected) {
    openBtn.disabled = true;
    closeBtn.disabled = true;
    autoBtn.disabled = true;

    if (!isAdmin) {
      setText(controlMessage, "Engineer authentication required to unlock actuator commands.");
    } else if (!deviceConnected) {
      setText(controlMessage, "Hardware telemetry link offline. Actuator commands locked.");
    }
    return;
  }

  if (controlMode === "MANUAL") {
    if (gateStatus === "CLOSED") {
      openBtn.disabled = false;
      closeBtn.disabled = true;
      autoBtn.disabled = false;
      setText(controlMessage, "Manual Mode Active: Gate is closed. Ready to OPEN or return to AUTO.");
    } else if (gateStatus === "OPEN") {
      openBtn.disabled = true;
      closeBtn.disabled = false;
      autoBtn.disabled = true;
      setText(controlMessage, "Manual Mode Active: Gate is open. CLOSE gate prior to AUTO return.");
    } else {
      openBtn.disabled = true;
      closeBtn.disabled = true;
      autoBtn.disabled = true;
      setText(controlMessage, "Gate servo in motion. Actuators locked.");
    }
    return;
  }

  // AUTO Mode
  if (gateStatus === "CLOSED") {
    openBtn.disabled = false;
    closeBtn.disabled = true;
    autoBtn.disabled = true;
    setText(controlMessage, "AUTO Mode: Gate is holding water. Manual OPEN command ready.");
  } else if (gateStatus === "OPEN") {
    openBtn.disabled = true;
    closeBtn.disabled = false;
    autoBtn.disabled = true;
    setText(controlMessage, "AUTO Mode: Gate is open. Manual CLOSE command ready.");
  } else {
    openBtn.disabled = true;
    closeBtn.disabled = true;
    autoBtn.disabled = true;
    setText(controlMessage, "Actuator busy.");
  }
}

/* --------------------------------------------------------------------------
   SOCKET.IO & TELEMETRY HANDLERS
   -------------------------------------------------------------------------- */
function applyTelemetryUpdate(data) {
  if (!data) return;
  const level = Number(data.level || 0);
  const state = data.state || "SAFE";

  setText(levelEl, `Water Level: ${level} cm`);
  setText(levelValue, `${level} cm`);

  gateStatus = data.gate || "CLOSED";
  controlMode = data.mode || "AUTO";

  setText(stateValue, state);

  if (stateEl) {
    setText(stateEl, `Status: ${state}`);
    stateEl.style.color = state === "SAFE" ? "#34d399" : state === "ALARM" ? "#fbbf24" : "#f87171";
  }

  // Check state transitions for toast notifications
  if (previousRiskState && previousRiskState !== state) {
    if (state === "ALARM") {
      showToast("warning", "Hazard Warning: ALARM", "Reservoir elevation has reached preventive warning stage.");
    } else if (state === "DANGER") {
      showToast("danger", "CRITICAL OVERFLOW HAZARD", "Water levels exceeding safety threshold! Immediate gate discharge in effect.");
    } else if (state === "SAFE") {
      showToast("safe", "System Safe", "Reservoir water levels restored to normal baseline.");
    }
  }
  previousRiskState = state;

  setRiskTheme(state);
  updateGateUI();
  updatePredictionUI(data.prediction, level, state);
  updateGauge(level);

  if (bannerLastUpdated) {
    bannerLastUpdated.innerText = `Sync: ${new Date().toLocaleTimeString()}`;
  }

  if (Array.isArray(data.history)) {
    readingsHistory.length = 0;
    data.history.forEach((item) => readingsHistory.push(item));
    renderReadingsTable();
  }

  // Update chart
  if (levelChart) {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });

    levelChart.data.labels.push(timestamp);
    levelChart.data.datasets[0].data.push(level);

    if (levelChart.data.labels.length > 20) {
      levelChart.data.labels.shift();
      levelChart.data.datasets[0].data.shift();
    }

    levelChart.update();
  }
}

if (socket) {
  socket.on("update", applyTelemetryUpdate);
  socket.on("device-status", (data) => {
    deviceConnected = Boolean(data && data.connected);
    updateDeviceUI();
  });
  socket.on("history-cleared", () => {
    readingsHistory.length = 0;
    renderReadingsTable();
  });
}

// Fallback polling for serverless (Vercel) or disconnected environments
async function pollStatusFallback() {
  try {
    const res = await fetch("/api/status");
    if (!res.ok) return;
    const data = await res.json();
    if (data && data.success) {
      deviceConnected = Boolean(data.connected);
      updateDeviceUI();
      applyTelemetryUpdate(data);
    }
  } catch (err) {
    // Network or server unreachable; ignore silently
  }
}

// Poll every 3 seconds if socket is null or not connected
setInterval(() => {
  if (!socket || !socket.connected) {
    pollStatusFallback();
  }
}, 3000);

/* --------------------------------------------------------------------------
   ENGINEER LOGIN MODAL & COMMANDS
   -------------------------------------------------------------------------- */
function showLoginModal() {
  if (!loginModal) return;
  loginModal.classList.remove("hidden");
  if (loginMessage) loginMessage.innerText = "";
  if (adminPasswordInput) {
    adminPasswordInput.value = "";
    setTimeout(() => adminPasswordInput.focus(), 100);
  }
}

function hideLoginModal() {
  if (!loginModal) return;
  loginModal.classList.add("hidden");
}

async function loginAdmin() {
  if (!adminPasswordInput) return;
  const password = adminPasswordInput.value.trim();

  try {
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password })
    });

    const result = await response.json();

    if (result.success) {
      isAdmin = true;
      sessionStorage.setItem("isAdmin", "true");
      sessionStorage.setItem("adminUser", "Engineer");
      updateAdminUI();
      hideLoginModal();
      showToast("safe", "Access Granted", "Engineer supervisory control enabled.");
    } else {
      if (loginMessage) loginMessage.innerText = "Incorrect security authorization password.";
      showToast("danger", "Access Denied", "Invalid engineer credentials.");
    }
  } catch (error) {
    if (loginMessage) loginMessage.innerText = "Authorization server error.";
    showToast("danger", "Connection Error", "Failed to communicate with authentication service.");
  }
}

function logoutAdmin() {
  isAdmin = false;
  sessionStorage.removeItem("isAdmin");
  sessionStorage.removeItem("adminUser");
  updateAdminUI();
  showToast("warning", "Session Terminated", "Engineer supervisory controls returned to standby.");
}

async function sendManualControl(command) {
  if (socket && socket.connected) {
    socket.emit("manual-control", command);
  } else {
    try {
      await fetch("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command })
      });
      pollStatusFallback();
    } catch (e) {
      console.error("Control command dispatch failed", e);
    }
  }
}

function openGate() {
  if (!isAdmin || !deviceConnected || gateStatus !== "CLOSED") return;
  sendManualControl("OPEN");
  showToast("warning", "Open Command Queued", "Command transmitted to ESP8266 actuator controller.");
}

function closeGate() {
  if (!isAdmin || !deviceConnected || gateStatus !== "OPEN") return;
  sendManualControl("CLOSE");
  showToast("warning", "Close Command Queued", "Command transmitted to ESP8266 actuator controller.");
}

function returnToAuto() {
  if (!isAdmin || !deviceConnected) return;
  if (controlMode !== "MANUAL") return;
  if (gateStatus !== "CLOSED") return;

  sendManualControl("AUTO");
  showToast("safe", "Automatic Control Restored", "Supervisory logic returned to automatic gate actuation.");
}

// Enter Key on password field
adminPasswordInput?.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    loginAdmin();
  }
});

// Escape key to close modal
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideLoginModal();
    if (window.innerWidth <= 1080) closeSidebar();
  }
});

/* --------------------------------------------------------------------------
   LIFECYCLE INITIALIZATION
   -------------------------------------------------------------------------- */
window.addEventListener("load", () => {
  isAdmin = sessionStorage.getItem("isAdmin") === "true";
  hideLoginModal();
  updateAdminUI();
  updateDeviceUI();
  updateGateUI();
  updateGauge(0);
  renderReadingsTable();
  if (socket && socket.connected) {
    socket.emit("request-status");
  }
  pollStatusFallback();
});