import React, { useState } from "react";
import {
  Home,
  FileText,
  Package,
  Truck,
  CreditCard,
  Building2,
  Tag,
  Search,
  Bell,
  CheckCircle2,
  Circle,
  Plus,
  ArrowRight,
  TrendingUp,
  Clock,
  AlertTriangle,
  X,
  Printer,
  ChevronRight,
  Building,
} from "lucide-react";

export type MisaScreen = "dashboard" | "po" | "approval" | "handover";

export function MisaPreview() {
  const [activeScreen, setActiveScreen] = useState<MisaScreen>("dashboard");
  const [approvalTab, setApprovalTab] = useState<"list" | "compare">("list");
  const [drawerPO, setDrawerPO] = useState<{
    number: string;
    supplier: string;
    total: string;
    status: string;
  } | null>(null);

  const [hoveredApproval, setHoveredApproval] = useState<{
    code: string;
    date: string;
    supplier: string;
    total: string;
    top: number;
    left: number;
  } | null>(null);

  return (
    <div className="flex flex-col h-screen bg-[#f4f6f8] text-slate-800 font-sans overflow-hidden">
      {/* ── TOP PREVIEW SWITCHER BANNER ── */}
      <div className="bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-800 text-white px-4 py-2 text-xs flex items-center justify-between shadow-sm z-50 flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="bg-white/20 px-2 py-0.5 rounded font-bold uppercase text-[10px]">
            ⭐ BẢN DEMO MÔ PHỎNG (MOCKUP)
          </span>
          <span className="font-medium">
            Nghiên cứu triết lý giao diện MISA AMIS cho SCMH Phenikaa Pharma
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-blue-200">Chọn màn hình xem trước:</span>
          <div className="inline-flex bg-black/25 p-0.5 rounded-lg border border-white/20">
            <button
              onClick={() => setActiveScreen("dashboard")}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                activeScreen === "dashboard"
                  ? "bg-white text-blue-900 shadow-sm"
                  : "text-white hover:bg-white/10"
              }`}
            >
              1. Bàn làm việc
            </button>
            <button
              onClick={() => setActiveScreen("po")}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                activeScreen === "po"
                  ? "bg-white text-blue-900 shadow-sm"
                  : "text-white hover:bg-white/10"
              }`}
            >
              2. Đơn PO
            </button>
            <button
              onClick={() => setActiveScreen("approval")}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                activeScreen === "approval"
                  ? "bg-white text-blue-900 shadow-sm"
                  : "text-white hover:bg-white/10"
              }`}
            >
              3. PR & ĐNPD
            </button>
            <button
              onClick={() => setActiveScreen("handover")}
              className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                activeScreen === "handover"
                  ? "bg-white text-blue-900 shadow-sm"
                  : "text-white hover:bg-white/10"
              }`}
            >
              4. Bàn giao
            </button>
          </div>
        </div>
      </div>

      {/* ── TOP HEADER CHUẨN MISA ── */}
      <header className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between flex-shrink-0 z-40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 pr-4 border-r border-slate-200">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black text-sm tracking-tighter">
              AMIS
            </div>
            <div>
              <div className="font-bold text-xs leading-none text-slate-900 flex items-center gap-1.5">
                MISA AMIS MUA HÀNG
                <span className="bg-blue-50 text-blue-700 text-[10px] px-1.5 rounded font-semibold border border-blue-200">
                  v2.6
                </span>
              </div>
              <small className="text-[10px] text-slate-500 font-medium">Phenikaa Pharma ERP</small>
            </div>
          </div>

          <nav className="flex items-center text-xs text-slate-500 font-medium">
            <span>Hệ thống</span>
            <ChevronRight size={14} className="mx-1 text-slate-400" />
            <span>Quản trị Mua hàng</span>
            <ChevronRight size={14} className="mx-1 text-slate-400" />
            <span className="text-blue-600 font-semibold">
              {activeScreen === "dashboard" && "Bàn làm việc (To-do List)"}
              {activeScreen === "po" && "Quản lý Đơn mua hàng (PO)"}
              {activeScreen === "approval" && "Yêu cầu mua sắm & Đề nghị phê duyệt"}
              {activeScreen === "handover" && "Bàn giao & Nghiệm thu"}
            </span>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative w-64">
            <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm kiếm nhanh [Ctrl + K]..."
              className="w-full pl-8 pr-12 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 text-slate-800"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-md text-slate-700 font-medium">
            <Building size={14} className="text-slate-500" />
            <span>Nhà máy Phenikaa Pharma</span>
          </div>

          <button className="relative p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md">
            <Bell size={16} />
            <span className="absolute top-1 right-1 w-2 h-2 bg-rose-500 rounded-full"></span>
          </button>

          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-bold text-xs flex items-center justify-center shadow-xs">
              HA
            </div>
            <div className="text-left">
              <div className="text-xs font-bold text-slate-800 leading-none">Trần Hải Hà</div>
              <small className="text-[10px] text-slate-500">Phòng Cung Ứng</small>
            </div>
          </div>
        </div>
      </header>

      {/* ── WORKSPACE: SIDEBAR TRẮNG + CONTENT ── */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar MISA */}
        <aside className="w-60 bg-white border-r border-slate-200 flex flex-col justify-between flex-shrink-0 z-30">
          <div className="overflow-y-auto py-3 px-2 space-y-4">
            <div>
              <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                BÀN LÀM VIỆC
              </div>
              <button
                onClick={() => setActiveScreen("dashboard")}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs transition ${
                  activeScreen === "dashboard"
                    ? "bg-blue-50 text-blue-700 font-semibold border-l-4 border-blue-600"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Home size={15} />
                  <span>Tổng quan & Việc làm</span>
                </div>
                <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                  5 việc
                </span>
              </button>
            </div>

            <div>
              <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                NGHIỆP VỤ MUA HÀNG
              </div>
              <div className="space-y-0.5">
                <button
                  onClick={() => setActiveScreen("approval")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs transition ${
                    activeScreen === "approval"
                      ? "bg-blue-50 text-blue-700 font-semibold border-l-4 border-blue-600"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <FileText size={15} />
                    <span>Yêu cầu & ĐNPD</span>
                  </div>
                  <span className="bg-amber-100 text-amber-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                    3 chờ duyệt
                  </span>
                </button>

                <button
                  onClick={() => setActiveScreen("po")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs transition ${
                    activeScreen === "po"
                      ? "bg-blue-50 text-blue-700 font-semibold border-l-4 border-blue-600"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Package size={15} />
                    <span>Đơn mua hàng (PO)</span>
                  </div>
                  <span className="bg-blue-100 text-blue-800 text-[10px] px-1.5 py-0.2 rounded-full font-bold">
                    8 đang giao
                  </span>
                </button>

                <button
                  onClick={() => setActiveScreen("handover")}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs transition ${
                    activeScreen === "handover"
                      ? "bg-blue-50 text-blue-700 font-semibold border-l-4 border-blue-600"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Truck size={15} />
                    <span>Bàn giao & Nghiệm thu</span>
                  </div>
                </button>
              </div>
            </div>

            <div>
              <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                ĐỐI SOÁT & THANH TOÁN
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <CreditCard size={15} />
                  <span>Bảng kê Kế toán</span>
                </div>
              </div>
            </div>

            <div>
              <div className="px-3 text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                DANH MỤC TẬP TRUNG
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <Building2 size={15} />
                  <span>Nhà cung cấp (96 đối tác)</span>
                </div>
                <div className="flex items-center gap-2.5 px-3 py-2 rounded-md text-xs text-slate-700 hover:bg-slate-50 cursor-pointer">
                  <Tag size={15} />
                  <span>Hàng hóa & Vật tư (730 mã)</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-3 border-t border-slate-200 bg-slate-50/50 flex items-center justify-between text-[11px] text-slate-500">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>Online · D1 Đồng bộ</span>
            </div>
            <span className="font-mono text-[10px]">v1.1.2</span>
          </div>
        </aside>

        {/* Content View Area */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-[#f4f6f8]">
          {/* SCREEN 1: DASHBOARD */}
          {activeScreen === "dashboard" && (
            <div className="space-y-4">
              <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-base font-bold text-slate-900">
                    Bàn làm việc Mua hàng & Quản trị Công việc
                  </h1>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Theo dõi thời gian thực tiến độ phê duyệt, trạng thái giao nhận và công việc ưu tiên.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xs">
                    + Tạo PR
                  </button>
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs">
                    + Tạo ĐNPD
                  </button>
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-sky-600 hover:bg-sky-700 text-white shadow-xs">
                    + Tạo PO
                  </button>
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs">
                    + Tạo Bàn giao
                  </button>
                  <button className="px-3 py-1.5 rounded-md text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white shadow-xs">
                    + Tạo ĐNTT
                  </button>
                </div>
              </div>

              {/* KPI Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="bg-white rounded-lg border border-slate-200 p-3.5 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-blue-500"></div>
                  <div className="text-slate-500 text-xs font-medium">Giá trị PO phát sinh tháng</div>
                  <div className="text-xl font-bold text-slate-900 mt-2 font-mono">486.250.000 ₫</div>
                  <div className="text-[11px] text-emerald-600 font-semibold mt-1">↑ +12.4% so với tháng trước</div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-3.5 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500"></div>
                  <div className="text-slate-500 text-xs font-medium">ĐNPD chờ phê duyệt</div>
                  <div className="text-xl font-bold text-slate-900 mt-2">3 phiếu</div>
                  <div className="text-[11px] text-amber-700 font-medium mt-1">Cần lãnh đạo duyệt để ra PO</div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-3.5 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-sky-500"></div>
                  <div className="text-slate-500 text-xs font-medium">Đơn hàng đang giao</div>
                  <div className="text-xl font-bold text-slate-900 mt-2">8 đơn hàng</div>
                  <div className="text-[11px] text-sky-700 font-medium mt-1">2 đơn sắp đến hạn giao đợt 2</div>
                </div>
                <div className="bg-white rounded-lg border border-slate-200 p-3.5 shadow-xs relative overflow-hidden">
                  <div className="absolute top-0 left-0 right-0 h-1 bg-rose-500"></div>
                  <div className="text-slate-500 text-xs font-medium">Chứng từ cần đôn đốc</div>
                  <div className="text-xl font-bold text-rose-600 mt-2">4 hóa đơn VAT</div>
                  <div className="text-[11px] text-slate-500 mt-1">Đã nhận hàng đủ nhưng chưa có HĐ</div>
                </div>
              </div>

              {/* To-do List 2 Columns */}
              <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
                <div className="p-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold text-slate-900">
                      Công việc cần xử lý trong ngày (To-do List)
                    </h2>
                    <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-semibold border border-blue-200">
                      Còn 5 việc cần làm
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-200 p-2">
                  <div className="p-2 space-y-2">
                    <div className="text-[11px] font-bold text-rose-600 uppercase tracking-wider mb-2">
                      Ưu tiên cao / Việc xử lý ngay
                    </div>
                    <div className="p-2.5 rounded-lg border border-rose-100 bg-rose-50/30 flex items-start gap-2.5 text-xs">
                      <input type="checkbox" className="mt-0.5 rounded text-blue-600" />
                      <div>
                        <div className="font-semibold text-slate-900">
                          Liên hệ Techmaster lấy báo giá và hợp đồng thuê datalogger
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="bg-indigo-50 text-indigo-700 px-1.5 py-0.2 rounded font-mono text-[10px] font-semibold border border-indigo-200">
                            @PO-260318
                          </span>
                          <span className="text-[10px] text-slate-400">· Hạn hôm nay 17:00</span>
                        </div>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg border border-amber-100 bg-amber-50/30 flex items-start gap-2.5 text-xs">
                      <input type="checkbox" className="mt-0.5 rounded text-blue-600" />
                      <div>
                        <div className="font-semibold text-slate-900">
                          Làm thanh toán Alpha Coach hóa chất QC
                        </div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.2 rounded font-mono text-[10px] font-semibold border border-emerald-200">
                            @ĐNTT
                          </span>
                          <span className="text-[10px] text-amber-700 font-semibold">9.100.000 ₫</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-2 space-y-2">
                    <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      Giao nhận & Thủ tục hành chính
                    </div>
                    <div className="p-2.5 rounded-lg border border-slate-200 bg-white flex items-start gap-2.5 text-xs">
                      <input type="checkbox" className="mt-0.5 rounded text-blue-600" />
                      <div>
                        <div className="font-medium text-slate-800">
                          Sửa hóa đơn tài phát và lấy biên bản giao hàng
                        </div>
                      </div>
                    </div>
                    <div className="p-2.5 rounded-lg border border-slate-200 bg-white flex items-start gap-2.5 text-xs">
                      <input type="checkbox" className="mt-0.5 rounded text-blue-600" />
                      <div>
                        <div className="font-medium text-slate-800">
                          Xử lý đơn thuê UPS Nguyên Hà và ký nghiệm thu đợt 2
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SCREEN 2: QUẢN LÝ PO */}
          {activeScreen === "po" && (
            <div className="space-y-3.5">
              <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button className="px-2.5 py-1 text-xs font-bold bg-slate-900 text-white rounded-md">
                    Tất cả (24)
                  </button>
                  <button className="px-2.5 py-1 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-md">
                    Chờ duyệt (3)
                  </button>
                  <button className="px-2.5 py-1 text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 rounded-md">
                    Đang giao (8)
                  </button>
                  <button className="px-2.5 py-1 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md">
                    Đã hoàn thành (11)
                  </button>
                </div>
                <button className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md shadow-xs">
                  + Tạo đơn PO mới
                </button>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                      <th className="p-3 w-10 text-center">
                        <input type="checkbox" className="rounded" />
                      </th>
                      <th className="p-3 w-32">SỐ PO</th>
                      <th className="p-3 w-28">NGÀY ĐẶT</th>
                      <th className="p-3 min-w-[220px]">NHÀ CUNG CẤP</th>
                      <th className="p-3 text-right w-36">GIÁ TRỊ ĐƠN</th>
                      <th className="p-3 w-40 text-center">TIẾN ĐỘ GIAO</th>
                      <th className="p-3 w-32 text-center">HÓA ĐƠN VAT</th>
                      <th className="p-3 w-32 text-center">TRẠNG THÁI</th>
                      <th className="p-3 w-28 text-center">THAO TÁC</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr
                      onClick={() =>
                        setDrawerPO({
                          number: "PO-260318",
                          supplier: "CÔNG TY TNHH NI VINA",
                          total: "22.401.000 ₫",
                          status: "Đang giao hàng",
                        })
                      }
                      className="hover:bg-blue-50/60 cursor-pointer transition"
                    >
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" className="rounded" />
                      </td>
                      <td className="p-3 font-mono font-bold text-blue-600">PO-260318</td>
                      <td className="p-3 text-slate-600">03/11/2026</td>
                      <td className="p-3">
                        <div className="font-bold text-slate-900">CÔNG TY TNHH NI VINA</div>
                        <small className="text-slate-400">12 mặt hàng · MST: 0107823910</small>
                      </td>
                      <td className="p-3 text-right font-mono font-bold text-slate-900">22.401.000 ₫</td>
                      <td className="p-3 text-center">
                        <div className="w-full bg-slate-200 rounded-full h-1.5 mb-1">
                          <div className="bg-blue-600 h-1.5 rounded-full" style={{ width: "60%" }}></div>
                        </div>
                        <span className="text-[10px] text-slate-500 font-semibold">Đã giao 60% (7/12)</span>
                      </td>
                      <td className="p-3 text-center">
                        <span className="bg-amber-50 text-amber-700 border border-amber-200 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                          Chưa có HĐ
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <span className="bg-sky-50 text-sky-700 border border-sky-200 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                          Đang giao
                        </span>
                      </td>
                      <td className="p-3 text-center" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() =>
                            setDrawerPO({
                              number: "PO-260318",
                              supplier: "CÔNG TY TNHH NI VINA",
                              total: "22.401.000 ₫",
                              status: "Đang giao hàng",
                            })
                          }
                          className="px-2 py-1 bg-white border border-slate-200 text-blue-600 rounded text-xs font-semibold shadow-xs"
                        >
                          Chi tiết ▾
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* SCREEN 3: APPROVAL & PR */}
          {activeScreen === "approval" && (
            <div className="space-y-3.5">
              <div className="bg-white rounded-lg border border-slate-200 p-2.5 shadow-xs flex items-center justify-between">
                <div className="flex items-center bg-slate-100 p-1 rounded-md">
                  <button
                    onClick={() => setApprovalTab("list")}
                    className={`px-3 py-1 text-xs font-bold rounded transition ${
                      approvalTab === "list"
                        ? "bg-white text-blue-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Danh sách ĐNPD (15 phiếu)
                  </button>
                  <button
                    onClick={() => setApprovalTab("compare")}
                    className={`px-3 py-1 text-xs font-bold rounded transition ${
                      approvalTab === "compare"
                        ? "bg-white text-blue-700 shadow-xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Bảng so sánh báo giá (3 NCC)
                  </button>
                </div>
                <button className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md shadow-xs">
                  + Tạo ĐNPD mới
                </button>
              </div>

              {approvalTab === "list" && (
                <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold text-[11px] uppercase tracking-wider">
                        <th className="p-3 w-36">SỐ PR / MÃ PHIẾU</th>
                        <th className="p-3 w-28">NGÀY LẬP</th>
                        <th className="p-3 w-32 text-center">QUY MÔ ĐÁNH GIÁ</th>
                        <th className="p-3 min-w-[220px]">NCC ĐỀ XUẤT LỰA CHỌN</th>
                        <th className="p-3 text-right w-40">TỔNG TIỀN ĐỀ XUẤT</th>
                        <th className="p-3 w-32 text-center">TRẠNG THÁI</th>
                        <th className="p-3 w-36 text-center">THAO TÁC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr className="hover:bg-blue-50/50 transition">
                        <td className="p-3">
                          <span
                            onMouseEnter={(e) => {
                              const r = e.currentTarget.getBoundingClientRect();
                              setHoveredApproval({
                                code: "ĐNPD-018",
                                date: "03/11/2026",
                                supplier: "CÔNG TY TNHH PHALCOLAB",
                                total: "4.345.000 ₫",
                                top: r.bottom + 6,
                                left: Math.min(r.left, window.innerWidth - 420),
                              });
                            }}
                            onMouseLeave={() => setHoveredApproval(null)}
                            className="font-mono font-bold text-blue-600 hover:underline cursor-pointer bg-blue-50 px-2 py-1 rounded border border-blue-200"
                          >
                            ĐNPD-018
                          </span>
                        </td>
                        <td className="p-3 text-slate-700 font-medium">03/11/2026</td>
                        <td className="p-3 text-center">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px] font-semibold">
                            3 NCC · 1 mục
                          </span>
                        </td>
                        <td className="p-3 font-bold text-blue-600">CÔNG TY TNHH PHALCOLAB</td>
                        <td className="p-3 text-right font-mono font-bold text-slate-900">4.345.000 ₫</td>
                        <td className="p-3 text-center">
                          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                            Đã phê duyệt
                          </span>
                        </td>
                        <td className="p-3 text-center space-x-1">
                          <button className="px-2 py-1 bg-blue-600 text-white rounded text-xs font-semibold">
                            Mở phiếu →
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              {approvalTab === "compare" && (
                <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-xs">
                  <h3 className="font-bold text-sm text-slate-900 mb-2">
                    Ma trận So Sánh Báo Giá 3 Nhà Cung Cấp
                  </h3>
                  <div className="border border-slate-200 rounded overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 font-bold">
                        <tr>
                          <th className="p-2 border border-slate-200">Tên hàng</th>
                          <th className="p-2 border border-slate-200 text-center">ĐVT</th>
                          <th className="p-2 border-2 border-emerald-500 bg-emerald-50 text-center">
                            ✓ MPK VIỆT NAM (CHỌN)
                          </th>
                          <th className="p-2 border border-slate-200 text-center">KẾT NỐI TIÊU DÙNG</th>
                          <th className="p-2 border border-slate-200 text-center">VIỆT HỒNG</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td className="p-2 border border-slate-200 font-semibold">Xe nâng tay thấp 2.5T</td>
                          <td className="p-2 border border-slate-200 text-center">Cái</td>
                          <td className="p-2 border-2 border-emerald-500 bg-emerald-50/50 text-right font-bold text-emerald-800 font-mono">
                            4.345.000 ₫
                          </td>
                          <td className="p-2 border border-slate-200 text-right font-mono">4.850.000 ₫</td>
                          <td className="p-2 border border-slate-200 text-right font-mono">5.200.000 ₫</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* SCREEN 4: HANDOVER */}
          {activeScreen === "handover" && (
            <div className="space-y-3.5">
              <div className="bg-white rounded-lg border border-slate-200 p-3 shadow-xs flex items-center justify-between">
                <span className="text-xs font-bold text-slate-800">
                  Biên bản kiểm đếm giao nhận theo PO gốc: <b>PO-260318 (NI VINA)</b>
                </span>
                <button className="px-3 py-1.5 bg-emerald-600 text-white rounded text-xs font-semibold shadow-xs">
                  ✓ Lưu biên bản nghiệm thu
                </button>
              </div>

              <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 font-bold uppercase text-[11px] border-b border-slate-200">
                    <tr>
                      <th className="p-2.5 w-12 text-center">STT</th>
                      <th className="p-2.5">MÃ VẬT TƯ</th>
                      <th className="p-2.5">TÊN HÀNG HÓA THEO PO</th>
                      <th className="p-2.5 text-center">ĐVT</th>
                      <th className="p-2.5 text-right">SL ĐẶT</th>
                      <th className="p-2.5 text-right bg-blue-50 text-blue-900">ĐÃ GIAO TRƯỚC</th>
                      <th className="p-2.5 text-right bg-emerald-50 text-emerald-900">GIAO ĐỢT NÀY</th>
                      <th className="p-2.5 text-right bg-rose-50 text-rose-900">CÒN THIẾU</th>
                      <th className="p-2.5 text-center">TÌNH TRẠNG</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="p-2.5 text-center">1</td>
                      <td className="p-2.5 font-mono text-blue-600 font-bold">100100002</td>
                      <td className="p-2.5 font-semibold">Acetylcystein chuẩn kiểm nghiệm</td>
                      <td className="p-2.5 text-center">Lọ</td>
                      <td className="p-2.5 text-right font-bold">10</td>
                      <td className="p-2.5 text-right font-bold text-blue-700 bg-blue-50/30">10</td>
                      <td className="p-2.5 text-right bg-emerald-50/30">
                        <input
                          type="number"
                          defaultValue={0}
                          className="w-16 text-right px-1.5 py-1 text-xs border border-slate-200 rounded font-bold"
                        />
                      </td>
                      <td className="p-2.5 text-right font-bold text-emerald-600 bg-rose-50/20">0 (Đủ)</td>
                      <td className="p-2.5 text-center">
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                          Đạt 100%
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* ── DRAWER CHI TIẾT PO TRƯỢT TỪ BÊN PHẢI ── */}
      {drawerPO && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div
            onClick={() => setDrawerPO(null)}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
          />
          <div className="relative w-full max-w-2xl bg-white shadow-2xl h-full flex flex-col z-50">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-mono font-bold text-blue-600">{drawerPO.number}</span>
                  <span className="bg-sky-100 text-sky-800 text-xs px-2 py-0.5 rounded-full font-bold">
                    {drawerPO.status}
                  </span>
                </div>
                <p className="text-xs font-bold text-slate-800 mt-1">{drawerPO.supplier}</p>
              </div>
              <button
                onClick={() => setDrawerPO(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-md"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto text-xs space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-slate-500 text-[11px]">Tổng giá trị đơn</span>
                  <b className="block text-sm font-bold text-slate-900 mt-1 font-mono">{drawerPO.total}</b>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-slate-500 text-[11px]">Tiến độ nhận</span>
                  <b className="block text-sm font-bold text-blue-600 mt-1">60% (7/12)</b>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                  <span className="text-slate-500 text-[11px]">Hạn giao hàng</span>
                  <b className="block text-sm font-bold text-slate-900 mt-1">08/11/2026</b>
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between">
              <button
                onClick={() => setDrawerPO(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 font-semibold rounded-md"
              >
                Đóng
              </button>
              <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow-xs">
                In đơn hàng PO
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── HOVER POPOVER CARD ── */}
      {hoveredApproval && (
        <div
          style={{ top: hoveredApproval.top, left: hoveredApproval.left }}
          className="fixed pointer-events-none z-50 w-96 bg-white border border-slate-300 rounded-lg shadow-xl p-3 text-xs space-y-2"
        >
          <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
            <span className="font-mono font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
              {hoveredApproval.code}
            </span>
            <span className="text-[10px] text-slate-400">{hoveredApproval.date}</span>
          </div>
          <div>
            <div className="text-[11px] text-slate-500">Nhà cung cấp đề xuất:</div>
            <b className="text-blue-700 block">{hoveredApproval.supplier}</b>
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-slate-100 text-[11px]">
            <span className="text-slate-500">Tổng tiền đề xuất:</span>
            <b className="text-blue-600 font-bold font-mono">{hoveredApproval.total}</b>
          </div>
        </div>
      )}
    </div>
  );
}
