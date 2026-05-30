const express = require("express");
const router  = express.Router();
const { readUsers, writeUsers, addUser, deleteUser, updatePassword, updateRole } = require("../utils/db");

// ===== REGISTER =====
router.post("/register", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password)
        return res.json({ success: false, message: "Thiếu thông tin!" });

    try {
        const users = await readUsers();
        if (users[username])
            return res.json({ success: false, message: "Tài khoản đã tồn tại!" });

        await addUser(username, password, "user");
        res.json({ success: true, message: "Đăng ký thành công!" });
    } catch (err) {
        res.json({ success: false, message: "Lỗi server: " + err.message });
    }
});

// ===== LOGIN =====
router.post("/login", async (req, res) => {
    const { username, password } = req.body;
    try {
        const users = await readUsers();
        if (!users[username])
            return res.json({ success: false, message: "Tài khoản không tồn tại!" });
        if (users[username].password !== password)
            return res.json({ success: false, message: "Sai mật khẩu!" });

        res.json({
            success:  true,
            message:  "Đăng nhập thành công!",
            username: username,
            role:     users[username].role || "user",
        });
    } catch (err) {
        res.json({ success: false, message: "Lỗi server: " + err.message });
    }
});

// ===== LẤY DANH SÁCH USER =====
router.get("/users", async (req, res) => {
    if (req.headers["x-role"] !== "admin")
        return res.status(403).json({ success: false, message: "Không có quyền!" });

    try {
        const users = await readUsers();
        const list  = Object.entries(users).map(([username, data]) => ({
            username,
            role:      data.role,
            createdAt: data.createdAt || null,
        }));
        res.json({ success: true, users: list });
    } catch (err) {
        res.json({ success: false, message: "Lỗi server: " + err.message });
    }
});

// ===== THÊM USER =====
router.post("/users/add", async (req, res) => {
    if (req.headers["x-role"] !== "admin")
        return res.status(403).json({ success: false, message: "Không có quyền!" });

    const { username, password, role } = req.body;
    if (!username || !password)
        return res.json({ success: false, message: "Thiếu thông tin!" });

    try {
        const users = await readUsers();
        if (users[username])
            return res.json({ success: false, message: "Tài khoản đã tồn tại!" });

        await addUser(username, password, role || "user");
        res.json({ success: true, message: "Thêm thành công!" });
    } catch (err) {
        res.json({ success: false, message: "Lỗi server: " + err.message });
    }
});

// ===== XÓA USER =====
router.delete("/users/:username", async (req, res) => {
    if (req.headers["x-role"] !== "admin")
        return res.status(403).json({ success: false, message: "Không có quyền!" });

    const { username } = req.params;
    const requestUser  = req.headers["x-username"];
    if (username === requestUser)
        return res.json({ success: false, message: "Không thể xóa chính mình!" });

    try {
        const changes = await deleteUser(username);
        if (!changes)
            return res.json({ success: false, message: "Không tìm thấy user!" });
        res.json({ success: true, message: "Đã xóa!" });
    } catch (err) {
        res.json({ success: false, message: "Lỗi server: " + err.message });
    }
});

// ===== ĐỔI MẬT KHẨU =====
router.post("/users/change-password", async (req, res) => {
    const { username, oldPassword, newPassword } = req.body;
    try {
        const users = await readUsers();
        if (!users[username])
            return res.json({ success: false, message: "Không tìm thấy user!" });
        if (users[username].password !== oldPassword)
            return res.json({ success: false, message: "Mật khẩu cũ không đúng!" });
        if (!newPassword || newPassword.length < 1)
            return res.json({ success: false, message: "Mật khẩu mới không hợp lệ!" });

        await updatePassword(username, newPassword);
        res.json({ success: true, message: "Đổi mật khẩu thành công!" });
    } catch (err) {
        res.json({ success: false, message: "Lỗi server: " + err.message });
    }
});

// ===== ĐỔI ROLE =====
router.put("/users/:username/role", async (req, res) => {
    if (req.headers["x-role"] !== "admin")
        return res.status(403).json({ success: false, message: "Không có quyền!" });

    const { username }  = req.params;
    const { role }      = req.body;
    const requestUser   = req.headers["x-username"];

    if (username === requestUser)
        return res.json({ success: false, message: "Không thể đổi role của chính mình!" });
    if (!["admin", "user"].includes(role))
        return res.json({ success: false, message: "Role không hợp lệ!" });

    try {
        const changes = await updateRole(username, role);
        if (!changes)
            return res.json({ success: false, message: "Không tìm thấy user!" });
        res.json({ success: true, message: "Đã cập nhật role!" });
    } catch (err) {
        res.json({ success: false, message: "Lỗi server: " + err.message });
    }
});

// ===== RESET MẬT KHẨU =====
router.post("/users/:username/reset-password", async (req, res) => {
    if (req.headers["x-role"] !== "admin")
        return res.status(403).json({ success: false, message: "Không có quyền!" });

    const { username }    = req.params;
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 3)
        return res.json({ success: false, message: "Mật khẩu tối thiểu 3 ký tự!" });

    try {
        const changes = await updatePassword(username, newPassword);
        if (!changes)
            return res.json({ success: false, message: "Không tìm thấy user!" });
        res.json({ success: true, message: "Đã reset mật khẩu!" });
    } catch (err) {
        res.json({ success: false, message: "Lỗi server: " + err.message });
    }
});

module.exports = router;
