# Dam Safety System - Web Dashboard & API

Real-time web monitoring and automated gate control dashboard for the Intelligent Dam Safety System.

## Architecture

- **Backend**: Node.js, Express, Socket.IO
- **Frontend**: HTML5, CSS3, Vanilla JavaScript, Chart.js, jsPDF
- **Hardware Interface**: HTTP REST endpoints for ESP8266 telemetry and command polling

## Directory Structure

```text
web/
├── public/                 # Static web client assets
│   ├── img/                # Images and team avatars
│   ├── developer.html      # Developer profile page
│   ├── index.html          # Main monitoring dashboard
│   ├── script.js           # Client-side Socket.IO and Chart.js logic
│   └── style.css           # Dashboard UI styles
├── .env.example            # Environment variable template
├── package.json            # Node.js dependencies and scripts
├── package-lock.json       # Dependency lockfile
├── server.js               # Express & Socket.IO server
└── README.md               # Subsystem documentation
```

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment (Optional)
Copy `.env.example` to `.env` and set your desired port or admin password:
```bash
PORT=3000
ADMIN_PASSWORD=admin123
```

### 3. Run the Server

**Production mode:**
```bash
npm start
```

**Development mode (auto-reload on save):**
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## API Reference (ESP8266 & Client Integration)

### Sensor Telemetry
- **Endpoint**: `POST /api/data`
- **Payload**:
  ```json
  {
    "level": 45.2,
    "state": "SAFE",
    "gate": "CLOSED",
    "mode": "AUTO"
  }
  ```
- **Response**: `OK`

### Command Polling (ESP8266)
- **Endpoint**: `GET /api/command`
- **Response**: String (`"OPEN"`, `"CLOSE"`, `"AUTO"`, or empty if no pending command)

### Admin & History
- **POST** `/api/admin/login` - Authenticate admin credentials
- **GET** `/api/history` - Retrieve historical water level readings
- **DELETE** `/api/history` - Clear recorded history
