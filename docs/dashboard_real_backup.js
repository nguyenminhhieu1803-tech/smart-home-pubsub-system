// ===================================================
//  SMART HOME DASHBOARD — dashboard.js  (Phase 3 complete)
//  Nodes: ESP32_1 (living), ESP32_2 (door), ESP8266 (kitchen)
// ===================================================

// ===== CONFIG =====
const MQTT_CONFIG = {
    host:     "192.168.68.193",
    port:     9001,
    username: "",
    password: "",
    clientId: "dashboard_" + Math.random().toString(16).slice(2, 8),
};

const TOPIC_STATE_MAP = {
    "home/esp32_1/state/relay1": "relay1",
    "home/esp32_1/state/relay2": "relay2",
    "home/esp8266/state/relay":  "relay_k",
    "home/esp32_2/state/door":   "door",
};
// dashboard.js — DEVICE_CMD_TOPIC
const DEVICE_CMD_TOPIC = {
    "relay1": "home/esp32_1/cmd/relay1",
    "relay2": "home/esp32_1/cmd/relay2",
    // relay_k: khong co cmd (tu dong theo alarm)
};

// ===== DEVICE DATA =====
const devices = [
    { id: "relay1",  name: "Đèn phòng khách",  room: "living",   icon: "bi-lightbulb",      state: false, canControl: true  },
    { id: "relay2",  name: "Quạt phòng khách", room: "living",   icon: "bi-fan",            state: false, canControl: true  },
    { id: "relay_k", name: "Relay báo động",   room: "kitchen",  icon: "bi-exclamation-triangle", state: false, canControl: false },
    { id: "door",    name: "Cảm biến cửa",      room: "entrance", icon: "bi-door-open",      state: false, canControl: false },
];

const roomLabels = {
    all: "All rooms", living: "Living room",
    bedroom: "Bedroom", kitchen: "Kitchen", entrance: "Entrance",
};

const alertLog  = [];
let currentRoom = "all";
let mqttClient  = null;

// ===== STATE MỞ RỘNG =====
let gasThreshold = 50;      // nhận từ home/esp8266/state/threshold
let alarmActive  = false;   // nhận từ home/esp8266/state/alarm
let muteActive   = false;   // nhận từ home/esp8266/state/mute
let currentRgb   = "OFF";   // nhận từ home/esp32_1/state/rgb
let lastIrCmd    = "--";     // nhận từ home/esp32_1/sensor/ir
let unreadCount  = 0;       // số thông báo chưa đọc

// ===== AUTH =====
const userData = localStorage.getItem("user");
if (!userData) window.location.href = "/login/login.html";
let user = null;
try   { user = JSON.parse(userData); }
catch { user = { username: userData }; }

// ===== INIT =====
document.addEventListener("DOMContentLoaded", () => {
    loadTheme();
    loadUserInfo();
    setupLogout();
    setupSidebarToggle();
    startClock();
    renderDevices("all", "device-list");
    renderAlerts();
    updateDeviceCount();
    initChart();
    initMQTT();
    initSlideshow();
});

// ===== MQTT =====
function initMQTT() {
    const url = "ws://" + MQTT_CONFIG.host + ":" + MQTT_CONFIG.port + "/mqtt";
    const options = {
        clientId: MQTT_CONFIG.clientId,
        clean: true,
        reconnectPeriod: 3000,
    };
    if (MQTT_CONFIG.username) {
        options.username = MQTT_CONFIG.username;
        options.password = MQTT_CONFIG.password;
    }
    mqttClient = mqtt.connect(url, options);

    mqttClient.on("connect", function() {
        setMqttStatus(true, MQTT_CONFIG.host + ":" + MQTT_CONFIG.port);
        console.log("[MQTT] Connected");
        var topics = [
            // ESP32_1: phong khach
            "home/esp32_1/sensor/temp",
            "home/esp32_1/sensor/hum",
            "home/esp32_1/sensor/light",
            "home/esp32_1/sensor/pir",
            "home/esp32_1/sensor/ir",
            "home/esp32_1/state/relay1",
            "home/esp32_1/state/relay2",
            "home/esp32_1/state/rgb",
            "home/esp32_1/state/status",
            // ESP32_2: cua ra vao
            "home/esp32_2/sensor/door",
            "home/esp32_2/sensor/rfid",
            "home/esp32_2/state/door",
            "home/esp32_2/state/rfid",
            "home/esp32_2/state/status",
            // ESP8266: bao dong
            "home/esp8266/sensor/gas",
            "home/esp8266/sensor/flame",
            "home/esp8266/state/relay",
            "home/esp8266/state/buzzer",
            "home/esp8266/state/mute",
            "home/esp8266/state/alarm",
            "home/esp8266/state/threshold",
            "home/esp8266/state/status",
            "home/esp8266/alert",
        ];
        topics.forEach(function(t) { mqttClient.subscribe(t); });
    });

    mqttClient.on("message", function(topic, payload) {
        handleMessage(topic, payload.toString().trim());
    });

    mqttClient.on("offline",    function() { setMqttStatus(false); });
    mqttClient.on("error",  function(e) { setMqttStatus(false); console.warn("[MQTT]", e); });
    mqttClient.on("reconnect",  function() { setMqttStatusReconnecting(); });
}

// ===== MESSAGE HANDLER =====
function handleMessage(topic, val) {

    // ── ESP32_1: SENSOR ── 
    if (topic === "home/esp32_1/sensor/temp") {
        var parts     = val.split(",");
        var tempVal   = parseFloat(parts[0]);
        var recvTime  = Date.now();
        console.log("[LATENCY] temp: " + (recvTime - parseInt(parts[1] || 0)) + " ms | value: " + tempVal);
        setText("temp", tempVal.toFixed(1) + " °C");
        setText("tempSensor", tempVal.toFixed(1) + " °C");
        setText("welcomeTemp", parseFloat(val).toFixed(1) + " °C");
        pushChartData("temp", tempVal);
        return;
    }
    if (topic === "home/esp32_1/sensor/hum") {
        setText("humidity", parseFloat(val).toFixed(1) + " %");
        setText("humSensor", parseFloat(val).toFixed(1) + " %");
        setText("welcomeHum", parseFloat(val).toFixed(1) + " %");
        pushChartData("hum", parseFloat(val));
        return;
    }
    if (topic === "home/esp32_1/sensor/light") {
        setText("lightLux", parseFloat(val).toFixed(0) + " lux");
        return;
    }
    if (topic === "home/esp32_1/sensor/pir") {
        var detected = (val === "1");
        updatePirUI(detected);
        if (detected) pushAlert("motion", "Phát hiện chuyển động!", "Phòng khách", "warning");
        return;
    }
    // IR remote — log lệnh, không alert
    if (topic === "home/esp32_1/sensor/ir") {
        lastIrCmd = "0x" + val.toUpperCase();
        setText("irLastCmd", lastIrCmd);
        console.log("[IR] Lệnh nhận:", lastIrCmd);
        return;
    }

    // ── ESP32_1: STATE ──────────────────────────────
    if (topic === "home/esp32_1/state/rgb") {
        currentRgb = val;
        updateRgbUI(val);
        return;
    }

    // ── ESP32_2: SENSOR ─────────────────────────────
    if (topic === "home/esp32_2/sensor/door") {
        var isOpen = (val === "OPEN");
        updateDoorUI(isOpen);
        syncDeviceState("door", isOpen);
        if (isOpen) pushAlert("door", "Cửa đang mở!", "Cửa ra vào", "info");
        return;
    }
    if (topic === "home/esp32_2/sensor/rfid" ||
        topic === "home/esp32_2/state/rfid") {
        pushAlert("rfid", "Quẹt thẻ: " + val, "Cửa ra vào", "info");
        setText("lastRfid", val);
        autoFillRfidUID(val);
        return;
    }

    // ── ESP8266: SENSOR ─────────────────────────────
    if (topic === "home/esp8266/sensor/gas") {
        var gasVal = parseInt(val);
        updateGasUI(gasVal);
        // Chỉ hiển thị giá trị, KHÔNG alert gas — alert đến từ home/esp8266/alert
        return;
    }
    if (topic === "home/esp8266/sensor/flame") {
        var flameDetected = (val === "1");
        updateFlameUI(flameDetected);
        // Không alert ở đây — alert đến từ home/esp8266/alert
        return;
    }

    // ── ESP8266: ALERT (chính thức từ firmware) ─────
    if (topic === "home/esp8266/alert") {
        if (val === "FLAME") {
            pushAlert("flame", "🔥 Phát hiện lửa!", "Nhà bếp", "danger");
            setSensorAlert("flame", true);
        } else if (val === "GAS") {
            pushAlert("gas", "⚠️ Khí gas vượt ngưỡng!", "Nhà bếp", "danger");
            setSensorAlert("gas", true);
        } else if (val === "BOTH") {
            pushAlert("alarm", "🚨 Gas + Lửa đồng thời!", "Nhà bếp", "danger");
            setSensorAlert("flame", true);
            setSensorAlert("gas", true);
        } else if (val === "CLEAR") {
            setSensorAlert("flame", false);
            setSensorAlert("gas", false);
        }
        return;
    }

    // ── ESP8266: STATE ──────────────────────────────
    if (topic === "home/esp8266/state/alarm") {
        alarmActive = (val === "ON");
        updateAlarmIndicator(alarmActive);
        return;
    }
    if (topic === "home/esp8266/state/mute") {
        muteActive = (val === "ON");
        updateMuteUI(muteActive);
        return;
    }
    if (topic === "home/esp8266/state/threshold") {
        gasThreshold = parseInt(val);
        setText("gasThresholdVal", gasThreshold);
        var inp = document.getElementById("gasThresholdInput");
        if (inp) inp.value = gasThreshold;
        return;
    }

    // ── STATE MAP (relay1, relay2, relay_k, buzzer, door) ──
    if (TOPIC_STATE_MAP[topic]) {
        var deviceId = TOPIC_STATE_MAP[topic];
        var on = (val === "ON" || val === "1" || val === "OPEN");
        syncDeviceState(deviceId, on);
        return;
    }

    // ── STATUS NODE ─────────────────────────────────
    if (topic.endsWith("/state/status")) {
        var node = topic.split("/")[1];
        updateNodeStatus(node, val);
        return;
    }
}

// ===== PUBLISH =====
function publishCommand(deviceId, isOn) {
    var topic = DEVICE_CMD_TOPIC[deviceId];
    if (!topic) return;
    if (!mqttClient || !mqttClient.connected) {
        console.warn("[MQTT] Not connected");
        return;
    }
    mqttClient.publish(topic, isOn ? "ON" : "OFF", { qos: 1, retain: false });
    console.log("[MQTT] -> " + topic + ": " + (isOn ? "ON" : "OFF"));
}

// ===== TOGGLE DEVICE =====
function toggleDevice(id, containerId, isOn) {
    var device = devices.find(function(d) { return d.id === id; });
    if (!device || !device.canControl) return;
    device.state = isOn;
    updateDeviceCardUI(id, isOn);
    updateDeviceCount();
    publishCommand(id, isOn);
}

// ===== SYNC STATE =====
function syncDeviceState(deviceId, isOn) {
    var device = devices.find(function(d) { return d.id === deviceId; });
    if (!device || device.state === isOn) return;
    device.state = isOn;
    updateDeviceCardUI(deviceId, isOn);
    updateDeviceCount();

    // Cập nhật UI relay báo động riêng (vì không render card)
    if (deviceId === "relay_k") {
        var el  = document.getElementById("relayAlarmStatus");
        var dot = document.getElementById("relayAlarmDot");
        if (el)  { el.textContent = isOn ? "Đang kích hoạt" : "Tắt"; el.className = "sensor-val " + (isOn ? "text-danger" : "text-success"); }
        if (dot) { dot.textContent = isOn ? "🔴" : "⚪"; }
    }
}

function updateDeviceCardUI(id, isOn) {
    var card   = document.getElementById("card-" + id);
    if (!card) return;
    card.classList.toggle("on", isOn);
    var label  = card.querySelector(".device-state-label");
    var sub    = card.querySelector(".device-sub");
    var chkbox = card.querySelector("input[type=checkbox]");
    var wrap   = card.querySelector(".device-icon-wrap");
    if (label)  { label.textContent = isOn ? "ON" : "OFF"; label.className = "device-state-label" + (isOn ? " on" : ""); }
    if (sub)    { sub.textContent   = isOn ? "Active" : "Inactive"; }
    if (chkbox) { chkbox.checked    = isOn; }
    if (wrap)   { wrap.className    = "device-icon-wrap" + (isOn ? " on" : ""); }
}

// ===== RENDER DEVICES =====
function renderDevices(room, containerId) {
    var container = document.getElementById(containerId);
    if (!container) return;

    // device-list (dashboard): chỉ thiết bị điều khiển được, bỏ filter room
    // device-list-full (page devices): tương tự
    var filtered = devices.filter(function(d) { return d.canControl; });

    if (filtered.length === 0) {
        container.innerHTML = '<div style="grid-column:1/-1;color:var(--text-muted);padding:20px 0;font-size:13px;">Không có thiết bị nào.</div>';
        return;
    }

    container.innerHTML = filtered.map(function(device) {
        return '<div class="device-card ' + (device.state ? "on" : "") + '" id="card-' + device.id + '">'
            + '<div class="device-top">'
            + '<span class="device-state-label ' + (device.state ? "on" : "") + '">' + (device.state ? "ON" : "OFF") + '</span>'
            + '<label class="toggle-switch">'
            + '<input type="checkbox" ' + (device.state ? "checked" : "") + ' ' + (!device.canControl ? "disabled" : "")
            + ' onchange="toggleDevice(\'' + device.id + '\', \'' + containerId + '\', this.checked)">'
            + '<div class="toggle-track"></div>'
            + '<div class="toggle-thumb"></div>'
            + '</label>'
            + '</div>'
            + '<div class="device-icon-wrap ' + (device.state ? "on" : "") + '">'
            + '<i class="bi ' + device.icon + '"></i>'
            + '</div>'
            + '<div class="device-name">' + device.name + '</div>'
            + '<div class="device-sub">' + (device.state ? "Active" : "Inactive") + '</div>'
            + '</div>';
    }).join("");
}

// ===== SENSOR UI =====
function updatePirUI(detected) {
    var el = document.getElementById("pirStatus");
    if (el) { el.textContent = detected ? "Có chuyển động" : "Không có"; el.className = detected ? "sensor-val text-warning" : "sensor-val"; }
}
function updateDoorUI(isOpen) {
    var el = document.getElementById("doorStatus");
    if (el) { el.textContent = isOpen ? "Đang mở" : "Đã đóng"; el.className = isOpen ? "sensor-val text-danger" : "sensor-val text-success"; }
}
function updateGasUI(val) {
    var el  = document.getElementById("gasValue");
    var bar = document.getElementById("gasBar");
    var barVal = document.getElementById("gasBarVal");
    if (el)     el.textContent = val + " ADC";
    if (barVal) barVal.textContent = val + " / " + gasThreshold;
    var pct = Math.min(100, Math.round(val / gasThreshold * 100));
    if (bar) {
        bar.style.width = pct + "%";
        bar.className   = "gas-bar-fill " + (val > gasThreshold ? "danger" : val > gasThreshold * 0.6 ? "warning" : "safe");
    }
}
function updateFlameUI(detected) {
    var el = document.getElementById("flameStatus");
    if (el) { el.textContent = detected ? "Phát hiện lửa!" : "Bình thường"; el.className = detected ? "sensor-val text-danger" : "sensor-val text-success"; }
}

function setSensorAlert(type, active) {
    var iconId = type === "flame" ? "flameAlertIcon" : "gasAlertIcon";
    var icon   = document.getElementById(iconId);
    var row    = icon ? icon.closest(".sensor-row") : null;

    if (icon) {
        icon.classList.toggle("active", active);
    }
    if (row) {
        row.classList.remove("alerting", "alerting-warn");
        if (active) {
            row.classList.add(type === "flame" ? "alerting" : "alerting-warn");
        }
    }
}

// ── MỚI: RGB LED ─────────────────────────────────
function updateRgbUI(val) {
    var colorMap = {
        "RED":     { label: "Đỏ",         color: "#ef4444" },
        "GREEN":   { label: "Xanh lá",    color: "#22c55e" },
        "BLUE":    { label: "Xanh dương", color: "#3b82f6" },
        "YELLOW":  { label: "Vàng",       color: "#eab308" },
        "CYAN":    { label: "Cyan",        color: "#06b6d4" },
        "MAGENTA": { label: "Tím",         color: "#a855f7" },
        "WHITE":   { label: "Trắng",       color: "#e2e8f0" },
        "OFF":     { label: "TẮT",         color: "#6b7280" },
    };
    var info  = colorMap[val] || { label: val, color: "#6b7280" };
    var isOn  = (val !== "OFF" && val !== "");

    // ── Dashboard mini RGB ──
    var el  = document.getElementById("rgbStatus");
    var dot = document.getElementById("rgbDot");
    if (el)  el.textContent       = info.label;
    if (dot) dot.style.background = info.color;

    // ── Trang Devices RGB card ──
    var devDot      = document.getElementById("devRgbDot");
    var devLabel    = document.getElementById("devRgbLabel");
    var devToggle   = document.getElementById("devRgbToggle");
    var devIconWrap = document.getElementById("devRgbIconWrap");
    var devCard     = devIconWrap ? devIconWrap.closest(".dev-rgb-card") : null;
    var devColors   = document.getElementById("devRgbColors");

    if (devDot)    devDot.style.background = info.color;
    if (devLabel)  devLabel.textContent    = info.label;
    if (devToggle) devToggle.checked       = isOn;
    if (devIconWrap) {
        devIconWrap.className = "dev-rgb-icon-wrap" + (isOn ? " on" : "");
        devIconWrap.style.color = isOn ? info.color : "";
    }
    if (devCard)   devCard.classList.toggle("on", isOn);
    if (devColors) devColors.style.display = isOn ? "" : "none";

    // Highlight nút màu đang active
    document.querySelectorAll(".rgb-pill, .dev-rgb-pill").forEach(function(btn) {
        btn.classList.remove("active");
        if (btn.dataset.color === val) btn.classList.add("active");
    });
}

// ── MỚI: Alarm indicator ─────────────────────────
function updateAlarmIndicator(active) {
    var el = document.getElementById("alarmIndicator");
    if (!el) return;
    el.className = "alarm-indicator" + (active ? " active" : "");
    el.textContent = active ? "🚨 ĐANG BÁO ĐỘNG" : "✅ Bình thường";
}

// ── MỚI: Mute UI ─────────────────────────────────
function updateMuteUI(muted) {
    var btn = document.getElementById("muteBtn");
    var lbl = document.getElementById("muteLabel");
    if (btn) btn.className = "user-btn " + (muted ? "user-btn-warning" : "user-btn-ghost");
    if (lbl) lbl.textContent = muted ? "Bỏ mute" : "Mute còi";
}

// ── MỚI: Publish mute ────────────────────────────
function publishMute(on) {
    if (!mqttClient || !mqttClient.connected) return;
    var payload = on ? "ON" : "OFF";
    mqttClient.publish("home/esp8266/cmd/mute", payload, { qos: 1, retain: false });
    console.log("[MQTT] -> mute:", payload);
}

// ── MỚI: Publish ngưỡng gas ──────────────────────
function publishGasThreshold(val) {
    var v = parseInt(val);
    if (isNaN(v) || v < 10 || v > 1023) {
        alert("Ngưỡng gas hợp lệ: 10 – 1023");
        return;
    }
    if (!mqttClient || !mqttClient.connected) {
        alert("MQTT chưa kết nối!");
        return;
    }
    mqttClient.publish("home/esp8266/cmd/threshold", String(v), { qos: 1, retain: true });
    console.log("[MQTT] -> threshold:", v);
}

// ── MỚI: Publish RGB ─────────────────────────────
function publishRgb(color) {
    if (!mqttClient || !mqttClient.connected) return;
    mqttClient.publish("home/esp32_1/cmd/rgb", color, { qos: 1, retain: false });
    console.log("[MQTT] -> rgb:", color);
}
// Toggle ON/OFF cho RGB ở trang Devices
function toggleRgbPower(isOn) {
    if (isOn) {
        // Bật lại màu cuối hoặc WHITE mặc định
        var lastColor = currentRgb && currentRgb !== "OFF" ? currentRgb : "WHITE";
        publishRgb(lastColor);
    } else {
        publishRgb("OFF");
    }
    // Ẩn/hiện color picker
    var colors = document.getElementById("devRgbColors");
    if (colors) colors.style.display = isOn ? "" : "none";
}
function updateNodeStatus(node, status) {
    var el = document.getElementById("status-" + node);
    if (el) {
        el.className = "node-dot " + (status === "ONLINE" ? "online" : "offline");
    }
}

// ===== ALERTS =====
function pushAlert(type, message, location, level) {
    var now = new Date().toLocaleTimeString("vi-VN");
    alertLog.unshift({ id: Date.now(), type: type, message: message, location: location, level: level, time: now, read: false });
    if (alertLog.length > 50) alertLog.pop();
    unreadCount++;
    renderAlerts();
    renderAlertsMini();
    updateNotifBadge();
    // Cập nhật panel nếu đang mở
    var panel = document.getElementById("notifPanel");
    if (panel && panel.style.display !== "none") renderNotifPanel();
    setText("alertCount", alertLog.filter(function(a) { return a.level === "danger"; }).length);
}

function updateNotifBadge() {
    var nb = document.getElementById("notifBadge");
    var nc = document.getElementById("notiCount");
    var display = unreadCount > 0 ? (unreadCount > 99 ? "99+" : String(unreadCount)) : "0";
    if (nb) { nb.textContent = display; nb.style.display = unreadCount > 0 ? "" : "none"; }
    if (nc) { nc.textContent = display; nc.style.display = unreadCount > 0 ? "" : "none"; }
}

function markAllRead() {
    unreadCount = 0;
    alertLog.forEach(function(a) { a.read = true; });
    updateNotifBadge();
    renderAlerts();
}

function toggleNotifPanel(e) {
    e.stopPropagation();
    var panel = document.getElementById("notifPanel");
    if (!panel) return;
    var isOpen = panel.style.display !== "none";
    if (isOpen) {
        panel.style.display = "none";
    } else {
        renderNotifPanel();
        panel.style.display = "";
    }
}

function closeNotifPanel() {
    var panel = document.getElementById("notifPanel");
    if (panel) panel.style.display = "none";
}

function renderNotifPanel() {
    var container = document.getElementById("notif-panel-list");
    if (!container) return;

    if (alertLog.length === 0) {
        container.innerHTML = '<div style="padding:16px;text-align:center;'
            + 'color:var(--text-muted);font-size:12px;">Chưa có thông báo nào.</div>';
        return;
    }

    container.innerHTML = alertLog.slice(0, 10).map(function(a) {
        return '<div class="notif-item ' + a.level + (a.read ? "" : " unread") + '">'
            + '<div class="notif-item-msg">' + a.message + '</div>'
            + '<div class="notif-item-meta">' + a.location + ' · ' + a.time + '</div>'
            + '</div>';
    }).join("");
}

// Đóng panel khi click ra ngoài
document.addEventListener("click", function(e) {
    var panel = document.getElementById("notifPanel");
    if (panel && panel.style.display !== "none") {
        if (!panel.contains(e.target)) closeNotifPanel();
    }
});

function renderAlerts() {
    var container = document.getElementById("alert-list");
    if (!container) return;
    if (alertLog.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:13px;padding:20px 0;">Chưa có cảnh báo nào.</div>';
        return;
    }
    container.innerHTML = alertLog.map(function(a) {
        return '<div class="alert-card ' + a.level + '">'
            + '<div class="d-flex justify-content-between align-items-start">'
            + '<div><div class="alert-msg">' + a.message + '</div><div class="alert-loc">' + a.location + '</div></div>'
            + '<span class="alert-badge ' + a.level + '">' + a.level.toUpperCase() + '</span>'
            + '</div>'
            + '<div class="alert-time">' + a.time + '</div>'
            + '</div>';
    }).join("");
}

// Render 5 alert mới nhất vào cột phải
function renderAlertsMini() {
    var container = document.getElementById("alert-list-mini");
    if (!container) return;

    var recent = alertLog.slice(0, 5);

    if (recent.length === 0) {
        container.innerHTML = '<div style="font-size:12px;color:var(--text-muted);padding:8px 0;">Chưa có cảnh báo.</div>';
        return;
    }

    container.innerHTML = recent.map(function(a) {
        var borderColor = a.level === "danger" ? "#f85149"
                        : a.level === "warning" ? "#d29922" : "#2f81f7";
        return '<div style="padding:8px 10px;background:var(--bg-surface);border-radius:8px;border-left:3px solid ' + borderColor + ';font-size:12px;">'
            + '<div style="font-weight:500;color:var(--text-main);">' + a.message + '</div>'
            + '<div style="color:var(--text-muted);font-size:10px;margin-top:2px;">' + a.location + ' · ' + a.time + '</div>'
            + '</div>';
    }).join("");
}

// ===== CHART =====
var chartLabels   = [];
var chartTempData = [];
var chartHumData  = [];

function pushChartData(type, value) {
    if (!window.envChart) return;
    if (type === "temp") {
        var time = new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        chartLabels.push(time);
        chartTempData.push(value);
        if (chartLabels.length > 15) { chartLabels.shift(); chartTempData.shift(); }
        window.envChart.data.labels = chartLabels;
        window.envChart.data.datasets[0].data = chartTempData;
    }
    if (type === "hum") {
        chartHumData.push(value);
        if (chartHumData.length > 15) chartHumData.shift();
        window.envChart.data.datasets[1].data = chartHumData;
    }
    window.envChart.update("none");
}

function initChart() {
    var ctx = document.getElementById("envChart");
    if (!ctx) return;
    var getGrid = function() { return document.body.classList.contains("dark-mode") ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"; };
    var getTick = function() { return document.body.classList.contains("dark-mode") ? "#94a3b8" : "#9ca3af"; };

    window.envChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: [],
            datasets: [
                { label: "Nhiệt độ (°C)", data: [], borderColor: "#ef4444", backgroundColor: "rgba(239,68,68,0.07)", borderWidth: 2, tension: 0.4, pointRadius: 3, fill: true, yAxisID: "yTemp" },
                { label: "Độ ẩm (%)",     data: [], borderColor: "#3b82f6", backgroundColor: "rgba(59,130,246,0.07)", borderWidth: 2, tension: 0.4, pointRadius: 3, fill: true, yAxisID: "yHum"  },
            ],
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: { legend: { labels: { boxWidth: 12, font: { size: 12 }, color: getTick() } } },
            scales: {
                x:     { ticks: { color: getTick(), font: { size: 11 }, maxTicksLimit: 8 }, grid: { color: getGrid() } },
                yTemp: { type: "linear", position: "left",  title: { display: true, text: "°C", color: "#ef4444", font: { size: 11 } }, ticks: { color: "#ef4444", font: { size: 11 } }, grid: { color: getGrid() } },
                yHum:  { type: "linear", position: "right", title: { display: true, text: "%",  color: "#3b82f6", font: { size: 11 } }, ticks: { color: "#3b82f6", font: { size: 11 } }, grid: { drawOnChartArea: false } },
            },
        },
    });
}

function loadChart() {
  fetch('/api/7days')
    .then(res => res.json())
    .then(data => {

      const grouped = {};

      data.forEach(item => {
        if (!grouped[item.day]) {
          grouped[item.day] = { temp: null, hum: null, gas: null };
        }
        grouped[item.day][item.sensor_type] = item.avg_value;
      });

      const labels = Object.keys(grouped);

      const temp = labels.map(day => grouped[day].temp);
      const hum  = labels.map(day => grouped[day].hum);

      // 👉 update chart có sẵn (KHÔNG tạo new Chart)
      window.envChart.data.labels = labels;
      window.envChart.data.datasets[0].data = temp;
      window.envChart.data.datasets[1].data = hum;

      window.envChart.update();
    });
}

// ===== MQTT STATUS =====
function setMqttStatus(connected, broker) {
    broker = broker || "--";
    var dot    = document.getElementById("mqttDot");
    var status = document.getElementById("mqttStatus");
    var bi     = document.getElementById("brokerInfo");
    var icon   = document.getElementById("mqttIcon");
    if (dot)    dot.className = "mqtt-dot" + (connected ? " connected" : "");
    if (status) status.textContent = connected ? "Connected" : "Disconnected";
    if (bi)     bi.textContent = broker;
    if (icon)   icon.style.color = connected ? "#22c55e" : "#6b7280";
}
function setMqttStatusReconnecting() {
    var status = document.getElementById("mqttStatus");
    var icon   = document.getElementById("mqttIcon");
    if (status) status.textContent = "Reconnecting...";
    if (icon)   icon.style.color = "#f59e0b";
}

// ===== NAVIGATION =====
function showPage(page, el) {
    var doSwitch = function() {
        document.querySelectorAll('[id^="page-"]').forEach(function(p) { p.style.display = "none"; });
        var target = document.getElementById("page-" + page);
        if (target) target.style.display = "";
        document.querySelectorAll(".nav-link").forEach(function(l) { l.classList.remove("active"); });
        if (el) el.classList.add("active");
        if (page === "devices")       renderDevices("all", "device-list-full");
        if (page === "notifications") renderAlerts();
        if (page === "history")       initHistoryPage();
        if (page === "user")          initUserPage();
        if (page === "settings") initSettingsPage();
    };
    if (document.startViewTransition) document.startViewTransition(doSwitch);
    else doSwitch();
}

function switchRoomTab(el, room) {
    document.querySelectorAll(".room-tab").forEach(function(t) { t.classList.remove("active"); });
    el.classList.add("active");
    currentRoom = room;
    var label = document.getElementById("roomLabel");
    if (label) label.textContent = roomLabels[room] || room;
    renderDevices(room, "device-list");
}

// ===== HELPERS =====
function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
}
function updateDeviceCount() {
    var controllable = devices.filter(function(d) { return d.canControl; });
    var onCount = controllable.filter(function(d) { return d.state; }).length;
    setText("deviceCount", onCount + " / " + controllable.length);
    setText("welcomeDevices", onCount + " / " + controllable.length);
}

// ===== THEME =====
function loadTheme() {
    var saved    = localStorage.getItem("theme");
    var darkIcon = document.getElementById("darkIcon");
    if (saved === "dark") {
        document.body.classList.add("dark-mode");
        if (darkIcon) { darkIcon.classList.remove("bi-moon"); darkIcon.classList.add("bi-sun"); }
    }
}
function toggleDark() {
    var isDark = document.body.classList.toggle("dark-mode");
    localStorage.setItem("theme", isDark ? "dark" : "light");
    var icon = document.getElementById("darkIcon");
    if (icon) { icon.classList.toggle("bi-sun", isDark); icon.classList.toggle("bi-moon", !isDark); }
    if (window.envChart) window.envChart.update();
}

function toggleFullscreen() {
    var icon = document.getElementById("fullscreenIcon");
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
        if (icon) {
            icon.classList.remove("bi-fullscreen");
            icon.classList.add("bi-fullscreen-exit");
        }
    } else {
        document.exitFullscreen();
        if (icon) {
            icon.classList.remove("bi-fullscreen-exit");
            icon.classList.add("bi-fullscreen");
        }
    }
}

// ===== USER / AUTH / SIDEBAR / CLOCK =====
function loadUserInfo() {
    var el = document.getElementById("username");
    var wn = document.getElementById("welcomeName");
    var name = user ? (user.username || user) : "Admin";
    if (el) el.innerText = name;
    if (wn) wn.textContent = name + " 👋";
}
function setupLogout() {
    var logout = function() { localStorage.removeItem("user"); window.location.href = "/login/login.html"; };
    ["logoutBtn2"].forEach(function(id) { var b = document.getElementById(id); if (b) b.onclick = logout; });
}
function setupSidebarToggle() {
    var btn = document.getElementById("toggleBtn");
    var sb  = document.getElementById("sidebar");
    if (btn && sb) btn.onclick = function() { sb.classList.toggle("collapsed"); };
}
function startClock() {
    var tick = function() {
        var now = new Date();
        setText("clockTime", now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" }));
        setText("clockDate", now.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" }));
    };
    tick();
    setInterval(tick, 1000);
}

// ===== SLIDESHOW =====
function initSlideshow() {
    var slides = document.querySelectorAll(".welcome-slide");
    var dots   = document.querySelectorAll(".wd");
    if (!slides.length) return;

    var current = 0;

    function goTo(idx) {
        slides[current].classList.remove("active");
        dots[current].classList.remove("active");
        current = (idx + slides.length) % slides.length;
        slides[current].classList.add("active");
        dots[current].classList.add("active");
    }

    // Tự động chuyển mỗi 4 giây
    setInterval(function() { goTo(current + 1); }, 4000);

    // Click dot để chuyển
    dots.forEach(function(dot, i) {
        dot.addEventListener("click", function() { goTo(i); });
    });
}


// ===================================================
//  HISTORY PAGE — fetch API + render chart + table
// ===================================================

var histChart      = null;
var histRawData    = [];   // raw rows từ API
var currentDays    = 7;    // 7 hoặc 30

// Gọi khi click menu History
function initHistoryPage() {
    loadHistory(7, document.querySelector(".filter-btn"));
}

// ===== LOAD DATA =====
function loadHistory(days, btnEl) {
    currentDays = days;

    // Active button
    document.querySelectorAll(".filter-btn").forEach(function(b) { b.classList.remove("active"); });
    if (btnEl) btnEl.classList.add("active");

    // Loading state
    setText("histTableBody", "");
    var tbody = document.getElementById("histTableBody");
    if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="hist-loading">Đang tải dữ liệu...</td></tr>';

    var endpoint = days === 7 ? "/api/7days" : "/api/30days";

    fetch(endpoint)
        .then(function(res) { return res.json(); })
        .then(function(rows) {
            histRawData = rows;
            renderHistSummary(rows, days);
            renderHistChart(rows);
            renderHistTable(rows);
        })
        .catch(function(err) {
            console.error("[History] fetch error:", err);
            var tbody = document.getElementById("histTableBody");
            if (tbody) tbody.innerHTML = '<tr><td colspan="5" class="hist-loading">Lỗi tải dữ liệu. Thử lại sau.</td></tr>';
        });
}

// ===== SUMMARY CARDS =====
function renderHistSummary(rows, days) {
    var tempRows = rows.filter(function(r) { return r.sensor_type === "temp"; });
    var humRows  = rows.filter(function(r) { return r.sensor_type === "hum"; });
    var gasRows  = rows.filter(function(r) { return r.sensor_type === "gas"; });

    function avg(arr) {
        if (!arr.length) return null;
        return arr.reduce(function(s, r) { return s + r.avg_value; }, 0) / arr.length;
    }
    function minMax(arr) {
        if (!arr.length) return "--";
        var vals = arr.map(function(r) { return r.avg_value; });
        return Math.min.apply(null, vals).toFixed(1) + " — " + Math.max.apply(null, vals).toFixed(1);
    }

    var avgTemp = avg(tempRows);
    var avgHum  = avg(humRows);
    var avgGas  = avg(gasRows);

    setText("hist-avg-temp",   avgTemp !== null ? avgTemp.toFixed(1) + " °C" : "--");
    setText("hist-avg-hum",    avgHum  !== null ? avgHum.toFixed(1)  + " %"  : "--");
    setText("hist-avg-gas",    avgGas  !== null ? avgGas.toFixed(0)           : "--");
    setText("hist-range-temp", "min–max: " + minMax(tempRows));
    setText("hist-range-hum",  "min–max: " + minMax(humRows));
    setText("hist-range-gas",  "min–max: " + minMax(gasRows));
    setText("hist-count",      rows.length);
    setText("hist-days-label", days + " ngày qua");
}

// ===== CHART =====
function renderHistChart(rows) {
    // Lấy danh sách ngày unique, sort tăng dần
    var daysSet = {};
    rows.forEach(function(r) { daysSet[r.day] = true; });
    var labels = Object.keys(daysSet).sort();

    // Build dataset cho từng sensor_type
    function buildDataset(type) {
        var map = {};
        rows.filter(function(r) { return r.sensor_type === type; })
            .forEach(function(r) { map[r.day] = r.avg_value; });
        return labels.map(function(d) { return map[d] !== undefined ? parseFloat(map[d].toFixed(2)) : null; });
    }

    var tempData = buildDataset("temp");
    var humData  = buildDataset("hum");
    var gasData  = buildDataset("gas");

    // Format label ngày ngắn gọn
    var shortLabels = labels.map(function(d) {
        var parts = d.split("-");
        return parts[2] + "/" + parts[1];
    });

    var getGrid = function() { return document.body.classList.contains("dark-mode") ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)"; };
    var getTick = function() { return document.body.classList.contains("dark-mode") ? "#94a3b8" : "#9ca3af"; };

    if (histChart) {
        // Update chart nếu đã tồn tại
        histChart.data.labels = shortLabels;
        histChart.data.datasets[0].data = tempData;
        histChart.data.datasets[1].data = humData;
        histChart.data.datasets[2].data = gasData;
        histChart.update();
        return;
    }

    var ctx = document.getElementById("histChart");
    if (!ctx) return;

    histChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: shortLabels,
            datasets: [
                {
                    label: "Nhiệt độ (°C)",
                    data: tempData,
                    borderColor: "#ef4444",
                    backgroundColor: "rgba(239,68,68,0.07)",
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    yAxisID: "yLeft",
                    spanGaps: true,
                },
                {
                    label: "Độ ẩm (%)",
                    data: humData,
                    borderColor: "#3b82f6",
                    backgroundColor: "rgba(59,130,246,0.07)",
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    yAxisID: "yLeft",
                    spanGaps: true,
                },
                {
                    label: "Gas (ADC)",
                    data: gasData,
                    borderColor: "#f59e0b",
                    backgroundColor: "rgba(245,158,11,0.07)",
                    borderWidth: 2,
                    tension: 0.4,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: false,
                    yAxisID: "yRight",
                    spanGaps: true,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: {
                    display: false, // dùng button toggle riêng
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            var unit = ctx.datasetIndex === 2 ? "" : (ctx.datasetIndex === 0 ? " °C" : " %");
                            return " " + ctx.dataset.label + ": " + (ctx.parsed.y !== null ? ctx.parsed.y.toFixed(1) + unit : "N/A");
                        }
                    }
                }
            },
            scales: {
                x: {
                    ticks: { color: getTick(), font: { size: 11 }, maxTicksLimit: 15 },
                    grid:  { color: getGrid() },
                },
                yLeft: {
                    type: "linear",
                    position: "left",
                    ticks: { color: getTick(), font: { size: 11 } },
                    grid:  { color: getGrid() },
                    title: { display: true, text: "°C / %", color: getTick(), font: { size: 11 } },
                },
                yRight: {
                    type: "linear",
                    position: "right",
                    ticks: { color: "#f59e0b", font: { size: 11 } },
                    grid:  { drawOnChartArea: false },
                    title: { display: true, text: "Gas", color: "#f59e0b", font: { size: 11 } },
                },
            },
        },
    });
}

// Toggle hiển thị từng line trên chart
function toggleHistLine(type, btnEl) {
    if (!histChart) return;
    var indexMap = { temp: 0, hum: 1, gas: 2 };
    var idx = indexMap[type];
    if (idx === undefined) return;

    var meta = histChart.getDatasetMeta(idx);
    meta.hidden = !meta.hidden;
    histChart.update();
    btnEl.classList.toggle("active", !meta.hidden);
}

// ===== TABLE =====
function renderHistTable(rows) {
    var tbody = document.getElementById("histTableBody");
    if (!tbody) return;

    // Group theo ngày
    var byDay = {};
    rows.forEach(function(r) {
        if (!byDay[r.day]) byDay[r.day] = {};
        byDay[r.day][r.sensor_type] = r.avg_value;
    });

    var days = Object.keys(byDay).sort().reverse(); // mới nhất lên đầu

    if (days.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="hist-loading">Chưa có dữ liệu.</td></tr>';
        return;
    }

    tbody.innerHTML = days.map(function(day) {
        var d    = byDay[day];
        var temp = d.temp !== undefined ? d.temp.toFixed(1) : "--";
        var hum  = d.hum  !== undefined ? d.hum.toFixed(1)  : "--";
        var gas  = d.gas  !== undefined ? d.gas.toFixed(0)  : "--";

        // Đánh giá tổng hợp
        var status = "normal";
        var label  = "Bình thường";
        if (d.temp > 35 || d.gas > 300) { status = "danger";  label = "Cảnh báo"; }
        else if (d.temp > 32 || d.gas > 150) { status = "warning"; label = "Chú ý"; }

        // Format ngày dễ đọc
        var parts   = day.split("-");
        var dayFmt  = parts[2] + "/" + parts[1] + "/" + parts[0];

        return '<tr>'
            + '<td>' + dayFmt + '</td>'
            + '<td>' + temp + ' °C</td>'
            + '<td>' + hum  + ' %</td>'
            + '<td>' + gas  + '</td>'
            + '<td><span class="status-badge status-' + status + '">' + label + '</span></td>'
            + '</tr>';
    }).join("");
}

// ===== EXPORT CSV =====
function exportCSV() {
    if (!histRawData.length) return;

    // Group theo ngày
    var byDay = {};
    histRawData.forEach(function(r) {
        if (!byDay[r.day]) byDay[r.day] = {};
        byDay[r.day][r.sensor_type] = r.avg_value;
    });

    var lines = ["Ngày,Nhiệt độ TB (°C),Độ ẩm TB (%),Gas TB"];
    Object.keys(byDay).sort().forEach(function(day) {
        var d = byDay[day];
        lines.push([
            day,
            d.temp !== undefined ? d.temp.toFixed(2) : "",
            d.hum  !== undefined ? d.hum.toFixed(2)  : "",
            d.gas  !== undefined ? d.gas.toFixed(2)  : "",
        ].join(","));
    });

    var blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement("a");
    a.href     = url;
    a.download = "smarthome_history_" + currentDays + "days.csv";
    a.click();
    URL.revokeObjectURL(url);
}

// ===== PWA: Đăng ký Service Worker =====
if ("serviceWorker" in navigator) {
    window.addEventListener("load", function() {
        navigator.serviceWorker.register("/sw.js")
            .then(function(reg) {
                console.log("[SW] Registered:", reg.scope);
            })
            .catch(function(err) {
                console.warn("[SW] Register failed:", err);
            });
    });
}

// ===================================================
//  USER PAGE
// ===================================================

var allUsers       = [];   // cache danh sách user
var userFilter     = "all";
var userSearchText = "";

function initUserPage() {
    var u = user ? (user.username || user) : "?";
    var r = user ? (user.role    || "user") : "user";

    setText("profileName", u);
    setText("profileRoleText",
        r === "admin" ? "Quản trị viên" : "Người dùng");

    var loginTime = new Date().toLocaleString("vi-VN", {
        hour: "2-digit", minute: "2-digit",
        day:  "2-digit", month: "2-digit", year: "numeric"
    });
    setText("profileLoginTime", "Đăng nhập lúc " + loginTime);

    var badge = document.getElementById("profileRole");
    if (badge) {
        badge.textContent = r === "admin" ? "Admin" : "User";
        badge.className   = "profile-role-badge " + r;
    }

    var adminPanel = document.getElementById("adminPanel");
    if (adminPanel) adminPanel.style.display = r === "admin" ? "" : "none";

    if (r === "admin") loadUserList();
}

// ===== LOAD DANH SÁCH USER =====
function loadUserList() {
    var r = user ? (user.role     || "user") : "user";
    var u = user ? (user.username || user)   : "";

    fetch("/users", {
        headers: { "x-role": r, "x-username": u }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (!data.success) return;
        allUsers = data.users;
        applyUserFilter();
    })
    .catch(function(err) {
        console.error("[User] loadUserList:", err);
    });
}

// ===== FILTER + SEARCH =====
function setUserFilter(filter, btnEl) {
    userFilter = filter;
    document.querySelectorAll(".user-filter-btn")
        .forEach(function(b) { b.classList.remove("active"); });
    if (btnEl) btnEl.classList.add("active");
    applyUserFilter();
}

function filterUserTable() {
    var input = document.getElementById("userSearchInput");
    userSearchText = input ? input.value.trim().toLowerCase() : "";
    applyUserFilter();
}

function applyUserFilter() {
    var filtered = allUsers.filter(function(u) {
        var matchRole   = userFilter === "all" || u.role === userFilter;
        var matchSearch = !userSearchText ||
            u.username.toLowerCase().includes(userSearchText);
        return matchRole && matchSearch;
    });
    renderUserTable(filtered);
}

// ===== RENDER BẢNG =====
function renderUserTable(users) {
    var tbody       = document.getElementById("userTableBody");
    if (!tbody) return;

    var currentUser = user ? (user.username || user) : "";

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;'
            + 'color:var(--text-muted);padding:20px;">Không tìm thấy user.</td></tr>';
        return;
    }

    tbody.innerHTML = users.map(function(u, i) {
        var isSelf = u.username === currentUser;

        // Nút đổi role
        var roleBtn = isSelf ? ""
            : u.role === "admin"
                ? "<button class='role-toggle-btn to-user' "
                    + "onclick='changeRole(\"" + u.username + "\", \"user\")'>"
                    + "→ User</button>"
                : "<button class='role-toggle-btn to-admin' "
                    + "onclick='changeRole(\"" + u.username + "\", \"admin\")'>"
                    + "→ Admin</button>";

        // Ngày tạo
        var created = u.createdAt
            ? new Date(u.createdAt).toLocaleDateString("vi-VN")
            : "<span style='color:var(--text-hint)'>—</span>";

        return "<tr>"
            + "<td style='color:var(--text-muted)'>" + (i + 1) + "</td>"
            + "<td>"
            + "<span class='user-table-avatar'>"
            + "<i class='bi bi-person-fill'></i></span>"
            + u.username
            + (isSelf
                ? " <span style='font-size:10px;color:var(--text-muted)'>(bạn)</span>"
                : "")
            + "</td>"
            + "<td>"
            + "<span class='role-pill " + u.role + "'>" + u.role + "</span> "
            + roleBtn
            + "</td>"
            + "<td style='font-size:12px;color:var(--text-muted)'>"
            + created + "</td>"
            + "<td>"
            + "<div class='action-group'>"
            + (!isSelf
                ? "<button class='user-btn user-btn-sm user-btn-ghost' "
                    + "onclick='showResetModal(\"" + u.username + "\")'>"
                    + "<i class='bi bi-key'></i></button>"
                    + "<button class='user-btn user-btn-danger' "
                    + "onclick='deleteUser(\"" + u.username + "\")'>"
                    + "<i class='bi bi-trash'></i></button>"
                : "<span style='color:var(--text-hint);font-size:12px;'>—</span>")
            + "</div>"
            + "</td>"
            + "</tr>";
    }).join("");
}

// ===== ĐỔI ROLE =====
function changeRole(username, newRole) {
    var r = user ? (user.role     || "user") : "user";
    var u = user ? (user.username || user)   : "";

    fetch("/users/" + username + "/role", {
        method:  "PUT",
        headers: {
            "Content-Type": "application/json",
            "x-role":       r,
            "x-username":   u
        },
        body: JSON.stringify({ role: newRole })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            // Cập nhật local cache
            var found = allUsers.find(function(x) {
                return x.username === username;
            });
            if (found) found.role = newRole;
            applyUserFilter();
        } else {
            alert(data.message);
        }
    });
}

// ===== MODAL RESET PASSWORD =====
function showResetModal(username) {
    // Tạo modal động
    var existing = document.getElementById("resetModal");
    if (existing) existing.remove();

    var modal = document.createElement("div");
    modal.id        = "resetModal";
    modal.className = "modal-overlay";
    modal.innerHTML =
        "<div class='modal-box'>"
        + "<div class='modal-title'>"
        + "<i class='bi bi-key-fill'></i>"
        + "Reset mật khẩu: <strong>" + username + "</strong>"
        + "</div>"
        + "<div class='user-form-row'>"
        + "<label>Mật khẩu mới</label>"
        + "<input type='password' id='resetPwInput' "
        + "placeholder='Tối thiểu 3 ký tự'>"
        + "</div>"
        + "<div class='user-form-msg' id='resetPwMsg'></div>"
        + "<div class='modal-actions'>"
        + "<button class='user-btn user-btn-ghost' "
        + "onclick='closeResetModal()'>Hủy</button>"
        + "<button class='user-btn user-btn-primary' "
        + "onclick='doResetPassword(\"" + username + "\")'>"
        + "<i class='bi bi-check2'></i> Xác nhận"
        + "</button>"
        + "</div>"
        + "</div>";

    // Click outside để đóng
    modal.addEventListener("click", function(e) {
        if (e.target === modal) closeResetModal();
    });

    document.body.appendChild(modal);
    document.getElementById("resetPwInput").focus();
}

function closeResetModal() {
    var modal = document.getElementById("resetModal");
    if (modal) modal.remove();
}

function doResetPassword(username) {
    var input = document.getElementById("resetPwInput");
    var msg   = document.getElementById("resetPwMsg");
    var pw    = input ? input.value : "";
    var r     = user ? (user.role || "user") : "user";

    if (!pw || pw.length < 3) {
        msg.textContent = "Mật khẩu tối thiểu 3 ký tự!";
        msg.className   = "user-form-msg error";
        return;
    }

    fetch("/users/" + username + "/reset-password", {
        method:  "POST",
        headers: {
            "Content-Type": "application/json",
            "x-role":       r
        },
        body: JSON.stringify({ newPassword: pw })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        msg.textContent = data.message;
        msg.className   = "user-form-msg " + (data.success ? "success" : "error");
        if (data.success) {
            setTimeout(closeResetModal, 800);
        }
    });
}

// ===== TOGGLE FORM THÊM USER =====
function toggleAddUserForm() {
    var form = document.getElementById("addUserForm");
    if (!form) return;
    var isHidden = form.style.display === "none";
    form.style.display = isHidden ? "" : "none";
    if (isHidden) {
        document.getElementById("newUsername").value     = "";
        document.getElementById("newUserPassword").value = "";
        document.getElementById("newUserRole").value     = "user";
        setText("addUserMsg", "");
    }
}

// ===== THÊM USER =====
function addUser() {
    var username = document.getElementById("newUsername").value.trim();
    var password = document.getElementById("newUserPassword").value;
    var role     = document.getElementById("newUserRole").value;
    var msg      = document.getElementById("addUserMsg");
    var r        = user ? (user.role     || "user") : "user";
    var u        = user ? (user.username || user)   : "";

    if (!username || !password) {
        msg.textContent = "Vui lòng điền đầy đủ!";
        msg.className   = "user-form-msg error";
        return;
    }

    fetch("/users/add", {
        method:  "POST",
        headers: {
            "Content-Type": "application/json",
            "x-role":       r,
            "x-username":   u
        },
        body: JSON.stringify({ username, password, role })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        msg.textContent = data.message;
        msg.className   = "user-form-msg " + (data.success ? "success" : "error");
        if (data.success) {
            setTimeout(function() {
                toggleAddUserForm();
                loadUserList();
            }, 800);
        }
    });
}

// ===== XÓA USER =====
function deleteUser(username) {
    if (!confirm("Xóa tài khoản \"" + username + "\"?")) return;

    var r = user ? (user.role     || "user") : "user";
    var u = user ? (user.username || user)   : "";

    fetch("/users/" + username, {
        method:  "DELETE",
        headers: { "x-role": r, "x-username": u }
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (data.success) {
            allUsers = allUsers.filter(function(x) {
                return x.username !== username;
            });
            applyUserFilter();
        } else {
            alert(data.message);
        }
    });
}

// ===== ĐỔI MẬT KHẨU CÁ NHÂN =====
function changePassword() {
    var oldPw  = document.getElementById("oldPassword").value;
    var newPw  = document.getElementById("newPassword").value;
    var confPw = document.getElementById("confirmPassword").value;
    var msg    = document.getElementById("pwMsg");
    var u      = user ? (user.username || user) : "";

    if (!oldPw || !newPw || !confPw) {
        msg.textContent = "Vui lòng điền đầy đủ!";
        msg.className   = "user-form-msg error";
        return;
    }
    if (newPw !== confPw) {
        msg.textContent = "Mật khẩu mới không khớp!";
        msg.className   = "user-form-msg error";
        return;
    }
    if (newPw.length < 3) {
        msg.textContent = "Mật khẩu tối thiểu 3 ký tự!";
        msg.className   = "user-form-msg error";
        return;
    }

    fetch("/users/change-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
            username:    u,
            oldPassword: oldPw,
            newPassword: newPw
        })
    })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        msg.textContent = data.message;
        msg.className   = "user-form-msg " + (data.success ? "success" : "error");
        if (data.success) {
            document.getElementById("oldPassword").value    = "";
            document.getElementById("newPassword").value    = "";
            document.getElementById("confirmPassword").value = "";
        }
    });
}   

// ===================================================
//  SETTINGS PAGE
// ===================================================

function initSettingsPage() {
    var r = user ? (user.role || "user") : "user";
    loadSettingsData();

    if (r !== "admin") {
        // User thường: ẩn nút save, disable input, giữ badge "Chỉ Admin"
        document.querySelectorAll("#btn-thresholds, #btn-add-rfid").forEach(function(el) {
            el.style.display = "none";
        });
        document.querySelectorAll(
            ".settings-field input, .settings-field select"
        ).forEach(function(el) { el.disabled = true; });
    } else {
        // Admin: ẩn badge "Chỉ Admin"
        document.querySelectorAll(".settings-admin-badge").forEach(function(el) {
            el.style.display = "none";
        });
    }
}

function loadSettingsData() {
    var r = user ? (user.role || "user") : "user";

    fetch("/settings", { headers: { "x-role": r } })
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (!data.success) return;
        var s = data.settings;

        // Thresholds
        setVal("cfg-gas", gasThreshold !== 50 ? gasThreshold : (s.thresholds && s.thresholds.gas));
        setVal("cfg-temp-hot",   s.thresholds && s.thresholds.temp_hot);
        setVal("cfg-temp-ok",    s.thresholds && s.thresholds.temp_ok);
        setVal("cfg-temp-alert", s.thresholds && s.thresholds.temp_alert);
        setVal("cfg-hum",        s.thresholds && s.thresholds.hum);
        setVal("cfg-pir-timeout",
            s.pir_timeout ? Math.round(s.pir_timeout / 60000) : 10);

        // Automation toggles
        if (s.automation) {
            setChecked("auto-pir_light",    s.automation.pir_light);
            setChecked("auto-temp_fan",     s.automation.temp_fan);
            setChecked("auto-gas_safety",   s.automation.gas_safety);
            setChecked("auto-flame_safety", s.automation.flame_safety);
        }

        // Telegram
        if (s.telegram) {
            setVal("cfg-tg-token",  s.telegram.token !== "***"
                ? s.telegram.token : "");
            setVal("cfg-tg-chatid", s.telegram.chat_id);
        }

        // MQTT
        if (s.mqtt) {
            setVal("cfg-mqtt-host", s.mqtt.host);
            setVal("cfg-mqtt-port", s.mqtt.port);
        }
    });

    loadRfidList();
    loadScheduleList();
}

// ===== HELPER =====
function setVal(id, val) {
    var el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
}
function setChecked(id, val) {
    var el = document.getElementById(id);
    if (el) el.checked = !!val;
}
function showSettingsMsg(id, msg, ok) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className   = "settings-msg " + (ok ? "success" : "error");
    setTimeout(function() { el.textContent = ""; el.className = "settings-msg"; }, 3000);
}

// ===== TABS =====
function switchSettingsTab(tab, btnEl) {
    document.querySelectorAll(".settings-tab")
        .forEach(function(b) { b.classList.remove("active"); });
    document.querySelectorAll(".settings-panel")
        .forEach(function(p) { p.classList.remove("active"); });
    if (btnEl) btnEl.classList.add("active");
    var panel = document.getElementById("stab-" + tab);
    if (panel) panel.classList.add("active");
}

// ===== THRESHOLDS =====
function saveThresholds() {
    var r = user ? (user.role || "user") : "user";
    var gasVal = parseInt(document.getElementById("cfg-gas").value) || 400;
    var body = {
        gas:        gasVal,
        temp_hot:   parseInt(document.getElementById("cfg-temp-hot").value)   || 35,
        temp_ok:    parseInt(document.getElementById("cfg-temp-ok").value)    || 32,
        temp_alert: parseInt(document.getElementById("cfg-temp-alert").value) || 38,
        hum:        parseInt(document.getElementById("cfg-hum").value)        || 90,
    };

    fetch("/settings/thresholds", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-role": r },
        body: JSON.stringify(body)
    })
    .then(function(res) { return res.json(); })
    .then(function(d) {
        showSettingsMsg("msg-thresholds", d.message, d.success);
        // Đồng bộ ngưỡng gas lên ESP8266 qua MQTT
        if (d.success) publishGasThreshold(gasVal);
    });

    // PIR timeout riêng
    var mins = parseInt(document.getElementById("cfg-pir-timeout").value) || 10;
    fetch("/settings/pir-timeout", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-role": r },
        body: JSON.stringify({ minutes: mins })
    });
}

function saveAutomation(rule, enabled) {
    var r    = user ? (user.role || "user") : "user";
    var body = {};
    body[rule] = enabled;

    fetch("/settings/automation", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-role": r },
        body: JSON.stringify(body)
    })
    .then(function(res) { return res.json(); })
    .then(function(d) {
        showSettingsMsg("msg-automation", d.message, d.success);
        // Publish MQTT để ESP nhận rule mới
        if (d.success && mqttClient && mqttClient.connected) {
            publishAutomationRule(rule, enabled);
        }
    });
}

function publishAutomationRule(rule, enabled) {
    var topicMap = {
        "pir_light":    "home/esp32_1/cmd/auto/pir_light",
        "temp_fan":     "home/esp32_1/cmd/auto/temp_fan",
        "gas_safety":   "home/esp8266/cmd/auto/gas_safety",
        "flame_safety": "home/esp8266/cmd/auto/flame_safety",
    };
    var topic = topicMap[rule];
    if (!topic) return;
    mqttClient.publish(topic, enabled ? "ON" : "OFF", { qos: 1, retain: true });
    console.log("[MQTT] -> auto/" + rule + ":", enabled ? "ON" : "OFF");
}

// ===== RFID =====
function loadRfidList() {
    fetch("/settings/rfid")
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (!data.success) return;
        renderRfidTable(data.whitelist);
    });
}

function renderRfidTable(list) {
    var tbody = document.getElementById("rfidTableBody");
    if (!tbody) return;
    var r = user ? (user.role || "user") : "user";

    if (!list || list.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;'
            + 'color:var(--text-muted);padding:20px;">Chưa có thẻ nào.</td></tr>';
        return;
    }

    tbody.innerHTML = list.map(function(c) {
        var added = c.addedAt
            ? new Date(c.addedAt).toLocaleDateString("vi-VN")
            : "—";
        return "<tr>"
            + "<td style='font-family:monospace;font-weight:600'>"
            + c.uid + "</td>"
            + "<td id='rfid-name-" + c.uid + "'>" + c.name + "</td>"
            + "<td>" + (c.owner || "—") + "</td>"
            + "<td style='font-size:12px;color:var(--text-muted)'>"
            + added + "</td>"
            + "<td>"
            + (r === "admin"
                ? "<div class='action-group'>"
                + "<button class='user-btn user-btn-sm user-btn-ghost' "
                + "onclick='editRfidCard(\"" + c.uid + "\", \""
                + c.name + "\", \"" + (c.owner||"") + "\")'>"
                + "<i class='bi bi-pencil'></i></button>"
                + "<button class='user-btn user-btn-danger' "
                + "onclick='deleteRfidCard(\"" + c.uid + "\")'>"
                + "<i class='bi bi-trash'></i></button>"
                + "</div>"
                : "—")
            + "</td>"
            + "</tr>";
    }).join("");
}

function toggleRfidForm() {
    var form = document.getElementById("rfidAddForm");
    if (!form) return;
    var hidden = form.style.display === "none";
    form.style.display = hidden ? "" : "none";
    if (hidden) {
        ["rfid-uid","rfid-name","rfid-owner"].forEach(function(id) {
            var el = document.getElementById(id);
            if (el) el.value = "";
        });
        setText("msg-rfid-add", "");
    }
}

// Auto-fill UID từ MQTT khi nhận thẻ mới
function autoFillRfidUID(uid) {
    var input = document.getElementById("rfid-uid");
    if (input && !input.value) {
        input.value = uid.toUpperCase();
    }
}

function addRfidCard() {
    var uid   = document.getElementById("rfid-uid").value.trim().toUpperCase();
    var name  = document.getElementById("rfid-name").value.trim();
    var owner = document.getElementById("rfid-owner").value.trim();
    var r     = user ? (user.role || "user") : "user";

    if (!uid || !name) {
        showSettingsMsg("msg-rfid-add", "Cần điền UID và tên thẻ!", false);
        return;
    }

    fetch("/settings/rfid", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": r },
        body: JSON.stringify({ uid, name, owner })
    })
    .then(function(res) { return res.json(); })
    .then(function(d) {
        showSettingsMsg("msg-rfid-add", d.message, d.success);
        if (d.success) setTimeout(function() {
            toggleRfidForm();
            loadRfidList();
        }, 600);
    });
}

function editRfidCard(uid, currentName, currentOwner) {
    var name = prompt("Tên mới cho thẻ " + uid + ":", currentName);
    if (name === null) return;
    var owner = prompt("Chủ thẻ:", currentOwner);
    if (owner === null) return;

    var r = user ? (user.role || "user") : "user";
    fetch("/settings/rfid/" + uid, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-role": r },
        body: JSON.stringify({ name: name, owner: owner })
    })
    .then(function(res) { return res.json(); })
    .then(function(d) {
        if (d.success) loadRfidList();
        else alert(d.message);
    });
}

function deleteRfidCard(uid) {
    if (!confirm("Xóa thẻ " + uid + "?")) return;
    var r = user ? (user.role || "user") : "user";

    fetch("/settings/rfid/" + uid, {
        method: "DELETE",
        headers: { "x-role": r }
    })
    .then(function(res) { return res.json(); })
    .then(function(d) {
        if (d.success) loadRfidList();
        else alert(d.message);
    });
}

// ===== TELEGRAM =====
function saveTelegram() {
    var r      = user ? (user.role || "user") : "user";
    var token  = document.getElementById("cfg-tg-token").value.trim();
    var chatId = document.getElementById("cfg-tg-chatid").value.trim();

    fetch("/settings/telegram", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-role": r },
        body: JSON.stringify({ token: token, chat_id: chatId })
    })
    .then(function(res) { return res.json(); })
    .then(function(d) { showSettingsMsg("msg-telegram", d.message, d.success); });
}

function testTelegram() {
    var r = user ? (user.role || "user") : "user";
    showSettingsMsg("msg-telegram", "Đang gửi...", true);

    fetch("/settings/telegram/test", {
        method: "POST",
        headers: { "x-role": r }
    })
    .then(function(res) { return res.json(); })
    .then(function(d) { showSettingsMsg("msg-telegram", d.message, d.success); });
}

// ===== MQTT CONFIG =====
function saveMqttConfig() {
    var r    = user ? (user.role || "user") : "user";
    var host = document.getElementById("cfg-mqtt-host").value.trim();
    var port = document.getElementById("cfg-mqtt-port").value;

    fetch("/settings/mqtt", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-role": r },
        body: JSON.stringify({ host: host, port: parseInt(port) })
    })
    .then(function(res) { return res.json(); })
    .then(function(d) {
        showSettingsMsg("msg-mqtt-cfg", d.message, d.success);
        if (d.success && mqttClient) {
            // Reconnect với config mới
            MQTT_CONFIG.host = host;
            MQTT_CONFIG.port = parseInt(port);
            mqttClient.end(true, function() { initMQTT(); });
            showSettingsMsg("msg-mqtt-cfg", "Đang reconnect...", true);
        }
    });
}

// ===== SCHEDULE =====
var DAY_NAMES = ["CN","T2","T3","T4","T5","T6","T7"];

function loadScheduleList() {
    fetch("/settings/schedule")
    .then(function(res) { return res.json(); })
    .then(function(data) {
        if (!data.success) return;
        renderScheduleList(data.schedule);
    });
}

function renderScheduleList(list) {
    var container = document.getElementById("scheduleList");
    if (!container) return;
    var r = user ? (user.role || "user") : "user";

    var deviceNames = {
        relay1:  "Đèn phòng khách",
        relay2:  "Quạt",
        relay_k: "Relay báo động (tự động)",
    };

    if (!list || list.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);'
            + 'font-size:13px;padding:20px 0;text-align:center;">'
            + 'Chưa có lịch hẹn nào.</div>';
        return;
    }

    container.innerHTML = list.map(function(s) {
        var dayStr = (s.days || []).map(function(d) {
            return DAY_NAMES[d];
        }).join(", ");
        var actionClass = s.action === "ON"
            ? "schedule-action-on" : "schedule-action-off";

        return '<div class="schedule-item ' + (s.enabled ? "" : "disabled") + '">'
            + '<div class="schedule-time">' + s.time + '</div>'
            + '<div style="flex:1">'
            + '<div class="schedule-device">'
            + (deviceNames[s.device] || s.device)
            + ' — <span class="' + actionClass + '">'
            + s.action + '</span></div>'
            + '<div class="schedule-days">' + dayStr + '</div>'
            + '</div>'
            + (r === "admin"
                ? '<label class="toggle-switch">'
                + '<input type="checkbox" ' + (s.enabled ? "checked" : "")
                + ' onchange="toggleSchedule(' + s.id + ', this)">'
                + '<div class="toggle-track"></div>'
                + '<div class="toggle-thumb"></div>'
                + '</label>'
                + '<button class="user-btn user-btn-danger" '
                + 'onclick="deleteSchedule(' + s.id + ')">'
                + '<i class="bi bi-trash"></i></button>'
                : "")
            + '</div>';
    }).join("");
}

function toggleScheduleForm() {
    var form = document.getElementById("scheduleAddForm");
    if (!form) return;
    form.style.display = form.style.display === "none" ? "" : "none";
}

function addSchedule() {
    var device  = document.getElementById("sch-device").value;
    var action  = document.getElementById("sch-action").value;
    var time    = document.getElementById("sch-time").value;
    var r       = user ? (user.role || "user") : "user";

    if (!time) {
        showSettingsMsg("msg-schedule-add", "Chọn giờ thực hiện!", false);
        return;
    }

    // Lấy ngày đã chọn
    var days = [];
    document.querySelectorAll("#dayPicker .day-chip.active")
        .forEach(function(chip) {
            days.push(parseInt(chip.dataset.day));
        });

    fetch("/settings/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-role": r },
        body: JSON.stringify({ device, action, time, days, enabled: true })
    })
    .then(function(res) { return res.json(); })
    .then(function(d) {
        showSettingsMsg("msg-schedule-add", d.message, d.success);
        if (d.success) setTimeout(function() {
            toggleScheduleForm();
            loadScheduleList();
        }, 600);
    });
}

function toggleSchedule(id, checkbox) {
    var r = user ? (user.role || "user") : "user";
    fetch("/settings/schedule/" + id + "/toggle", {
        method: "PUT",
        headers: { "x-role": r }
    })
    .then(function(res) { return res.json(); })
    .then(function(d) {
        if (!d.success) { checkbox.checked = !checkbox.checked; }
    });
}

function deleteSchedule(id) {
    if (!confirm("Xóa lịch hẹn này?")) return;
    var r = user ? (user.role || "user") : "user";

    fetch("/settings/schedule/" + id, {
        method: "DELETE",
        headers: { "x-role": r }
    })
    .then(function(res) { return res.json(); })
    .then(function(d) { if (d.success) loadScheduleList(); });
}

// Day chip toggle
document.addEventListener("click", function(e) {
    if (e.target.classList.contains("day-chip")) {
        e.target.classList.toggle("active");
    }
});