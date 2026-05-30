#include <WiFi.h>
#include <PubSubClient.h>
#include <DHT.h>
#include <Wire.h>
#include <BH1750.h>
#include <IRremote.h>

// ===== WIFI =====
const char* ssid = "TEN_WIFI";
const char* password = "PASSWORD";

// ===== MQTT =====
const char* mqtt_server = "192.168.*.*";

// ===== DEVICE ID =====
const char* DEVICE_ID = "esp32_1";

// ===== PIN =====
#define DHTPIN 4
#define DHTTYPE DHT22

#define RELAY1 26
#define RELAY2 27

#define PIR 14
#define IR_PIN 19

#define RED_PIN   16
#define GREEN_PIN 17
#define BLUE_PIN  18

#define LED_PIN 2

// ========= IR CODE =========
#define IR_CH_MINUS    0x45
#define IR_CH          0x46
#define IR_CH_PLUS     0x47

#define IR_PREV        0x44
#define IR_NEXT        0x40
#define IR_PLAY        0x43

#define IR_VOL_MINUS   0x07
#define IR_VOL_PLUS    0x15
#define IR_EQ          0x09

#define IR_0           0x16
#define IR_1           0x0C
#define IR_2           0x18
#define IR_3           0x5E
#define IR_4           0x08
#define IR_5           0x1C
#define IR_6           0x5A
#define IR_7           0x42
#define IR_8           0x52
#define IR_9           0x4A

#define IR_100         0x19
#define IR_200         0x0D

// ========= RELAY STATE =========
bool relay1State = false;
bool relay2State = false;

// ===== OBJECT =====
WiFiClient espClient;
PubSubClient client(espClient);
DHT dht(DHTPIN, DHTTYPE);
BH1750 lightMeter;

// ===== TIME =====
unsigned long lastMsg = 0;

// ===== PIR =====
bool roomOccupied = false;

unsigned long lastMotionTime = 0;

const unsigned long motionTimeout = 10000;

int lastPublishedState = -1;

volatile bool motionTriggered = false;

bool pirReady = false;

// ===== BASE TOPIC =====
String baseTopic = "home/" + String(DEVICE_ID);

// ================= WIFI =================
void setup_wifi() {

  Serial.print("Connecting WiFi...");

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {

    delay(300);

    Serial.print(".");

    digitalWrite(
      LED_PIN,
      !digitalRead(LED_PIN)
    );
  }

  Serial.println("\nWiFi connected!");
}

// ================= RGB =================
void setColor(int r, int g, int b) {

  digitalWrite(RED_PIN, r);
  digitalWrite(GREEN_PIN, g);
  digitalWrite(BLUE_PIN, b);

  // publish RGB state
  String state =
      String(r) + "," +
      String(g) + "," +
      String(b);

  client.publish(
    (baseTopic + "/state/rgb").c_str(),
    state.c_str(),
    true
  );
}

// ================= MQTT CALLBACK =================
void callback(
    char* topic,
    byte* payload,
    unsigned int length
) {

  String msg = "";

  for (int i = 0; i < length; i++) {
    msg += (char)payload[i];
  }

  String topicStr = String(topic);

  Serial.print("Topic: ");
  Serial.print(topicStr);

  Serial.print(" | Msg: ");
  Serial.println(msg);

  // ===== RELAY 1 =====
  if (topicStr ==
      baseTopic + "/cmd/relay1") {

    digitalWrite(
      RELAY1,
      msg == "ON" ? LOW : HIGH
    );

    client.publish(
      (baseTopic + "/state/relay1").c_str(),
      msg.c_str(),
      true
    );
  }

  // ===== RELAY 2 =====
  if (topicStr ==
      baseTopic + "/cmd/relay2") {

    digitalWrite(
      RELAY2,
      msg == "ON" ? LOW : HIGH
    );

    client.publish(
      (baseTopic + "/state/relay2").c_str(),
      msg.c_str(),
      true
    );
  }

  // ===== RGB =====
  if (topicStr ==
      baseTopic + "/cmd/rgb") {

    if (msg == "RED")
      setColor(1,0,0);

    else if (msg == "GREEN")
      setColor(0,1,0);

    else if (msg == "BLUE")
      setColor(0,0,1);

    else if (msg == "YELLOW")
      setColor(1,1,0);

    else if (msg == "CYAN")
      setColor(0,1,1);

    else if (msg == "MAGENTA")
      setColor(1,0,1);

    else if (msg == "WHITE")
      setColor(1,1,1);

    else if (msg == "OFF")
      setColor(0,0,0);
  }
}

// ================= MQTT RECONNECT =================
void reconnect() {

  while (!client.connected()) {

    Serial.print("Connecting MQTT...");

    if (client.connect(
          DEVICE_ID,
          (baseTopic + "/state/status").c_str(),
          1,
          true,
          "OFFLINE"
    )) {

      Serial.println("connected");

      digitalWrite(LED_PIN, HIGH);

      // ===== SUBSCRIBE =====
      client.subscribe(
        (baseTopic + "/cmd/relay1").c_str()
      );

      client.subscribe(
        (baseTopic + "/cmd/relay2").c_str()
      );

      client.subscribe(
        (baseTopic + "/cmd/rgb").c_str()
      );

      // ===== ONLINE =====
      client.publish(
        (baseTopic + "/state/status").c_str(),
        "ONLINE",
        true
      );

    } else {

      Serial.print("failed, rc=");

      Serial.println(client.state());

      digitalWrite(LED_PIN, LOW);

      delay(2000);
    }
  }
}

// ================= PIR INTERRUPT =================
void IRAM_ATTR detectMotion() {

  motionTriggered = true;
}

// ================= SETUP =================
void setup() {

  Serial.begin(115200);

  pinMode(RELAY1, OUTPUT);
  pinMode(RELAY2, OUTPUT);

  pinMode(PIR, INPUT);

  pinMode(RED_PIN, OUTPUT);
  pinMode(GREEN_PIN, OUTPUT);
  pinMode(BLUE_PIN, OUTPUT);

  pinMode(LED_PIN, OUTPUT);

  digitalWrite(RELAY1, HIGH);
  digitalWrite(RELAY2, HIGH);

  setColor(0,0,0);

  dht.begin();

  Wire.begin(21,22);

  lightMeter.begin();

  IrReceiver.begin(
    IR_PIN,
    ENABLE_LED_FEEDBACK
  );

  setup_wifi();

  client.setServer(mqtt_server, 1883);

  client.setCallback(callback);

  // ===== PIR WARMUP =====
  Serial.println(
      "Dang khoi dong PIR..."
  );

  Serial.println(
      "Cho PIR on dinh 60 giay..."
  );

  delay(60000);

  // doi PIR ve LOW on dinh
  while (digitalRead(PIR) == HIGH) {

      Serial.println(
          "Dang doi PIR on dinh..."
      );

      delay(500);
  }

  // attach interrupt SAU KHI ổn định
  attachInterrupt(
      digitalPinToInterrupt(PIR),
      detectMotion,
      RISING
  );

  pirReady = true;

  Serial.println(
      ">>> PIR SAN SANG!"
  );
}

// ================= LOOP =================
void loop() {

  if (!client.connected()) {
    reconnect();
  }

  client.loop();

  digitalWrite(
    LED_PIN,
    client.connected()
  );

  unsigned long now = millis();

  // ===== SENSOR =====
  if (now - lastMsg > 2000) {

    lastMsg = now;

    float temp = dht.readTemperature();

    float hum = dht.readHumidity();

    float lux = lightMeter.readLightLevel();

    // ===== PIR ACTIVE =====
    if (true) {

      // motion mới
      if (motionTriggered) {

        motionTriggered = false;

        lastMotionTime = millis();

        if (!roomOccupied) {

          roomOccupied = true;

          Serial.println(
            ">>> CO NGUOI TRONG PHONG"
          );
        }
      }

      // timeout
      if (roomOccupied &&
          millis() - lastMotionTime
          > motionTimeout) {

        roomOccupied = false;

        Serial.println(
          ">>> KHONG PHAT HIEN NGUOI"
        );
      }

      // publish khi đổi trạng thái
      int currentState =
          roomOccupied ? 1 : 0;

      if (currentState !=
          lastPublishedState) {

        client.publish(
          (baseTopic + "/sensor/pir")
          .c_str(),

          String(currentState)
          .c_str(),

          true
        );

        lastPublishedState =
            currentState;
      }
    }

    // ===== DHT =====
    if (!isnan(temp) &&
        !isnan(hum)) {

      String payload = String(temp) + "," + String(millis());
      client.publish(
          (baseTopic + "/sensor/temp").c_str(),
          payload.c_str()
      );

      client.publish(
        (baseTopic + "/sensor/hum")
        .c_str(),

        String(hum).c_str()
      );
    }

    // ===== LIGHT =====
    client.publish(
      (baseTopic + "/sensor/light")
      .c_str(),

      String(lux).c_str()
    );

    // ===== DEBUG =====
    Serial.println("=== DATA ===");

    Serial.print("Temp: ");
    Serial.println(temp);

    Serial.print("Hum: ");
    Serial.println(hum);

    Serial.print("Lux: ");
    Serial.println(lux);

    Serial.print("PIR: ");

    Serial.println(
      roomOccupied
      ? "CO NGUOI"
      : "KHONG CO NGUOI"
    );
  }

  // ================= IR REMOTE CONTROL =================
  if (IrReceiver.decode()) {

      // bỏ repeat khi giữ nút
      if (IrReceiver.decodedIRData.flags &
          IRDATA_FLAGS_IS_REPEAT) {

          IrReceiver.resume();
          return;
      }

      uint8_t cmd =
          IrReceiver.decodedIRData.command;

      Serial.print("IR CMD: 0x");
      Serial.println(cmd, HEX);

      // publish IR command
      client.publish(
          (baseTopic + "/sensor/ir").c_str(),
          String(cmd, HEX).c_str()
      );

      // ========= RELAY 1 TOGGLE =========
      if (cmd == IR_1) {
          relay1State = !relay1State;
          digitalWrite(RELAY1, relay1State ? LOW : HIGH);
          client.publish(
              (baseTopic + "/state/relay1").c_str(),
              relay1State ? "ON" : "OFF", true
          );
          Serial.print("Relay1: ");
          Serial.println(relay1State ? "ON" : "OFF");
      }

      // ========= RELAY 2 TOGGLE =========
      else if (cmd == IR_2) {
          relay2State = !relay2State;
          digitalWrite(RELAY2, relay2State ? LOW : HIGH);
          client.publish(
              (baseTopic + "/state/relay2").c_str(),
              relay2State ? "ON" : "OFF", true
          );
          Serial.print("Relay2: ");
          Serial.println(relay2State ? "ON" : "OFF");
      }

      // ========= BẢNG MÀU RGB (3–9) =========
      else if (cmd == IR_3) { setColor(1,0,0); Serial.println("RGB RED");     }
      else if (cmd == IR_4) { setColor(0,1,0); Serial.println("RGB GREEN");   }
      else if (cmd == IR_5) { setColor(0,0,1); Serial.println("RGB BLUE");    }
      else if (cmd == IR_6) { setColor(1,1,0); Serial.println("RGB YELLOW");  }
      else if (cmd == IR_7) { setColor(0,1,1); Serial.println("RGB CYAN");    }
      else if (cmd == IR_8) { setColor(1,0,1); Serial.println("RGB MAGENTA"); }
      else if (cmd == IR_9) { setColor(1,1,1); Serial.println("RGB WHITE");   }

      // ========= TOGGLE ALL =========
      else if (cmd == IR_PLAY) {
          relay1State = !relay1State;
          relay2State = !relay2State;
          digitalWrite(RELAY1, relay1State ? LOW : HIGH);
          digitalWrite(RELAY2, relay2State ? LOW : HIGH);
          client.publish((baseTopic + "/state/relay1").c_str(), relay1State ? "ON" : "OFF", true);
          client.publish((baseTopic + "/state/relay2").c_str(), relay2State ? "ON" : "OFF", true);
          Serial.println("TOGGLE ALL");
      }

      // ========= ALL OFF =========
      else if (cmd == IR_0) {
          relay1State = false;
          relay2State = false;
          digitalWrite(RELAY1, HIGH);
          digitalWrite(RELAY2, HIGH);
          setColor(0,0,0);
          client.publish((baseTopic + "/state/relay1").c_str(), "OFF", true);
          client.publish((baseTopic + "/state/relay2").c_str(), "OFF", true);
          Serial.println("ALL DEVICE OFF");
      }

      IrReceiver.resume();
  }
}
