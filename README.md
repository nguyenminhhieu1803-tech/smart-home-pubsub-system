# Hệ thống điều khiển nhà thông minh dựa trên mô hình Pub-Sub

![Project](https://img.shields.io/badge/Project-Smart%20Home%20IoT-blue)
![Platform](https://img.shields.io/badge/Platform-Raspberry%20Pi-red)
![Protocol](https://img.shields.io/badge/Protocol-MQTT-green)
![Backend](https://img.shields.io/badge/Backend-Node.js-brightgreen)
![Database](https://img.shields.io/badge/Database-SQLite-lightgrey)

## Giao diện hệ thống

![Giao diện Web Dashboard](assets/images/ch3-dashboard-overview.jpg)

## Giới thiệu

Đây là hệ thống điều khiển và giám sát nhà thông minh dựa trên mô hình **Publish-Subscribe**, sử dụng **Raspberry Pi** làm máy chủ trung tâm và các node **ESP32/ESP8266** để thu thập dữ liệu cảm biến, điều khiển thiết bị và gửi cảnh báo.

Hệ thống hỗ trợ giám sát dữ liệu thời gian thực, điều khiển đèn/quạt, phát hiện khí gas/lửa, giám sát cửa bằng RFID, lưu dữ liệu vào SQLite và gửi cảnh báo qua Telegram Bot.

Đề tài khóa luận tốt nghiệp:

> **Thiết kế hệ thống điều khiển nhà thông minh dựa trên mô hình Pub-Sub**

---

## Demo

* **Live Demo giao diện tĩnh:**
  `https://nguyenminhhieu1803-tech.github.io/smart-home-pubsub-system/`

* **Source Code:**
  `https://github.com/nguyenminhhieu1803-tech/smart-home-pubsub-system`

> Demo tĩnh chỉ mô phỏng giao diện Web Dashboard, không kết nối trực tiếp với Raspberry Pi, MQTT Broker hoặc phần cứng thật.

---

## Tính năng chính

| Nhóm chức năng          | Mô tả                                                                      |
| ----------------------- | -------------------------------------------------------------------------- |
| Giám sát thời gian thực | Theo dõi nhiệt độ, độ ẩm, ánh sáng, khí gas, lửa, chuyển động, cửa và RFID |
| Điều khiển thiết bị     | Bật/tắt đèn, quạt, relay và RGB LED từ Web Dashboard                       |
| Giao tiếp Pub-Sub       | Truyền dữ liệu giữa server và các node qua MQTT                            |
| Cảnh báo thông minh     | Cảnh báo gas, lửa, mở cửa bất thường và quét sai thẻ RFID                  |
| Lưu trữ dữ liệu         | Lưu dữ liệu cảm biến và trạng thái hệ thống bằng SQLite                    |
| Thông báo từ xa         | Gửi cảnh báo đến người dùng thông qua Telegram Bot                         |
| Tự khởi động            | Server Node.js có thể chạy tự động khi Raspberry Pi khởi động              |

---

## Kiến trúc hệ thống

![Sơ đồ kiến trúc tổng thể](assets/diagrams/ch2-diagram-overall-system.drawio.png)

Hệ thống gồm một máy chủ trung tâm Raspberry Pi và ba node phần cứng:

| Khu vực     | Vi điều khiển  | Chức năng                                                 |
| ----------- | -------------- | --------------------------------------------------------- |
| Phòng khách | ESP32          | Đọc nhiệt độ, độ ẩm, ánh sáng, PIR và điều khiển đèn/quạt |
| Khu vực bếp | ESP8266        | Phát hiện khí gas, lửa và kích hoạt cảnh báo tại chỗ      |
| Khu vực cửa | ESP32          | Đọc RFID, trạng thái cửa và cảnh báo truy cập sai         |
| Trung tâm   | Raspberry Pi 4 | Chạy Mosquitto, Node.js Server, SQLite và Web Dashboard   |

---

## Mô hình Pub-Sub với MQTT

Hệ thống sử dụng MQTT theo mô hình **Publish-Subscribe**:

```text
ESP32/ESP8266  →  Publish dữ liệu cảm biến  →  MQTT Broker
Node.js Server →  Subscribe dữ liệu         →  Lưu SQLite + cập nhật Dashboard
Dashboard      →  Gửi lệnh điều khiển       →  Node.js publish MQTT command
ESP32/ESP8266  →  Subscribe lệnh            →  Điều khiển thiết bị
```

Ví dụ topic MQTT:

```text
home/esp32_1/sensor/temp
home/esp32_1/sensor/hum
home/esp32_1/cmd/relay1
home/esp8266_1/sensor/gas
home/esp32_2/sensor/rfid
```

---

## Công nghệ sử dụng

| Thành phần       | Công nghệ              |
| ---------------- | ---------------------- |
| Server trung tâm | Raspberry Pi 4 Model B |
| MQTT Broker      | Mosquitto              |
| Backend          | Node.js                |
| Database         | SQLite                 |
| Web Dashboard    | HTML, CSS, JavaScript  |
| Vi điều khiển    | ESP32, ESP8266         |
| Cảnh báo từ xa   | Telegram Bot API       |
| Firmware         | Arduino IDE            |

---

## Hình ảnh minh họa

### Giao diện điều khiển thiết bị

![Giao diện điều khiển thiết bị](assets/images/ch3-dashboard-device-control.jpg)

### Mô hình phần cứng tổng thể

![Mô hình phần cứng tổng thể](assets/images/ch3-hardware-overall-system.jpg)

### Node phòng khách

![Node phòng khách](assets/images/ch3-hardware-livingroom-node.jpg)

### Node bếp

![Node bếp](assets/images/ch3-hardware-kitchen-node.jpg)

### Node cửa

![Node cửa](assets/images/ch3-hardware-door-node.jpg)

### Cảnh báo Telegram

![Cảnh báo Telegram](assets/images/ch3-telegram-alerts-summary.jpg)

---

## Cấu trúc thư mục

```text
smart-home-pubsub-system/
├── server/                 # Node.js Server
├── public/                 # Web Dashboard thật
├── firmware/               # Code ESP32/ESP8266
├── data/                   # File cấu hình mẫu
├── docs/                   # Demo giao diện tĩnh cho GitHub Pages
├── assets/
│   ├── images/             # Ảnh dashboard, phần cứng, Telegram
│   └── diagrams/           # Sơ đồ hệ thống
├── README.md
├── package.json
└── package-lock.json
```

---

## Cài đặt và chạy trên Raspberry Pi

### 1. Clone repository

```bash
git clone https://github.com/nguyenminhhieu1803-tech/smart-home-pubsub-system.git
cd smart-home-pubsub-system
```

### 2. Cài đặt thư viện

```bash
npm install
```

### 3. Tạo file cấu hình

```bash
cp data/settings.example.json data/settings.json
nano data/settings.json
```

Cấu hình mẫu:

```json
{
  "telegram": {
    "token": "YOUR_TELEGRAM_BOT_TOKEN",
    "chat_id": "YOUR_TELEGRAM_CHAT_ID"
  },
  "mqtt": {
    "host": "localhost"
  }
}
```

### 4. Khởi động Mosquitto

```bash
sudo systemctl enable mosquitto
sudo systemctl start mosquitto
```

### 5. Chạy server

```bash
node server/server.js
```

Truy cập Dashboard:

```text
http://<IP_RASPBERRY_PI>:3000
```

---

## Firmware

Firmware của các node nằm trong thư mục:

```text
firmware/
├── esp32_livingroom/
├── esp8266_kitchen/
└── esp32_door/
```

Trước khi nạp code cần cấu hình:

```text
Wi-Fi SSID
Wi-Fi Password
MQTT Host
GPIO Pin
Tên node
```

---

## Ghi chú bảo mật

Không đưa các file sau lên GitHub:

```text
data/settings.json
data/users.json
database.db
database.sqlite
.env
node_modules/
```

Không công khai:

```text
Telegram Bot Token
Telegram Chat ID
Mật khẩu Wi-Fi
Database thật
```

---

## Hướng phát triển

* Bổ sung xác thực MQTT.
* Bổ sung TLS cho MQTT khi triển khai qua Internet.
* Cải thiện giao diện biểu đồ dữ liệu.
* Bổ sung camera giám sát và xử lý ảnh.
* Thiết kế PCB hoặc vỏ hộp cho các node.
* Triển khai truy cập từ xa an toàn bằng VPN hoặc cloud.

---

## Tác giả

**Nguyễn Minh Hiếu**

Đề tài khóa luận tốt nghiệp:

**Thiết kế hệ thống điều khiển nhà thông minh dựa trên mô hình Pub-Sub**
