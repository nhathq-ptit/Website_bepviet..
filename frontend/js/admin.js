const API_BASE = 'http://localhost:3001/api'; 
let currentEditId = null; 
let adminRecipesList = []; 

document.addEventListener("DOMContentLoaded", () => {
    renderAdminTable();
    loadDashboardStats();
});

// 1. TẢI SỐ LIỆU THỐNG KÊ

async function loadDashboardStats() {
    try {
        const response = await fetch(`${API_BASE}/dashboard-stats`);
        if (!response.ok) throw new Error("Lỗi API");
        const stats = await response.json();
        
        const elRecipes = document.getElementById('dashRecipes');
        const elSubs = document.getElementById('dashSubs');
        if (elRecipes) elRecipes.innerText = stats.totalRecipes || 0;
        if (elSubs) elSubs.innerText = stats.totalSubscribers || 0;
    } catch(e) { console.error("Lỗi tải thống kê:", e); }
}

// 2. TẢI VÀ VẼ BẢNG DANH SÁCH (Đã sửa lỗi vỡ cột)

async function renderAdminTable() {
    const tableBody = document.getElementById('adminTableBody'); 
    if (!tableBody) return; 
    
    tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">⏳ Đang tải dữ liệu...</td></tr>';

    try {
        const response = await fetch(`${API_BASE}/recipes`);
        adminRecipesList = await response.json();
        tableBody.innerHTML = ''; 
        
        adminRecipesList.forEach((recipe, index) => {
            const tr = document.createElement('tr');
            const isHot = recipe.is_featured === 1 || recipe.is_featured === true || recipe.is_featured === "1";
            
            // 🎯 Đã tách riêng Thẻ <td> chứa Ngôi sao và <td> chứa Sửa/Xóa rõ ràng
            tr.innerHTML = `
                <td>#${index + 1}</td>
                <td style="font-weight: bold; color: #1f2937;">${recipe.name}</td>
                <td>${recipe.category}</td>
                
                <td style="text-align: center; vertical-align: middle;">
                    <button id="star-btn-${recipe.id}" onclick="toggleFeatured(${recipe.id}, ${isHot ? 1 : 0})" title="Đánh dấu thịnh hành" style="background:transparent; border:none; font-size:1.6rem; cursor:pointer; transition: 0.2s; outline: none;">
                        ${isHot ? '⭐' : '☆'}
                    </button>
                </td>
                
                <td style="vertical-align: middle;">
                    <div style="display: flex; gap: 10px;">
                        <button onclick="editRecipe(${recipe.id})" style="background: #2196f3; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-weight: bold;">✏️ Sửa</button>
                        <button onclick="deleteRecipe(${recipe.id})" style="background: #ff4d4f; color: white; border: none; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-weight: bold;">🗑️ Xóa</button>
                    </div>
                </td>
            `;
            tableBody.appendChild(tr);
        });
        
        loadDashboardStats(); 
    } catch (error) { 
        tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color: red; padding: 20px;">❌ Lỗi tải dữ liệu. Vui lòng bật Server.</td></tr>';
    }
}

// 3. THUẬT TOÁN ĐỔI MÀU SIÊU MƯỢT (OPTIMISTIC UI) 

window.toggleFeatured = async function(id, currentStatus) {
    const newStatus = currentStatus === 1 ? 0 : 1; 
    const btn = document.getElementById(`star-btn-${id}`);
    
    // Bước 1: Đổi màu giao diện ngay lập tức trong 0.1 giây để tạo độ mượt
    if (btn) {
        btn.innerHTML = newStatus === 1 ? '⭐' : '☆';
        // Ép nút ghi nhớ trạng thái mới để bấm lần 2 không bị lỗi
        btn.setAttribute('onclick', `toggleFeatured(${id}, ${newStatus})`);
    }
    
    // Bước 2: Âm thầm gửi lệnh lưu lên Server ở nền
    try {
        const response = await fetch(`${API_BASE}/recipes/${id}/toggle-featured`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_featured: newStatus })
        });
        
        if (response.ok) {
            // Lưu ngầm vào mảng gốc
            const recipeIndex = adminRecipesList.findIndex(r => r.id === id);
            if (recipeIndex !== -1) adminRecipesList[recipeIndex].is_featured = newStatus;
        } else {
            throw new Error("Server từ chối cập nhật");
        }
    } catch (error) {
        // Nếu mạng lỗi, tự động nhả màu Ngôi sao về như cũ và báo lỗi
        if (btn) {
            btn.innerHTML = currentStatus === 1 ? '⭐' : '☆';
            btn.setAttribute('onclick', `toggleFeatured(${id}, ${currentStatus})`);
        }
        alert('❌ Lỗi kết nối mạng! Trạng thái chưa được lưu.');
    }
}

// 4. XÓA MÓN ĂN

async function deleteRecipe(recipeId) {
    if (!confirm("Bạn có chắc chắn muốn xóa vĩnh viễn món này không?")) return;
    try {
        const response = await fetch(`${API_BASE}/recipes/${recipeId}`, { method: 'DELETE' });
        if (response.ok) {
            renderAdminTable(); 
        } else {
            alert("❌ Server từ chối xóa món này!");
        }
    } catch (error) { alert("❌ Lỗi kết nối tới máy chủ."); }
}

// 5. NẠP DỮ LIỆU LÊN FORM ĐỂ SỬA

function editRecipe(id) {
    const recipe = adminRecipesList.find(r => r.id === id);
    if (!recipe) return;

    currentEditId = id; 
    
    const btnSubmit = document.querySelector('#addRecipeForm button[type="submit"]');
    if (btnSubmit) {
        btnSubmit.innerHTML = "🔄 Cập Nhật Công Thức";
        btnSubmit.style.background = "#2196f3"; 
        btnSubmit.style.boxShadow = "0 4px 15px rgba(33, 150, 243, 0.3)";
    }

    document.getElementById('recipeName').value = recipe.name || '';
    document.getElementById('recipeDesc').value = recipe.desc || '';
    document.getElementById('recipeTime').value = recipe.time || '';
    document.getElementById('recipeRegion').value = recipe.region || 'Miền Bắc';
    document.getElementById('recipeServings').value = recipe.servings || '';
    document.getElementById('recipeCalories').value = recipe.calories || '';
    document.getElementById('recipeTip').value = recipe.tip || '';
    document.getElementById('recipeDifficulty').value = recipe.difficulty || 'Dễ';
    
    const dietSelect = document.getElementById('recipeDietType');
    if (dietSelect) {
        dietSelect.value = recipe.menu_type || 'Mặn';
        updateCategories(); 
    }
    
    setTimeout(() => {
        const catSelect = document.getElementById('recipeCategory');
        if (catSelect) catSelect.value = recipe.category; 
    }, 50); 

    document.getElementById('recipeIngredients').value = (recipe.ingredients || []).join('\n');
    document.getElementById('recipeSteps').value = (recipe.steps || []).join('\n');

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// 6. GỬI FORM LƯU VÀO DATABASE

document.getElementById('addRecipeForm')?.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    try {
        const formData = new FormData();
        formData.append('name', document.getElementById('recipeName').value);
        formData.append('category', document.getElementById('recipeCategory').value);
        formData.append('desc', document.getElementById('recipeDesc').value);
        formData.append('difficulty', document.getElementById('recipeDifficulty').value);
        formData.append('time', document.getElementById('recipeTime').value || "30 phút");
        formData.append('region', document.getElementById('recipeRegion').value);
        formData.append('servings', document.getElementById('recipeServings').value || 4);
        formData.append('calories', document.getElementById('recipeCalories').value || 300);
        formData.append('tip', document.getElementById('recipeTip').value);
        formData.append('menu_type', document.getElementById('recipeDietType').value); 
        
        const ingArr = document.getElementById('recipeIngredients').value.split('\n').filter(i => i.trim());
        const stepArr = document.getElementById('recipeSteps').value.split('\n').filter(s => s.trim());
        formData.append('ingredients', JSON.stringify(ingArr));
        formData.append('steps', JSON.stringify(stepArr));

        const imageInput = document.getElementById('recipeImage');
        if (imageInput && imageInput.files.length > 0) {
            formData.append('image', imageInput.files[0]);
        }

        const url = currentEditId ? `${API_BASE}/recipes/${currentEditId}` : `${API_BASE}/recipes`;
        const method = currentEditId ? 'PUT' : 'POST';

        const response = await fetch(url, { method: method, body: formData });
        const result = await response.json();
        
        if (response.ok) {
            alert("✅ " + result.message);
            this.reset();             
            currentEditId = null;     
            
            const btnSubmit = document.querySelector('#addRecipeForm button[type="submit"]');
            if (btnSubmit) {
                btnSubmit.innerHTML = "💾 Lưu Công Thức";
                btnSubmit.style.background = "#ff5e3a"; 
                btnSubmit.style.boxShadow = "0 4px 15px rgba(255, 94, 58, 0.3)";
            }
            
            renderAdminTable(); 
        } else {
            alert("❌ Lỗi: " + result.error);
        }
    } catch (error) { 
        alert("❌ Lỗi kết nối! Server chưa bật hoặc bị sập."); 
    }
});

// 7. CẬP NHẬT DANH MỤC KHI ĐỔI TAB MẶN/CHAY

function updateCategories() {
    const dietType = document.getElementById('recipeDietType').value;
    const categorySelect = document.getElementById('recipeCategory');
    if (!categorySelect) return;
    
    if (dietType === 'Đồ uống') {
        categorySelect.innerHTML = `
            <option value="Trà">🍵 Các loại Trà</option>
            <option value="Sinh tố & Nước ép">🥤 Sinh tố & Nước ép</option>
            <option value="Cà phê">☕ Cà phê</option>
            <option value="Nước pha chế khác">🍹 Nước pha chế khác</option>
        `;
    } else {
        categorySelect.innerHTML = `
            <option value="Canh">🥣 Canh & Súp</option>
            <option value="Xào">🥘 Món xào</option>
            <option value="Luộc">🥚 Món luộc</option>
            <option value="Nướng">🔥 Món nướng</option>
            <option value="Tráng miệng">🍮 Tráng miệng</option>
            <option value="Cơm">🍚 Cơm & Bún</option>
        `;
    }
}