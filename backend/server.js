// 0. NẠP BIẾN MÔI TRƯỜNG TỪ FILE .env
require('dotenv').config();

// 1. IMPORT THƯ VIỆN & CẤU HÌNH APP
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();

// Lấy cổng PORT từ file .env. Nếu trong .env không ghi gì thì mặc định chạy 3001
const PORT = process.env.PORT || 3001;

// Middleware xử lý CORS và JSON
app.use(cors());
app.use(express.json());

// 2. CẤU HÌNH UPLOAD ẢNH (MULTER)
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Mở thư mục uploads để Frontend có thể lấy ảnh
app.use('/uploads', express.static(uploadDir));
   
// 3. KẾT NỐI & KHỞI TẠO DATABASE (SQLITE)
const dbPath = path.join(__dirname, 'bepviet.db'); // Neo cứng đường dẫn vào thư mục backend
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error("❌ Lỗi kết nối DB:", err.message);
    } else {
        console.log('✅ Đã kết nối với CSDL SQLite (bepviet.db).');
        
        // 🔒 KÍCH HOẠT KHÓA NGOẠI (FOREIGN KEYS)
        db.run("PRAGMA foreign_keys = ON;", (err) => {
            if (err) console.error("❌ Không thể kích hoạt Foreign Key:", err.message);
            else console.log("🔒 Đã kích hoạt ràng buộc khóa ngoại hệ thống.");
        });
    }
});

// KHỞI TẠO CẤU TRÚC BẢNG (ER MODEL)
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS Categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS Recipes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        category_id INTEGER,
        menu_type TEXT DEFAULT 'Mặn', 
        difficulty TEXT,
        time TEXT,
        servings INTEGER,
        calories INTEGER,
        region TEXT,
        desc TEXT,
        tip TEXT,
        image TEXT,
        is_featured INTEGER DEFAULT 0,
        FOREIGN KEY (category_id) REFERENCES Categories(id) ON DELETE SET NULL
    )`);
    
    db.run("ALTER TABLE Recipes ADD COLUMN is_featured INTEGER DEFAULT 0", (err) => { });

    db.run(`CREATE TABLE IF NOT EXISTS Recipe_Ingredients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id INTEGER,
        ingredient_text TEXT NOT NULL,
        FOREIGN KEY (recipe_id) REFERENCES Recipes(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS Recipe_Steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        recipe_id INTEGER,
        step_num INTEGER,
        step_text TEXT NOT NULL,
        FOREIGN KEY (recipe_id) REFERENCES Recipes(id) ON DELETE CASCADE
    )`);
    
    db.run(`CREATE TABLE IF NOT EXISTS Subscribers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS Users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT DEFAULT 'Member',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // DỮ LIỆU MẶC ĐỊNH BAN ĐẦU
    db.get("SELECT COUNT(*) as count FROM Users", (err, row) => {
        if (row && row.count === 0) {
            db.run(`INSERT INTO Users (username, password, role) VALUES ('admin', 'bepviet2026', 'Admin')`);
            console.log("🔑 Đã khởi tạo tài khoản Admin mặc định");
        }
    });

    const defaultCategories = ['Canh', 'Xào', 'Cơm', 'Luộc', 'Nướng', 'Tráng miệng', 'Trà', 'Sinh tố & Nước ép', 'Cà phê', 'Nước pha chế khác'];
    defaultCategories.forEach(cat => {
        db.run(`INSERT OR IGNORE INTO Categories (name) VALUES (?)`, [cat]);
    });
});
   
// 4. API ENDPOINTS - LẤY DỮ LIỆU (GET)
app.get('/api/recipes', (req, res) => {
    const recipesSql = `
        SELECT r.*, c.name as category 
        FROM Recipes r
        LEFT JOIN Categories c ON r.category_id = c.id
        ORDER BY r.id DESC
    `;

    db.all(recipesSql, [], (err, recipes) => {
        if (err) return res.status(500).json({ error: err.message });
        if (recipes.length === 0) return res.json([]);

        db.all("SELECT * FROM Recipe_Ingredients", [], (err, allIngredients) => {
            if (err) return res.status(500).json({ error: err.message });

            db.all("SELECT * FROM Recipe_Steps ORDER BY recipe_id, step_num", [], (err, allSteps) => {
                if (err) return res.status(500).json({ error: err.message });

                const ingredientsMap = {};
                allIngredients.forEach(ing => {
                    if (!ingredientsMap[ing.recipe_id]) ingredientsMap[ing.recipe_id] = [];
                    ingredientsMap[ing.recipe_id].push(ing.ingredient_text);
                });

                const stepsMap = {};
                allSteps.forEach(step => {
                    if (!stepsMap[step.recipe_id]) stepsMap[step.recipe_id] = [];
                    stepsMap[step.recipe_id].push(step.step_text);
                });

                const formattedRecipes = recipes.map(row => ({
                    id: row.id,
                    name: row.name,
                    category: row.category || "Nước pha chế khác",
                    difficulty: row.difficulty,
                    time: row.time,
                    image: row.image,
                    desc: row.desc,
                    ingredients: ingredientsMap[row.id] || [],
                    steps: stepsMap[row.id] || [],
                    region: row.region || "Khắp nơi",
                    servings: row.servings || 1,
                    calories: row.calories || 0,
                    tip: row.tip || "",
                    menu_type: row.menu_type || "Mặn",
                    is_featured: row.is_featured || 0
                }));

                res.json(formattedRecipes);
            });
        });
    });
});

app.get('/api/dashboard-stats', (req, res) => {
    db.get("SELECT COUNT(*) as count FROM Recipes", [], (err, row1) => {
        db.get("SELECT COUNT(*) as count FROM Subscribers", [], (err, row2) => {
            res.json({
                totalRecipes: row1 ? row1.count : 0,
                totalSubscribers: row2 ? row2.count : 0
            });
        });
    });
});
   
// 5. API ENDPOINTS - THÊM DỮ LIỆU (POST)
app.post('/api/recipes', upload.single('image'), (req, res) => {
    const { name, category, difficulty, time, servings, calories, region, desc, ingredients, steps, tip, menu_type } = req.body;
    
    let ingredientsArray = [], stepsArray = [];
    try {
        ingredientsArray = JSON.parse(ingredients || "[]");
        stepsArray = JSON.parse(steps || "[]");
    } catch(e) {
        ingredientsArray = Array.isArray(ingredients) ? ingredients : [];
        stepsArray = Array.isArray(steps) ? steps : [];
    }

    // TỐI ƯU: Chỉ lưu tên file, không lưu localhost
    const imageUrl = req.file ? req.file.filename : '';

    db.get("SELECT id FROM Categories WHERE name = ?", [category], (err, catRow) => {
        if (err) return res.status(500).json({ error: err.message });
        const category_id = catRow ? catRow.id : null;

        const recipeSql = `INSERT INTO Recipes (name, category_id, difficulty, time, servings, calories, region, desc, tip, image, menu_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        const recipeParams = [name, category_id, difficulty, time, servings, calories, region, desc, tip, imageUrl, menu_type];

        db.run(recipeSql, recipeParams, function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const recipeId = this.lastID;

            const stmtIng = db.prepare(`INSERT INTO Recipe_Ingredients (recipe_id, ingredient_text) VALUES (?, ?)`);
            ingredientsArray.forEach(ing => stmtIng.run(recipeId, ing));
            stmtIng.finalize();

            const stmtStep = db.prepare(`INSERT INTO Recipe_Steps (recipe_id, step_num, step_text) VALUES (?, ?, ?)`);
            stepsArray.forEach((step, index) => stmtStep.run(recipeId, index + 1, step));
            stmtStep.finalize();

            res.json({ id: recipeId, message: "Thêm món ăn hoàn chỉnh thành công!" });
        });
    });
});

app.post('/api/subscribe', (req, res) => {
    const { email } = req.body;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    
    if (!email || !emailRegex.test(email)) {
        return res.status(400).json({ error: 'Định dạng email không hợp lệ!' });
    }

    db.run(`INSERT INTO Subscribers (email) VALUES (?)`, [email], function(err) {
        if (err && err.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email đã đăng ký!' });
        res.json({ success: true, message: 'Đăng ký thành công!' });
    });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    
    db.get("SELECT * FROM Users WHERE username = ? AND password = ?", [username, password], (err, user) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!user) return res.status(401).json({ error: 'Sai tên đăng nhập hoặc mật khẩu!' });
        
        res.json({ 
            success: true, 
            message: 'Đăng nhập thành công!',
            user: { id: user.id, username: user.username, role: user.role } 
        });
    });
});
   
// 6. API ENDPOINTS - CẬP NHẬT DỮ LIỆU (PUT)
app.put('/api/recipes/:id', upload.single('image'), (req, res) => {
    const recipeId = req.params.id;
    const { name, category, difficulty, time, servings, calories, region, desc, ingredients, steps, tip, menu_type } = req.body;
    
    let ingredientsArray = [], stepsArray = [];
    try {
        ingredientsArray = JSON.parse(ingredients || "[]");
        stepsArray = JSON.parse(steps || "[]");
    } catch(e) { }

    db.get("SELECT id FROM Categories WHERE name = ?", [category], (err, catRow) => {
        const category_id = catRow ? catRow.id : null;

        let recipeSql = `UPDATE Recipes SET name=?, category_id=?, difficulty=?, time=?, servings=?, calories=?, region=?, desc=?, tip=?, menu_type=?`;
        let recipeParams = [name, category_id, difficulty, time, servings, calories, region, desc, tip, menu_type];

        if (req.file) {
            recipeSql += `, image=?`;
            // TỐI ƯU: Chỉ lưu tên file khi cập nhật
            recipeParams.push(req.file.filename);
        }
        recipeSql += ` WHERE id=?`;
        recipeParams.push(recipeId);

        db.run(recipeSql, recipeParams, function(err) {
            if (err) return res.status(500).json({ error: err.message });

            db.run(`DELETE FROM Recipe_Ingredients WHERE recipe_id = ?`, recipeId, () => {
                const stmtIng = db.prepare(`INSERT INTO Recipe_Ingredients (recipe_id, ingredient_text) VALUES (?, ?)`);
                ingredientsArray.forEach(ing => stmtIng.run(recipeId, ing));
                stmtIng.finalize();
            });

            db.run(`DELETE FROM Recipe_Steps WHERE recipe_id = ?`, recipeId, () => {
                const stmtStep = db.prepare(`INSERT INTO Recipe_Steps (recipe_id, step_num, step_text) VALUES (?, ?, ?)`);
                stepsArray.forEach((step, idx) => stmtStep.run(recipeId, idx + 1, step));
                stmtStep.finalize();
            });

            res.json({ success: true, message: "Cập nhật món ăn thành công!" });
        });
    });
});

app.put('/api/recipes/:id/toggle-featured', (req, res) => {
    const recipeId = req.params.id;
    const newStatus = req.body.is_featured;

    db.run("UPDATE Recipes SET is_featured = ? WHERE id = ?", [newStatus, recipeId], function(err) {
        if (err) return res.status(500).json({ error: 'Lỗi cập nhật CSDL' });
        res.json({ success: true, message: 'Đã cập nhật trạng thái thịnh hành' });
    });
});
   
// 7. API ENDPOINTS - XÓA DỮ LIỆU (DELETE)
app.delete('/api/recipes/:id', (req, res) => {
    const id = req.params.id;
    db.run(`DELETE FROM Recipes WHERE id = ?`, id, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true, message: "Đã dọn dẹp món ăn và dữ liệu liên quan thành công!" });
    });
});
   
// 8. KHỞI ĐỘNG SERVER
app.listen(PORT, () => {
    console.log(` Backend quan hệ đã chạy tại cổng: ${PORT}`);
    
    setInterval(() => {
        console.log(" Server vẫn đang sống...");
    }, 3600000); 
});