#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>

const char* ssid = "iPhone";
const char* password = "12345678";

const char* serverName = "http://172.20.10.3:3000/api/data";
const char* commandURL = "http://172.20.10.3:3000/api/command";

String incomingData = "";

unsigned long lastCommandCheck = 0;
unsigned long commandInterval = 500;   // check every 0.5 second

void setup() {
  Serial.begin(9600);

  connectWiFi();
}

/* ---------- WiFi Reconnect Function ---------- */
void connectWiFi() {

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
  }
}

/* ---------- MAIN LOOP ---------- */
void loop() {

  // Auto reconnect WiFi if disconnected
  if (WiFi.status() != WL_CONNECTED) {
    connectWiFi();
  }

  // Read UART from ATmega
  while (Serial.available()) {
    char c = Serial.read();

    if (c == '\n') {
      processData(incomingData);
      incomingData = "";
    } else {
      incomingData += c;
    }
  }

  // Non-blocking command check
  if (millis() - lastCommandCheck > commandInterval) {
    lastCommandCheck = millis();
    checkCommand();
  }
}

/* ---------- Send Sensor Data ---------- */
void processData(String data) {

  int levelIndex = data.indexOf("LEVEL:");
  int stateIndex = data.indexOf("STATE:");

  if (levelIndex == -1 || stateIndex == -1) return;

  String level = data.substring(levelIndex + 6, data.indexOf(",", levelIndex));
  String state = data.substring(stateIndex + 6);

  if (WiFi.status() == WL_CONNECTED) {

    WiFiClient client;
    HTTPClient http;

    http.begin(client, serverName);
    http.addHeader("Content-Type", "application/x-www-form-urlencoded");

    String httpRequestData = "level=" + level + "&state=" + state;

    int response = http.POST(httpRequestData);

    http.end();
  }
}

/* ---------- Check Manual Command ---------- */
void checkCommand() {

  if (WiFi.status() == WL_CONNECTED) {

    WiFiClient client;
    HTTPClient http;

    http.begin(client, commandURL);

    int httpResponseCode = http.GET();

    if (httpResponseCode == 200) {

      String command = http.getString();
      command.trim();   // remove spaces/newline

      if (command == "OPEN") {
        Serial.println("OPEN");
      }
      else if (command == "CLOSE") {
        Serial.println("CLOSE");
      }
    }

    http.end();
  }
}
