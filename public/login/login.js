// ===== CONFIG BẢO MẬT =====
const MAX_ATTEMPTS  = 5;
const LOCKOUT_MS    = 2 * 60 * 1000; // 2 phút

// ===== ELEMENT =====
const loginForm     = document.getElementById("login-form");
const registerForm  = document.getElementById("register-form");
const showRegister  = document.getElementById("show-register-form-link");
const showLogin     = document.getElementById("show-login-form-link");
const loginMessage  = document.getElementById("login-status-message");
const registerMessage = document.getElementById("register-status-message");
const loginBtn      = document.getElementById("login-btn");
const attemptsBox   = document.getElementById("login-attempts");
const attemptsText  = document.getElementById("attempts-text");

// ===== SLIDESHOW =====
var bgSlides  = document.querySelectorAll(".bg-slide");
var bgCurrent = 0;

function nextBgSlide() {
    bgSlides[bgCurrent].classList.remove("active");
    bgCurrent = (bgCurrent + 1) % bgSlides.length;
    bgSlides[bgCurrent].classList.add("active");
}

setInterval(nextBgSlide, 5000);

// ===== TOGGLE PASSWORD =====
function togglePassword(inputId, btn) {
    var input = document.getElementById(inputId);
    var icon  = btn.querySelector("i");
    if (input.type === "password") {
        input.type = "text";
        icon.className = "bi bi-eye-slash";
    } else {
        input.type = "password";
        icon.className = "bi bi-eye";
    }
}

// ===== PASSWORD STRENGTH =====
var pwInput = document.getElementById("password-register");
if (pwInput) {
    pwInput.addEventListener("input", function() {
        var val = pwInput.value;
        var strengthBox  = document.getElementById("pw-strength");
        var strengthFill = document.getElementById("strength-fill");
        var strengthLbl  = document.getElementById("strength-label");

        if (!val) { strengthBox.style.display = "none"; return; }
        strengthBox.style.display = "";

        var score = 0;
        if (val.length >= 6)  score++;
        if (val.length >= 10) score++;
        if (/[A-Z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        var levels = [
            { pct: "20%", color: "#f85149", label: "Rất yếu" },
            { pct: "40%", color: "#d29922", label: "Yếu" },
            { pct: "60%", color: "#f59e0b", label: "Trung bình" },
            { pct: "80%", color: "#3fb950", label: "Mạnh" },
            { pct: "100%",color: "#1a7f37", label: "Rất mạnh" },
        ];

        var lv = levels[Math.min(score, 4)];
        strengthFill.style.width      = lv.pct;
        strengthFill.style.background = lv.color;
        strengthLbl.textContent       = lv.label;
        strengthLbl.style.color       = lv.color;
    });
}

// ===== GIỚI HẠN ĐĂNG NHẬP =====
function getAttemptData() {
    try {
        return JSON.parse(localStorage.getItem("loginAttempts") || "{}");
    } catch { return {}; }
}

function saveAttemptData(data) {
    localStorage.setItem("loginAttempts", JSON.stringify(data));
}

function checkLockout() {
    var data = getAttemptData();
    if (data.lockedUntil && Date.now() < data.lockedUntil) {
        var remaining = Math.ceil((data.lockedUntil - Date.now()) / 1000);
        return remaining;
    }
    return 0;
}

function recordFailedAttempt() {
    var data = getAttemptData();
    data.count = (data.count || 0) + 1;

    if (data.count >= MAX_ATTEMPTS) {
        data.lockedUntil = Date.now() + LOCKOUT_MS;
        data.count = 0;
    }

    saveAttemptData(data);
    return data.count;
}

function clearAttempts() {
    localStorage.removeItem("loginAttempts");
}

function updateAttemptsUI(count) {
    if (count <= 0) {
        attemptsBox.style.display = "none";
        return;
    }
    attemptsBox.style.display = "flex";
    var remaining = MAX_ATTEMPTS - count;
    attemptsText.textContent = "Sai mật khẩu " + count + " lần. Còn " + remaining + " lần trước khi bị khóa.";
}

// Kiểm tra lockout khi load trang
(function checkOnLoad() {
    var remaining = checkLockout();
    if (remaining > 0) {
        loginBtn.disabled = true;
        attemptsBox.style.display = "flex";
        attemptsText.textContent  = "Tài khoản bị khóa. Thử lại sau " + remaining + " giây.";

        var timer = setInterval(function() {
            var left = checkLockout();
            if (left <= 0) {
                clearInterval(timer);
                loginBtn.disabled = false;
                attemptsBox.style.display = "none";
            } else {
                attemptsText.textContent = "Tài khoản bị khóa. Thử lại sau " + left + " giây.";
            }
        }, 1000);
    }
})();

// ===== CHUYỂN FORM =====
showRegister.addEventListener("click", function(e) {
    e.preventDefault();
    loginForm.classList.add("hidden");
    registerForm.classList.remove("hidden");
});

showLogin.addEventListener("click", function(e) {
    e.preventDefault();
    registerForm.classList.add("hidden");
    loginForm.classList.remove("hidden");
});

// ===== HIỂN THỊ THÔNG BÁO =====
function showMessage(el, msg, type) {
    el.textContent  = msg;
    el.className    = "status-message " + type;
    el.style.display = "block";
}

// ===== LOGIN =====
loginForm.addEventListener("submit", async function(e) {
    e.preventDefault();

    // Kiểm tra lockout
    var lockRemaining = checkLockout();
    if (lockRemaining > 0) {
        showMessage(loginMessage, "Tài khoản bị khóa " + lockRemaining + " giây nữa!", "error");
        return;
    }

    var username = document.getElementById("username-login").value.trim();
    var password = document.getElementById("password-login").value;

    loginBtn.disabled = true;
    showMessage(loginMessage, "Đang đăng nhập...", "info");

    try {
        var res  = await fetch("/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        var data = await res.json();

        if (data.success) {
            clearAttempts();
            showMessage(loginMessage, "Đăng nhập thành công!", "success");
            localStorage.setItem("user", JSON.stringify({
                username: data.username,
                role:     data.role
            }));
            setTimeout(function() {
                window.location.href = "/dashboard/index.html";
            }, 800);

        } else {
            loginBtn.disabled = false;
            var count = recordFailedAttempt();
            updateAttemptsUI(count);

            // Nếu vừa bị khóa
            var locked = checkLockout();
            if (locked > 0) {
                showMessage(loginMessage, "Sai quá " + MAX_ATTEMPTS + " lần! Bị khóa 2 phút.", "error");
                loginBtn.disabled = true;

                var timer = setInterval(function() {
                    var left = checkLockout();
                    if (left <= 0) {
                        clearInterval(timer);
                        loginBtn.disabled = false;
                        attemptsBox.style.display = "none";
                    } else {
                        attemptsText.textContent = "Tài khoản bị khóa. Thử lại sau " + left + " giây.";
                    }
                }, 1000);
            } else {
                showMessage(loginMessage, data.message || "Sai tài khoản hoặc mật khẩu!", "error");
            }
        }

    } catch (err) {
        loginBtn.disabled = false;
        showMessage(loginMessage, "Lỗi kết nối server!", "error");
    }
});

// ===== REGISTER =====
registerForm.addEventListener("submit", async function(e) {
    e.preventDefault();

    var username = document.getElementById("username-register").value.trim();
    var password = document.getElementById("password-register").value;
    var confirm  = document.getElementById("confirm-password-register").value;

    if (password !== confirm) {
        showMessage(registerMessage, "Mật khẩu không khớp!", "error");
        return;
    }

    if (password.length < 3) {
        showMessage(registerMessage, "Mật khẩu tối thiểu 3 ký tự!", "error");
        return;
    }

    showMessage(registerMessage, "Đang đăng ký...", "info");

    try {
        var res  = await fetch("/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        });

        var data = await res.json();

        if (data.success) {
            showMessage(registerMessage, "Đăng ký thành công! Đang chuyển hướng...", "success");
            setTimeout(function() {
                registerForm.classList.add("hidden");
                loginForm.classList.remove("hidden");
            }, 1000);
        } else {
            showMessage(registerMessage, data.message || "Đăng ký thất bại!", "error");
        }

    } catch (err) {
        showMessage(registerMessage, "Lỗi kết nối server!", "error");
    }
});