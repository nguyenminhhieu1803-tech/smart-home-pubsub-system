const express  = require("express");
const router   = express.Router();
const fetch    = require("node-fetch");
const { readSettings, writeSettings } = require("../utils/settings");
let mqttClient = null;
try { mqttClient = require("../mqtt").client; } catch(e) {}

// Middleware kiểm tra admin
function adminOnly(req, res, next) {
    if (req.headers["x-role"] !== "admin") {
        return res.status(403).json({
            success: false, message: "Chỉ admin mới có quyền!"
        });
    }
    next();
}

// ===== GET ALL SETTINGS =====
router.get("/settings", (req, res) => {
    const s = readSettings();
    // Ẩn telegram token với user thường
    if (req.headers["x-role"] !== "admin") {
        if (s.telegram) s.telegram.token = "***";
    }
    res.json({ success: true, settings: s });
});

// ===== CẬP NHẬT NGƯỠNG =====
router.put("/settings/thresholds", adminOnly, (req, res) => {
    const s = readSettings();
    s.thresholds = { ...s.thresholds, ...req.body };
    writeSettings(s);

    // Publish ngưỡng gas lên ESP8266 ngay lập tức
    if (mqttClient && mqttClient.connected && req.body.gas) {
        mqttClient.publish(
            "home/esp8266/cmd/threshold",
            String(req.body.gas),
            { qos: 1, retain: true }
        );
        console.log("[Settings] Published gas threshold:", req.body.gas);
    }

    res.json({ success: true, message: "Đã cập nhật ngưỡng cảnh báo!" });
});

// ===== CẬP NHẬT AUTOMATION =====
router.put("/settings/automation", adminOnly, (req, res) => {
    const s = readSettings();
    s.automation = { ...s.automation, ...req.body };
    writeSettings(s);

    // Publish automation rules lên ESP qua MQTT
    if (mqttClient && mqttClient.connected) {
        const topicMap = {
            pir_light:    "home/esp32_1/cmd/auto/pir_light",
            temp_fan:     "home/esp32_1/cmd/auto/temp_fan",
            gas_safety:   "home/esp8266/cmd/auto/gas_safety",
            flame_safety: "home/esp8266/cmd/auto/flame_safety",
        };
        Object.keys(req.body).forEach(function(rule) {
            const topic = topicMap[rule];
            if (topic) {
                mqttClient.publish(
                    topic,
                    req.body[rule] ? "ON" : "OFF",
                    { qos: 1, retain: true }
                );
                console.log("[Settings] Published auto/" + rule + ":", req.body[rule] ? "ON" : "OFF");
            }
        });
    }

    res.json({ success: true, message: "Đã cập nhật automation!" });
});

// ===== CẬP NHẬT PIR TIMEOUT =====
router.put("/settings/pir-timeout", adminOnly, (req, res) => {
    const { minutes } = req.body;
    if (!minutes || minutes < 1 || minutes > 60) {
        return res.json({
            success: false, message: "Thời gian 1-60 phút!"
        });
    }
    const s = readSettings();
    s.pir_timeout = minutes * 60 * 1000;
    writeSettings(s);
    res.json({ success: true, message: "Đã cập nhật!" });
});

// ===== RFID WHITELIST =====
router.get("/settings/rfid", (req, res) => {
    const s = readSettings();
    res.json({ success: true, whitelist: s.rfid_whitelist || [] });
});

router.post("/settings/rfid", adminOnly, (req, res) => {
    const { uid, name, owner } = req.body;
    if (!uid || !name) {
        return res.json({ success: false, message: "Thiếu UID hoặc tên thẻ!" });
    }
    const s = readSettings();
    if (!s.rfid_whitelist) s.rfid_whitelist = [];
    const exists = s.rfid_whitelist.find(
        c => c.uid.toUpperCase() === uid.toUpperCase()
    );
    if (exists) {
        return res.json({ success: false, message: "UID đã tồn tại!" });
    }
    s.rfid_whitelist.push({
        uid:   uid.toUpperCase(),
        name:  name,
        owner: owner || "",
        addedAt: new Date().toISOString()
    });
    writeSettings(s);
    res.json({ success: true, message: "Đã thêm thẻ!" });
});

router.put("/settings/rfid/:uid", adminOnly, (req, res) => {
    const { uid } = req.params;
    const { name, owner } = req.body;
    const s = readSettings();
    const card = s.rfid_whitelist.find(
        c => c.uid.toUpperCase() === uid.toUpperCase()
    );
    if (!card) {
        return res.json({ success: false, message: "Không tìm thấy thẻ!" });
    }
    if (name)  card.name  = name;
    if (owner !== undefined) card.owner = owner;
    writeSettings(s);
    res.json({ success: true, message: "Đã cập nhật thẻ!" });
});

router.delete("/settings/rfid/:uid", adminOnly, (req, res) => {
    const { uid } = req.params;
    const s = readSettings();
    const before = s.rfid_whitelist.length;
    s.rfid_whitelist = s.rfid_whitelist.filter(
        c => c.uid.toUpperCase() !== uid.toUpperCase()
    );
    if (s.rfid_whitelist.length === before) {
        return res.json({ success: false, message: "Không tìm thấy thẻ!" });
    }
    writeSettings(s);
    res.json({ success: true, message: "Đã xóa thẻ!" });
});

// ===== TELEGRAM CONFIG =====
router.put("/settings/telegram", adminOnly, (req, res) => {
    const { token, chat_id } = req.body;
    const s = readSettings();
    s.telegram = { token: token || "", chat_id: chat_id || "" };
    writeSettings(s);
    res.json({ success: true, message: "Đã lưu cấu hình Telegram!" });
});

router.post("/settings/telegram/test", adminOnly, (req, res) => {
    const s = readSettings();
    const { token, chat_id } = s.telegram || {};
    if (!token || !chat_id) {
        return res.json({ success: false, message: "Chưa cấu hình Telegram!" });
    }
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            chat_id,
            text: "✅ SmartHome test message - " + new Date().toLocaleString("vi-VN")
        })
    })
    .then(r => r.json())
    .then(data => {
        if (data.ok) res.json({ success: true, message: "Gửi thành công!" });
        else res.json({ success: false, message: data.description });
    })
    .catch(err => res.json({ success: false, message: err.message }));
});

// ===== MQTT CONFIG =====
router.put("/settings/mqtt", adminOnly, (req, res) => {
    const { host, port } = req.body;
    if (!host || !port) {
        return res.json({ success: false, message: "Thiếu host hoặc port!" });
    }
    const s = readSettings();
    s.mqtt = { host, port: parseInt(port) };
    writeSettings(s);
    res.json({ success: true, message: "Đã lưu cấu hình MQTT!" });
});

// ===== SCHEDULE =====
router.get("/settings/schedule", (req, res) => {
    const s = readSettings();
    res.json({ success: true, schedule: s.schedule || [] });
});

router.post("/settings/schedule", adminOnly, (req, res) => {
    const { device, action, time, days, enabled } = req.body;
    if (!device || !action || !time) {
        return res.json({ success: false, message: "Thiếu thông tin!" });
    }
    const s = readSettings();
    if (!s.schedule) s.schedule = [];
    s.schedule.push({
        id:      Date.now(),
        device,
        action,
        time,
        days:    days || [1,2,3,4,5,6,0],
        enabled: enabled !== false
    });
    writeSettings(s);
    res.json({ success: true, message: "Đã thêm lịch!" });
});

router.delete("/settings/schedule/:id", adminOnly, (req, res) => {
    const id = parseInt(req.params.id);
    const s  = readSettings();
    s.schedule = (s.schedule || []).filter(x => x.id !== id);
    writeSettings(s);
    res.json({ success: true, message: "Đã xóa lịch!" });
});

router.put("/settings/schedule/:id/toggle", adminOnly, (req, res) => {
    const id   = parseInt(req.params.id);
    const s    = readSettings();
    const item = (s.schedule || []).find(x => x.id === id);
    if (!item) {
        return res.json({ success: false, message: "Không tìm thấy!" });
    }
    item.enabled = !item.enabled;
    writeSettings(s);
    res.json({ success: true, enabled: item.enabled });
});

module.exports = router;
