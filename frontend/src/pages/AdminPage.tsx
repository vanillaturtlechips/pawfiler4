import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import ParchmentPanel from "@/components/ParchmentPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Plus, Pencil, Trash2, Save, X, ShoppingBag,
  ToggleLeft, ToggleRight, RefreshCw,
} from "lucide-react";
import {
  adminFetchShopItems,
  adminCreateShopItem,
  adminUpdateShopItem,
  adminDeleteShopItem,
  type AdminShopItem,
  type AdminShopItemInput,
} from "@/lib/api";

const ITEM_TYPES = ["subscription", "coins", "item"] as const;
type ItemType = (typeof ITEM_TYPES)[number];

const typeLabel: Record<ItemType, string> = {
  subscription: "구독권",
  coins: "코인팩",
  item: "패키지",
};

const typeBadgeColor: Record<ItemType, string> = {
  subscription: "bg-purple-100 text-purple-700 border-purple-300",
  coins: "bg-yellow-100 text-yellow-700 border-yellow-300",
  item: "bg-orange-100 text-orange-700 border-orange-300",
};

const emptyForm = (): AdminShopItemInput => ({
  id: "",
  name: "",
  description: "",
  price: 0,
  icon: "🎁",
  badge: "",
  type: "item",
  quantity: 0,
  bonus: 0,
  is_active: true,
  sort_order: 0,
});

const AdminPage = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<AdminShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<AdminShopItemInput>(emptyForm());
  const [filterType, setFilterType] = useState<ItemType | "all">("all");

  const loadItems = () => {
    setLoading(true);
    adminFetchShopItems()
      .then((res) => setItems(res.items))
      .catch(() => toast.error("아이템 목록을 불러오지 못했습니다."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadItems();
  }, []);

  const handleEdit = (item: AdminShopItem) => {
    setEditingId(item.id);
    setForm({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      icon: item.icon,
      badge: item.badge ?? "",
      type: item.type,
      quantity: item.quantity,
      bonus: item.bonus,
      is_active: item.is_active,
      sort_order: item.sort_order,
    });
    setShowForm(true);
  };

  const handleNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  };

  const handleSave = async () => {
    if (!form.name || !form.type) {
      toast.error("이름과 타입은 필수입니다.");
      return;
    }
    setSaving(true);
    try {
      const payload: AdminShopItemInput = {
        ...form,
        badge: form.badge || undefined,
      };
      if (editingId) {
        const updated = await adminUpdateShopItem(editingId, payload);
        setItems((prev) => prev.map((i) => (i.id === editingId ? updated : i)));
        toast.success("아이템이 수정되었습니다.");
      } else {
        const created = await adminCreateShopItem(payload);
        setItems((prev) => [...prev, created]);
        toast.success("아이템이 추가되었습니다.");
      }
      handleCancel();
    } catch (err: any) {
      toast.error(err?.data?.error || err?.message || "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`"${name}" 아이템을 삭제하시겠습니까?`)) return;
    try {
      await adminDeleteShopItem(id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      toast.success("삭제되었습니다.");
    } catch {
      toast.error("삭제 실패");
    }
  };

  const handleToggleActive = async (item: AdminShopItem) => {
    try {
      const updated = await adminUpdateShopItem(item.id, { is_active: !item.is_active });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated : i)));
    } catch {
      toast.error("상태 변경 실패");
    }
  };

  const filtered = filterType === "all"
    ? items
    : items.filter((i) => i.type === filterType);

  return (
    <div className="h-[calc(100vh-5rem)] w-full overflow-hidden">
      <motion.div
        className="flex flex-col h-full gap-3 p-3 max-w-[1400px] mx-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => navigate(-1)}
              className="font-jua text-base hover:bg-wood-dark/20 rounded-xl px-3 py-1.5"
            >
              <ArrowLeft className="w-5 h-5 mr-1" />
              뒤로
            </Button>
            <span className="text-3xl">🏪</span>
            <h1 className="font-jua text-3xl text-foreground text-shadow-glow">
              상점 관리
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={loadItems}
              variant="ghost"
              className="font-jua text-sm rounded-xl px-3 py-1.5 hover:bg-wood-dark/20"
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              새로고침
            </Button>
            <Button
              onClick={handleNew}
              className="font-jua text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-xl px-4 py-1.5"
            >
              <Plus className="w-4 h-4 mr-1" />
              아이템 추가
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-[1fr_380px] gap-3 flex-1 min-h-0">
          {/* Left — Item List */}
          <ParchmentPanel className="rounded-2xl border-4 p-4 flex flex-col shadow-xl min-h-0">
            {/* Filter tabs */}
            <div className="flex gap-2 mb-3 flex-shrink-0">
              {(["all", ...ITEM_TYPES] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilterType(t)}
                  className={`font-jua text-xs px-3 py-1 rounded-full border-2 transition-colors ${
                    filterType === t
                      ? "bg-orange-500 text-white border-orange-600"
                      : "bg-white text-wood-darkest border-parchment-border hover:border-orange-300"
                  }`}
                >
                  {t === "all" ? "전체" : typeLabel[t]}
                  <span className="ml-1 opacity-60">
                    ({t === "all" ? items.length : items.filter((i) => i.type === t).length})
                  </span>
                </button>
              ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto space-y-2">
              {loading ? (
                <div className="flex items-center justify-center h-32">
                  <span className="font-jua text-wood-dark animate-pulse">불러오는 중...</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <span className="font-jua text-wood-dark opacity-60">아이템이 없습니다.</span>
                </div>
              ) : (
                filtered.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-colors ${
                      item.is_active
                        ? "bg-white border-parchment-border hover:border-orange-300"
                        : "bg-gray-50 border-gray-200 opacity-60"
                    }`}
                  >
                    <span className="text-3xl w-10 text-center flex-shrink-0">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="font-jua text-sm text-wood-darkest truncate">{item.name}</span>
                        {item.badge && (
                          <span className="font-jua text-xs px-1.5 py-0 rounded-full bg-red-100 text-red-600 border border-red-200 flex-shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-wood-dark truncate">{item.description}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`font-jua text-xs px-2 py-0 rounded-full border ${typeBadgeColor[item.type as ItemType] ?? "bg-gray-100 text-gray-600 border-gray-300"}`}>
                          {typeLabel[item.type as ItemType] ?? item.type}
                        </span>
                        <span className="font-jua text-xs text-amber-700">💰 {item.price.toLocaleString()}</span>
                        {item.quantity > 0 && (
                          <span className="text-xs text-wood-dark">수량: {item.quantity}</span>
                        )}
                        <span className="text-xs text-wood-dark opacity-50">순서: {item.sort_order}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleToggleActive(item)}
                        className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                        title={item.is_active ? "비활성화" : "활성화"}
                      >
                        {item.is_active
                          ? <ToggleRight className="w-5 h-5 text-green-500" />
                          : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                      </button>
                      <button
                        onClick={() => handleEdit(item)}
                        className="p-1.5 rounded-lg hover:bg-blue-50 transition-colors"
                      >
                        <Pencil className="w-4 h-4 text-blue-500" />
                      </button>
                      <button
                        onClick={() => handleDelete(item.id, item.name)}
                        className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </ParchmentPanel>

          {/* Right — Form */}
          <ParchmentPanel className="rounded-2xl border-4 p-4 flex flex-col shadow-xl min-h-0">
            <div className="flex items-center gap-2 mb-4 flex-shrink-0">
              <ShoppingBag className="w-5 h-5 text-orange-600" />
              <h2 className="font-jua text-lg text-wood-darkest">
                {showForm ? (editingId ? "아이템 수정" : "아이템 추가") : "아이템 선택"}
              </h2>
            </div>

            {!showForm ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center space-y-3">
                  <span className="text-5xl">🏪</span>
                  <p className="font-jua text-sm text-wood-dark">
                    목록에서 아이템을 선택하거나
                    <br />새 아이템을 추가하세요.
                  </p>
                  <Button
                    onClick={handleNew}
                    className="font-jua text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-xl"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    새 아이템
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto space-y-3">
                {/* ID */}
                <div>
                  <label className="font-jua text-xs text-wood-dark block mb-1">ID {editingId && <span className="opacity-50">(수정 불가)</span>}</label>
                  <Input
                    value={form.id}
                    onChange={(e) => setForm((f) => ({ ...f, id: e.target.value }))}
                    placeholder="예: daily-package"
                    disabled={!!editingId}
                    className="font-jua text-sm"
                  />
                </div>
                {/* Name */}
                <div>
                  <label className="font-jua text-xs text-wood-dark block mb-1">이름 *</label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="아이템 이름"
                    className="font-jua text-sm"
                  />
                </div>
                {/* Description */}
                <div>
                  <label className="font-jua text-xs text-wood-dark block mb-1">설명</label>
                  <Input
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="간단한 설명"
                    className="font-jua text-sm"
                  />
                </div>
                {/* Type + Icon row */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-jua text-xs text-wood-dark block mb-1">타입 *</label>
                    <select
                      value={form.type}
                      onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                      className="w-full font-jua text-sm border border-parchment-border rounded-lg px-2 py-2 bg-white"
                    >
                      {ITEM_TYPES.map((t) => (
                        <option key={t} value={t}>{typeLabel[t]}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="font-jua text-xs text-wood-dark block mb-1">아이콘 (이모지)</label>
                    <Input
                      value={form.icon}
                      onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                      placeholder="🎁"
                      className="font-jua text-sm"
                    />
                  </div>
                </div>
                {/* Price + Badge row */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-jua text-xs text-wood-dark block mb-1">가격 (코인) *</label>
                    <Input
                      type="number"
                      value={form.price}
                      onChange={(e) => setForm((f) => ({ ...f, price: Number(e.target.value) }))}
                      className="font-jua text-sm"
                    />
                  </div>
                  <div>
                    <label className="font-jua text-xs text-wood-dark block mb-1">배지 (선택)</label>
                    <Input
                      value={form.badge}
                      onChange={(e) => setForm((f) => ({ ...f, badge: e.target.value }))}
                      placeholder="인기, 신규, 한정..."
                      className="font-jua text-sm"
                    />
                  </div>
                </div>
                {/* Quantity + Bonus (coins only) */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-jua text-xs text-wood-dark block mb-1">수량</label>
                    <Input
                      type="number"
                      value={form.quantity}
                      onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))}
                      className="font-jua text-sm"
                    />
                  </div>
                  <div>
                    <label className="font-jua text-xs text-wood-dark block mb-1">보너스</label>
                    <Input
                      type="number"
                      value={form.bonus}
                      onChange={(e) => setForm((f) => ({ ...f, bonus: Number(e.target.value) }))}
                      className="font-jua text-sm"
                    />
                  </div>
                </div>
                {/* Sort order + Active */}
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="font-jua text-xs text-wood-dark block mb-1">정렬 순서</label>
                    <Input
                      type="number"
                      value={form.sort_order}
                      onChange={(e) => setForm((f) => ({ ...f, sort_order: Number(e.target.value) }))}
                      className="font-jua text-sm"
                    />
                  </div>
                  <div className="flex flex-col justify-end">
                    <label className="font-jua text-xs text-wood-dark block mb-1">활성 상태</label>
                    <button
                      onClick={() => setForm((f) => ({ ...f, is_active: !f.is_active }))}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border-2 font-jua text-sm transition-colors ${
                        form.is_active
                          ? "bg-green-50 border-green-300 text-green-700"
                          : "bg-gray-50 border-gray-300 text-gray-500"
                      }`}
                    >
                      {form.is_active
                        ? <><ToggleRight className="w-4 h-4" /> 활성</>
                        : <><ToggleLeft className="w-4 h-4" /> 비활성</>}
                    </button>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 font-jua text-sm bg-orange-500 hover:bg-orange-600 text-white rounded-xl"
                  >
                    <Save className="w-4 h-4 mr-1" />
                    {saving ? "저장 중..." : "저장"}
                  </Button>
                  <Button
                    onClick={handleCancel}
                    variant="ghost"
                    className="font-jua text-sm rounded-xl hover:bg-wood-dark/20"
                  >
                    <X className="w-4 h-4 mr-1" />
                    취소
                  </Button>
                </div>
              </div>
            )}
          </ParchmentPanel>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminPage;
