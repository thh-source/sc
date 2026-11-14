"use client";

import React, { useMemo, useRef, useState } from "react";
import {
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { MentionItem } from "./Dashboard";

export interface TodoSubtask {
  id: string;
  text: string;
  done: boolean;
}

export interface SmartTodoItem {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  priority?: "high" | "normal" | "low";
  dueDate?: string;
  subtasks?: TodoSubtask[];
  note?: string;
}

interface SmartTodoPanelProps {
  todos: SmartTodoItem[];
  todayStr: string;
  allMentionItems: MentionItem[];
  counts: { po: number; pr: number; dnpd: number; ncc: number };
  onAddTodo: (text: string, priority?: "high" | "normal" | "low", dueDate?: string) => void;
  onToggleTodo: (id: string) => void;
  onUpdateTodo: (id: string, patch: Partial<SmartTodoItem>) => void;
  onDeleteTodo: (id: string) => void;
  onClearCompletedTodos: () => void;
  renderSmartTodoText: (text: string) => React.ReactNode;
}

function addDaysIso(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatShortDateVN(iso?: string, todayStr?: string, tomorrowStr?: string): string {
  if (!iso) return "";
  if (todayStr && iso === todayStr) return "Hôm nay";
  if (tomorrowStr && iso === tomorrowStr) return "Ngày mai";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}` : iso;
}

function parseQuickAddNLP(
  raw: string,
  explicitPriority: "high" | "normal",
  explicitDueDate: string,
  todayStr: string,
  tomorrowStr: string,
  nextWeekStr: string,
): { text: string; priority: "high" | "normal"; dueDate?: string } {
  let text = raw.trim();
  let priority: "high" | "normal" = explicitPriority;
  let dueDate: string | undefined = explicitDueDate || undefined;

  if (/!(?:gấp|gap)\b/i.test(text)) {
    priority = "high";
    text = text.replace(/\s*!(?:gấp|gap)\b/gi, "").trim();
  }
  if (!explicitDueDate) {
    if (/(?:^|\s)(?:hôm nay|hom nay)(?:\s|$)/i.test(text)) {
      dueDate = todayStr;
    } else if (/(?:^|\s)(?:ngày mai|ngay mai)(?:\s|$)/i.test(text)) {
      dueDate = tomorrowStr;
    } else if (/(?:^|\s)(?:tuần sau|tuan sau)(?:\s|$)/i.test(text)) {
      dueDate = nextWeekStr;
    }
  }
  return { text: text || raw.trim(), priority, dueDate };
}

export function SmartTodoPanel(props: SmartTodoPanelProps) {
  const {
    todos,
    todayStr,
    allMentionItems,
    counts,
    onAddTodo,
    onToggleTodo,
    onUpdateTodo,
    onDeleteTodo,
    onClearCompletedTodos,
    renderSmartTodoText,
  } = props;

  const tomorrowStr = useMemo(() => addDaysIso(todayStr, 1), [todayStr]);
  const nextWeekStr = useMemo(() => addDaysIso(todayStr, 7), [todayStr]);

  const [todoInput, setTodoInput] = useState("");
  const [todoPriority, setTodoPriority] = useState<"high" | "normal">("normal");
  const [todoDueDate, setTodoDueDate] = useState<string>(todayStr);
  const [todoFilter, setTodoFilter] = useState<"active" | "all" | "completed">("active");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showUpcoming, setShowUpcoming] = useState(false);
  const [showCompletedInAll, setShowCompletedInAll] = useState(false);

  // Inline edit state inside expanded task
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState("");
  const [subtaskDraft, setSubtaskDraft] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  const [collapsedSubs, setCollapsedSubs] = useState<Record<string, boolean>>({});
  const [addingSubForId, setAddingSubForId] = useState<string | null>(null);

  // Mention state
  const inputRef = useRef<HTMLInputElement>(null);
  const mentionDropdownRef = useRef<HTMLDivElement>(null);
  const [mentionCategoryTab, setMentionCategoryTab] = useState<"all" | "po" | "pr" | "dnpd" | "ncc">("all");
  const [mentionState, setMentionState] = useState<{
    isOpen: boolean;
    triggerChar: string;
    query: string;
    startIndex: number;
    selectedIndex: number;
  }>({ isOpen: false, triggerChar: "@", query: "", startIndex: -1, selectedIndex: 0 });

  const filteredMentionItems = useMemo(() => {
    const q = mentionState.query.toLowerCase().trim();
    return allMentionItems
      .filter((item) => {
        if (mentionCategoryTab !== "all" && item.category !== mentionCategoryTab) return false;
        if (!q) return true;
        return item.searchStr.includes(q);
      })
      .slice(0, 12);
  }, [allMentionItems, mentionState.query, mentionCategoryTab]);

  const checkMentionTrigger = (text: string, cursorPos: number) => {
    const beforeCursor = text.slice(0, cursorPos);
    const match = beforeCursor.match(/(?:^|\s)([@#])([a-zA-Z0-9_\-\.:]*)$/);
    if (match) {
      const triggerChar = match[1];
      const query = match[2];
      const startIndex = cursorPos - query.length - 1;
      setMentionState((prev) => ({
        ...prev,
        isOpen: true,
        triggerChar,
        query,
        startIndex,
        selectedIndex: 0,
      }));
    } else if (mentionState.isOpen) {
      setMentionState((prev) => ({ ...prev, isOpen: false }));
    }
  };

  const applyMentionItem = (item: MentionItem) => {
    const before = todoInput.slice(0, mentionState.startIndex);
    const after = todoInput.slice(
      inputRef.current?.selectionStart ?? mentionState.startIndex + mentionState.query.length + 1,
    );
    const cleanAfter = after.replace(/^[a-zA-Z0-9_\-]+/, "");
    const newText = `${before}${item.tag} ${cleanAfter}`;
    setTodoInput(newText);
    setMentionState((prev) => ({ ...prev, isOpen: false }));
    const newCursor = before.length + item.tag.length + 1;
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(newCursor, newCursor);
      }
    }, 10);
  };

  const handleInsertHelperTag = (tagPrefix: string) => {
    const needLeadingSpace = todoInput.length > 0 && !todoInput.endsWith(" ");
    const newText = todoInput + (needLeadingSpace ? " " : "") + tagPrefix;
    setTodoInput(newText);
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const pos = newText.length;
        inputRef.current.setSelectionRange(pos, pos);
        checkMentionTrigger(newText, pos);
      }
    }, 10);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!todoInput.trim()) return;
    const parsed = parseQuickAddNLP(
      todoInput,
      todoPriority,
      todoDueDate,
      todayStr,
      tomorrowStr,
      nextWeekStr,
    );
    onAddTodo(parsed.text, parsed.priority, parsed.dueDate);
    setTodoInput("");
    setTodoPriority("normal");
    setMentionState((prev) => ({ ...prev, isOpen: false }));
  };

  // Grouping tasks: Overdue, Today/Unscheduled, Upcoming, Completed
  const { overdueTodos, todayTodos, upcomingTodos, completedTodos, activeCount } = useMemo(() => {
    const overdue: SmartTodoItem[] = [];
    const today: SmartTodoItem[] = [];
    const upcoming: SmartTodoItem[] = [];
    const completed: SmartTodoItem[] = [];

    const sorted = [...todos].sort((a, b) => {
      const pA = a.priority === "high" ? 1 : 0;
      const pB = b.priority === "high" ? 1 : 0;
      if (pA !== pB) return pB - pA;
      return (b.createdAt || "").localeCompare(a.createdAt || "");
    });

    for (const t of sorted) {
      if (t.completed) {
        completed.push(t);
      } else if (t.dueDate && t.dueDate < todayStr) {
        overdue.push(t);
      } else if (t.dueDate && t.dueDate > todayStr) {
        upcoming.push(t);
      } else {
        today.push(t);
      }
    }
    return {
      overdueTodos: overdue,
      todayTodos: today,
      upcomingTodos: upcoming,
      completedTodos: completed,
      activeCount: overdue.length + today.length + upcoming.length,
    };
  }, [todos, todayStr]);

  const renderTaskRow = (item: SmartTodoItem, section: "overdue" | "today" | "upcoming" | "completed") => {
    const isExpanded = expandedId === item.id;
    const subtasks = item.subtasks || [];
    const doneSubCount = subtasks.filter((s) => s.done).length;
    const isEditingTitle = editingTitleId === item.id;
    const currentNote = noteDraft[item.id] !== undefined ? noteDraft[item.id] : item.note || "";

    return (
      <li
        key={item.id}
        className={`todo-hero-item smart-todo-item ${item.completed ? "completed" : ""} ${
          item.priority === "high" ? "priority-high" : ""
        } ${section === "overdue" ? "is-overdue" : ""}`}
      >
        <div className="smart-todo-main-row">
          <label className="todo-checkbox-label">
            <input
              type="checkbox"
              className="todo-checkbox"
              checked={item.completed}
              onChange={() => onToggleTodo(item.id)}
            />
            <span className="custom-check-box">
              {item.completed && <Check size={12} strokeWidth={3} />}
            </span>
          </label>

          <div
            className="todo-body smart-todo-body"
            onClick={() => {
              if (!isEditingTitle) {
                setExpandedId(isExpanded ? null : item.id);
              }
            }}
          >
            {isEditingTitle ? (
              <input
                type="text"
                autoFocus
                className="smart-todo-title-input"
                value={draftTitle}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setDraftTitle(e.target.value)}
                onBlur={() => {
                  const trimmed = draftTitle.trim();
                  if (trimmed && trimmed !== item.text) {
                    onUpdateTodo(item.id, { text: trimmed });
                  }
                  setEditingTitleId(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    const trimmed = draftTitle.trim();
                    if (trimmed && trimmed !== item.text) {
                      onUpdateTodo(item.id, { text: trimmed });
                    }
                    setEditingTitleId(null);
                  } else if (e.key === "Escape") {
                    setEditingTitleId(null);
                  }
                }}
              />
            ) : (
              <div className="todo-text">
                {item.priority === "high" && !item.completed && (
                  <span className="priority-flag" title="Việc gấp cần giải quyết ngay">
                    GẤP
                  </span>
                )}
                {renderSmartTodoText(item.text)}
              </div>
            )}

            {item.note?.trim() && (
              <div className="smart-todo-note-inline">{item.note}</div>
            )}

            {/* Metadata pills under task title */}
            {(item.dueDate || subtasks.length > 0 || !item.completed) && (
              <div className="smart-todo-meta-row">
                {item.dueDate && !item.completed && (
                  <span
                    className={`smart-todo-date-pill ${
                      item.dueDate < todayStr
                        ? "date-overdue"
                        : item.dueDate === todayStr
                        ? "date-today"
                        : "date-upcoming"
                    }`}
                  >
                    <Calendar size={10} />
                    {formatShortDateVN(item.dueDate, todayStr, tomorrowStr)}
                  </span>
                )}
                {subtasks.length > 0 && (
                  <button
                    type="button"
                    className="smart-sub-toggle-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsedSubs((prev) => ({ ...prev, [item.id]: !prev[item.id] }));
                    }}
                    title="Thu gọn / mở rộng các bước con"
                  >
                    {collapsedSubs[item.id] ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                    {doneSubCount}/{subtasks.length} bước con
                  </button>
                )}
                {!item.completed && (
                  <button
                    type="button"
                    className="smart-add-sub-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCollapsedSubs((prev) => ({ ...prev, [item.id]: false }));
                      setAddingSubForId((prev) => (prev === item.id ? null : item.id));
                    }}
                  >
                    + Bước con
                  </button>
                )}
              </div>
            )}

            {/* Inline Subtasks always visible (unless collapsed) */}
            {((subtasks.length > 0 && !collapsedSubs[item.id]) || addingSubForId === item.id) && (
              <div
                className="smart-subtasks-inline"
                onClick={(e) => e.stopPropagation()}
              >
                {subtasks.map((st) => (
                  <div key={st.id} className="smart-subtask-inline-row">
                    <label className="smart-subtask-inline-label">
                      <input
                        type="checkbox"
                        checked={st.done}
                        onChange={() => {
                          const next = subtasks.map((s) =>
                            s.id === st.id ? { ...s, done: !s.done } : s,
                          );
                          onUpdateTodo(item.id, { subtasks: next });
                        }}
                      />
                      <span className={st.done ? "is-done" : ""}>{st.text}</span>
                    </label>
                    <button
                      type="button"
                      className="smart-subtask-inline-del"
                      onClick={() => {
                        const next = subtasks.filter((s) => s.id !== st.id);
                        onUpdateTodo(item.id, { subtasks: next });
                      }}
                      title="Xóa bước con"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {addingSubForId === item.id && (
                  <div className="smart-subtask-add-inline">
                    <input
                      type="text"
                      autoFocus
                      value={subtaskDraft[item.id] || ""}
                      onChange={(e) =>
                        setSubtaskDraft((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          const val = (subtaskDraft[item.id] || "").trim();
                          if (!val) return;
                          const next = [
                            ...subtasks,
                            { id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, text: val, done: false },
                          ];
                          onUpdateTodo(item.id, { subtasks: next });
                          setSubtaskDraft((prev) => ({ ...prev, [item.id]: "" }));
                        } else if (e.key === "Escape") {
                          setAddingSubForId(null);
                        }
                      }}
                      placeholder="Nhập bước con rồi nhấn Enter..."
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = (subtaskDraft[item.id] || "").trim();
                        if (!val) return;
                        const next = [
                          ...subtasks,
                          { id: `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, text: val, done: false },
                        ];
                        onUpdateTodo(item.id, { subtasks: next });
                        setSubtaskDraft((prev) => ({ ...prev, [item.id]: "" }));
                      }}
                    >
                      Thêm
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Hover quick actions */}
          <div className="smart-todo-actions">
            {!item.completed && (
              <>
                <button
                  type="button"
                  className={`smart-action-btn ${item.priority === "high" ? "is-starred" : ""}`}
                  title={item.priority === "high" ? "Bỏ ưu tiên gấp" : "Đánh dấu gấp"}
                  onClick={() =>
                    onUpdateTodo(item.id, {
                      priority: item.priority === "high" ? "normal" : "high",
                    })
                  }
                >
                  <Star size={13} fill={item.priority === "high" ? "currentColor" : "none"} />
                </button>
                {item.dueDate !== tomorrowStr && (
                  <button
                    type="button"
                    className="smart-action-btn snooze-btn"
                    title="Dời sang ngày mai"
                    onClick={() => onUpdateTodo(item.id, { dueDate: tomorrowStr })}
                  >
                    → Mai
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              className="todo-del-btn"
              title="Xóa việc này"
              onClick={() => onDeleteTodo(item.id)}
            >
              <Trash2 size={13} />
            </button>
          </div>
        </div>

        {/* Expanded inline drawer: Edit title, Due date, Subtasks, Note */}
        {isExpanded && (
          <div className="smart-todo-drawer" onClick={(e) => e.stopPropagation()}>
            <div className="smart-drawer-toolbar">
              <button
                type="button"
                className="smart-drawer-chip"
                onClick={() => {
                  setDraftTitle(item.text);
                  setEditingTitleId(item.id);
                }}
              >
                ✏️ Sửa tên
              </button>
              <button
                type="button"
                className={`smart-drawer-chip ${item.dueDate === todayStr ? "active" : ""}`}
                onClick={() => onUpdateTodo(item.id, { dueDate: todayStr })}
              >
                Hôm nay
              </button>
              <button
                type="button"
                className={`smart-drawer-chip ${item.dueDate === tomorrowStr ? "active" : ""}`}
                onClick={() => onUpdateTodo(item.id, { dueDate: tomorrowStr })}
              >
                Ngày mai
              </button>
              <input
                type="date"
                className="smart-drawer-date-input"
                value={item.dueDate || ""}
                onChange={(e) => onUpdateTodo(item.id, { dueDate: e.target.value || undefined })}
                title="Chọn hạn xử lý"
              />
            </div>

            {/* Subtasks checklist */}
            <div className="smart-subtasks-box">
              {subtasks.map((st) => (
                <div key={st.id} className="smart-subtask-row">
                  <label className="smart-subtask-label">
                    <input
                      type="checkbox"
                      checked={st.done}
                      onChange={() => {
                        const next = subtasks.map((s) =>
                          s.id === st.id ? { ...s, done: !s.done } : s,
                        );
                        onUpdateTodo(item.id, { subtasks: next });
                      }}
                    />
                    <span className={st.done ? "done" : ""}>{st.text}</span>
                  </label>
                  <button
                    type="button"
                    className="smart-subtask-del"
                    onClick={() => {
                      const next = subtasks.filter((s) => s.id !== st.id);
                      onUpdateTodo(item.id, { subtasks: next });
                    }}
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
              <div className="smart-subtask-add">
                <input
                  type="text"
                  placeholder="+ Thêm bước nhỏ (Enter)..."
                  value={subtaskDraft[item.id] || ""}
                  onChange={(e) =>
                    setSubtaskDraft((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const val = (subtaskDraft[item.id] || "").trim();
                      if (!val) return;
                      const next = [
                        ...subtasks,
                        { id: `sub-${Date.now()}`, text: val, done: false },
                      ];
                      onUpdateTodo(item.id, { subtasks: next });
                      setSubtaskDraft((prev) => ({ ...prev, [item.id]: "" }));
                    }
                  }}
                />
              </div>
            </div>

            {/* Detail Note */}
            <input
              type="text"
              className="smart-drawer-note-input"
              placeholder="Ghi chú thêm (số điện thoại, lưu ý...) — Enter để lưu"
              value={currentNote}
              onChange={(e) =>
                setNoteDraft((prev) => ({ ...prev, [item.id]: e.target.value }))
              }
              onBlur={() => {
                const trimmed = currentNote.trim();
                if (trimmed !== (item.note || "").trim()) {
                  onUpdateTodo(item.id, { note: trimmed });
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onUpdateTodo(item.id, { note: currentNote.trim() });
                  (e.target as HTMLInputElement).blur();
                }
              }}
            />
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="dashboard-card todo-hero-card">
      <div className="card-header todo-hero-header">
        <div className="card-title-group">
          <span className="card-badge-icon badge-green">
            <CheckCircle2 size={18} />
          </span>
          <div>
            <div className="todo-title-row">
              <h2>Việc Cần làm (To-Do)</h2>
              {activeCount > 0 ? (
                <span className="todo-counter-pill active">
                  <b>{activeCount}</b> việc
                </span>
              ) : (
                <span className="todo-counter-pill done">✓ Xong hết!</span>
              )}
              {overdueTodos.length > 0 && (
                <span className="todo-counter-pill urgent">
                  <Clock size={11} /> {overdueTodos.length} quá hạn
                </span>
              )}
            </div>
            <p>Bấm vào việc để sửa, chia bước nhỏ hoặc dời sang ngày mai</p>
          </div>
        </div>

        <div className="todo-header-actions">
          <div className="todo-filter-pills">
            <button
              type="button"
              className={`todo-pill ${todoFilter === "active" ? "active" : ""}`}
              onClick={() => setTodoFilter("active")}
            >
              Đang làm ({activeCount})
            </button>
            <button
              type="button"
              className={`todo-pill ${todoFilter === "all" ? "active" : ""}`}
              onClick={() => setTodoFilter("all")}
            >
              Tất cả ({todos.length})
            </button>
            <button
              type="button"
              className={`todo-pill ${todoFilter === "completed" ? "active" : ""}`}
              onClick={() => setTodoFilter("completed")}
            >
              Đã xong ({completedTodos.length})
            </button>
          </div>
          {completedTodos.length > 0 && (
            <button
              type="button"
              className="clear-completed-btn"
              onClick={onClearCompletedTodos}
              title="Xóa các việc đã hoàn thành"
            >
              Dọn đã xong
            </button>
          )}
        </div>
      </div>

      {/* Smart Quick-Add Form */}
      <form className="todo-hero-input-form" onSubmit={handleSubmit}>
        <div className="todo-hero-input-row">
          <input
            ref={inputRef}
            type="text"
            className="todo-hero-input"
            placeholder="Thêm việc... gõ @PO, #PR, @NCC hoặc 'ngày mai !gấp'"
            value={todoInput}
            onChange={(e) => {
              setTodoInput(e.target.value);
              checkMentionTrigger(e.target.value, e.target.selectionStart ?? e.target.value.length);
            }}
            onKeyDown={(e) => {
              if (!mentionState.isOpen || filteredMentionItems.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionState((p) => ({ ...p, selectedIndex: (p.selectedIndex + 1) % filteredMentionItems.length }));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionState((p) => ({
                  ...p,
                  selectedIndex: (p.selectedIndex - 1 + filteredMentionItems.length) % filteredMentionItems.length,
                }));
              } else if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                const item = filteredMentionItems[mentionState.selectedIndex];
                if (item) applyMentionItem(item);
              } else if (e.key === "Escape") {
                e.preventDefault();
                setMentionState((p) => ({ ...p, isOpen: false }));
              }
            }}
            autoComplete="off"
          />

          {/* Quick Due Date Chips */}
          <div className="smart-quick-dates">
            <button
              type="button"
              className={`smart-date-chip ${todoDueDate === todayStr ? "active" : ""}`}
              onClick={() => setTodoDueDate(todayStr)}
            >
              Hôm nay
            </button>
            <button
              type="button"
              className={`smart-date-chip ${todoDueDate === tomorrowStr ? "active" : ""}`}
              onClick={() => setTodoDueDate(tomorrowStr)}
            >
              Ngày mai
            </button>
            <button
              type="button"
              className={`smart-date-chip ${todoDueDate === "" ? "active" : ""}`}
              onClick={() => setTodoDueDate("")}
            >
              Không hạn
            </button>
            <input
              type="date"
              className="smart-date-picker-mini"
              value={todoDueDate}
              onChange={(e) => setTodoDueDate(e.target.value)}
              title="Chọn ngày hẹn khác"
            />
          </div>

          <div className="todo-priority-toggle">
            <label>
              <input
                type="checkbox"
                checked={todoPriority === "high"}
                onChange={(e) => setTodoPriority(e.target.checked ? "high" : "normal")}
              />
              <span className={todoPriority === "high" ? "high-label" : ""}>Ưu tiên gấp</span>
            </label>
          </div>
          <button type="submit" className="btn btn-primary todo-hero-add-btn" disabled={!todoInput.trim()}>
            <Plus size={15} /> Thêm
          </button>

          {mentionState.isOpen && (
            <div ref={mentionDropdownRef} className="todo-mention-dropdown" onMouseDown={(e) => e.preventDefault()}>
              <div className="mention-header">
                <div className="mention-tabs">
                  <button
                    type="button"
                    className={`mention-tab ${mentionCategoryTab === "all" ? "active" : ""}`}
                    onClick={() => setMentionCategoryTab("all")}
                  >
                    Tất cả
                  </button>
                  <button
                    type="button"
                    className={`mention-tab tab-po ${mentionCategoryTab === "po" ? "active" : ""}`}
                    onClick={() => setMentionCategoryTab("po")}
                  >
                    PO ({counts.po})
                  </button>
                  <button
                    type="button"
                    className={`mention-tab tab-pr ${mentionCategoryTab === "pr" ? "active" : ""}`}
                    onClick={() => setMentionCategoryTab("pr")}
                  >
                    PR ({counts.pr})
                  </button>
                  <button
                    type="button"
                    className={`mention-tab tab-approval ${mentionCategoryTab === "dnpd" ? "active" : ""}`}
                    onClick={() => setMentionCategoryTab("dnpd")}
                  >
                    ĐNPD ({counts.dnpd})
                  </button>
                  <button
                    type="button"
                    className={`mention-tab tab-ncc ${mentionCategoryTab === "ncc" ? "active" : ""}`}
                    onClick={() => setMentionCategoryTab("ncc")}
                  >
                    NCC ({counts.ncc})
                  </button>
                </div>
                <button
                  type="button"
                  className="mention-close-btn"
                  onClick={() => setMentionState((p) => ({ ...p, isOpen: false }))}
                >
                  <X size={13} />
                </button>
              </div>
              <div className="mention-list">
                {filteredMentionItems.length === 0 ? (
                  <div className="mention-empty">Không tìm thấy chứng từ phù hợp.</div>
                ) : (
                  filteredMentionItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`mention-item ${idx === mentionState.selectedIndex ? "selected" : ""}`}
                      onClick={() => applyMentionItem(item)}
                      onMouseEnter={() => setMentionState((p) => ({ ...p, selectedIndex: idx }))}
                    >
                      <span className={`mention-badge badge-${item.category}`}>{item.badge}</span>
                      <div className="mention-info">
                        <div className="mention-top-line">
                          <strong className="mention-title">{item.title}</strong>
                          {item.status && <span className="mention-status">{item.status}</span>}
                        </div>
                        {(item.subtitle || item.meta) && (
                          <div className="mention-meta">
                            {item.subtitle && <span className="mention-sub">{item.subtitle}</span>}
                            {item.subtitle && item.meta && <span className="meta-sep">·</span>}
                            {item.meta && <span className="mention-extra">{item.meta}</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="todo-hero-helpers">
          <span className="helpers-label">Gắn nhanh:</span>
          <button type="button" className="helper-chip chip-po" onClick={() => handleInsertHelperTag("@PO-")}>
            + @PO
          </button>
          <button type="button" className="helper-chip chip-pr" onClick={() => handleInsertHelperTag("#PR-")}>
            + #PR
          </button>
          <button type="button" className="helper-chip chip-approval" onClick={() => handleInsertHelperTag("@DNPD-")}>
            + @DNPD
          </button>
          <button type="button" className="helper-chip chip-supplier" onClick={() => handleInsertHelperTag("@NCC-")}>
            + @NCC
          </button>
        </div>
      </form>

      {/* Time-Grouped Task List */}
      <div className="todo-hero-list-wrap">
        {todoFilter === "completed" ? (
          completedTodos.length === 0 ? (
            <div className="todo-empty-state">
              <Sparkles size={24} className="empty-sparkle" />
              <p>Chưa có công việc nào đã hoàn thành.</p>
            </div>
          ) : (
            <ul className="todo-hero-items-list">
              {completedTodos.map((item) => renderTaskRow(item, "completed"))}
            </ul>
          )
        ) : activeCount === 0 && (todoFilter === "active" || completedTodos.length === 0) ? (
          <div className="todo-empty-state">
            <Sparkles size={24} className="empty-sparkle" />
            <p>Tuyệt vời! Bạn đã xử lý xong toàn bộ việc cần làm.</p>
          </div>
        ) : (
          <div className="smart-todo-sections">
            {overdueTodos.length > 0 && (
              <div className="smart-todo-section">
                <div className="smart-section-header overdue">
                  <span>🔴 Quá hạn ({overdueTodos.length})</span>
                  <button
                    type="button"
                    className="smart-section-bulk"
                    onClick={() => overdueTodos.forEach((t) => onUpdateTodo(t.id, { dueDate: todayStr }))}
                  >
                    Dời hết về hôm nay
                  </button>
                </div>
                <ul className="todo-hero-items-list">
                  {overdueTodos.map((item) => renderTaskRow(item, "overdue"))}
                </ul>
              </div>
            )}

            {todayTodos.length > 0 && (
              <div className="smart-todo-section">
                <div className="smart-section-header today">
                  <span>☀️ Hôm nay ({todayTodos.length})</span>
                </div>
                <ul className="todo-hero-items-list">
                  {todayTodos.map((item) => renderTaskRow(item, "today"))}
                </ul>
              </div>
            )}

            {upcomingTodos.length > 0 && (
              <div className="smart-todo-section">
                <button
                  type="button"
                  className="smart-section-toggle"
                  onClick={() => setShowUpcoming((v) => !v)}
                >
                  {showUpcoming ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>📅 Sắp tới ({upcomingTodos.length})</span>
                </button>
                {showUpcoming && (
                  <ul className="todo-hero-items-list">
                    {upcomingTodos.map((item) => renderTaskRow(item, "upcoming"))}
                  </ul>
                )}
              </div>
            )}

            {todoFilter === "all" && completedTodos.length > 0 && (
              <div className="smart-todo-section">
                <button
                  type="button"
                  className="smart-section-toggle"
                  onClick={() => setShowCompletedInAll((v) => !v)}
                >
                  {showCompletedInAll ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>✓ Đã xong ({completedTodos.length})</span>
                </button>
                {showCompletedInAll && (
                  <ul className="todo-hero-items-list">
                    {completedTodos.map((item) => renderTaskRow(item, "completed"))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
