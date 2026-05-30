const mqtt   = require("mqtt");
const db     = require("./utils/sqlite");
const fetch  = require("node-fetch");
const path   = require("path");
const fs     = require("fs");
const { execFile } = require("child_process");

// ===================================================
// ĐỌC CONFIG TỪ settings.json
// ===================================================
function getSettings() {
    try {
        const raw = fs.readFileSync(
            path.join(__dirname, "../data/settings.json"), "utf-8"
        );
        return JSON.parse(raw);
    } catch { return {}; }
}

function getTelegramConfig() {
    const s = getSettings();
    return {
        token:   (s.telegram && s.telegram.token)   || "",
        chat_id: (s.telegram && s.telegram.chat_id) || "",
    };
}

function getGasThreshold() {
    const s = getSettings();
    return (s.thresholds && s.thresholds.gas) || 50;
}

// ===================================================
// COOLDOWN
// ===================================================
const COOLDOWN_MS = {
    gas:   5 * 60 * 1000,   // 5 phút
    flame: 0,                // lửa: gửi ngay
    temp:  10 * 60 * 1000,  // 10 phút
    hum:   10 * 60 * 1000,  // 10 phút
    door:  1 * 60 * 1000,   // 1 phút
    rfid:  0,                // thẻ: gửi ngay
};

const lastAlertTime = {};

function canAlert(key) {
    const sensor   = key.split("_")[0];
    const cooldown = COOLDOWN_MS[sensor] ?? 5 * 60 * 1000;
    const now  = Date.now();
    const last = lastAlertTime[key] || 0;
    if (now - last > cooldown) {
        lastAlertTime[key] = now;
        return true;
    }
    console.log("[Cooldown]", key, "còn",
        Math.round((cooldown - (now - last)) / 1000), "giây");
    return false;
}

// ===================================================
// SMART STORAGE
// ===================================================
const lastSaved = {};
const DELTA_THRESHOLD = { temp: 0.5, hum: 1.0, gas: 20 };
const SAVE_INTERVAL_MS = 5 * 60 * 1000;

function shouldSave(device, name, value) {
    const key  = device + "_" + name;
    const now  = Date.now();
    const last = lastSaved[key];

    if (!last) { lastSaved[key] = { value, time: now }; return true; }

    if (name === "gas" && value > getGasThreshold()) {
        lastSaved[key] = { value, time: now };
        return true;
    }

    const delta   = Math.abs(value - last.value);
    const elapsed = now - last.time;

    if (DELTA_THRESHOLD[name] && delta >= DELTA_THRESHOLD[name]) {
        lastSaved[key] = { value, time: now };
        return true;
    }
    if (elapsed >= SAVE_INTERVAL_MS) {
        lastSaved[key] = { value, time: now };
        return true;
    }
    return false;
}

// ===================================================
// TELEGRAM
// ===================================================
function sendTelegram(message) {
    const { token, chat_id } = getTelegramConfig();

    if (!token || token === "" || token === "YOUR_BOT_TOKEN") {
        console.log("[Telegram] Chưa cấu hình token, bỏ qua.");
        return;
    }

    if (!chat_id || chat_id === "") {
        console.log("[Telegram] Chưa cấu hình chat_id, bỏ qua.");
        return;
    }

    const url = "https://api.telegram.org/bot" + token + "/sendMessage";

    const body = JSON.stringify({
        chat_id: chat_id,
        text: message,
        parse_mode: "HTML"
    });

    execFile("curl", [
        "-s",
        "-X", "POST",
        url,
        "-H", "Content-Type: application/json",
        "-d", body
    ], function(error, stdout, stderr) {
        if (error) {
            console.error("[Telegram CURL] Error:", error.message);
            return;
        }

        if (stderr) {
            console.error("[Telegram CURL] stderr:", stderr);
        }

        console.log("[Telegram CURL] Response:", stdout);

        try {
            const data = JSON.parse(stdout);
            if (data.ok) {
                console.log("[Telegram] Sent:", message.slice(0, 60));
            } else {
                console.warn("[Telegram] Error:", data.description);
            }
        } catch (e) {
            console.warn("[Telegram] Không đọc được JSON:", stdout);
        }
    });
}

// ===================================================
// FORMAT TIME VN
// ===================================================
function nowVN() {
    return new Date().toLocaleString("vi-VN", {
        timeZone: "Asia/Ho_Chi_Minh",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
        day:  "2-digit", month: "2-digit", year: "numeric",
    });
}

// ===================================================
// CHECK ALERT — gas, flame, temp, hum, door
// ===================================================
function checkAlert(device, sensor, value) {

    // ── GAS ──────────────────────────────────────
    if (sensor === "gas") {
        const threshold = getGasThreshold();
        if (value > threshold) {
            sendTelegram(
                "🚨 <b>CẢNH BÁO KHÍ GAS!</b>\n\n"
                + "📍 Thiết bị: <code>" + device + "</code>\n"
                + "📊 Giá trị: <b>" + value + "</b> (ngưỡng: " + threshold + ")\n"
                + "🕐 Thời gian: " + nowVN() + "\n\n"
                + "⚠️ Kiểm tra ngay khu vực nhà bếp!"
            );
        }
        return;
    }

    // ── FLAME ────────────────────────────────────
    if (sensor === "flame" && value === 1) {
        sendTelegram(
            "🔥 <b>PHÁT HIỆN LỬA!</b>\n\n"
            + "📍 Thiết bị: <code>" + device + "</code>\n"
            + "🕐 Thời gian: " + nowVN() + "\n\n"
            + "🆘 Kiểm tra ngay lập tức!"
        );
        return;
    }

    // ── DOOR ─────────────────────────────────────
    if (sensor === "door" && value === "OPEN") {
        sendTelegram(
            "🚪 <b>Cửa đang mở</b>\n\n"
            + "📍 Thiết bị: <code>" + device + "</code>\n"
            + "🕐 Thời gian: " + nowVN()
        );
        return;
    }
}

// ===================================================
// RFID ALERT
// ===================================================
function handleRfidAlert(device, uid) {
    const s         = getSettings();
    const whitelist = s.rfid_whitelist || [];
    const card      = whitelist.find(
        c => c.uid.toUpperCase() === uid.toUpperCase()
    );

    if (card) {
        sendTelegram(
            "✅ <b>Quẹt thẻ thành công</b>\n\n"
            + "📍 Thiết bị: <code>" + device + "</code>\n"
            + "💳 UID: <code>" + uid.toUpperCase() + "</code>\n"
            + "👤 Chủ thẻ: <b>" + (card.owner || card.name) + "</b>\n"
            + "🕐 Thời gian: " + nowVN()
        );
    } else {
        sendTelegram(
            "⚠️ <b>Thẻ không xác định!</b>\n\n"
            + "📍 Thiết bị: <code>" + device + "</code>\n"
            + "💳 UID lạ: <code>" + uid.toUpperCase() + "</code>\n"
            + "🕐 Thời gian: " + nowVN() + "\n\n"
            + "🔒 Kiểm tra khu vực cửa ra vào!"
        );
    }

    console.log("[RFID]", device, uid);
}

// ===================================================
// MQTT CLIENT
// ===================================================
const client = mqtt.connect("mqtt://localhost");

client.on("connect", () => {
    console.log("[MQTT] Connected to broker");
    client.subscribe("home/#");
});

client.on("message", (topic, message) => {
    const raw   = message.toString().trim();
    const parts = topic.split("/");

    if (parts.length < 4) return;

    const device = parts[1];
    const type   = parts[2];
    const name   = parts[3];

    if (type !== "sensor") return;

    // ── NUMERIC: temp, hum, gas ──────────────────
    const numericSensors = ["temp", "hum", "gas"];
    if (numericSensors.includes(name)) {
        const value = parseFloat(raw);
        if (!isNaN(value)) {
            if (shouldSave(device, name, value)) {
                db.run(
                    "INSERT INTO sensor_data (device, sensor_type, value) VALUES (?, ?, ?)",
                    [device, name, value],
                    function(err) {
                        if (err) console.error("[DB]", err.message);
                        else     console.log("[DB] Saved:", device, name, value);
                    }
                );
            } else {
                console.log("[DB] Skipped:", device, name, value);
            }
            checkAlert(device, name, value);
        }
        return;
    }

    // ── FLAME ────────────────────────────────────
    if (name === "flame") {
        const value = parseInt(raw);
        checkAlert(device, name, value);
        return;
    }

    // ── PIR — chỉ log, không gửi Telegram ────────
    if (name === "pir") {
        const value = parseInt(raw);
        console.log("[PIR]", device, value === 1 ? "Có chuyển động" : "Không có");
        return;
    }

    // ── DOOR ─────────────────────────────────────
    if (name === "door") {
        checkAlert(device, name, raw);
        return;
    }

    // ── RFID — gửi Telegram ──────────────────────
    if (name === "rfid") {
        handleRfidAlert(device, raw);
        return;
    }

    // ── IR ───────────────────────────────────────
    if (name === "ir") {
        console.log("[IR]", device, raw);
        return;
    }
});

client.on("error",   (err) => console.error("[MQTT] Error:", err.message));
client.on("offline", ()    => console.warn("[MQTT] Offline — reconnecting..."));

// ===================================================
// AUTO CLEANUP — xóa data > 90 ngày, chạy mỗi đêm 2AM
// ===================================================
function cleanOldData() {
    db.run(
        "DELETE FROM sensor_data WHERE created_at < datetime('now', '-90 days')",
        function(err) {
            if (err) console.error("[DB Cleanup]", err.message);
            else     console.log("[DB Cleanup] Deleted", this.changes, "old rows");
        }
    );
}

function msUntil2AM() {
    const now  = new Date();
    const next = new Date();
    next.setHours(2, 0, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    return next - now;
}

setTimeout(function scheduleCleanup() {
    cleanOldData();
    setInterval(cleanOldData, 24 * 60 * 60 * 1000);
}, msUntil2AM());

module.exports = { client };
