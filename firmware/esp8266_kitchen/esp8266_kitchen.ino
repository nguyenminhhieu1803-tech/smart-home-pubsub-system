#include <ESP8266WiFi.h>
#include <PubSubClient.h>

// =====================================================
// WIFI
// =====================================================
const char* ssid     = "TEN_WIFI";
const char* password = "PASSWORD";

// =====================================================
// MQTT
// =====================================================
const char* mqtt_server = "192.168.*.*";

// =====================================================
// DEVICE
// =====================================================
const char* DEVICE_ID = "esp8266";
String baseTopic = "home/" + String(DEVICE_ID);

// =====================================================
// PIN
// =====================================================
#define MQ2_PIN      A0
#define FLAME_SENSOR D6
#define BUZZER       D7
#define RELAY        D0
#define LED_PIN      D4

// =====================================================
// MQTT OBJECT
// =====================================================
WiFiClient   espClient;
PubSubClient client(espClient);

// =====================================================
// TIMER
// =====================================================
unsigned long lastSensorRead = 0;

// =====================================================
// ① EDGE LOGIC — ngưỡng & trạng thái báo động
// =====================================================
int  gasThreshold = 50;   // ngưỡng mặc định, thay đổi được qua MQTT
bool isMuted      = false;
bool alarmActive  = false;

// =====================================================
// ① EDGE LOGIC — bộ đếm xác nhận 2 giây (mục tiêu 1.4)
// Sensor đọc mỗi 500ms → cần 4 lần liên tiếp = 2 giây
// =====================================================
int alarmCount = 0;
#define ALARM_CONFIRM_COUNT 4 

// =====================================================
// ② BEEP PATTERN — non-blocking
// =====================================================
unsigned long lastBeep = 0;
int beepStep = 0;

// =====================================================
// ② LỌC NHIỄU — EMA (Exponential Moving Average)
// avgGas = avgGas * 0.8 + newSample * 0.2
// Tương đương moving average ~5 mẫu, nhẹ hơn mảng 10 phần tử
// =====================================================
int avgGas   = 0;
int lastSentGas = -999;   // chỉ publish khi thay đổi > SEND_DELTA

#define SEND_DELTA 3     // ngưỡng thay đổi tối thiểu để gửi MQTT

// =====================================================
// ③ MUTE AUTO-CANCEL
// Tự động hủy Mute sau MUTE_TIMEOUT_MS (5 phút)
// =====================================================
unsigned long muteStartTime   = 0;
#define MUTE_TIMEOUT_MS 300000UL  // 5 phút

// =====================================================
// WIFI
// =====================================================
void setup_wifi() {

  Serial.println("Connecting WiFi...");

  WiFi.begin(ssid, password);

  unsigned long startAttempt = millis();

  while (
    WiFi.status() != WL_CONNECTED &&
    millis() - startAttempt < 10000
  ) {
    delay(300);
    Serial.print(".");
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWiFi connected! IP: " + WiFi.localIP().toString());
  } else {
    Serial.println("\nWiFi failed — chạy offline mode.");
  }
}

// =====================================================
// MQTT CALLBACK
// =====================================================
void callback(
  char*        topic,
  byte*        payload,
  unsigned int length
) {

  String msg = "";
  for (unsigned int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }

  String topicStr = String(topic);

  Serial.print("[MQTT IN] ");
  Serial.print(topicStr);
  Serial.print(" | ");
  Serial.println(msg);

  // ─── MUTE ───────────────────────────────────────
  if (topicStr == baseTopic + "/cmd/mute") {

    if (msg == "ON") {
      isMuted       = true;
      muteStartTime = millis();

    } else if (msg == "OFF") {
      isMuted = false;
    }

    client.publish(
      (baseTopic + "/state/mute").c_str(),
      isMuted ? "ON" : "OFF",
      true
    );
  }

  // ─── RELAY ──────────────────────────────────────
  if (topicStr == baseTopic + "/cmd/relay") {

    if (msg == "ON") {
      digitalWrite(RELAY, HIGH);
    } else if (msg == "OFF") {
      // Chỉ tắt relay nếu không đang có báo động
      if (!alarmActive) digitalWrite(RELAY, LOW);
    }

    client.publish(
      (baseTopic + "/state/relay").c_str(),
      digitalRead(RELAY) ? "ON" : "OFF",
      true
    );
  }

  // ─── BUZZER ─────────────────────────────────────
  if (topicStr == baseTopic + "/cmd/buzzer") {

    if (msg == "ON") {
      digitalWrite(BUZZER, HIGH);
    } else if (msg == "OFF") {
      if (!alarmActive) digitalWrite(BUZZER, LOW);
    }

    client.publish(
      (baseTopic + "/state/buzzer").c_str(),
      digitalRead(BUZZER) ? "ON" : "OFF",
      true
    );
  }

  // ─── ③ THRESHOLD — cấu hình ngưỡng từ xa ────────
  if (topicStr == baseTopic + "/cmd/threshold") {

    int newVal = msg.toInt();

    // Validate: chỉ chấp nhận giá trị hợp lệ (100–1023)
    if (newVal >= 100 && newVal <= 1023) {

      gasThreshold = newVal;

      Serial.print("[THRESHOLD] Cập nhật ngưỡng: ");
      Serial.println(gasThreshold);

      // Phản hồi về Dashboard
      client.publish(
        (baseTopic + "/state/threshold").c_str(),
        String(gasThreshold).c_str(),
        true
      );
    } else {
      Serial.println("[THRESHOLD] Giá trị không hợp lệ, bỏ qua.");
    }
  }
}

// =====================================================
// MQTT RECONNECT — non-blocking
// =====================================================
void reconnect() {

  static unsigned long lastReconnectAttempt = 0;

  if (millis() - lastReconnectAttempt < 3000) return;
  lastReconnectAttempt = millis();

  Serial.print("Connecting MQTT... ");

  if (client.connect(
        DEVICE_ID,
        (baseTopic + "/state/status").c_str(),
        1,
        true,
        "OFFLINE"
      )) {

    Serial.println("OK");
    digitalWrite(LED_PIN, LOW);

    // ─── SUBSCRIBE ──────────────────────────────
    client.subscribe((baseTopic + "/cmd/mute").c_str());
    client.subscribe((baseTopic + "/cmd/relay").c_str());
    client.subscribe((baseTopic + "/cmd/buzzer").c_str());
    client.subscribe((baseTopic + "/cmd/threshold").c_str()); // ③

    // ─── PUBLISH TRẠNG THÁI KHỞI ĐỘNG ───────────
    client.publish(
      (baseTopic + "/state/status").c_str(),
      "ONLINE", true
    );
    client.publish(
      (baseTopic + "/state/mute").c_str(),
      isMuted ? "ON" : "OFF", true
    );
    client.publish(
      (baseTopic + "/state/relay").c_str(),
      digitalRead(RELAY) ? "ON" : "OFF", true
    );
    client.publish(
      (baseTopic + "/state/buzzer").c_str(),
      digitalRead(BUZZER) ? "ON" : "OFF", true
    );
    // ③ Publish ngưỡng hiện tại để Dashboard đồng bộ
    client.publish(
      (baseTopic + "/state/threshold").c_str(),
      String(gasThreshold).c_str(), true
    );

  } else {
    Serial.print("failed rc=");
    Serial.println(client.state());
    digitalWrite(LED_PIN, HIGH);
  }
}

// =====================================================
// ② BEEP PATTERN — non-blocking
// Chuỗi: BIP - BIP - BIP ... nghỉ 700ms ... lặp lại
// =====================================================
void handleBeepPattern() {

  // Tắt còi ngay nếu không có alarm hoặc đang Muted
  if (!alarmActive || isMuted) {
    digitalWrite(BUZZER, LOW);
    beepStep = 0;
    return;
  }

  unsigned long now = millis();

  switch (beepStep) {

    case 0:                                       // BIP 1 bắt đầu
      digitalWrite(BUZZER, HIGH);
      lastBeep = now;
      beepStep = 1;
      break;

    case 1:                                       // BIP 1 kết thúc
      if (now - lastBeep >= 150) {
        digitalWrite(BUZZER, LOW);
        lastBeep = now;
        beepStep = 2;
      }
      break;

    case 2:                                       // khoảng ngắn
      if (now - lastBeep >= 120) {
        digitalWrite(BUZZER, HIGH);
        lastBeep = now;
        beepStep = 3;
      }
      break;

    case 3:                                       // BIP 2 kết thúc
      if (now - lastBeep >= 150) {
        digitalWrite(BUZZER, LOW);
        lastBeep = now;
        beepStep = 4;
      }
      break;

    case 4:                                       // khoảng ngắn
      if (now - lastBeep >= 120) {
        digitalWrite(BUZZER, HIGH);
        lastBeep = now;
        beepStep = 5;
      }
      break;

    case 5:                                       // BIP 3 kết thúc
      if (now - lastBeep >= 150) {
        digitalWrite(BUZZER, LOW);
        lastBeep = now;
        beepStep = 6;
      }
      break;

    case 6:                                       // nghỉ dài rồi lặp
      if (now - lastBeep >= 700) {
        beepStep = 0;
      }
      break;
  }
}

// =====================================================
// ① LOCAL ALARM — tự trị biên, không phụ thuộc MQTT
// =====================================================
void checkLocalAlarm() {

  int  flame     = digitalRead(FLAME_SENSOR);
  bool gasAlert  = avgGas > gasThreshold;
  bool flameAlert = (flame == HIGH);  // HIGH = phát hiện lửa (active high)

  // ─── ① MỤC TIÊU 1.4: bộ đếm xác nhận 3 giây ────
  // Tránh báo động giả do nhiễu ngắn (khói thuốc, bụi)
  bool rawAlert = gasAlert || flameAlert;

  if (rawAlert) {
    if (alarmCount < ALARM_CONFIRM_COUNT) alarmCount++;
  } else {
    alarmCount = 0;
  }

  bool prevAlarmActive = alarmActive;
  alarmActive = (alarmCount >= ALARM_CONFIRM_COUNT);

  // ─── RELAY: bật ngay khi có alarm + chưa Mute ───
  if (alarmActive && !isMuted) {
    digitalWrite(RELAY, HIGH);
  } else if (!alarmActive) {
    // Chỉ tắt relay khi không còn alarm thực sự
    // (không tắt nếu relay đang bật thủ công từ dashboard
    //  — để đơn giản, ưu tiên an toàn: tắt khi alarm hết)
    digitalWrite(RELAY, LOW);
  }

  // ─── ① MỤC TIÊU 1.3: publish alert qua MQTT ────
  if (client.connected()) {

    // Khi alarm mới bật → publish loại cảnh báo
    if (alarmActive && !prevAlarmActive) {

      const char* alertPayload = "BOTH";
      if      (gasAlert && !flameAlert) alertPayload = "GAS";
      else if (!gasAlert && flameAlert) alertPayload = "FLAME";

      client.publish(
        (baseTopic + "/alert").c_str(),
        alertPayload,
        false
      );

      Serial.print("[ALERT] ");
      Serial.println(alertPayload);
    }

    // Khi alarm vừa tắt → publish CLEAR để Dashboard reset
    if (!alarmActive && prevAlarmActive) {
      client.publish(
        (baseTopic + "/alert").c_str(),
        "CLEAR",
        false
      );
      Serial.println("[ALERT] CLEAR");
    }

    // Publish trạng thái alarm (retained) để Dashboard
    // luôn biết trạng thái hiện tại khi mới kết nối
    client.publish(
      (baseTopic + "/state/alarm").c_str(),
      alarmActive ? "ON" : "OFF",
      true
    );
  }
}

// =====================================================
// ③ MUTE AUTO-CANCEL — kiểm tra trong loop()
// =====================================================
void checkMuteTimeout() {

  if (!isMuted) return;

  if (millis() - muteStartTime >= MUTE_TIMEOUT_MS) {

    isMuted = false;

    Serial.println("[MUTE] Hết thời gian mute, tự động bật lại báo động.");

    if (client.connected()) {
      client.publish(
        (baseTopic + "/state/mute").c_str(),
        "OFF",
        true
      );
    }
  }
}

// =====================================================
// SETUP
// =====================================================
void setup() {

  Serial.begin(115200);
  delay(100);

  pinMode(FLAME_SENSOR, INPUT);
  pinMode(BUZZER,       OUTPUT);
  pinMode(RELAY,        OUTPUT);
  pinMode(LED_PIN,      OUTPUT);

  // Trạng thái ban đầu an toàn
  digitalWrite(BUZZER,  LOW);
  digitalWrite(RELAY,   LOW);
  digitalWrite(LED_PIN, HIGH);  // HIGH = tắt (LED onboard active-low)

  setup_wifi();

  client.setServer(mqtt_server, 1883);
  client.setCallback(callback);

  // Chờ thiết bị ổn định 30 giây
  Serial.println("Cho thiet bi on dinh 30 giay...");
  for (int i = 30; i > 0; i--) {
    Serial.print("Con lai: ");
    Serial.print(i);
    Serial.println("s");
    digitalWrite(LED_PIN, !digitalRead(LED_PIN));
    delay(1000);
  }
  digitalWrite(LED_PIN, LOW);
  Serial.println(">>> SAN SANG!");

  // Khởi tạo avgGas từ đọc thực tế (tránh EMA khởi động từ 0)
  avgGas      = analogRead(MQ2_PIN);
  lastSentGas = avgGas;
}

// =====================================================
// LOOP
// =====================================================
void loop() {

  // ─── MQTT ───────────────────────────────────────
  if (client.connected()) {
    client.loop();
    digitalWrite(LED_PIN, LOW);
  } else {
    reconnect();
    digitalWrite(LED_PIN, HIGH);
  }

  // ─── ③ MUTE AUTO-CANCEL ─────────────────────────
  checkMuteTimeout();

  unsigned long now = millis();

  // ─── SENSOR + ALARM (mỗi 2000ms) ─────────────────
  if (now - lastSensorRead >= 2000) {

    lastSensorRead = now;

    // ── ② EMA FILTER ──────────────────────────────
    // Hệ số 0.8/0.2 ≈ window 5 mẫu
    // Đổi thành 4/1 với integer math để tránh float
    int rawGas = analogRead(MQ2_PIN);
    avgGas = (avgGas * 4 + rawGas) / 5;

    // ── ① LOCAL ALARM ─────────────────────────────
    checkLocalAlarm();

    // ── MQTT SENSOR PUBLISH ───────────────────────
    if (client.connected()) {

      // ② Chỉ gửi gas khi thay đổi đáng kể (>= SEND_DELTA)
      // Giảm tải database, tránh ghi log khi ổn định
      if (abs(avgGas - lastSentGas) >= SEND_DELTA) {

        client.publish(
          (baseTopic + "/sensor/gas").c_str(),
          String(avgGas).c_str()
        );

        lastSentGas = avgGas;
      }

      // Flame: chỉ publish khi thay đổi trạng thái
      static int lastFlameState = -1;
      int currentFlame = digitalRead(FLAME_SENSOR);
      if (currentFlame != lastFlameState) {
        client.publish(
          (baseTopic + "/sensor/flame").c_str(),
          String(currentFlame).c_str()
        );
        lastFlameState = currentFlame;
      }
    }

    // ── SERIAL DEBUG ──────────────────────────────
    Serial.print("Gas(raw): "); Serial.print(rawGas);
    Serial.print(" | Gas(avg): "); Serial.print(avgGas);
    Serial.print(" | Threshold: "); Serial.print(gasThreshold);
    Serial.print(" | Flame: "); Serial.print(digitalRead(FLAME_SENSOR));
    Serial.print(" | AlarmCnt: "); Serial.print(alarmCount);
    Serial.print("/"); Serial.print(ALARM_CONFIRM_COUNT);
    Serial.print(" | Alarm: "); Serial.print(alarmActive ? "ON" : "OFF");
    Serial.print(" | Muted: "); Serial.println(isMuted ? "YES" : "NO");
  }

  // ─── ② BEEP PATTERN ─────────────────────────────
  handleBeepPattern();
}
