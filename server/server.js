const fetch = require("node-fetch");
const express = require("express");
const path = require("path");
const sqlite3 = require("sqlite3").verbose();

// 👉 thêm mqtt
require("./mqtt");

const app = express();
const PORT = 3000;

// 👉 kết nối database
const db = new sqlite3.Database(
  path.join(__dirname, "../data/database.db"),
  (err) => {
    if (err) console.error(err.message);
    else console.log("✅ Connected to SQLite");
  }
);

// middleware
app.use(express.json());

// ===== PWA FILES =====
app.get("/manifest.json", (req, res) => {
  res.setHeader("Content-Type", "application/manifest+json");
  res.sendFile(path.join(__dirname, "../public/manifest.json"));
});

app.get("/sw.js", (req, res) => {
  res.setHeader("Content-Type", "application/javascript");
  res.setHeader("Service-Worker-Allowed", "/");
  res.sendFile(path.join(__dirname, "../public/sw.js"));
});

// static frontend
app.use(express.static(path.join(__dirname, "../public")));

// routes auth
const authRoutes = require("./routes/auth");
app.use("/", authRoutes);

const settingsRoutes = require("./routes/settings");
app.use("/", settingsRoutes);


// ================= API 7 NGÀY =================
app.get("/api/7days", (req, res) => {
  db.all(`
    SELECT DATE(created_at) as day,
           sensor_type,
           AVG(value) as avg_value
    FROM sensor_data
    WHERE created_at >= datetime('now', '-7 days')
    GROUP BY day, sensor_type
  `, [], (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
});

// ================= API 30 NGÀY =================
app.get("/api/30days", (req, res) => {
  db.all(`
    SELECT DATE(created_at) as day,
           sensor_type,
           AVG(value) as avg_value
    FROM sensor_data
    WHERE created_at >= datetime('now', '-30 days')
    GROUP BY day, sensor_type
  `, [], (err, rows) => {
    if (err) return res.status(500).json(err);
    res.json(rows);
  });
});

// ===== USERS API =====
app.get("/users", (req, res) => {

  // check quyền admin (đơn giản)
  if (req.headers["x-role"] !== "admin") {
    return res.status(403).json({ error: "Forbidden" });
  }

  db.all("SELECT id, username FROM users", [], (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "DB error" });
    }

    res.json(rows); // 👈 QUAN TRỌNG
  });

});

// chạy server
app.listen(PORT, () => {
  console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});