const path    = require("path");
const sqlite3 = require("sqlite3").verbose();

const db = new sqlite3.Database(
    path.join(__dirname, "../../data/database.db")
);

// ===== ĐỌC TẤT CẢ USER =====
function readUsers() {
    return new Promise((resolve, reject) => {
        db.all("SELECT * FROM users", [], (err, rows) => {
            if (err) return reject(err);
            // Chuyển về dạng object { username: { password, role, createdAt } }
            const result = {};
            rows.forEach(row => {
                result[row.username] = {
                    password:  row.password,
                    role:      row.role,
                    createdAt: row.created_at,
                };
            });
            resolve(result);
        });
    });
}

// ===== GHI / CẬP NHẬT USER =====
function writeUsers(users) {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            Object.entries(users).forEach(([username, data]) => {
                db.run(
                    `INSERT INTO users (username, password, role, created_at)
                     VALUES (?, ?, ?, ?)
                     ON CONFLICT(username) DO UPDATE SET
                         password   = excluded.password,
                         role       = excluded.role`,
                    [
                        username,
                        data.password,
                        data.role || "user",
                        data.createdAt || new Date().toISOString(),
                    ],
                    (err) => { if (err) console.error("[DB]", err.message); }
                );
            });
            resolve();
        });
    });
}

// ===== THÊM USER MỚI =====
function addUser(username, password, role) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO users (username, password, role, created_at)
             VALUES (?, ?, ?, ?)`,
            [username, password, role || "user", new Date().toISOString()],
            function(err) {
                if (err) return reject(err);
                resolve(this.lastID);
            }
        );
    });
}

// ===== XÓA USER =====
function deleteUser(username) {
    return new Promise((resolve, reject) => {
        db.run(
            "DELETE FROM users WHERE username = ?",
            [username],
            function(err) {
                if (err) return reject(err);
                resolve(this.changes);
            }
        );
    });
}

// ===== CẬP NHẬT PASSWORD =====
function updatePassword(username, newPassword) {
    return new Promise((resolve, reject) => {
        db.run(
            "UPDATE users SET password = ? WHERE username = ?",
            [newPassword, username],
            function(err) {
                if (err) return reject(err);
                resolve(this.changes);
            }
        );
    });
}

// ===== CẬP NHẬT ROLE =====
function updateRole(username, role) {
    return new Promise((resolve, reject) => {
        db.run(
            "UPDATE users SET role = ? WHERE username = ?",
            [role, username],
            function(err) {
                if (err) return reject(err);
                resolve(this.changes);
            }
        );
    });
}

module.exports = {
    readUsers,
    writeUsers,
    addUser,
    deleteUser,
    updatePassword,
    updateRole,
    db,
};
