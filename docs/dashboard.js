// Static dashboard demo for GitHub Pages
// This file does not connect to MQTT, Node.js Server, SQLite or real hardware.

let currentRgb = "OFF";
let relayState = {
    relay1: false,
    relay2: false
};

let notifications = [
    {
        type: "gas",
        title: "Cảnh báo khí gas",
        message: "Giá trị MQ-2 vượt ngưỡng an toàn tại khu vực bếp.",
        time: "09:15"
    },
    {
        type: "rfid",
        title: "RFID không hợp lệ",
        message: "Phát hiện thẻ không hợp lệ tại khu vực cửa.",
        time: "10:42"
    },
    {
        type: "door",
        title: "Cửa mở",
        message: "Cửa chính đang ở trạng thái mở.",
        time: "11:03"
    }
];

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function setClass(id, className) {
    const el = document.getElementById(id);
    if (el) el.className = className;
}

function showPage(page, navEl) {
    document.querySelectorAll(".page-content").forEach(function(p) {
        p.style.display = "none";
    });

    const target = document.getElementById("page-" + page);
    if (target) target.style.display = "block";

    document.querySelectorAll(".sidebar .nav-link").forEach(function(a) {
        a.classList.remove("active");
    });

    if (navEl) navEl.classList.add("active");

    if (page === "history") {
        renderHistory();
    }

    if (page === "notifications") {
        renderNotifications();
    }
}

function updateClock() {
    const now = new Date();
    const time = now.toLocaleTimeString("vi-VN", {
        hour: "2-digit",
        minute: "2-digit"
    });

    const date = now.toLocaleDateString("vi-VN", {
        weekday: "short",
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });

    setText("clockTime", time);
    setText("clockDate", date);
}

function initDemoData() {
    setText("username", "Admin");
    setText("welcomeName", "Admin 👋");

    setText("welcomeTemp", "28.4 °C");
    setText("welcomeHum", "65 %");
    setText("welcomeDevices", "0 / 2");

    setText("tempSensor", "28.4 °C");
    setText("humSensor", "65 %");
    setText("lightLux", "420 lux");
    setText("gasValue", "310 ADC");
    setText("pirStatus", "Không có người");
    setText("flameStatus", "Bình thường");

    setText("tempStatus", "Ổn định");
    setText("humStatus", "Bình thường");
    setText("lightStatus", "Đủ sáng");
    setText("gasStatus", "An toàn");
    setText("pirDot", "OFF");
    setText("flameDot", "SAFE");

    setText("gasBarVal", "310 / 1023");
    const gasBar = document.getElementById("gasBar");
    if (gasBar) {
        gasBar.style.width = "30%";
        gasBar.className = "gas-bar-fill safe";
    }

    setText("doorStatus", "Đóng");
    setText("lastRfid", "A3 B5 7C 91");
    setText("mqttStatus", "Demo mode");
    setText("alertCount", notifications.length);
    setText("notifBadge", notifications.length);
    setText("notiCount", notifications.length);

    const notifBadge = document.getElementById("notifBadge");
    const notiCount = document.getElementById("notiCount");
    if (notifBadge) notifBadge.style.display = "inline-flex";
    if (notiCount) notiCount.style.display = "inline-flex";

    setClass("mqttDot", "mqtt-dot connected");
    setClass("status-esp32_1", "node-dot online");
    setClass("status-esp32_2", "node-dot online");
    setClass("status-esp8266", "node-dot online");

    const mqttIcon = document.getElementById("mqttIcon");
    if (mqttIcon) mqttIcon.style.color = "#22c55e";

    renderDevices();
    renderMiniAlerts();
    renderNotifications();
    initEnvChart();
    renderHistory();
}

function renderDevices() {
    const html = `
        <div class="device-card">
            <div class="device-icon"><i class="bi bi-lightbulb"></i></div>
            <div class="device-info">
                <div class="device-name">Đèn phòng khách</div>
                <div class="device-sub">Relay 1</div>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" onchange="toggleRelay('relay1', this.checked)">
                <div class="toggle-track"></div>
                <div class="toggle-thumb"></div>
            </label>
        </div>

        <div class="device-card">
            <div class="device-icon"><i class="bi bi-fan"></i></div>
            <div class="device-info">
                <div class="device-name">Quạt</div>
                <div class="device-sub">Relay 2</div>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" onchange="toggleRelay('relay2', this.checked)">
                <div class="toggle-track"></div>
                <div class="toggle-thumb"></div>
            </label>
        </div>
    `;

    const list1 = document.getElementById("device-list");
    const list2 = document.getElementById("device-list-full");

    if (list1) list1.innerHTML = html;
    if (list2) list2.innerHTML = html;
}

function toggleRelay(relay, checked) {
    relayState[relay] = checked;
    const onCount = Object.values(relayState).filter(Boolean).length;
    setText("welcomeDevices", onCount + " / 2");
}

function publishRgb(color) {
    currentRgb = color;
    setText("rgbStatus", color === "OFF" ? "TẮT" : color);
    setText("devRgbLabel", color === "OFF" ? "TẮT" : color);
    setText("irLastCmd", "DEMO_" + color);

    const dot = document.getElementById("rgbDot");
    const devDot = document.getElementById("devRgbDot");

    const colorMap = {
        RED: "#ef4444",
        GREEN: "#22c55e",
        BLUE: "#3b82f6",
        YELLOW: "#eab308",
        CYAN: "#06b6d4",
        MAGENTA: "#a855f7",
        WHITE: "#e2e8f0",
        OFF: "#64748b"
    };

    if (dot) dot.style.background = colorMap[color] || "#64748b";
    if (devDot) devDot.style.background = colorMap[color] || "#64748b";

    const toggle = document.getElementById("devRgbToggle");
    if (toggle) toggle.checked = color !== "OFF";
}

function toggleRgbPower(checked) {
    publishRgb(checked ? "WHITE" : "OFF");
}

function toggleDark() {
    document.body.classList.toggle("dark-mode");
    const icon = document.getElementById("darkIcon");
    if (icon) {
        icon.className = document.body.classList.contains("dark-mode")
            ? "bi bi-sun"
            : "bi bi-moon";
    }
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(function() {});
    } else {
        document.exitFullscreen().catch(function() {});
    }
}

function toggleNotifPanel(event) {
    if (event) event.stopPropagation();
    const panel = document.getElementById("notifPanel");
    if (!panel) return;
    panel.style.display = panel.style.display === "none" ? "block" : "none";
}

function closeNotifPanel() {
    const panel = document.getElementById("notifPanel");
    if (panel) panel.style.display = "none";
}

function markAllRead() {
    const badge = document.getElementById("notifBadge");
    const count = document.getElementById("notiCount");
    if (badge) badge.style.display = "none";
    if (count) count.style.display = "none";
}

function renderMiniAlerts() {
    const box = document.getElementById("alert-list-mini");
    if (!box) return;

    box.innerHTML = notifications.slice(0, 3).map(function(n) {
        return `
            <div class="alert-mini-item">
                <div class="alert-mini-title">${n.title}</div>
                <div class="alert-mini-msg">${n.message}</div>
                <div class="alert-mini-time">${n.time}</div>
            </div>
        `;
    }).join("");
}

function renderNotifications() {
    const list = document.getElementById("alert-list");
    const panelList = document.getElementById("notif-panel-list");

    const html = notifications.map(function(n) {
        return `
            <div class="card" style="padding:14px;">
                <b>${n.title}</b>
                <p style="margin:6px 0;color:var(--text-muted);">${n.message}</p>
                <small>${n.time}</small>
            </div>
        `;
    }).join("");

    const compact = notifications.map(function(n) {
        return `
            <div class="notif-item">
                <div class="notif-title">${n.title}</div>
                <div class="notif-msg">${n.message}</div>
                <small>${n.time}</small>
            </div>
        `;
    }).join("");

    if (list) list.innerHTML = html;
    if (panelList) panelList.innerHTML = compact;
}

function initEnvChart() {
    const ctx = document.getElementById("envChart");
    if (!ctx || typeof Chart === "undefined") return;

    new Chart(ctx, {
        type: "line",
        data: {
            labels: ["08:00", "09:00", "10:00", "11:00", "12:00"],
            datasets: [
                {
                    label: "Nhiệt độ",
                    data: [27.5, 28.1, 28.4, 29.0, 28.6],
                    tension: 0.35
                },
                {
                    label: "Độ ẩm",
                    data: [64, 65, 63, 62, 65],
                    tension: 0.35
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function renderHistory() {
    const tbody = document.getElementById("histTableBody");
    if (tbody) {
        tbody.innerHTML = `
            <tr>
                <td>2026-05-27</td>
                <td>28.1</td>
                <td>65</td>
                <td>310</td>
                <td>Bình thường</td>
            </tr>
            <tr>
                <td>2026-05-28</td>
                <td>28.6</td>
                <td>63</td>
                <td>325</td>
                <td>Bình thường</td>
            </tr>
            <tr>
                <td>2026-05-29</td>
                <td>29.0</td>
                <td>62</td>
                <td>410</td>
                <td>Cần theo dõi</td>
            </tr>
        `;
    }

    setText("hist-avg-temp", "28.6 °C");
    setText("hist-avg-hum", "63 %");
    setText("hist-avg-gas", "348");
    setText("hist-count", "3");

    const ctx = document.getElementById("histChart");
    if (!ctx || typeof Chart === "undefined" || ctx.dataset.rendered) return;
    ctx.dataset.rendered = "1";

    new Chart(ctx, {
        type: "line",
        data: {
            labels: ["27/05", "28/05", "29/05"],
            datasets: [
                { label: "Nhiệt độ", data: [28.1, 28.6, 29.0], tension: 0.35 },
                { label: "Độ ẩm", data: [65, 63, 62], tension: 0.35 },
                { label: "Gas", data: [310, 325, 410], tension: 0.35 }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false
        }
    });
}

function loadHistory() {
    renderHistory();
}

function toggleHistLine() {
    renderHistory();
}

function exportCSV() {
    alert("Demo tĩnh: chức năng xuất CSV chỉ được mô phỏng.");
}

function switchSettingsTab(tab, btn) {
    document.querySelectorAll(".settings-panel").forEach(function(p) {
        p.classList.remove("active");
    });

    const panel = document.getElementById("stab-" + tab);
    if (panel) panel.classList.add("active");

    document.querySelectorAll(".settings-tab").forEach(function(b) {
        b.classList.remove("active");
    });

    if (btn) btn.classList.add("active");
}

function showSettingsMsg(id, msg, success) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg;
    el.className = success ? "settings-msg success" : "settings-msg error";
}

function saveThresholds() {
    showSettingsMsg("msg-thresholds", "Đã lưu cấu hình demo.", true);
}

function saveAutomation(name, enabled) {
    showSettingsMsg("msg-automation", "Đã cập nhật automation demo.", true);
}

function toggleRfidForm() {
    const form = document.getElementById("rfidAddForm");
    if (form) form.style.display = form.style.display === "none" ? "block" : "none";
}

function addRfidCard() {
    showSettingsMsg("msg-rfid-add", "Đã thêm thẻ demo.", true);
}

function testTelegram() {
    showSettingsMsg("msg-telegram", "Demo: đã giả lập gửi tin Telegram.", true);
}

function saveTelegram() {
    showSettingsMsg("msg-telegram", "Đã lưu cấu hình Telegram demo.", true);
}

function saveMqttConfig() {
    showSettingsMsg("msg-mqtt-cfg", "Đã lưu cấu hình MQTT demo.", true);
}

function toggleScheduleForm() {
    const form = document.getElementById("scheduleAddForm");
    if (form) form.style.display = form.style.display === "none" ? "block" : "none";
}

function addSchedule() {
    const list = document.getElementById("scheduleList");
    if (list) {
        list.innerHTML = `
            <div class="automation-item">
                <div class="automation-info">
                    <div class="automation-title">Đèn phòng khách</div>
                    <div class="automation-desc">Bật lúc 18:00 hằng ngày</div>
                </div>
            </div>
        `;
    }
}

function changePassword() {
    const msg = document.getElementById("pwMsg");
    if (msg) {
        msg.textContent = "Demo tĩnh: không thay đổi mật khẩu thật.";
        msg.className = "user-form-msg";
    }
}

function toggleAddUserForm() {
    const form = document.getElementById("addUserForm");
    if (form) form.style.display = form.style.display === "none" ? "block" : "none";
}

function addUser() {
    const msg = document.getElementById("addUserMsg");
    if (msg) msg.textContent = "Demo tĩnh: đã giả lập thêm user.";
}

function filterUserTable() {}

function setUserFilter() {}

document.addEventListener("click", function(e) {
    const panel = document.getElementById("notifPanel");
    if (panel && !panel.contains(e.target)) {
        panel.style.display = "none";
    }
});

document.addEventListener("DOMContentLoaded", function() {
    updateClock();
    setInterval(updateClock, 1000);
    initDemoData();

    setInterval(function() {
        const temp = (27 + Math.random() * 3).toFixed(1);
        const hum = Math.round(58 + Math.random() * 12);
        const gas = Math.round(280 + Math.random() * 90);

        setText("welcomeTemp", temp + " °C");
        setText("welcomeHum", hum + " %");
        setText("tempSensor", temp + " °C");
        setText("humSensor", hum + " %");
        setText("gasValue", gas + " ADC");
        setText("gasBarVal", gas + " / 1023");

        const gasBar = document.getElementById("gasBar");
        if (gasBar) gasBar.style.width = Math.min(100, Math.round(gas / 1023 * 100)) + "%";
    }, 2500);
});