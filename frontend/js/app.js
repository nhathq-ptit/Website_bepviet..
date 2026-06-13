// PHẦN 1: BIẾN TOÀN CỤC & TRẠNG THÁI (STATE MANAGEMENT)
     
let RECIPES = [];            // Mảng chứa toàn bộ dữ liệu gốc từ Server
let filteredRecipes = [];    // Mảng chứa dữ liệu sau khi Lọc/Tìm kiếm
let sortAscending = true;    // Trạng thái sắp xếp A-Z hay Z-A
let currentSection = "home"; // Nhận biết đang ở trang nào (Home, Recipes, v.v.)
let currentDietType = 'Tất cả'; // Chế độ ăn hiện tại (Mặn, Chay...)

// Cấu hình Phân trang (Pagination)
let ITEMS_PER_PAGE = 6;      // Số món ăn hiển thị trên 1 trang
let currentPage = 1;         // Trang hiện tại đang xem

// Cấu hình tính năng mở rộng
let shoppingCart = JSON.parse(localStorage.getItem("bepviet_cart")) || [];       // Giỏ hàng
let purchasedItems = JSON.parse(localStorage.getItem("bepviet_purchased")) || []; // Đồ đã mua
let currentRecipeContext = null; // Lưu trữ tạm thời món ăn đang xem chi tiết
let mySwiperInstance = null;     // Biến điều khiển Slider (tránh lỗi kẹt slider)

// Dữ liệu ảnh Thumbnail dự phòng (Fallback Images)
const THUMB_IMAGES = {
    1: "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?q=80&w=800&auto=format&fit=crop",
    2: "https://images.unsplash.com/photo-1594910243457-3a131b54a856?q=80&w=800&auto=format&fit=crop",
    3: "https://images.unsplash.com/photo-1548943487-a2e4e43b4859?q=80&w=800&auto=format&fit=crop",
};
     
// PHẦN 2: KHỞI TẠO & KẾT NỐI SERVER (INIT & FETCH API)

// 1. Chạy ngay khi trang web vừa load xong bộ khung HTML
document.addEventListener("DOMContentLoaded", () => {
    loadRecipesFromMySQL();
    animateSearchPlaceholder(); // Chạy hiệu ứng gõ chữ ở thanh tìm kiếm
    setTimeout(updateCartBadge, 300); // Cập nhật số lượng giỏ hàng

    // Lắng nghe phím ESC để đóng Modal
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeRecipeModal();
    });

    // Hiệu ứng đổ bóng thanh Header khi cuộn chuột
    window.addEventListener("scroll", () => {
        const header = document.getElementById("header");
        if (header) header.style.boxShadow = window.scrollY > 10 ? "0 2px 20px rgba(92,61,46,0.12)" : "none";
    });
    
    // Cài đặt Giao diện Sáng/Tối (Dark/Light Mode)
    const themeToggle = document.getElementById('themeToggle');
    if (localStorage.getItem('bepviet_theme') === 'dark') {
        document.body.classList.add('dark-mode');
        if(themeToggle) themeToggle.textContent = '☀️';
    }

    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            localStorage.setItem('bepviet_theme', isDark ? 'dark' : 'light');
            themeToggle.textContent = isDark ? '☀️' : '🌙';
        });
    }
});

// Hàm vẽ khung xương chờ tải dữ liệu (Skeleton)
function renderSkeletons(elementId, count = 6) {
    const grid = document.getElementById(elementId);
    if (!grid) return;
    grid.innerHTML = "";
    for (let i = 0; i < count; i++) {
        const skeleton = `
            <div class="${elementId === 'featuredGrid' ? 'swiper-slide' : ''}">
                <div class="skeleton-card">
                    <div class="skeleton-anim skeleton-thumb"></div>
                    <div class="skeleton-body">
                        <div class="skeleton-anim skeleton-line short"></div>
                        <div class="skeleton-anim skeleton-line medium"></div>
                        <div class="skeleton-anim skeleton-line"></div>
                        <div class="skeleton-anim skeleton-line"></div>
                    </div>
                </div>
            </div>`;
        grid.innerHTML += skeleton;
    }
}

// 2. Fetch API tải dữ liệu món ăn từ Server
async function loadRecipesFromMySQL() {
    renderSkeletons("recipeGrid", 8); // Đã có lại hàm renderSkeletons ở đây!
    renderSkeletons("featuredGrid", 4);

    try {
        // Mẹo chống Cache: Nối thêm thời gian hiện tại vào đuôi URL
        const response = await fetch('http://localhost:3001/api/recipes?t=' + new Date().getTime());
        RECIPES = await response.json();
        filteredRecipes = [...RECIPES]; // Sao chép mảng gốc sang mảng hiển thị

        setTimeout(() => {
            // Lọc ra các món "Thịnh hành" (is_featured = 1)
            let featuredRecipes = RECIPES.filter(r => r.is_featured == 1 || r.is_featured === "1" || r.is_featured === true);
            const otherRecipes = RECIPES.filter(r => r.is_featured != 1 && r.is_featured !== "1" && r.is_featured !== true);

            // Đảm bảo slider luôn có đủ 6 món để hiển thị
            if (featuredRecipes.length < 6) {
                featuredRecipes = [...featuredRecipes, ...otherRecipes];
            }
            
            renderFeaturedRecipes(featuredRecipes.slice(0, 6)); // Vẽ Slider
            applyFilters(); // Đổ dữ liệu ra danh sách chính
            updateStats();  // Cập nhật các con số thống kê
        }, 800); 

    } catch (err) {
        console.error("Lỗi kết nối máy chủ:", err);
        showToast("Lỗi kết nối máy chủ! Hãy kiểm tra Backend.");
    }
}
     
// PHẦN 3: HIỂN THỊ GIAO DIỆN CHÍNH (RENDER UI & PAGINATION)
     
// 1. Tạo một thẻ món ăn (Recipe Card)
function createRecipeCard(recipe) {
    const fav = isFavorite(recipe.id);
    const diffStars = { "Dễ": "⭐", "Trung bình": "⭐⭐", "Khó": "⭐⭐⭐" };
    const thumbImage = recipe.image ? `http://localhost:3001/uploads/${recipe.image}` : (typeof THUMB_IMAGES !== 'undefined' && THUMB_IMAGES[recipe.id] ? THUMB_IMAGES[recipe.id] : "https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=800&auto=format&fit=crop");
    const thumbStyle = `background-image: linear-gradient(180deg, rgba(0,0,0,0.05), rgba(0,0,0,0.4)), url('${thumbImage}'); background-size: cover; background-position: center;`;

    // Huy hiệu Thịnh hành
    const isHot = (recipe.is_featured == 1 || recipe.is_featured === "1" || recipe.is_featured === true);
    const hotBadge = isHot ? `<div style="position: absolute; top: 10px; left: 10px; background: #ff3d00; color: white; padding: 5px 12px; border-radius: 20px; font-size: 0.75rem; font-weight: bold; z-index: 10; box-shadow: 0 4px 8px rgba(255,61,0,0.4); text-transform: uppercase;">🔥 Thịnh hành</div>` : "";
    const regionBadge = `<span class="card-badge" ${isHot ? 'style="top: 45px;"' : ''}>${recipe.region || "Khắp nơi"}</span>`;

    const card = document.createElement("div");
    card.className = "recipe-card";
    card.setAttribute("data-id", recipe.id);
    card.style.position = "relative"; 
    card.onclick = () => openRecipeModal(recipe.id);

    card.innerHTML = `
        <div class="card-thumb" style="${thumbStyle}">
            ${hotBadge}
            ${regionBadge}
            
            <div onclick="event.stopPropagation(); quickAddToCart(${recipe.id}, event)" style="position: absolute; top: 10px; right: 55px; width: 35px; height: 35px; background: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; z-index: 20; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'" title="Nhặt nhanh vào giỏ">
                <span style="font-size: 1.15rem; line-height: 1; pointer-events: none; transform: translateY(-1px);">🛒</span>
            </div>

            <div class="fav-btn-wrapper" onclick="event.stopPropagation(); toggleFavorite(${recipe.id}, event)" style="position: absolute; top: 10px; right: 10px; width: 35px; height: 35px; background: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; cursor: pointer; z-index: 20; box-shadow: 0 2px 5px rgba(0,0,0,0.2); transition: 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'" title="${fav ? "Bỏ yêu thích" : "Thêm yêu thích"}">
                <span style="font-size: 1.15rem; line-height: 1; pointer-events: none; transform: translateY(1px);">${fav ? "❤️" : "🤍"}</span>
            </div>
        </div>
        
        <div class="card-body">
            <div class="card-category">${recipe.category}</div>
            <h3 class="card-title">${recipe.name}</h3>
            <p class="card-desc">${recipe.desc || "Chưa có mô tả chi tiết."}</p>
            <div class="card-meta">
                <span>⏱️ ${recipe.time}</span>
                <span>${diffStars[recipe.difficulty] || "⭐"} ${recipe.difficulty}</span>
                <span>🍽️ ${recipe.servings} người</span>
            </div>
        </div>`;
    return card;
}

// 2. Vẽ Slider Thịnh hành (Sử dụng thư viện Swiper)
function renderFeaturedRecipes(list) {
    const grid = document.getElementById("featuredGrid");
    if (!grid) return;

    // Hủy Slider cũ để giải phóng bộ nhớ
    const swiperEl = document.querySelector('.mySwiper');
    if (swiperEl && swiperEl.swiper) swiperEl.swiper.destroy(true, true);

    grid.innerHTML = "";
    
    // Lọc và vẽ các Slide
    const strictList = list.filter(r => r.is_featured == 1 || r.is_featured === "1" || r.is_featured === true);
    strictList.forEach((r) => {
        const slide = document.createElement("div");
        slide.className = "swiper-slide";
        slide.appendChild(createRecipeCard(r));
        grid.appendChild(slide);
    });

    // Khởi tạo lại Slider
    if (window.Swiper && strictList.length > 0) {
        mySwiperInstance = new Swiper(".mySwiper", {
            slidesPerView: 1,
            spaceBetween: 20,
            loop: strictList.length > 1, 
            autoplay: { delay: 3000, disableOnInteraction: false },
            pagination: { el: ".swiper-pagination", clickable: true },
            navigation: { nextEl: ".swiper-button-next", prevEl: ".swiper-button-prev" },
            breakpoints: {
                640: { slidesPerView: Math.min(2, strictList.length), spaceBetween: 20 },
                960: { slidesPerView: Math.min(3, strictList.length), spaceBetween: 30 },
                1200: { slidesPerView: Math.min(4, strictList.length), spaceBetween: 30 },
            },
        });
    }
}

// 3. Hiển thị danh sách món ăn & Xử lý Phân trang (Pagination)
function renderRecipes(list) {
    const grid = document.getElementById("recipeGrid");
    const empty = document.getElementById("emptyState");
    const info = document.getElementById("resultInfo");
    const paginationContainer = document.getElementById("paginationContainer");

    if (!grid) return;
    grid.innerHTML = "";

    // Xử lý khi mảng trống (Không tìm thấy món)
    if (list.length === 0) {
        if (empty) empty.style.display = "block";
        if (info) info.textContent = "";
        if (paginationContainer) paginationContainer.innerHTML = "";
        grid.style.minHeight = "auto"; 
        return;
    } 
    
    // Xử lý khi có dữ liệu
    if (empty) empty.style.display = "none";
    if (info) info.textContent = `Hiển thị ${list.length} công thức`;

    // Tính toán số trang
    const totalPages = Math.ceil(list.length / ITEMS_PER_PAGE);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    // THUẬT TOÁN CHỐNG GIẬT KHUNG (Khóa chiều cao nếu có nhiều trang)
    grid.style.minHeight = (totalPages > 1) ? "720px" : "auto"; 

    // Cắt mảng để lấy số món đúng với trang hiện tại
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const visibleList = list.slice(startIndex, endIndex);

    // Vẽ thẻ và gán animation delay
    visibleList.forEach((r, i) => {
        const card = createRecipeCard(r);
        card.style.animationDelay = `${i * 0.05}s`; 
        grid.appendChild(card);
    });

    // Vẽ thanh nút 1, 2, 3...
    renderPagination(totalPages);
}

// 4. Vẽ thanh Nút bấm phân trang
function renderPagination(totalPages) {
    const container = document.getElementById("paginationContainer");
    if (!container) return;
    
    container.innerHTML = ""; 
    if (totalPages <= 1) return; // Ẩn nếu chỉ có 1 trang

    const createBtn = (text, disabled, isActive, onClick) => {
        const btn = document.createElement("button");
        btn.innerHTML = text;
        btn.disabled = disabled;
        
        if (isActive) {
            btn.style.cssText = "padding: 8px 16px; border: none; background: linear-gradient(135deg, #ff3d00, #dd2c00); color: white; border-radius: 8px; font-weight: bold; box-shadow: 0 3px 8px rgba(255,61,0,0.3); margin: 0 4px;";
        } else if (disabled) {
            btn.style.cssText = "padding: 8px 14px; border: 1px solid #ddd; background: #f5f5f5; color: #ccc; border-radius: 8px; cursor: not-allowed; font-weight: bold; margin: 0 4px;";
        } else {
            btn.style.cssText = "padding: 8px 16px; border: 1px solid #ddd; background: white; color: #555; border-radius: 8px; cursor: pointer; transition: 0.2s; font-weight: bold; margin: 0 4px;";
            btn.onmouseover = () => { btn.style.borderColor = '#ff3d00'; btn.style.color = '#ff3d00'; };
            btn.onmouseout = () => { btn.style.borderColor = '#ddd'; btn.style.color = '#555'; };
        }
        btn.onclick = onClick;
        return btn;
    };

    container.appendChild(createBtn("«", currentPage === 1, false, () => goToPage(currentPage - 1)));
    for (let i = 1; i <= totalPages; i++) {
        container.appendChild(createBtn(i, false, i === currentPage, () => goToPage(i)));
    }
    container.appendChild(createBtn("»", currentPage === totalPages, false, () => goToPage(currentPage + 1)));
}

// Sự kiện khi click vào số trang
function goToPage(page) {
    currentPage = page;
    const currentList = (typeof filteredRecipes !== 'undefined' && filteredRecipes.length > 0) ? filteredRecipes : RECIPES;
    renderRecipes(currentList); 
}
     
// PHẦN 4: BỘ LỌC, TÌM KIẾM & SẮP XẾP (FILTER & SEARCH)
    

// 1. Lọc Master (Áp dụng tất cả các điều kiện: Chế độ ăn, Danh mục, Độ khó)
function applyFilters() {
    const keyword = document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
    const category = document.getElementById("categoryFilter")?.value || "all";
    const difficulty = document.getElementById("difficultyFilter")?.value || "all";

    filteredRecipes = RECIPES.filter((recipe) => {
        const matchDiet = currentDietType === 'Tất cả' || (recipe.menu_type || 'Mặn') === currentDietType;
        const inName = recipe.name.toLowerCase().includes(keyword);
        const inDesc = recipe.desc && recipe.desc.toLowerCase().includes(keyword);
        const inIngredients = recipe.ingredients && recipe.ingredients.some(i => i.toLowerCase().includes(keyword));

        const matchKeyword = keyword === "" || inName || inDesc || inIngredients;
        const matchCategory = category === "all" || recipe.category === category;
        const matchDifficulty = difficulty === "all" || recipe.difficulty === difficulty;

        return matchDiet && matchKeyword && matchCategory && matchDifficulty;
    });

    // Ép các món Thịnh hành (is_featured) nổi lên đầu danh sách
    filteredRecipes.sort((a, b) => {
        const aHot = (a.is_featured == 1 || a.is_featured === "1" || a.is_featured === true) ? 1 : 0;
        const bHot = (b.is_featured == 1 || b.is_featured === "1" || b.is_featured === true) ? 1 : 0;
        return bHot - aHot; 
    });

    currentPage = 1; // Reset trang về 1
    renderRecipes(filteredRecipes);
}

// 2. Tìm kiếm chuẩn xác theo Tiền tố (Gõ "Gà" ra "Gà", không ra "Trứng")
function searchRecipes() {
    const searchInput = document.getElementById('searchInput');
    if (!searchInput) return;

    // Chuẩn hóa Unicode tiếng Việt
    const keyword = searchInput.value.toLowerCase().normalize('NFC').trim();

    if (keyword === "") {
        filteredRecipes = [...RECIPES]; 
        renderRecipes(filteredRecipes);
        return;
    }

    filteredRecipes = RECIPES.filter(recipe => {
        if (!recipe.name) return false;
        const dishName = recipe.name.toLowerCase().normalize('NFC').trim();
        // Chỉ chấp nhận từ khóa đứng ở đầu tên món hoặc sau khoảng trắng
        return dishName.startsWith(keyword) || dishName.includes(' ' + keyword);
    });
    
    currentPage = 1; 
    renderRecipes(filteredRecipes);
}
document.getElementById('searchInput')?.addEventListener('input', searchRecipes);

// 3. Chuyển đổi tab Chế độ ăn (Mặn, Chay, Đồ uống...)
function switchDietType(type) {
    currentDietType = type;
    const tabs = { 'Tất cả': 'tab-tatca', 'Mặn': 'tab-man', 'Chay': 'tab-chay', 'Đồ uống': 'tab-douong' };
    
    // Đổi màu Tab UI
    Object.keys(tabs).forEach(key => {
        const btn = document.getElementById(tabs[key]);
        if (!btn) return;
        if (key === type) {
            btn.style.background = '#e65100';
            btn.style.color = 'white';
        } else {
            btn.style.background = 'transparent';
            btn.style.color = '#555';
        }
    });

    // Thay đổi options của thanh Dropdown danh mục cho phù hợp
    const categoryFilter = document.getElementById('categoryFilter');
    if (categoryFilter) {
        if (type === 'Đồ uống') {
            categoryFilter.innerHTML = `<option value="all">🍹 Tất cả đồ uống</option><option value="Trà">🍵 Các loại Trà</option><option value="Sinh tố & Nước ép">🥤 Sinh tố & Nước ép</option><option value="Cà phê">☕ Cà phê</option><option value="Nước pha chế khác">🍹 Khác</option>`;
        } else if (type === 'Tất cả') {
            categoryFilter.innerHTML = `<option value="all">🍔 Tất cả danh mục</option><option value="Canh">🥣 Canh & Súp</option><option value="Xào">🥘 Món xào</option><option value="Luộc">🥚 Món luộc</option><option value="Nướng">🔥 Nướng</option><option value="Tráng miệng">🍮 Tráng miệng</option><option value="Cơm">🍚 Cơm & Bún</option><option value="Trà">🍵 Trà</option><option value="Sinh tố & Nước ép">🥤 Sinh tố</option><option value="Cà phê">☕ Cà phê</option>`;
        } else {
            categoryFilter.innerHTML = `<option value="all">🍔 Tất cả danh mục</option><option value="Canh">🥣 Canh & Súp</option><option value="Xào">🥘 Món xào</option><option value="Luộc">🥚 Món luộc</option><option value="Nướng">🔥 Nướng</option><option value="Tráng miệng">🍮 Tráng miệng</option><option value="Cơm">🍚 Cơm & Bún</option>`;
        }
    }
    applyFilters();
}

// 4. Các tiện ích lọc khác
function filterByCategory() { applyFilters(); }
function clearSearch() {
    const searchInput = document.getElementById("searchInput");
    if (searchInput) { searchInput.value = ""; searchInput.focus(); }
    if (document.getElementById("categoryFilter")) document.getElementById("categoryFilter").value = "all";
    if (document.getElementById("difficultyFilter")) document.getElementById("difficultyFilter").value = "all";
    applyFilters();
}
function sortRecipes() {
    sortAscending = !sortAscending;
    filteredRecipes.sort((a, b) => sortAscending ? a.name.localeCompare(b.name, "vi") : b.name.localeCompare(a.name, "vi"));
    currentPage = 1;
    renderRecipes(filteredRecipes);
    showToast(`Đã sắp xếp ${sortAscending ? "A → Z" : "Z → A"}`);
}
     
// PHẦN 5: TÍNH NĂNG YÊU THÍCH (FAVORITES - LOCAL STORAGE)
     
function getFavorites() { return JSON.parse(localStorage.getItem("bepviet_favorites") || "[]"); }
function saveFavorites(favs) { localStorage.setItem("bepviet_favorites", JSON.stringify(favs)); }
function isFavorite(id) { return getFavorites().includes(id); }

function toggleFavorite(id, event) {
    if (event) event.stopPropagation();
    let favs = getFavorites();
    let isNowFav = false;

    // Xử lý thêm/xóa khỏi mảng
    if (favs.includes(id)) {
        favs = favs.filter((f) => f !== id);
        showToast("Đã xoá khỏi danh sách yêu thích 💔");
    } else {
        favs.push(id);
        showToast("❤️ Đã thêm vào yêu thích!");
        isNowFav = true;
    }
    
    saveFavorites(favs); // Lưu vào máy
    updateStats();       // Cập nhật số liệu

    // Cập nhật màu nút ngay lập tức bằng DOM Target (Không dùng class tìm kiếm để tránh lỗi lệch id)
    if (event && event.target) {
        if (event.target.tagName === 'SPAN') {
            event.target.innerHTML = isNowFav ? "❤️" : "🤍";
        } else {
            const favSpan = event.target.querySelector('span');
            if (favSpan) favSpan.innerHTML = isNowFav ? "❤️" : "🤍";
        }
    }

    // Đồng bộ nút Yêu thích bên trong Modal (nếu đang mở)
    const modalFavBtn = document.getElementById("modalFavBtn");
    if (modalFavBtn) modalFavBtn.innerHTML = isNowFav ? "❤️ Đã yêu thích" : "🤍 Thêm yêu thích";

    // Cập nhật lại UI nếu đang ở trang Yêu thích
    if (currentSection === "favorites") renderFavorites();
}

function renderFavorites() {
    const favIds = getFavorites();
    const favRecipes = RECIPES.filter((r) => favIds.includes(r.id));
    const grid = document.getElementById("favGrid");
    const empty = document.getElementById("favEmpty");

    if (!grid) return;
    grid.innerHTML = "";
    
    if (favRecipes.length === 0) {
        if (empty) empty.style.display = "block";
    } else {
        if (empty) empty.style.display = "none";
        favRecipes.forEach((r, i) => {
            const card = createRecipeCard(r);
            card.style.animationDelay = `${i * 0.06}s`;
            grid.appendChild(card);
        });
    }
}
     
// PHẦN 6: TÍNH NĂNG GIỎ ĐI CHỢ TỰ ĐỘNG (SHOPPING CART)
     
function saveCartData() {
    localStorage.setItem("bepviet_cart", JSON.stringify(shoppingCart));
    localStorage.setItem("bepviet_purchased", JSON.stringify(purchasedItems));
}

// Thuật toán gộp nguyên liệu (Ví dụ: "100g thịt" + "200g thịt" = "300g thịt")
function getMergedCart() {
    const merged = {};
    const unmergeable = new Set();

    shoppingCart.forEach(item => {
        let text = item.trim().toLowerCase();
        // Regex tách số lượng và tên nguyên liệu
        const match = text.match(/^([\d.,]+)\s*(.*)$/);

        if (match) {
            let amount = parseFloat(match[1].replace(',', '.')); 
            let itemName = match[2].trim();
            merged[itemName] = (merged[itemName] || 0) + amount;
        } else {
            if (text !== "") unmergeable.add(text);
        }
    });

    let result = [];
    for (let name in merged) {
        let total = Number.isInteger(merged[name]) ? merged[name] : parseFloat(merged[name].toFixed(2));
        let space = /^(g|kg|ml|l|mg)\b/i.test(name) ? "" : " ";
        let str = `${total}${space}${name}`;
        result.push(str.charAt(0).toUpperCase() + str.slice(1));
    }
    unmergeable.forEach(name => result.push(name.charAt(0).toUpperCase() + name.slice(1)));
    return result;
}

function updateCartBadge() {
    const badge = document.getElementById("cartBadge");
    if (!badge) return;
    
    let mergedList = getMergedCart();
    let remainingCount = mergedList.filter(ing => !purchasedItems.includes(ing)).length;

    badge.style.display = remainingCount > 0 ? "inline-block" : "none";
    badge.innerText = remainingCount;
}

// Gắn nút "Thêm vào giỏ" trong Modal chi tiết món ăn
function injectGroceryButton(recipe) {
    currentRecipeContext = recipe;
    const modalMeta = document.querySelector(".modal-meta");
    if (modalMeta && !document.getElementById("btn-add-grocery-chip")) {
        modalMeta.insertAdjacentHTML('beforeend', `
            <div class="meta-chip" id="btn-add-grocery-chip" style="cursor: pointer; color: #4caf50; font-weight: bold; border-color: #4caf50; transition: 0.2s;" onclick="addToGroceryList()">
                🛒 Thêm vào giỏ
            </div>
        `);
    }
}

function quickAddToCart(id, event) {
    if (event) event.stopPropagation(); 
    const recipe = RECIPES.find(r => r.id == id);
    if (!recipe || !recipe.ingredients) return showToast("❌ Món này chưa có dữ liệu nguyên liệu!");
    
    shoppingCart = [...shoppingCart, ...recipe.ingredients];
    saveCartData(); 
    updateCartBadge(); 
    showToast(`🛒 Đã nhặt nguyên liệu món ${recipe.name} vào giỏ!`);
}

function addToGroceryList() {
    if (!currentRecipeContext || !currentRecipeContext.ingredients) return;
    shoppingCart = [...shoppingCart, ...currentRecipeContext.ingredients];
    saveCartData(); 
    updateCartBadge(); 
    showToast(`🛒 Đã thêm nguyên liệu món ${currentRecipeContext.name} vào giỏ!`);
}

// Cập nhật trạng thái "Đã mua" (gạch ngang)
function togglePurchase(checkbox, ingredient) {
    if (checkbox.checked) {
        purchasedItems.push(ingredient);
        checkbox.parentElement.style.opacity = '0.4';
        checkbox.parentElement.style.textDecoration = 'line-through';
    } else {
        purchasedItems = purchasedItems.filter(item => item !== ingredient);
        checkbox.parentElement.style.opacity = '1';
        checkbox.parentElement.style.textDecoration = 'none';
    }
    saveCartData(); 
    updateCartBadge(); 
}

function openShoppingList() {
    if (shoppingCart.length === 0) return alert("🛒 Giỏ đi chợ đang trống! Bạn hãy chọn món để nấu nhé.");
    
    let mergedList = getMergedCart(); 
    let listHTML = mergedList.map(ing => {
        const isBought = purchasedItems.includes(ing);
        return `
        <label style="display: flex; align-items: center; padding: 12px; border-bottom: 1px solid #eee; cursor: pointer; transition: 0.2s; opacity: ${isBought ? '0.4' : '1'}; text-decoration: ${isBought ? 'line-through' : 'none'};">
            <input type="checkbox" ${isBought ? 'checked' : ''} style="width: 20px; height: 20px; margin-right: 15px; cursor: pointer; flex-shrink: 0;" onchange="togglePurchase(this, '${ing.replace(/'/g, "\\'")}')">
            <span style="font-size: 1.1rem; color: #333; word-break: break-word;">${ing}</span>
        </label>
        `;
    }).join("");

    window.closeShoppingModal = () => document.getElementById('shopModal')?.remove();

    let modalHTML = `
        <div id="shopModal" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); z-index: 9999; display: flex; justify-content: center; align-items: center; padding: 20px;">
            <div style="background: white; width: 100%; max-width: 500px; max-height: 85vh; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
                <div style="background: #4caf50; padding: 15px 20px; color: white; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="margin:0; font-size: 1.4rem;">🛒 Checklist Đi Siêu Thị</h2>
                    <button onclick="closeShoppingModal()" style="background:none; border:none; color:white; font-size:1.5rem; cursor:pointer;">✖</button>
                </div>
                <div style="padding: 15px 20px; overflow-y: auto; flex-grow: 1;">${listHTML}</div>
                <div style="padding: 15px 20px; border-top: 1px solid #eee;">
                    <button onclick="shoppingCart=[]; purchasedItems=[]; saveCartData(); updateCartBadge(); closeShoppingModal();" style="width: 100%; padding: 12px; background: #e53935; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 1rem;">
                        🗑️ Xóa sạch Giỏ đi chợ
                    </button>
                </div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
}
     
// PHẦN 7: TỦ LẠNH CÒN GÌ NẤU NẤY (AI FRIDGE MATCHING)
     
function openFridgeModal() {
    let modalHTML = `
        <div id="fridgeModal" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); z-index: 9999; display: flex; justify-content: center; align-items: center; padding: 20px;">
            <div style="background: white; width: 100%; max-width: 500px; max-height: 85vh; display: flex; flex-direction: column; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3); animation: fadeIn 0.3s ease;">
                <div style="background: #2196f3; padding: 15px 20px; color: white; display: flex; justify-content: space-between; align-items: center;">
                    <h2 style="margin:0; font-size: 1.3rem;">🧊 Tủ lạnh có gì?</h2>
                    <button onclick="document.getElementById('fridgeModal').remove()" style="background:none; border:none; color:white; font-size:1.5rem; cursor:pointer;">✖</button>
                </div>
                <div style="padding: 20px; border-bottom: 1px solid #eee; flex-shrink: 0;">
                    <p style="margin-top: 0; color: #555; margin-bottom: 15px; font-size: 0.95rem; line-height: 1.5;">Hãy nhập nguyên liệu bạn đang có (cách nhau bằng dấu phẩy). Trợ lý AI sẽ quét và tìm món phù hợp nhất!</p>
                    <input type="text" id="fridgeInput" placeholder="VD: trứng, cà chua, hành lá..." style="width: 100%; padding: 12px; border: 2px solid #e3f2fd; border-radius: 8px; font-size: 1rem; box-sizing: border-box; margin-bottom: 15px; outline: none;" onfocus="this.style.borderColor='#2196f3'" onblur="this.style.borderColor='#e3f2fd'" onkeypress="if(event.key === 'Enter') executeFridgeSearch()">
                    <button onclick="executeFridgeSearch()" style="width: 100%; padding: 12px; background: #2196f3; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; font-size: 1.05rem;">🔍 Tìm món ngay</button>
                </div>
                <div id="fridgeResults" style="padding: 0; overflow-y: auto; flex-grow: 1; background: #f9f9f9;"></div>
            </div>
        </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    setTimeout(() => document.getElementById('fridgeInput').focus(), 100);
}

function executeFridgeSearch() {
    let input = document.getElementById("fridgeInput").value;
    const resultsContainer = document.getElementById("fridgeResults");

    if (!input.trim()) {
        resultsContainer.innerHTML = `<div style="padding: 20px; text-align: center; color: #e53935; font-weight: bold;">❌ Bạn chưa nhập nguyên liệu nào!</div>`;
        return;
    }
    
    let userIngs = input.toLowerCase().split(',').map(i => i.trim()).filter(i => i !== "");
    resultsContainer.innerHTML = `<div style="padding: 30px; text-align: center; color: #888;">⏳ Đang lục lọi tủ lạnh...</div>`;
    
    setTimeout(() => {
        let matchedRecipes = RECIPES.filter(r => {
            if (!r.ingredients) return false;
            let recipeIngs = r.ingredients.join(' ').toLowerCase();
            let matchCount = 0;
            userIngs.forEach(ui => { if (recipeIngs.includes(ui)) matchCount++; });
            r.matchScore = matchCount; 
            return matchCount > 0;
        });

        if (matchedRecipes.length > 0) {
            matchedRecipes.sort((a, b) => b.matchScore - a.matchScore);
            
            let resultHTML = `<div style="padding: 10px 20px; background: #e3f2fd; color: #1565c0; font-weight: bold; font-size: 0.9rem; border-bottom: 1px solid #bbdefb; position: sticky; top: 0; z-index: 10;">🧊 Tìm thấy ${matchedRecipes.length} món phù hợp:</div>`;
            resultHTML += matchedRecipes.map(recipe => {
                const thumbImage = recipe.image ? `http://localhost:3001/uploads/${recipe.image}` : (typeof THUMB_IMAGES !== 'undefined' && THUMB_IMAGES[recipe.id] ? THUMB_IMAGES[recipe.id] : "https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=200&auto=format&fit=crop");
                return `
                <div onclick="document.getElementById('fridgeModal').remove(); openRecipeModal(${recipe.id})" style="display: flex; gap: 15px; padding: 15px 20px; border-bottom: 1px solid #eee; cursor: pointer; transition: 0.2s; background: white;" onmouseover="this.style.background='#f0f8ff'" onmouseout="this.style.background='white'">
                    <img src="${thumbImage}" style="width: 80px; height: 80px; object-fit: cover; border-radius: 8px;">
                    <div style="flex-grow: 1; display: flex; flex-direction: column; justify-content: center;">
                        <h3 style="margin: 0 0 5px 0; font-size: 1.1rem; color: #333;">${recipe.name}</h3>
                        <div style="font-size: 0.85rem; color: #666; margin-bottom: 5px;">⭐ Trùng khớp: <b style="color: #4caf50;">${recipe.matchScore} nguyên liệu</b></div>
                        <div style="font-size: 0.8rem; color: #888;">⏱️ ${recipe.time} • 🍽️ ${recipe.servings} người</div>
                    </div>
                </div>`;
            }).join("");
            resultsContainer.innerHTML = resultHTML;
        } else {
            resultsContainer.innerHTML = `
                <div style="padding: 40px 20px; text-align: center; color: #666;">
                    <div style="font-size: 3rem; margin-bottom: 10px;">🍳</div>
                    <div style="font-size: 1.1rem; font-weight: bold; color: #e53935;">Không tìm thấy món nào!</div>
                    <div style="font-size: 0.9rem; margin-top: 5px;">Hãy thử nhập ít nguyên liệu hơn.</div>
                </div>`;
        }
    }, 300); 
}
     
// PHẦN 8: ĐỒNG HỒ THÔNG MINH & CHẾ ĐỘ NẤU BẾP (FOCUS MODE)
     
function injectSmartTimers() {
    const stepList = document.querySelector(".step-list");
    if (!stepList) return;

    stepList.innerHTML = stepList.innerHTML.replace(/(\d+(?:-\d+)?)\s*(giờ|tiếng|phút|giây)(?:\s*(\d+)\s*(phút|giây))?/gi, (match, so1, donVi1, so2, donVi2) => {
        let tongGiay = 0;
        let soPhu1 = parseInt(so1.includes('-') ? so1.split('-')[1] : so1);

        let d1 = donVi1.toLowerCase();
        if (d1 === 'giờ' || d1 === 'tiếng') tongGiay += soPhu1 * 3600;
        else if (d1 === 'phút') tongGiay += soPhu1 * 60;
        else tongGiay += soPhu1;

        if (so2 && donVi2) {
            let d2 = donVi2.toLowerCase();
            let soPhu2 = parseInt(so2);
            if (d2 === 'phút') tongGiay += soPhu2 * 60;
            else if (d2 === 'giây') tongGiay += soPhu2;
        }

        return `<button class="smart-timer-btn" data-time="${tongGiay}" onclick="startSmartTimer(this)" style="background: #ff9800; color: white; border: none; padding: 2px 8px; border-radius: 12px; cursor: pointer; font-weight: bold; font-size: 0.9rem; margin: 0 4px;">⏳ ${match}</button>`;
    });
}

function startSmartTimer(btn) {
    if (btn.dataset.intervalId) {
        clearInterval(btn.dataset.intervalId);
        btn.innerHTML = `⏳ ${btn.dataset.originalText}`;
        btn.style.background = "#ff9800";
        delete btn.dataset.intervalId;
        return;
    }

    if (!btn.dataset.originalText) btn.dataset.originalText = btn.innerText.replace('⏳', '').trim();
    let remainingSeconds = parseInt(btn.dataset.time);
    btn.style.background = "#e53935"; 

    let interval = setInterval(() => {
        remainingSeconds--;
        let h = Math.floor(remainingSeconds / 3600);
        let m = Math.floor((remainingSeconds % 3600) / 60);
        let s = remainingSeconds % 60;
        
        btn.innerHTML = h > 0 ? `⏱️ ${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}` : `⏱️ ${m}:${s < 10 ? '0' : ''}${s}`;

        if (remainingSeconds <= 0) {
            clearInterval(interval);
            delete btn.dataset.intervalId;
            btn.innerHTML = `🔔 CHÍN RỒI!`;
            btn.style.background = "#4caf50"; 

            try {
                let speech = new SpeechSynthesisUtterance("Thời gian nấu đã hết, mời bạn kiểm tra món ăn!");
                speech.lang = 'vi-VN';
                window.speechSynthesis.speak(speech);
            } catch (e) {}

            setTimeout(() => {
                btn.innerHTML = `⏳ ${btn.dataset.originalText}`;
                btn.style.background = "#ff9800";
            }, 6000);
        }
    }, 1000);

    btn.dataset.intervalId = interval;
}

let focusSteps = [];
let currentStepIndex = 0;

function startFocusMode() {
    if (!currentRecipeContext || !currentRecipeContext.steps || currentRecipeContext.steps.length === 0) return alert("❌ Hãy mở xem một món ăn trước khi bật Chế độ Đứng bếp!");
    focusSteps = currentRecipeContext.steps;
    currentStepIndex = 0;
    renderFocusMode();
}

function closeFocusMode() { document.getElementById('focusModeOverlay')?.remove(); }
function nextFocusStep() { currentStepIndex++; renderFocusMode(); }
function prevFocusStep() { currentStepIndex--; renderFocusMode(); }

function renderFocusMode() {
    let focusOverlay = document.getElementById("focusModeOverlay");
    if (!focusOverlay) {
        focusOverlay = document.createElement("div");
        focusOverlay.id = "focusModeOverlay";
        focusOverlay.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: #1a1a1a; color: white; z-index: 100000; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; padding: 20px; box-sizing: border-box;";
        document.body.appendChild(focusOverlay);
    }

    const stepText = focusSteps[currentStepIndex];
    const isFirst = currentStepIndex === 0;
    const isLast = currentStepIndex === focusSteps.length - 1;

    focusOverlay.innerHTML = `
        <button onclick="closeFocusMode()" style="position: absolute; top: 20px; right: 20px; background: rgba(255,255,255,0.1); border: none; color: white; font-size: 1.5rem; width: 50px; height: 50px; border-radius: 50%; cursor: pointer;">✖</button>
        <div style="font-size: 1.2rem; color: #9c27b0; margin-bottom: 20px; font-weight: bold; letter-spacing: 2px;">BƯỚC ${currentStepIndex + 1} / ${focusSteps.length}</div>
        <div style="font-size: 2.2rem; line-height: 1.6; max-width: 900px; padding: 0 20px; font-weight: 500;">${stepText}</div>
        <div style="position: absolute; bottom: 0; left: 0; width: 100%; height: 25vh; display: flex;">
            <div onclick="${isFirst ? '' : 'prevFocusStep()'}" style="flex: 1; background: ${isFirst ? 'transparent' : 'rgba(255,255,255,0.05)'}; display: flex; justify-content: center; align-items: center; font-size: 4rem; cursor: ${isFirst ? 'default' : 'pointer'}; opacity: ${isFirst ? '0.2' : '1'};">👈</div>
            <div style="width: 2px; background: rgba(255,255,255,0.1);"></div>
            <div onclick="${isLast ? 'closeFocusMode()' : 'nextFocusStep()'}" style="flex: 1; background: rgba(255,255,255,0.05); display: flex; justify-content: center; align-items: center; font-size: 4rem; cursor: pointer;">${isLast ? '✅' : '👉'}</div>
        </div>
    `;
}

// PHẦN 9: MODAL & CÁC TIỆN ÍCH KHÁC (MODALS, TOAST, UTILS)

function openRecipeModal(id) {
    const recipe = RECIPES.find((r) => r.id === id);
    if (!recipe) return;

    const diffStars = { Dễ: "⭐", "Trung bình": "⭐⭐", Khó: "⭐⭐⭐" };
    const fav = isFavorite(id);
    const thumbImage = recipe.image ? `http://localhost:3001/uploads/${recipe.image}` : (typeof THUMB_IMAGES !== 'undefined' && THUMB_IMAGES[recipe.id] ? THUMB_IMAGES[recipe.id] : "https://images.unsplash.com/photo-1504674900247-0877df9cc836?q=80&w=800&auto=format&fit=crop");

    let ingredientHTML = (recipe.ingredients || []).filter(i => i.trim() !== "").map((ing) => `<li>${ing}</li>`).join("");
    let stepsHTML = (recipe.steps || []).filter(s => s.trim() !== "").map((step, i) => `<li class="step-item"><div class="step-num">${i + 1}</div><div class="step-text">${step}</div></li>`).join("");

    document.getElementById("modalBody").innerHTML = `
        <div class="modal-image" style="background-image: url('${thumbImage}');"></div>
        <div class="modal-category">${recipe.category} • ${recipe.region || "Đa vùng miền"}</div>
        <h2 class="modal-title">${recipe.name}</h2>
        ${recipe.desc ? `<p class="modal-desc">${recipe.desc}</p>` : ""}
        
        <div class="modal-meta">
            <div class="meta-chip">⏱️ ${recipe.time}</div>
            <div class="meta-chip">${diffStars[recipe.difficulty] || "⭐"} ${recipe.difficulty}</div>
            <div class="meta-chip">🍽️ ${recipe.servings} người</div>
            <div class="meta-chip">🔥 ${recipe.calories} kcal</div>
            <div class="meta-chip" id="modalFavBtn" style="cursor:pointer" onclick="toggleFavorite(${id})">
                ${fav ? "❤️ Đã yêu thích" : "🤍 Thêm yêu thích"}
            </div>
        </div>
        
        ${ingredientHTML ? `<h3 class="modal-section-title">🧂 Nguyên liệu</h3><ul class="ingredient-list">${ingredientHTML}</ul>` : ""}
        ${stepsHTML ? `<h3 class="modal-section-title">👨‍🍳 Cách thực hiện</h3><ul class="step-list">${stepsHTML}</ul>` : ""}
        ${recipe.tip ? `<h3 class="modal-section-title">💡 Mẹo hay</h3><div class="tip-box">💡 ${recipe.tip}</div>` : ""}
    `;
    
    injectGroceryButton(recipe);
    injectSmartTimers();

    const modalOverlay = document.getElementById("modalOverlay");
    modalOverlay.style.display = "flex"; 
    modalOverlay.classList.add("open");
    document.body.style.overflow = "hidden";
}

function closeRecipeModal() {
    const modalOverlay = document.getElementById('modalOverlay');
    if (modalOverlay) { modalOverlay.style.display = 'none'; modalOverlay.classList.remove('open'); }
    document.body.style.overflow = ''; 
    document.documentElement.style.overflow = ''; 
}

function showSection(sectionId) {
    ["home", "recipes", "favorites", "about"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = "none";
    });
    const target = document.getElementById(sectionId);
    if (target) { target.style.display = "block"; window.scrollTo({ top: 0, behavior: "smooth" }); }
    currentSection = sectionId;
    if (sectionId === "favorites") renderFavorites();
    document.getElementById("nav")?.classList.remove("open");
}

function scrollToSearch() {
    showSection("recipes");
    setTimeout(() => {
        document.getElementById("search-bar")?.scrollIntoView({ behavior: "smooth" });
        document.getElementById("searchInput")?.focus();
    }, 100);
}

function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 2500);
}

function updateStats() {
    const categories = [...new Set(RECIPES.map((r) => r.category))];
    animateCount("stat-recipes", RECIPES.length);
    animateCount("stat-categories", categories.length);
    animateCount("stat-favorites", getFavorites().length);
}

function animateCount(elementId, target) {
    const el = document.getElementById(elementId);
    if (!el) return;
    let current = 0;
    const step = Math.ceil(target / 30) || 1;
    const timer = setInterval(() => {
        current += step;
        if (current >= target) { current = target; clearInterval(timer); }
        el.textContent = current;
    }, 40);
}

function openConverterModal() {
    const html = `
    <div id="converterModal" style="position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); z-index: 9999; display: flex; justify-content: center; align-items: center; padding: 20px;">
        <div style="background: white; width: 100%; max-width: 400px; border-radius: 12px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">
            <div style="background: #ff9800; padding: 15px 20px; color: white; display: flex; justify-content: space-between; align-items: center;">
                <h2 style="margin:0; font-size: 1.3rem;">⚖️ Sổ Tay Đong Đếm</h2>
                <button onclick="document.getElementById('converterModal').remove()" style="background:none; border:none; color:white; font-size:1.5rem; cursor:pointer;">✖</button>
            </div>
            <div style="padding: 20px;">
                <h3 style="margin-top: 0; color: #333; font-size: 1.1rem; border-bottom: 2px solid #eee; padding-bottom: 5px;">Thìa & Cốc (Hệ Mỹ)</h3>
                <ul style="list-style: none; padding: 0; color: #555; line-height: 1.8; margin-bottom: 25px;">
                    <li>🥄 1 Muỗng cà phê (tsp) = <b>5 ml / 5 gram</b></li>
                    <li>🥄 1 Muỗng canh (tbsp) = <b>15 ml / 15 gram</b></li>
                    <li>☕ 1 Chén (Cup) = <b>240 ml / ~120g bột</b></li>
                    <li>💧 1 Ounce (oz) = <b>~30 ml</b></li>
                </ul>
                <h3 style="color: #333; font-size: 1.1rem; border-bottom: 2px solid #eee; padding-bottom: 5px;">Máy tính Nhiệt độ</h3>
                <div style="display: flex; gap: 10px; align-items: center; width: 100%; box-sizing: border-box;">
                    <input type="number" id="tempF" placeholder="Độ F" style="flex: 1; min-width: 0; padding: 12px; border: 2px solid #ffcc80; border-radius: 8px; font-size: 1rem; outline: none; text-align: center; box-sizing: border-box;" oninput="convertTemp('F', this.value)">
                    <span style="font-size: 1.5rem; color: #ff9800; flex-shrink: 0;">⇌</span>
                    <input type="number" id="tempC" placeholder="Độ C" style="flex: 1; min-width: 0; padding: 12px; border: 2px solid #ffcc80; border-radius: 8px; font-size: 1rem; outline: none; text-align: center; box-sizing: border-box;" oninput="convertTemp('C', this.value)">
                </div>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
}

function convertTemp(type, value) {
    if (!value) { document.getElementById('tempF').value = ''; document.getElementById('tempC').value = ''; return; }
    if (type === 'F') document.getElementById('tempC').value = Math.round((value - 32) * 5 / 9);
    else document.getElementById('tempF').value = Math.round((value * 9 / 5) + 32);
}

function toggleFabMenu() {
    const items = document.querySelectorAll('.fab-item');
    const mainBtn = document.getElementById('mainFabBtn');
    if (!items.length || !mainBtn) return;
    
    const isOpen = items[0].style.opacity === '1';
    if (isOpen) {
        mainBtn.style.transform = 'rotate(0deg)';
        items.forEach((item, index) => {
            item.style.opacity = '0';
            item.style.transform = `translateY(${(index + 1) * 20}px) scale(0.5)`;
            item.style.pointerEvents = 'none';
        });
    } else {
        mainBtn.style.transform = 'rotate(360deg)';
        items.forEach(item => {
            item.style.opacity = '1';
            item.style.transform = 'translateY(0) scale(1)';
            item.style.pointerEvents = 'auto';
        });
    }
}

let placeholderIdx = 0, charIdx = 0, isDeletingPlaceholder = false;
const searchPlaceholders = [
    "Tìm kiếm 'Nước ép dưa hấu'...", "Tìm kiếm 'Mì Quảng Tôm Thịt'...", 
    "Tìm kiếm 'Phở bò Hà Nội'...", "Hôm nay bạn muốn ăn gì?..."
];
function animateSearchPlaceholder() {
    const input = document.getElementById('searchInput');
    if (!input) return;
    if (document.activeElement === input && input.value !== "") return setTimeout(animateSearchPlaceholder, 1000);

    const currentWord = searchPlaceholders[placeholderIdx];
    input.placeholder = isDeletingPlaceholder ? currentWord.substring(0, charIdx - 1) : currentWord.substring(0, charIdx + 1);
    charIdx += isDeletingPlaceholder ? -1 : 1;

    let typeSpeed = isDeletingPlaceholder ? 40 : 100;
    if (!isDeletingPlaceholder && charIdx === currentWord.length) { typeSpeed = 2000; isDeletingPlaceholder = true; }
    else if (isDeletingPlaceholder && charIdx === 0) { isDeletingPlaceholder = false; placeholderIdx = (placeholderIdx + 1) % searchPlaceholders.length; typeSpeed = 500; }
    setTimeout(animateSearchPlaceholder, typeSpeed);
}

async function subscribeNewsletter() {
    const emailInput = document.getElementById('subEmail');
    const email = emailInput.value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alert('❌ Email không đúng định dạng!');

    try {
        const res = await fetch('http://localhost:3001/api/subscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
        const data = await res.json();
        alert(res.ok ? '✅ ' + data.message : '❌ Lỗi: ' + data.error);
        if (res.ok) emailInput.value = '';
    } catch (err) { alert('❌ Lỗi kết nối tới máy chủ!'); }
}