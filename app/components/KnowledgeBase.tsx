import React, { useState, useMemo, useEffect } from "react";
import {
  BookOpen,
  Search,
  CheckCircle2,
  AlertTriangle,
  Lightbulb,
  ArrowRight,
  FileText,
  Scale,
  CheckSquare,
  Package,
  Truck,
  LayoutDashboard,
  Command,
  HelpCircle,
  X,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Copy,
  Printer,
  Upload,
  Download,
  Smartphone,
  Layers,
  Sparkles,
} from "lucide-react";
import { View } from "../types";

export interface GuideChapter {
  id: string;
  num: string;
  title: string;
  desc: string;
  icon: any;
  category: "flow" | "module" | "tools" | "support";
  keywords: string[];
}

export const GUIDE_CHAPTERS: GuideChapter[] = [
  {
    id: "flow",
    num: "Chương 1",
    title: "Tổng quan Luồng Mua sắm & 3 Nhánh Quy trình",
    desc: "Sơ đồ luồng khép kín 6 bước và 3 nhánh vận hành linh hoạt cho từng loại hàng hóa.",
    icon: Layers,
    category: "flow",
    keywords: ["luồng", "quy trình", "nhánh", "tổng quan", "flow", "end-to-end"],
  },
  {
    id: "pr",
    num: "Chương 2",
    title: "Phân hệ Yêu cầu Mua sắm (PR)",
    desc: "Cách tạo PR mới, chọn từ danh mục, dán danh sách từ Excel và gửi lấy báo giá.",
    icon: FileText,
    category: "module",
    keywords: ["pr", "yêu cầu mua hàng", "tạo pr", "danh mục", "phòng ban", "excel pr"],
  },
  {
    id: "compare",
    num: "Chương 3",
    title: "Phân hệ So sánh Báo giá (Price Comparison)",
    desc: "Nhập giá nhiều NCC, tự động tìm Best Price, thêm cột kỹ thuật và gom đơn vào Giỏ PO.",
    icon: Scale,
    category: "module",
    keywords: ["so sánh", "báo giá", "best price", "giá rẻ nhất", "vat", "giỏ po"],
  },
  {
    id: "approval",
    num: "Chương 4",
    title: "Phân hệ Đề nghị Phê duyệt (DNPD Chuẩn Phenikaa)",
    desc: "Mẹo Paste Excel nhiều dòng cực nhanh, cấu hình 2-4 NCC, in A4 Dọc/Ngang vừa khít trang.",
    icon: CheckSquare,
    category: "module",
    keywords: ["dnpd", "đề nghị phê duyệt", "paste excel", "in a4", "khổ ngang", "khổ dọc", "ô ký"],
  },
  {
    id: "po",
    num: "Chương 5",
    title: "Phân hệ Đơn Mua Hàng (PO - Purchase Order)",
    desc: "Tạo PO tự động theo mã NCC-Ngày, theo dõi giao hàng, tiến độ thanh toán và hồ sơ.",
    icon: Package,
    category: "module",
    keywords: ["po", "đơn mua hàng", "mã po", "giao hàng", "hồ sơ", "tiến độ po"],
  },
  {
    id: "mobile",
    num: "Chương 6",
    title: "Giao nhận Hiện trường trên Di động (Mobile UX)",
    desc: "Thủ kho kiểm đếm bằng nút tăng giảm (+/-), cảnh báo giao vượt và chụp ảnh biên bản.",
    icon: Smartphone,
    category: "module",
    keywords: ["mobile", "giao nhận", "thủ kho", "điện thoại", "kiểm đếm", "chụp ảnh", "ký nhận"],
  },
  {
    id: "dashboard",
    num: "Chương 7",
    title: "Trung tâm Điều hành Dashboard & Sổ tay To-Do",
    desc: "Hàng đợi việc gấp, cảnh báo đợt tiền tạm ứng và mẹo gắn tag @PO, #PR, @DNPD.",
    icon: LayoutDashboard,
    category: "tools",
    keywords: ["dashboard", "to-do", "hàng đợi", "tạm ứng", "dòng tiền", "smart tag"],
  },
  {
    id: "shortcuts",
    num: "Chương 8",
    title: "Bảng Phím tắt Toàn hệ thống & Mẹo Chuột",
    desc: "Tổng hợp phím tắt Ctrl+K tra cứu, Ctrl+V dán dữ liệu, kéo thả cột và phím điều hướng.",
    icon: Command,
    category: "tools",
    keywords: ["phím tắt", "shortcut", "ctrl k", "ctrl v", "esc", "kéo thả"],
  },
  {
    id: "faq",
    num: "Chương 9",
    title: "Câu hỏi Thường gặp & Xử lý Tình huống (FAQ)",
    desc: "Giải đáp các thắc mắc phổ biến về gộp PO, sửa giao nhận, in ấn và phân quyền.",
    icon: HelpCircle,
    category: "support",
    keywords: ["faq", "câu hỏi", "lỗi", "thắc mắc", "xử lý tình huống"],
  },
];

// --- MAIN FULL-PAGE KNOWLEDGE BASE VIEW ---
export function KnowledgeBase({
  onNavigate,
}: {
  onNavigate?: (route: { view: View; id?: number; prId?: number }) => void;
}) {
  const [activeId, setActiveId] = useState("flow");
  const [search, setSearch] = useState("");

  const filteredChapters = useMemo(() => {
    if (!search.trim()) return GUIDE_CHAPTERS;
    const q = search.toLowerCase();
    return GUIDE_CHAPTERS.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        c.desc.toLowerCase().includes(q) ||
        c.keywords.some((k) => k.includes(q)),
    );
  }, [search]);

  // Scroll to section when activeId changes
  const scrollToChapter = (id: string) => {
    setActiveId(id);
    const element = document.getElementById(`guide-sec-${id}`);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <section className="content guide-page">
      <div className="guide-container">
        {/* SIDEBAR TOC */}
        <aside className="guide-sidebar">
          <div className="guide-search-wrap">
            <Search size={14} className="guide-search-icon" />
            <input
              type="text"
              className="guide-search-input"
              placeholder="Tìm kiếm hướng dẫn..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <nav className="guide-toc-nav">
            {filteredChapters.map((ch) => {
              const Icon = ch.icon;
              return (
                <button
                  key={ch.id}
                  type="button"
                  className={`guide-toc-item ${activeId === ch.id ? "active" : ""}`}
                  onClick={() => scrollToChapter(ch.id)}
                >
                  <Icon size={15} />
                  <span>{ch.title}</span>
                  <span className="guide-toc-badge">{ch.num}</span>
                </button>
              );
            })}
          </nav>

          <div style={{ marginTop: "auto", paddingTop: "12px", borderTop: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "11px", color: "#64748b", lineHeight: "1.4" }}>
              💡 Bấm <kbd className="guide-kbd">Ctrl + K</kbd> bất kỳ lúc nào để tra cứu nhanh chứng từ.
            </div>
          </div>
        </aside>

        {/* READING PANE */}
        <main className="guide-content">
          {/* CHƯƠNG 1 */}
          <section id="guide-sec-flow" className="guide-chapter">
            <div className="chapter-header">
              <span className="chapter-badge">Chương 1 · Kiến trúc Quy trình</span>
              <h2 className="chapter-title">Tổng quan Luồng Mua sắm & 3 Nhánh Vận hành</h2>
              <p className="chapter-desc">
                Hệ thống Quản lý Mua hàng (SCMH) kết nối toàn diện từ khâu lập nhu cầu, khảo sát giá, phê duyệt tờ trình đến phát hành PO và kiểm đếm giao nhận.
              </p>
            </div>

            {/* Infographic Sơ đồ luồng */}
            <div className="guide-flowchart">
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", marginBottom: "10px" }}>
                Sơ đồ quy trình 6 bước khép kín:
              </div>
              <div className="flowchart-main">
                <div className="flow-step-box">
                  <span className="flow-step-num">Bước 1</span>
                  <span className="flow-step-label">Tạo PR</span>
                </div>
                <ArrowRight size={16} className="flow-arrow-icon" />
                <div className="flow-step-box">
                  <span className="flow-step-num">Bước 2</span>
                  <span className="flow-step-label">So sánh giá</span>
                </div>
                <ArrowRight size={16} className="flow-arrow-icon" />
                <div className="flow-step-box">
                  <span className="flow-step-num">Bước 3</span>
                  <span className="flow-step-label">Lập ĐNPD</span>
                </div>
                <ArrowRight size={16} className="flow-arrow-icon" />
                <div className="flow-step-box">
                  <span className="flow-step-num">Bước 4</span>
                  <span className="flow-step-label">Lãnh đạo duyệt</span>
                </div>
                <ArrowRight size={16} className="flow-arrow-icon" />
                <div className="flow-step-box">
                  <span className="flow-step-num">Bước 5</span>
                  <span className="flow-step-label">Phát hành PO</span>
                </div>
                <ArrowRight size={16} className="flow-arrow-icon" />
                <div className="flow-step-box">
                  <span className="flow-step-num">Bước 6</span>
                  <span className="flow-step-label">Nhận hàng</span>
                </div>
              </div>

              {/* 3 Nhánh vận hành linh hoạt */}
              <div className="flow-branches-grid">
                <div className="branch-card branch-primary">
                  <div className="branch-title">
                    <span style={{ color: "#2563eb" }}>●</span> Nhánh 1: Quy trình Chuẩn
                  </div>
                  <p className="branch-desc">
                    <b>PR ➔ So sánh giá ➔ Đề nghị Phê duyệt ➔ PO.</b> Áp dụng cho các gói mua sắm lớn, vật tư cơ điện hoặc dự án cần khảo sát giá từ 2-4 nhà cung cấp độc lập.
                  </p>
                </div>
                <div className="branch-card branch-accent">
                  <div className="branch-title">
                    <span style={{ color: "#059669" }}>●</span> Nhánh 2: Quy trình Rút gọn
                  </div>
                  <p className="branch-desc">
                    <b>PR ➔ Lập thẳng ĐNPD (bỏ qua so sánh) ➔ PO.</b> Dành cho các đơn hàng định kỳ đã có đơn giá khung hoặc nhà cung cấp độc quyền chỉ định sẵn.
                  </p>
                </div>
                <div className="branch-card branch-warning">
                  <div className="branch-title">
                    <span style={{ color: "#d97706" }}>●</span> Nhánh 3: Mua gấp / Độc lập
                  </div>
                  <p className="branch-desc">
                    <b>Tạo thẳng ĐNPD mới (Dán Excel) ➔ PO.</b> Dành cho trường hợp sự cố đột xuất; người dùng paste trực tiếp bảng chào giá Excel vào ĐNPD để trình ký ngay.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* CHƯƠNG 2 */}
          <section id="guide-sec-pr" className="guide-chapter">
            <div className="chapter-header">
              <span className="chapter-badge">Chương 2 · Khởi tạo Yêu cầu</span>
              <h2 className="chapter-title">Phân hệ Yêu cầu Mua sắm (PR)</h2>
              <p className="chapter-desc">
                Quản lý các đề xuất mua sắm từ các phòng ban, theo dõi trạng thái và chuyển sang bước khảo sát báo giá.
              </p>
            </div>

            <div className="guide-steps-list">
              <div className="guide-step-card">
                <span className="step-number-badge">1</span>
                <div className="step-details">
                  <h4>Khởi tạo phiếu PR mới</h4>
                  <p>
                    Vào menu <b>Yêu cầu mua sắm</b> hoặc bấm nút <b>[+] Tạo PR</b> trên thanh công cụ. Điền số PR, ngày lập và mục đích sử dụng.
                  </p>
                </div>
              </div>

              <div className="guide-step-card">
                <span className="step-number-badge">2</span>
                <div className="step-details">
                  <h4>Chọn Đơn vị / Phòng ban chuẩn hóa</h4>
                  <p>
                    Chọn từ danh sách 9 phòng ban chuẩn (TT ĐSH, QA, QC, RD, IT, Sản xuất, Cung ứng, Kế toán, Kho). Nếu phát sinh đơn vị mới, chọn mục <i>"＋ Thêm phòng ban mới..."</i> để lưu vĩnh viễn vào hệ thống.
                  </p>
                </div>
              </div>

              <div className="guide-step-card">
                <span className="step-number-badge">3</span>
                <div className="step-details">
                  <h4>3 Cách đưa hàng hóa vào PR</h4>
                  <p>
                    • <b>Từ danh mục:</b> Chọn sản phẩm từ kho danh mục và bấm <i>[+] Thêm vào PR</i>.<br />
                    • <b>Tạo mã mới:</b> Bấm <i>[+] Tạo hàng hóa mới</i>, hệ thống tự cấp mã <code>VT-xxx</code>.<br />
                    • <b>Nhập Excel:</b> Tải file mẫu <code>mau-nhap-danh-sach-hang-hoa-pr.xlsx</code>, điền dữ liệu và bấm <i>[⇧ Nhập Excel]</i>.
                  </p>
                </div>
              </div>
            </div>

            <div className="guide-alert tip">
              <Lightbulb size={18} style={{ flexShrink: 0 }} />
              <div>
                <strong>Mẹo thao tác nhanh:</strong> Bạn có thể copy một bảng danh sách gồm cột Tên hàng, ĐVT, Số lượng từ Excel và click chuột vào ô đầu tiên trên bảng PR bấm <kbd className="guide-kbd">Ctrl + V</kbd>. Bảng web sẽ tự động sinh dòng tương ứng!
              </div>
            </div>
          </section>

          {/* CHƯƠNG 3 */}
          <section id="guide-sec-compare" className="guide-chapter">
            <div className="chapter-header">
              <span className="chapter-badge">Chương 3 · Khảo sát Thị trường</span>
              <h2 className="chapter-title">Phân hệ So sánh Báo giá (Price Comparison)</h2>
              <p className="chapter-desc">
                Đánh giá đơn giá, năng lực của nhiều nhà cung cấp cạnh tranh và tự động tìm ra phương án tối ưu chi phí.
              </p>
            </div>

            <div className="guide-steps-list">
              <div className="guide-step-card">
                <span className="step-number-badge">1</span>
                <div className="step-details">
                  <h4>Chọn nhà cung cấp khảo sát</h4>
                  <p>
                    Bấm nút <b>[Users] Chọn NCC</b> để chọn các nhà cung cấp cần khảo sát giá từ danh bạ doanh nghiệp. Mỗi nhà cung cấp sẽ hiển thị thành 1 cột thẻ màu riêng biệt.
                  </p>
                </div>
              </div>

              <div className="guide-step-card">
                <span className="step-number-badge">2</span>
                <div className="step-details">
                  <h4>Nhập giá & Thêm tiêu chí đánh giá kỹ thuật</h4>
                  <p>
                    Điền đơn giá của từng NCC. Nếu cần thêm tiêu chí kỹ thuật (Xuất xứ, Thời gian giao, Thời hạn bảo hành), bấm nút <b>[+] Thêm cột NCC</b>.
                  </p>
                </div>
              </div>

              <div className="guide-step-card">
                <span className="step-number-badge">3</span>
                <div className="step-details">
                  <h4>Cơ chế Best Price tự động</h4>
                  <p>
                    Hệ thống sẽ tự động quét từng dòng hàng hóa và tô nền xanh ngọc <code>#f0fdf4</code> đi kèm biểu tượng tích <b>✓</b> ở nhà cung cấp có đơn giá rẻ nhất. Cột "Lựa chọn tốt nhất" hiển thị mức giá thắng cuộc cùng lịch sử giá mua gần nhất để tham chiếu.
                  </p>
                </div>
              </div>
            </div>

            <div className="guide-alert info">
              <Scale size={18} style={{ flexShrink: 0 }} />
              <div>
                <strong>Kế thừa dữ liệu 1-Click:</strong> Sau khi hoàn tất so sánh, bấm nút <b>[Check] Lập ĐNPD</b> trên thanh công cụ. Toàn bộ danh sách hàng hóa, giá dự toán và NCC thắng thầu sẽ được tự động chuyển sang mẫu Đề nghị phê duyệt.
              </div>
            </div>
          </section>

          {/* CHƯƠNG 4 */}
          <section id="guide-sec-approval" className="guide-chapter">
            <div className="chapter-header">
              <span className="chapter-badge">Chương 4 · Trình ký & Phê duyệt</span>
              <h2 className="chapter-title">Phân hệ Đề nghị Phê duyệt (DNPD Chuẩn Phenikaa)</h2>
              <p className="chapter-desc">
                Tờ trình đánh giá lựa chọn nhà cung cấp chuẩn mực tập đoàn, hỗ trợ cấu hình 2-4 NCC và in A4 vừa khít trang.
              </p>
            </div>

            <div className="guide-alert tip" style={{ borderColor: "#86efac", background: "#f0fdf4" }}>
              <Sparkles size={18} style={{ color: "#16a34a", flexShrink: 0 }} />
              <div>
                <strong style={{ color: "#15803d", fontSize: "13px" }}>MẸO PRO-TIP: DÁN TRỰC TIẾP TỪ EXCEL VÀO BIỂU MẪU ĐNPD</strong>
                <p style={{ margin: "4px 0 0", color: "#166534" }}>
                  1. Trong file Excel báo giá, quét chọn vùng dữ liệu (các cột Tên hàng, ĐVT, Số lượng, Đơn giá các NCC) và bấm <kbd className="guide-kbd">Ctrl + C</kbd>.<br />
                  2. Trên webapp ĐNPD, nhấp chuột vào ô đầu tiên của dòng muốn nhập và bấm <kbd className="guide-kbd">Ctrl + V</kbd>.<br />
                  3. Hệ thống sẽ tự động phân tách cột, tự động làm sạch số và tính toán tổng tiền chính xác 100%!
                </p>
              </div>
            </div>

            <div className="guide-steps-list">
              <div className="guide-step-card">
                <span className="step-number-badge">1</span>
                <div className="step-details">
                  <h4>Cấu hình số cột nhà cung cấp</h4>
                  <p>
                    Tùy theo số lượng báo giá thu thập được, chọn chế độ 2 NCC, 3 NCC hoặc 4 NCC. Tích chọn cột NCC được đề xuất lựa chọn.
                  </p>
                </div>
              </div>

              <div className="guide-step-card">
                <span className="step-number-badge">2</span>
                <div className="step-details">
                  <h4>Xử lý trường hợp NCC chào mã sản phẩm khác</h4>
                  <p>
                    Bật tùy chọn <i>"Hiển thị sản phẩm báo giá của NCC"</i> nếu NCC chào mã tương đương. Nếu NCC chào số lượng tách riêng, hệ thống tự động tính theo công thức: <code>Thành tiền = Đơn giá NCC * Số lượng NCC</code>.
                  </p>
                </div>
              </div>

              <div className="guide-step-card">
                <span className="step-number-badge">3</span>
                <div className="step-details">
                  <h4>Soạn thảo Điều khoản thương mại & Lý do lựa chọn</h4>
                  <p>
                    Nhập điều khoản thanh toán (Tạm ứng trước giao hàng, Thanh toán sau giao, Bảo lãnh bảo hành). Tích chọn các lý do đề xuất lựa chọn (Giá thấp nhất, Tiến độ giao nhanh nhất, Đáp ứng yêu cầu kỹ thuật...).
                  </p>
                </div>
              </div>

              <div className="guide-step-card">
                <span className="step-number-badge">4</span>
                <div className="step-details">
                  <h4>Xem & In ấn Bản in Chuẩn A4</h4>
                  <p>
                    Bấm <b>Xem bản in</b>. Chọn <b>Khổ Dọc (Portrait)</b> cho hồ sơ 2 NCC, hoặc <b>Khổ Ngang (Landscape)</b> cho hồ sơ 3-4 NCC. Sử dụng thanh trượt <i>"Độ cao khoảng trống ký"</i> để mở rộng khu vực ký tên đóng dấu của Ban Lãnh đạo.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* CHƯƠNG 5 */}
          <section id="guide-sec-po" className="guide-chapter">
            <div className="chapter-header">
              <span className="chapter-badge">Chương 5 · Hợp đồng & Đặt hàng</span>
              <h2 className="chapter-title">Phân hệ Đơn Mua Hàng (PO - Purchase Order)</h2>
              <p className="chapter-desc">
                Phát hành đơn đặt hàng chính thức, kiểm soát mã PO, tiến độ nhận hàng và theo dõi hồ sơ chứng từ thanh toán.
              </p>
            </div>

            <div className="guide-steps-list">
              <div className="guide-step-card">
                <span className="step-number-badge">1</span>
                <div className="step-details">
                  <h4>Tạo PO tự động theo mã chuẩn Phenikaa</h4>
                  <p>
                    Khi tờ trình ĐNPD được phê duyệt, bấm <b>Tạo PO</b>. Mã PO sẽ được tự động cấu trúc theo chuẩn: <code>[Mã NCC]-[Ngày-Tháng-Năm]</code> (Ví dụ: <code>MX-25102026</code>).
                  </p>
                </div>
              </div>

              <div className="guide-step-card">
                <span className="step-number-badge">2</span>
                <div className="step-details">
                  <h4>Gộp nhiều PR vào một PO duy nhất (Giỏ PO)</h4>
                  <p>
                    Nếu một nhà cung cấp thắng thầu nhiều mặt hàng ở các PR khác nhau, sử dụng chức năng <b>Giỏ PO (POCart)</b> để gom toàn bộ các mặt hàng đó và phát hành 1 đơn mua hàng duy nhất, giúp tiết kiệm chi phí vận chuyển và thủ tục hóa đơn.
                  </p>
                </div>
              </div>

              <div className="guide-step-card">
                <span className="step-number-badge">3</span>
                <div className="step-details">
                  <h4>Quản lý 4 tab nghiệp vụ trong chi tiết PO</h4>
                  <p>
                    • <b>Hàng hóa:</b> Quản lý đơn giá, thuế VAT 8% hoặc 10%, thành tiền.<br />
                    • <b>Giao hàng:</b> Nhật ký số lượng giao từng đợt, số còn nợ, người giao nhận.<br />
                    • <b>Thanh toán:</b> Đợt 1 (Tạm ứng trước giao), Đợt 2 (Thanh toán sau giao đủ).<br />
                    • <b>Hồ sơ:</b> Trạng thái Hóa đơn GTGT, Hợp đồng kinh tế, CO/CQ, Biên bản nghiệm thu.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* CHƯƠNG 6 */}
          <section id="guide-sec-mobile" className="guide-chapter">
            <div className="chapter-header">
              <span className="chapter-badge">Chương 6 · Vận hành Hiện trường</span>
              <h2 className="chapter-title">Giao nhận Hiện trường trên Di động (Mobile UX)</h2>
              <p className="chapter-desc">
                Giao diện tối ưu cảm ứng cho thủ kho, kỹ thuật viên nhà máy kiểm đếm và nhận hàng trực tiếp tại cửa kho.
              </p>
            </div>

            <div className="guide-steps-list">
              <div className="guide-step-card">
                <span className="step-number-badge">1</span>
                <div className="step-details">
                  <h4>Mở đơn PO trên điện thoại</h4>
                  <p>
                    Truy cập link PO trên trình duyệt điện thoại. Hệ thống tự động chuyển sang giao diện <b>Thẻ (Cards)</b> khổ lớn, chữ to rõ nét, phù hợp thao tác một tay ngoài kho bãi.
                  </p>
                </div>
              </div>

              <div className="guide-step-card">
                <span className="step-number-badge">2</span>
                <div className="step-details">
                  <h4>Kiểm đếm bằng nút tăng giảm (+ / -)</h4>
                  <p>
                    Chạm nút <b>[+]</b> hoặc <b>[-]</b> để tăng giảm số lượng thực nhận trong chuyến xe. Nếu hàng giao trọn gói đủ 100%, chạm nút <b>[Giao đủ]</b> để hệ thống tự điền số lượng còn thiếu.
                  </p>
                </div>
              </div>

              <div className="guide-step-card">
                <span className="step-number-badge">3</span>
                <div className="step-details">
                  <h4>Cảnh báo chống giao thừa & Chụp ảnh biên bản</h4>
                  <p>
                    Nếu vô tình nhập vượt quá số lượng đặt mua ban đầu, hệ thống sẽ báo đỏ và cảnh báo ngay lập tức. Sau khi kiểm đếm xong, thủ kho có thể dùng camera điện thoại chụp ảnh biên bản giao nhận và đính kèm vào đợt giao.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* CHƯƠNG 7 */}
          <section id="guide-sec-dashboard" className="guide-chapter">
            <div className="chapter-header">
              <span className="chapter-badge">Chương 7 · Giám sát & Năng suất</span>
              <h2 className="chapter-title">Trung tâm Điều hành Dashboard & Sổ tay To-Do</h2>
              <p className="chapter-desc">
                Màn hình làm việc thực chiến: phát hiện điểm nghẽn, cảnh báo dòng tiền và quản lý công việc cá nhân thông minh.
              </p>
            </div>

            <div className="guide-steps-list">
              <div className="guide-step-card">
                <span className="step-number-badge">1</span>
                <div className="step-details">
                  <h4>Hàng đợi Cần xử lý ngay (Action Items)</h4>
                  <p>
                    Theo dõi 3 tab việc gấp: <b>PR chờ báo giá</b> (bấm nút So sánh giá →), <b>ĐNPD chờ duyệt</b> (bấm nút Xem & Duyệt →) và <b>PO giao thiếu</b> (theo dõi tiến độ % nhận hàng).
                  </p>
                </div>
              </div>

              <div className="guide-step-card">
                <span className="step-number-badge">2</span>
                <div className="step-details">
                  <h4>Theo dõi Dòng tiền & Cảnh báo Tạm ứng</h4>
                  <p>
                    Bảng cảnh báo tự động phát hiện các PO có điều khoản <i>"Thanh toán trước khi giao hàng"</i> gắn nhãn đỏ <b>CẦN TT GẤP</b> để ưu tiên làm thủ tục chuyển khoản, tránh nhà cung cấp giữ hàng gây dừng sản xuất.
                  </p>
                </div>
              </div>

              <div className="guide-step-card">
                <span className="step-number-badge">3</span>
                <div className="step-details">
                  <h4>Sổ tay Công việc To-Do với Smart Tag Linking</h4>
                  <p>
                    Gõ việc cần làm trong ngày. Khi gõ <code>@PO-xxx</code>, <code>#PR-xxx</code> hoặc <code>@DNPD-xxx</code>, hệ thống sẽ tự động biến thành chip liên kết. Bấm chuột vào chip là màn hình sẽ nhảy thẳng tới đơn hàng hoặc phiếu phê duyệt tương ứng.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* CHƯƠNG 8 */}
          <section id="guide-sec-shortcuts" className="guide-chapter">
            <div className="chapter-header">
              <span className="chapter-badge">Chương 8 · Phím tắt & Mẹo Thần tốc</span>
              <h2 className="chapter-title">Bảng Phím tắt Toàn hệ thống & Thao tác Chuột</h2>
              <p className="chapter-desc">
                Các phím tắt và thao tác chuột tiện lợi giúp tối ưu hóa tốc độ làm việc hàng ngày của nhân viên mua hàng.
              </p>
            </div>

            <table className="shortcut-table">
              <thead>
                <tr>
                  <th style={{ width: "220px" }}>Phím tắt / Thao tác</th>
                  <th>Chức năng & Tác dụng</th>
                  <th style={{ width: "160px" }}>Phân hệ áp dụng</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><kbd className="guide-kbd">Ctrl + K</kbd> hoặc <kbd className="guide-kbd">Cmd + K</kbd></td>
                  <td>Mở cửa sổ Spotlight tìm kiếm tức thời bất kỳ PR, PO, ĐNPD, Nhà cung cấp hoặc Đề nghị thanh toán.</td>
                  <td>Toàn hệ thống</td>
                </tr>
                <tr>
                  <td><kbd className="guide-kbd">Ctrl + V</kbd></td>
                  <td>Dán ma trận dữ liệu từ Excel trực tiếp vào các bảng tính (Bảng PR, Bảng So sánh, Bảng ĐNPD).</td>
                  <td>PR, So sánh, ĐNPD</td>
                </tr>
                <tr>
                  <td><kbd className="guide-kbd">Esc</kbd></td>
                  <td>Đóng nhanh cửa sổ Spotlight, Modal chi tiết, hoặc Ngăn kéo trợ giúp [?].</td>
                  <td>Toàn hệ thống</td>
                </tr>
                <tr>
                  <td><kbd className="guide-kbd">Enter</kbd></td>
                  <td>Thêm nhanh một công việc mới trong widget To-Do List trên Dashboard.</td>
                  <td>Dashboard</td>
                </tr>
                <tr>
                  <td><b>Kéo thả tiêu đề cột</b></td>
                  <td>Nhấp giữ chuột vào tiêu đề cột và kéo sang trái/phải để hoán đổi vị trí hiển thị các cột.</td>
                  <td>Bảng So sánh & PR</td>
                </tr>
              </tbody>
            </table>
          </section>

          {/* CHƯƠNG 9 */}
          <section id="guide-sec-faq" className="guide-chapter">
            <div className="chapter-header">
              <span className="chapter-badge">Chương 9 · Hỗ trợ & Giải đáp</span>
              <h2 className="chapter-title">Câu hỏi Thường gặp & Xử lý Tình huống (FAQ)</h2>
              <p className="chapter-desc">
                Tập hợp các thắc mắc và câu hỏi thực tế thường gặp trong quá trình vận hành hệ thống.
              </p>
            </div>

            <div className="faq-grid">
              <div className="faq-card">
                <div className="faq-header">
                  <span>Q1: Làm sao để gom nhiều mặt hàng ở các PR khác nhau vào 1 PO duy nhất?</span>
                </div>
                <div className="faq-body">
                  <b>Trả lời:</b> Trong bảng So sánh giá, sau khi xác định được nhà cung cấp thắng thầu cho các mặt hàng, bạn tích chọn vào ô Giỏ PO ở đầu mỗi dòng. Hệ thống sẽ tích lũy các mặt hàng vào <b>Giỏ PO (POCart)</b>. Sau đó bấm vào Giỏ PO để xuất ra 1 đơn đặt hàng duy nhất cho nhà cung cấp đó.
                </div>
              </div>

              <div className="faq-card">
                <div className="faq-header">
                  <span>Q2: Khi xem bản in ĐNPD bị tràn chữ ký sang trang thứ 2 thì xử lý thế nào?</span>
                </div>
                <div className="faq-body">
                  <b>Trả lời:</b> Hãy chuyển đổi hướng in sang <b>Khổ Ngang (Landscape)</b> nếu bảng có từ 3 NCC trở lên. Ngoài ra, hãy kéo thanh trượt <i>"Độ cao khoảng trống ký"</i> xuống mức 80px - 100px để toàn bộ nội dung và khung ký thu gọn vừa khít trong đúng 1 trang A4.
                </div>
              </div>

              <div className="faq-card">
                <div className="faq-header">
                  <span>Q3: Nhập nhầm số lượng hàng đã nhận trên điện thoại thì chỉnh sửa thế nào?</span>
                </div>
                <div className="faq-body">
                  <b>Trả lời:</b> Mở chi tiết đơn hàng PO trên máy tính, chuyển sang tab <b>Giao nhận</b>. Tại bảng Nhật ký các đợt giao nhận, bạn có thể chỉnh sửa số lượng thực nhận của đợt giao đó hoặc xóa đợt giao nhầm để tiến hành kiểm đếm lại.
                </div>
              </div>

              <div className="faq-card">
                <div className="faq-header">
                  <span>Q4: Có thể chia sẻ đường link phiếu cho người khác xem mà không cần tài khoản không?</span>
                </div>
                <div className="faq-body">
                  <b>Trả lời:</b> Có. Bấm vào nút <b>"Tạo link theo dõi"</b> ở góc phải thanh menu đầu trang. Hệ thống sẽ sinh một đường dẫn công khai ở chế độ chỉ xem (Read-only Report Mode) để gửi cho đối tác hoặc các bộ phận liên quan xem tiến độ.
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </section>
  );
}

// --- CONTEXTUAL SLIDE-OVER DRAWER [?] ---
export function KnowledgeBaseDrawer({
  isOpen,
  onClose,
  initialTopic = "flow",
  onNavigate,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialTopic?: string;
  onNavigate?: (route: { view: View }) => void;
}) {
  const [topic, setTopic] = useState(initialTopic);

  useEffect(() => {
    if (initialTopic) setTopic(initialTopic);
  }, [initialTopic]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="guide-drawer-backdrop" onClick={onClose}>
      <div className="guide-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="guide-drawer-header">
          <div className="drawer-title-group">
            <BookOpen size={18} style={{ color: "#0284c7" }} />
            <h3>Sổ tay Vận hành & Hướng dẫn Nhanh</h3>
          </div>
          <button type="button" className="drawer-close-btn" onClick={onClose} title="Đóng (Esc)">
            <X size={16} />
          </button>
        </div>

        {/* Topic Selector Tabs */}
        <div style={{ display: "flex", gap: "4px", padding: "10px 16px", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", overflowX: "auto" }}>
          {GUIDE_CHAPTERS.map((ch) => (
            <button
              key={ch.id}
              type="button"
              className={`pill-btn ${topic === ch.id ? "active" : ""}`}
              onClick={() => setTopic(ch.id)}
              style={{ whiteSpace: "nowrap", fontSize: "11.5px" }}
            >
              {ch.num}: {ch.title.split("&")[0].split("(")[0].trim()}
            </button>
          ))}
        </div>

        <div className="guide-drawer-body">
          {/* TOPIC: PR */}
          {topic === "pr" && (
            <div>
              <span className="chapter-badge">Hướng dẫn Phân hệ PR</span>
              <h4 style={{ fontSize: "15px", fontWeight: 700, margin: "6px 0 10px" }}>Quy trình Tạo Yêu cầu Mua sắm</h4>
              <p style={{ fontSize: "12px", color: "#475569", lineHeight: "1.5" }}>
                1. Điền Số PR, Ngày và chọn Đơn vị yêu cầu.<br />
                2. Chọn hàng hóa từ kho danh mục hoặc bấm <b>[+] Tạo hàng hóa mới</b>.<br />
                3. Bấm <b>Lưu PR</b> để lưu trữ và chuyển sang bước lấy báo giá.
              </p>
              <div className="guide-alert tip">
                <Lightbulb size={16} />
                <span><b>Mẹo dán Excel:</b> Quét vùng dữ liệu Excel bấm Ctrl+C, click vào ô đầu tiên trên bảng PR và bấm Ctrl+V để nạp nhiều dòng.</span>
              </div>
            </div>
          )}

          {/* TOPIC: COMPARE */}
          {topic === "compare" && (
            <div>
              <span className="chapter-badge">Hướng dẫn So sánh Báo giá</span>
              <h4 style={{ fontSize: "15px", fontWeight: 700, margin: "6px 0 10px" }}>Đánh giá & Tìm giá rẻ nhất</h4>
              <p style={{ fontSize: "12px", color: "#475569", lineHeight: "1.5" }}>
                1. Bấm <b>[Users] Chọn NCC</b> để chọn các nhà cung cấp cần khảo sát.<br />
                2. Nhập đơn giá từng dòng. Hệ thống tự động tô màu xanh ngọc và tích <b>✓</b> ở giá tốt nhất.<br />
                3. Bấm <b>[Check] Lập ĐNPD</b> để kế thừa toàn bộ kết quả sang tờ trình phê duyệt.
              </p>
              <div className="guide-alert info">
                <span>Toggle nút <b>Trước VAT / Sau VAT</b> ở thanh công cụ để so sánh chính xác theo giá chưa thuế hoặc đã có thuế.</span>
              </div>
            </div>
          )}

          {/* TOPIC: APPROVAL */}
          {topic === "approval" && (
            <div>
              <span className="chapter-badge">Hướng dẫn Đề nghị Phê duyệt</span>
              <h4 style={{ fontSize: "15px", fontWeight: 700, margin: "6px 0 10px" }}>Tờ trình Phê duyệt Lựa chọn NCC</h4>
              <div className="guide-alert tip">
                <Sparkles size={16} style={{ color: "#16a34a" }} />
                <span><b>Paste Excel thần tốc:</b> Click vào ô đầu tiên của bảng và bấm <kbd className="guide-kbd">Ctrl + V</kbd>. Bảng web sẽ tự nhận diện số cột, tách dòng và tính tiền tự động!</span>
              </div>
              <p style={{ fontSize: "12px", color: "#475569", lineHeight: "1.5" }}>
                • Cấu hình 2-4 NCC và tích chọn NCC trúng thầu.<br />
                • Nhập điều khoản thanh toán & lý do lựa chọn.<br />
                • Bấm <b>Xem bản in</b> để in khổ Dọc hoặc khổ Ngang A4 chuẩn.
              </p>
            </div>
          )}

          {/* TOPIC: PO */}
          {topic === "po" && (
            <div>
              <span className="chapter-badge">Hướng dẫn Đơn Mua Hàng</span>
              <h4 style={{ fontSize: "15px", fontWeight: 700, margin: "6px 0 10px" }}>Phát hành & Theo dõi PO</h4>
              <p style={{ fontSize: "12px", color: "#475569", lineHeight: "1.5" }}>
                • Mã PO tự sinh chuẩn Phenikaa: <code>[Mã NCC]-[Ngày-Tháng-Năm]</code>.<br />
                • Theo dõi tiến độ giao nhận trong tab <b>Giao hàng</b>.<br />
                • Quản lý các đợt tạm ứng và thanh toán trong tab <b>Thanh toán</b>.<br />
                • Quản lý hóa đơn VAT, hợp đồng trong tab <b>Hồ sơ chứng từ</b>.
              </p>
            </div>
          )}

          {/* DEFAULT / FLOW */}
          {(topic === "flow" || topic === "dashboard" || topic === "shortcuts" || topic === "faq" || topic === "mobile") && (
            <div>
              <span className="chapter-badge">Kiến trúc Hệ thống</span>
              <h4 style={{ fontSize: "15px", fontWeight: 700, margin: "6px 0 10px" }}>Luồng Mua sắm 3 Nhánh</h4>
              <p style={{ fontSize: "12px", color: "#475569", lineHeight: "1.5" }}>
                1. <b>Quy trình Chuẩn:</b> PR ➔ So sánh giá ➔ Đề nghị Phê duyệt ➔ PO.<br />
                2. <b>Quy trình Rút gọn:</b> PR ➔ Lập thẳng ĐNPD (bỏ qua so sánh) ➔ PO.<br />
                3. <b>Mua sắm Gấp:</b> Tạo thẳng ĐNPD mới độc lập ➔ PO.
              </p>
              <div className="guide-alert tip">
                <Command size={16} />
                <span><b>Phím tắt:</b> Bấm <kbd className="guide-kbd">Ctrl + K</kbd> để tìm kiếm nhanh chứng từ ở bất kỳ đâu.</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="drawer-actions-bar">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              onClose();
              if (onNavigate) onNavigate({ view: "guide" });
            }}
          >
            <BookOpen size={14} /> Mở toàn bộ Cẩm nang
          </button>
          <button type="button" className="btn btn-primary btn-sm" onClick={onClose}>
            Đã hiểu & Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
