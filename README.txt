File này giải thích cấu trúc thư mục:

1. Thư mục node_modules/
Đây là thư mục chứa toàn bộ thư viện (package) mà project sử dụng
Đây chỉ là kho chứa thư viện, Node.js đọc code trong server.js sau đó nạp các thư viện từ node_modules khi cần

2. Thư mục assets/
Đây là thư mục chứa các hình ảnh và logo như là sơ đồ nguyên lý, hình ảnh thiết bị được trình bày trong khóa luận

3. Thư mục data/
là thư mục lưu trữ dữ liệu và các tệp cấu hình của hệ thống, bao gồm cơ sở dữ liệu SQLite, thông tin người dùng và các thiết lập cấu hình để Dashboard và Node.js hoạt động.

4. Thư mục docs/
Chứa tài liệu hướng dẫn, code tham khảo và sơ đồ, tài liệu cho dự án, Không tham gia vào quá trình chạy

5. Thư mục firmware/
Chứa code phần cứng cho các module esp32, esp8266

6. Thư mục public/
gồm 2 thư mục chính là login và dashboard. login chứa code giao diện web đăng nhập. dashboard chứ code giao diện chính

7. Thư mục server/
Chứa mã nguồn Backend Node.js (server.js, MQTT, API, xử lý cơ sở dữ liệu...), điều khiển hoạt động của Dashboard.