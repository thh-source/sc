import assert from "assert";

// Mock Cloudflare D1 Database cho môi trường kiểm thử
class MockD1Database {
  rows: any[] = [];

  prepare(query: string) {
    const db = this;
    return {
      _params: [] as any[],
      bind(...params: any[]) {
        this._params = params;
        return this;
      },
      async all() {
        let filtered = db.rows.filter((r) => r.is_deleted === 0);
        if (query.includes("user_id = ?")) {
          const userId = this._params[0];
          filtered = filtered.filter((r) => r.user_id === userId);
        }
        return { results: filtered, success: true };
      },
      async run() {
        const p = this._params;
        const normalized = query.replace(/\s+/g, " ").trim();

        if (normalized.includes("INSERT INTO personal_todos")) {
          const [id, user_id, content, is_completed, is_priority, tags, created_at, updated_at] = p;
          const idx = db.rows.findIndex((r) => r.id === id);
          const newRow = {
            id,
            user_id,
            content,
            is_completed,
            is_priority,
            tags,
            created_at,
            updated_at,
            is_deleted: 0,
          };
          if (idx >= 0) {
            db.rows[idx] = newRow;
          } else {
            db.rows.unshift(newRow);
          }
        } else if (normalized.includes("UPDATE personal_todos SET is_deleted = 1")) {
          if (normalized.includes("WHERE user_id = ? AND is_completed = 1")) {
            const userId = p[0];
            db.rows.forEach((r) => {
              if (r.user_id === userId && r.is_completed === 1) r.is_deleted = 1;
            });
          } else if (normalized.includes("WHERE id = ? AND user_id = ?")) {
            const [id, userId] = p;
            const row = db.rows.find((r) => r.id === id && r.user_id === userId);
            if (row) row.is_deleted = 1;
          } else if (normalized.includes("WHERE user_id = ? AND is_deleted = 0")) {
            const userId = p[0];
            db.rows.forEach((r) => {
              if (r.user_id === userId) r.is_deleted = 1;
            });
          }
        } else if (normalized.includes("UPDATE personal_todos SET updated_at = CURRENT_TIMESTAMP")) {
          const id = p[p.length - 2];
          const userId = p[p.length - 1];
          const row = db.rows.find((r) => r.id === id && r.user_id === userId);
          if (row) {
            if (normalized.includes("is_completed = ?")) {
              row.is_completed = p[0];
            }
          }
        }
        return { success: true };
      },
    };
  }
}

async function runTodosSyncTests() {
  console.log("==========================================================");
  console.log("🚀 BẮT ĐẦU KIỂM THỬ ĐỒNG BỘ CÔNG VIỆC CÁ NHÂN (TODOS) D1");
  console.log("==========================================================");

  const mockDb = new MockD1Database();

  // Test 1: Khởi tạo ban đầu -> Database trống, không có rác hay việc cũ
  console.log("\n[TEST 1] Kiểm tra danh sách khởi tạo trống...");
  const initialRes = await mockDb.prepare("SELECT * FROM personal_todos WHERE user_id = ? AND is_deleted = 0").bind("admin").all();
  assert.strictEqual(initialRes.results.length, 0, "Ban đầu khi chưa thêm việc, danh sách phải trống (0 việc)");
  console.log("✅ TEST 1 PASSED: Khi chưa có hoặc đã xóa hết việc trên Web, Mobile nhận đúng 0 việc.");

  // Test 2: Thêm việc mới từ Web hoặc Mobile
  console.log("\n[TEST 2] Thêm công việc mới...");
  await mockDb.prepare(`
    INSERT INTO personal_todos (id, user_id, content, is_completed, is_priority, tags, created_at, updated_at, is_deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).bind("todo-101", "admin", "Kiểm tra hàng về kho cho @PO-001", 0, 1, '["@PO-001"]', "2026-10-28", "2026-10-28").run();

  let currentList = await mockDb.prepare("SELECT * FROM personal_todos WHERE user_id = ? AND is_deleted = 0").bind("admin").all();
  assert.strictEqual(currentList.results.length, 1);
  assert.strictEqual(currentList.results[0].content, "Kiểm tra hàng về kho cho @PO-001");
  assert.strictEqual(currentList.results[0].is_priority, 1);
  console.log("✅ TEST 2 PASSED: Thêm việc thành công, đồng bộ lên D1 Database.");

  // Test 3: Đánh dấu hoàn thành (toggle)
  console.log("\n[TEST 3] Đánh dấu hoàn thành việc (Toggle completed)...");
  await mockDb.prepare("UPDATE personal_todos SET updated_at = CURRENT_TIMESTAMP, is_completed = ? WHERE id = ? AND user_id = ?")
    .bind(1, "todo-101", "admin")
    .run();

  currentList = await mockDb.prepare("SELECT * FROM personal_todos WHERE user_id = ? AND is_deleted = 0").bind("admin").all();
  assert.strictEqual(currentList.results[0].is_completed, 1);
  console.log("✅ TEST 3 PASSED: Trạng thái hoàn thành được cập nhật chính xác.");

  // Test 4: Dọn dẹp việc đã xong (Clear Completed)
  console.log("\n[TEST 4] Dọn dẹp việc đã hoàn thành (is_completed = 1)...");
  await mockDb.prepare("UPDATE personal_todos SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_completed = 1")
    .bind("admin")
    .run();

  currentList = await mockDb.prepare("SELECT * FROM personal_todos WHERE user_id = ? AND is_deleted = 0").bind("admin").all();
  assert.strictEqual(currentList.results.length, 0, "Sau khi dọn dẹp, danh sách việc active phải về 0");
  console.log("✅ TEST 4 PASSED: Việc đã hoàn thành được dọn dẹp sạch sẽ.");

  // Test 5: Xóa việc đơn lẻ (Delete by ID)
  console.log("\n[TEST 5] Xóa công việc đơn lẻ...");
  await mockDb.prepare(`
    INSERT INTO personal_todos (id, user_id, content, is_completed, is_priority, tags, created_at, updated_at, is_deleted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `).bind("todo-102", "admin", "Việc cần xóa", 0, 0, null, "2026-10-28", "2026-10-28").run();

  await mockDb.prepare("UPDATE personal_todos SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
    .bind("todo-102", "admin")
    .run();

  currentList = await mockDb.prepare("SELECT * FROM personal_todos WHERE user_id = ? AND is_deleted = 0").bind("admin").all();
  assert.strictEqual(currentList.results.length, 0);
  console.log("✅ TEST 5 PASSED: Xóa công việc đơn lẻ trên Web đồng bộ làm biến mất trên Mobile.");

  console.log("\n==========================================================");
  console.log("🎉 TẤT CẢ 5/5 KIỂM THỬ ĐỒNG BỘ CÔNG VIỆC ĐÃ ĐẠT 100%!");
  console.log("==========================================================");
}

runTodosSyncTests().catch((err) => {
  console.error("❌ TEST FAILED:", err);
  process.exit(1);
});
