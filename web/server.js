const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));

const DEVICE_TIMEOUT = 3000;
const ADMIN_PASSWORD = "admin123"; // change this
const MAX_HISTORY = 20;

let latestData = {
    level: 0,
    state: "SAFE",
    gate: "CLOSED",
    mode: "AUTO",
    prediction: {
        rainfallTomorrow: 0,
        predictedLevel: 0,
        predictedState: "SAFE",
        recommendation: "No action needed"
    }
};

let readingsHistory = [];
let latestCommand = "";
let lastEspSeen = 0;

function isDeviceConnected() {
    return (Date.now() - lastEspSeen) < DEVICE_TIMEOUT;
}

function markEspSeen() {
    lastEspSeen = Date.now();
}

function buildPrediction(level, state) {
    let rainfallTomorrow = 0;
    let predictedLevel = level;
    let predictedState = state;
    let recommendation = "No action needed";

    if (state === "SAFE") {
        rainfallTomorrow = 8;
        predictedLevel = level + 5;
        predictedState = "SAFE";
        recommendation = "Continue monitoring under automatic operation";
    } else if (state === "ALARM") {
        rainfallTomorrow = 28;
        predictedLevel = level + 12;
        predictedState = "ALARM";
        recommendation = "Prepare preventive discharge and monitor closely";
    } else if (state === "DANGER") {
        rainfallTomorrow = 55;
        predictedLevel = level + 18;
        predictedState = "DANGER";
        recommendation = "Immediate response recommended to reduce overflow risk";
    }

    return {
        rainfallTomorrow,
        predictedLevel,
        predictedState,
        recommendation
    };
}

function addReadingToHistory(data) {
    const entry = {
        time: new Date().toLocaleString(),
        level: data.level,
        state: data.state,
        gate: data.gate,
        mode: data.mode
    };

    readingsHistory.unshift(entry);

    if (readingsHistory.length > MAX_HISTORY) {
        readingsHistory = readingsHistory.slice(0, MAX_HISTORY);
    }
}

function emitAllStatus(targetSocket = null) {
    const payload = {
        ...latestData,
        history: readingsHistory
    };

    if (targetSocket) {
        targetSocket.emit("update", payload);
        targetSocket.emit("device-status", { connected: isDeviceConnected() });
    } else {
        io.emit("update", payload);
        io.emit("device-status", { connected: isDeviceConnected() });
    }
}

/* ---------- Admin Login ---------- */
app.post("/api/admin/login", (req, res) => {
    const { password } = req.body;

    if (password === ADMIN_PASSWORD) {
        return res.json({ success: true });
    }

    return res.status(401).json({
        success: false,
        message: "Wrong password"
    });
});

/* ---------- Get history ---------- */
app.get("/api/history", (req, res) => {
    res.json({
        success: true,
        history: readingsHistory
    });
});

/* ---------- Clear history ---------- */
app.delete("/api/history", (req, res) => {
    readingsHistory = [];
    io.emit("history-cleared");

    res.json({
        success: true,
        message: "History cleared"
    });
});

/* ---------- Receive data from ESP ---------- */
app.post("/api/data", (req, res) => {
    const {
        level,
        state,
        gate,
        mode,
        rainfallTomorrow,
        predictedLevel,
        predictedState,
        recommendation
    } = req.body;

    markEspSeen();

    latestData.level = parseFloat(level) || 0;
    latestData.state = state || "SAFE";
    latestData.gate = gate || "CLOSED";
    latestData.mode = mode || "AUTO";

    if (
        rainfallTomorrow !== undefined ||
        predictedLevel !== undefined ||
        predictedState !== undefined ||
        recommendation !== undefined
    ) {
        latestData.prediction = {
            rainfallTomorrow: parseFloat(rainfallTomorrow) || 0,
            predictedLevel: parseFloat(predictedLevel) || latestData.level,
            predictedState: predictedState || latestData.state,
            recommendation: recommendation || "No action needed"
        };
    } else {
        latestData.prediction = buildPrediction(latestData.level, latestData.state);
    }

    addReadingToHistory(latestData);

    console.log("Received:", latestData);

    emitAllStatus();
    res.send("OK");
});

/* ---------- Send command to ESP ---------- */
app.get("/api/command", (req, res) => {
    markEspSeen();

    if (latestCommand !== "") {
        console.log("ESP fetched command:", latestCommand);
    }

    res.send(latestCommand);
    latestCommand = "";
});

/* ---------- Socket ---------- */
io.on("connection", (socket) => {
    emitAllStatus(socket);

    socket.on("manual-control", (command) => {
        if (!isDeviceConnected()) {
            console.log("Manual command blocked: device offline");
            return;
        }

        command = String(command || "").trim().toUpperCase();
        console.log("Manual command from website:", command);
        console.log("Current gate:", latestData.gate, "Mode:", latestData.mode);

        if (command === "OPEN" && latestData.gate === "CLOSED") {
            latestCommand = "OPEN";
            console.log("Stored command for ESP: OPEN");
        } else if (command === "CLOSE" && latestData.gate === "OPEN") {
            latestCommand = "CLOSE";
            console.log("Stored command for ESP: CLOSE");
        } else if (
            command === "AUTO" &&
            latestData.mode === "MANUAL" &&
            latestData.gate === "CLOSED"
        ) {
            latestCommand = "AUTO";
            console.log("Stored command for ESP: AUTO");
        } else {
            console.log("Command ignored: invalid for current state");
        }
    });

    socket.on("request-status", () => {
        emitAllStatus(socket);
    });

    socket.on("clear-history", () => {
        readingsHistory = [];
        io.emit("history-cleared");
        console.log("History cleared from website");
    });
});

setInterval(() => {
    io.emit("device-status", { connected: isDeviceConnected() });
}, 1000);

server.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});