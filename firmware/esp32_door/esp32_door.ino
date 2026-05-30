#include <WiFi.h>
#include <PubSubClient.h>
#include <SPI.h>
#include <MFRC522.h>

// ================= WIFI =================
const char* ssid = "TEN_WIFI";
const char* password = "PASSWORD";

// ================= MQTT =================
const char* mqtt_server = "192.168.*.*";

// ================= DEVICE =================
const char* DEVICE_ID = "esp32_2";

// ================= BASE TOPIC =================
String baseTopic = "home/" + String(DEVICE_ID);

// ================= LED =================
#define LED_PIN 2

// ================= DOOR =================
#define DOOR_PIN 32

int lastDoorState;

// ================= RFID =================
#define SS_PIN   5
#define RST_PIN  22

MFRC522 rfid(SS_PIN, RST_PIN);

// ================= MQTT OBJECT =================
WiFiClient espClient;
PubSubClient client(espClient);

// ================= WIFI =================
void setup_wifi() {

  Serial.print("Connecting WiFi");

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {

    delay(300);

    Serial.print(".");

    // blink LED khi chưa kết nối WiFi
    digitalWrite(
      LED_PIN,
      !digitalRead(LED_PIN)
    );
  }

  Serial.println("\nWiFi connected!");
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

      // MQTT OK
      digitalWrite(LED_PIN, HIGH);

      // trạng thái online
      client.publish(
        (baseTopic + "/state/status").c_str(),
        "ONLINE",
        true
      );

    } else {

      Serial.print("failed, rc=");

      Serial.println(client.state());

      // mất MQTT
      digitalWrite(LED_PIN, LOW);

      delay(2000);
    }
  }
}

// ================= SETUP =================
void setup() {

  Serial.begin(115200);

  // ===== LED =====
  pinMode(LED_PIN, OUTPUT);

  // ===== DOOR =====
  pinMode(DOOR_PIN, INPUT_PULLUP);

  lastDoorState = digitalRead(DOOR_PIN);

  // ===== RFID =====
  SPI.begin(18, 19, 23, 5);

  rfid.PCD_Init();

  // ===== WIFI =====
  setup_wifi();

  // ===== MQTT =====
  client.setServer(mqtt_server, 1883);

  Serial.println("System Ready");

  Serial.println("Tap RFID card...");
}

// ================= LOOP =================
void loop() {

  // ===== MQTT =====
  if (!client.connected()) {

    reconnect();
  }

  client.loop();

  // LED sáng khi MQTT connected
  digitalWrite(
    LED_PIN,
    client.connected()
  );

  // ================= DOOR SENSOR =================
  int currentDoorState =
      digitalRead(DOOR_PIN);

  if (currentDoorState !=
      lastDoorState) {

    String doorState;

    if (currentDoorState == HIGH) {

      doorState = "OPEN";

    } else {

      doorState = "CLOSED";
    }

    Serial.print("Door: ");

    Serial.println(doorState);

    // ===== SENSOR =====
    client.publish(
      (baseTopic + "/sensor/door")
      .c_str(),

      doorState.c_str()
    );

    // ===== STATE =====
    client.publish(
      (baseTopic + "/state/door")
      .c_str(),

      doorState.c_str(),

      true
    );

    lastDoorState = currentDoorState;

    delay(200);
  }

  // ================= RFID =================
  if (rfid.PICC_IsNewCardPresent() &&
      rfid.PICC_ReadCardSerial()) {

    String uid = "";

    for (byte i = 0;
         i < rfid.uid.size;
         i++) {

      if (rfid.uid.uidByte[i] < 0x10) {

        uid += "0";
      }

      uid += String(
        rfid.uid.uidByte[i],
        HEX
      );
    }

    uid.toUpperCase();

    Serial.print("Card UID: ");

    Serial.println(uid);

    // ===== SENSOR =====
    client.publish(
      (baseTopic + "/sensor/rfid")
      .c_str(),

      uid.c_str()
    );

    // ===== STATE =====
    client.publish(
      (baseTopic + "/state/rfid")
      .c_str(),

      uid.c_str(),

      true
    );

    rfid.PICC_HaltA();

    delay(1000);
  }
}
