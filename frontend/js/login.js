// XỬ LÝ GỬI FORM ĐĂNG NHẬP (Chạy độc lập từ file login.js)
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const errorMsg = document.getElementById('errorMsg');
    const submitBtn = document.getElementById('submitBtn');
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    // Ẩn lỗi cũ và đổi trạng thái nút thành Đang xử lý
    errorMsg.style.display = 'none';
    submitBtn.innerHTML = '⏳ Đang xử lý...';
    submitBtn.disabled = true;

    try {
        const response = await fetch('http://localhost:3001/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const result = await response.json();

        if (response.ok) {
            // Đăng nhập thành công: Lưu thông tin và chuyển hướng
            localStorage.setItem('bepviet_user', JSON.stringify(result.user));
            window.location.href = 'admin.html';
        } else {
            // Hiện lỗi và mở khóa nút
            errorMsg.textContent = "❌ " + result.error;
            errorMsg.style.display = 'block';
            submitBtn.innerHTML = 'Đăng Nhập Ngay';
            submitBtn.disabled = false;
        }
    } catch (error) {
        // Lỗi sập server
        errorMsg.textContent = "❌ Lỗi kết nối máy chủ!";
        errorMsg.style.display = 'block';
        submitBtn.innerHTML = 'Đăng Nhập Ngay';
        submitBtn.disabled = false;
    }
});