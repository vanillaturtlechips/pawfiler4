import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import {
  ShopItem,
  ShopItemRequest,
  listShopItems,
  createShopItem,
  updateShopItem,
  deleteShopItem,
  uploadShopImage,
} from "../lib/adminApi";

const ITEM_TYPES = ["subscription", "coins", "item"];

const emptyForm = (): ShopItemRequest => ({
  name: "",
  description: "",
  price: 100,
  icon: "",
  badge: "",
  type: "coin_bonus",
  quantity: 1,
  bonus: 0,
  is_active: true,
  sort_order: 0,
});

export default function AdminShopPage() {
  const [items, setItems] = useState<ShopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ShopItem | null>(null);
  const [form, setForm] = useState<ShopItemRequest>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      setItems(await listShopItems());
    } catch {
      toast.error("상점 아이템을 불러오지 못했습니다");
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(item: ShopItem) {
    setEditing(item);
    setForm({
      name: item.name,
      description: item.description,
      price: item.price,
      icon: item.icon,
      badge: item.badge,
      type: item.type,
      quantity: item.quantity,
      bonus: item.bonus,
      is_active: item.is_active,
      sort_order: item.sort_order,
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!form.name.trim()) {
      toast.error("아이템 이름을 입력하세요");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateShopItem(editing.id, form);
        toast.success("아이템이 수정되었습니다");
      } else {
        await createShopItem(form);
        toast.success("아이템이 등록되었습니다");
      }
      setDialogOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: ShopItem) {
    if (!confirm(`"${item.name}" 아이템을 삭제하시겠습니까?`)) return;
    try {
      await deleteShopItem(item.id);
      toast.success("삭제되었습니다");
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "삭제 실패");
    }
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { url } = await uploadShopImage(file);
      setForm((f) => ({ ...f, icon: url }));
      toast.success("이미지가 업로드되었습니다");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "업로드 실패");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function set<K extends keyof ShopItemRequest>(k: K, v: ShopItemRequest[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">상점 관리</h1>
        <Button onClick={openCreate}>+ 아이템 등록</Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">불러오는 중...</div>
      ) : items.length === 0 ? (
        <div className="text-muted-foreground text-sm">등록된 아이템이 없습니다</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr>
                <th className="px-4 py-2">아이콘</th>
                <th className="px-4 py-2">이름</th>
                <th className="px-4 py-2">타입</th>
                <th className="px-4 py-2">가격</th>
                <th className="px-4 py-2">수량</th>
                <th className="px-4 py-2">보너스</th>
                <th className="px-4 py-2">상태</th>
                <th className="px-4 py-2">순서</th>
                <th className="px-4 py-2">액션</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t hover:bg-muted/30">
                  <td className="px-4 py-2">
                    {item.icon && item.icon.startsWith("http") ? (
                      <img src={item.icon} alt="" className="w-10 h-10 object-cover rounded" />
                    ) : (
                      <span className="text-2xl">{item.icon || item.badge || "🛍"}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 font-medium">
                    {item.name}
                    {item.description && (
                      <div className="text-xs text-muted-foreground">{item.description}</div>
                    )}
                  </td>
                  <td className="px-4 py-2">{item.type}</td>
                  <td className="px-4 py-2">{item.price.toLocaleString()}코인</td>
                  <td className="px-4 py-2">{item.quantity}</td>
                  <td className="px-4 py-2">{item.bonus}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        item.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {item.is_active ? "활성" : "비활성"}
                    </span>
                  </td>
                  <td className="px-4 py-2">{item.sort_order}</td>
                  <td className="px-4 py-2 space-x-2">
                    <Button size="sm" variant="outline" onClick={() => openEdit(item)}>
                      수정
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => handleDelete(item)}
                    >
                      삭제
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Dialog */}
      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold">
              {editing ? "아이템 수정" : "아이템 등록"}
            </h2>

            <div className="space-y-3">
              {/* Name */}
              <div>
                <label className="text-sm font-medium">이름 *</label>
                <input
                  className="mt-1 w-full border rounded px-3 py-2 text-sm"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="아이템 이름"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium">설명</label>
                <textarea
                  className="mt-1 w-full border rounded px-3 py-2 text-sm"
                  rows={2}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                  placeholder="아이템 설명"
                />
              </div>

              {/* Icon image upload */}
              <div>
                <label className="text-sm font-medium">아이콘 이미지</label>
                <div className="mt-1 flex items-center gap-3">
                  {form.icon && (
                    form.icon.startsWith("http") ? (
                      <img
                        src={form.icon}
                        alt="preview"
                        className="w-14 h-14 object-cover rounded border"
                      />
                    ) : (
                      <span className="text-4xl">{form.icon}</span>
                    )
                  )}
                  <div className="flex flex-col gap-1">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? "업로드 중..." : "이미지 업로드"}
                    </Button>
                    {form.icon && (
                      <button
                        className="text-xs text-muted-foreground underline"
                        onClick={() => set("icon", "")}
                      >
                        이미지 제거
                      </button>
                    )}
                  </div>
                </div>
                <input
                  className="mt-2 w-full border rounded px-3 py-2 text-sm"
                  value={form.icon}
                  onChange={(e) => set("icon", e.target.value)}
                  placeholder="또는 이미지 URL 직접 입력"
                />
              </div>

              {/* Badge emoji */}
              <div>
                <label className="text-sm font-medium">배지 이모지</label>
                <input
                  className="mt-1 w-full border rounded px-3 py-2 text-sm"
                  value={form.badge}
                  onChange={(e) => set("badge", e.target.value)}
                  placeholder="예: 🎁"
                />
              </div>

              {/* Type */}
              <div>
                <label className="text-sm font-medium">타입</label>
                <select
                  className="mt-1 w-full border rounded px-3 py-2 text-sm"
                  value={form.type}
                  onChange={(e) => set("type", e.target.value)}
                >
                  {ITEM_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Price / Quantity / Bonus */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium">가격 (코인)</label>
                  <input
                    type="number"
                    className="mt-1 w-full border rounded px-3 py-2 text-sm"
                    value={form.price}
                    min={0}
                    onChange={(e) => set("price", Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">수량</label>
                  <input
                    type="number"
                    className="mt-1 w-full border rounded px-3 py-2 text-sm"
                    value={form.quantity}
                    min={0}
                    onChange={(e) => set("quantity", Number(e.target.value))}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">보너스</label>
                  <input
                    type="number"
                    className="mt-1 w-full border rounded px-3 py-2 text-sm"
                    value={form.bonus}
                    min={0}
                    onChange={(e) => set("bonus", Number(e.target.value))}
                  />
                </div>
              </div>

              {/* Sort order / Active */}
              <div className="flex items-center gap-6">
                <div>
                  <label className="text-sm font-medium">정렬 순서</label>
                  <input
                    type="number"
                    className="mt-1 w-28 border rounded px-3 py-2 text-sm"
                    value={form.sort_order}
                    onChange={(e) => set("sort_order", Number(e.target.value))}
                  />
                </div>
                <div className="flex items-center gap-2 mt-5">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={form.is_active}
                    onChange={(e) => set("is_active", e.target.checked)}
                  />
                  <label htmlFor="is_active" className="text-sm font-medium">
                    활성화
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>
                취소
              </Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
