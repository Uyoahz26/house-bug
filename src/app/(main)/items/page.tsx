"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Card,
  Chip,
  Form,
  Input,
  Label,
  ListBox,
  Modal,
  NumberField,
  Pagination,
  Select,
  Spinner,
  Table,
  TextArea,
  TextField,
} from "@heroui/react";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Eye,
  MapPin,
  Package,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import { useConfirmDialog } from "@/components/providers/confirm-dialog-provider";
import { ImageOcrUploader } from "@/components/items/image-ocr-uploader";
import {
  DetailItem,
  ItemDetailModal,
} from "@/components/items/item-detail-modal";
import { ParsedOcrData, parseOCRText } from "@/lib/ocr/parse";
import { compressImageToMaxBytes } from "@/lib/image/compress";

type ItemStatus = "active" | "consumed" | "discarded";
type ItemStatusFilter = ItemStatus | "all";
type ItemFormMode = "create" | "edit";
type ItemShelfLifeUnit = "day" | "week" | "month" | "year";

interface Item {
  id: string;
  category: string | null;
  location: string | null;
  categoryName: string | null;
  locationName: string | null;
  name: string;
  brand: string | null;
  specification: string | null;
  barcode: string | null;
  quantity: number;
  unit: string;
  productionDate: string | null;
  shelfLifeDays: number | null;
  expiryDate: string | null;
  purchaseDate: string | null;
  purchasePrice: number | null;
  purchaseChannel: string | null;
  imageUrl: string | null;
  status: ItemStatus;
  notes: string | null;
  ocrRawText: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ItemsResponse {
  data?: Item[];
  error?: string;
}

interface ItemResponse {
  data?: Item;
  error?: string;
}

interface FormOptionsResponse {
  data?: {
    categories?: string[];
    locations?: string[];
    units?: string[];
  };
  error?: string;
}

interface UploadImageResponse {
  data?: {
    imageUrl?: string;
  };
  error?: string;
}

interface OcrResponse {
  data?: {
    rawText?: string;
    parsed?: {
      productionDate?: string | null;
      shelfLife?: number | null;
      unit?: "day" | "month" | "year" | null;
    };
  };
  error?: string;
  code?: string;
}

interface ItemFormState {
  name: string;
  brand: string;
  manufacturer: string;
  categoryId: string;
  locationId: string;
  productionDate: string;
  shelfLifeValue: number | undefined;
  shelfLifeUnit: ItemShelfLifeUnit;
  expiryDate: string;
  quantity: number | undefined;
  unit: string;
  barcode: string;
  notes: string;
}

const DEFAULT_FORM_STATE: ItemFormState = {
  name: "",
  brand: "",
  manufacturer: "",
  categoryId: "",
  locationId: "",
  productionDate: "",
  shelfLifeValue: undefined,
  shelfLifeUnit: "day",
  expiryDate: "",
  quantity: 1,
  unit: "个",
  barcode: "",
  notes: "",
};

function getDaysUntil(dateText: string | null): number | null {
  if (!dateText) return null;
  const now = new Date();
  const target = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((target.getTime() - now.getTime()) / msPerDay);
}

function getExpiryStatus(
  dateText: string | null,
): "safe" | "warning" | "expired" {
  const days = getDaysUntil(dateText);
  if (days === null) return "safe";
  if (days < 0) return "expired";
  if (days <= 30) return "warning";
  return "safe";
}

function getStatusText(status: ItemStatus): string {
  if (status === "active") return "正常";
  if (status === "consumed") return "已消耗";
  return "已废弃";
}

function getExpiryText(expiryDate: string | null): string {
  const days = getDaysUntil(expiryDate);
  if (days === null) return "-";
  if (days < 0) return `已过期 ${Math.abs(days)} 天`;
  if (days <= 30) return `剩余 ${days} 天`;
  return `剩余 ${days} 天`;
}

function computeExpiryDate(
  productionDate: string,
  shelfLifeValue: number | undefined,
  shelfLifeUnit: ItemShelfLifeUnit,
): string {
  if (
    !productionDate ||
    shelfLifeValue === undefined ||
    !Number.isFinite(shelfLifeValue) ||
    shelfLifeValue < 0
  ) {
    return "";
  }

  const baseDate = new Date(`${productionDate}T00:00:00`);
  if (Number.isNaN(baseDate.getTime())) {
    return "";
  }

  const amount = Math.floor(shelfLifeValue);
  if (shelfLifeUnit === "day") {
    baseDate.setDate(baseDate.getDate() + amount);
  } else if (shelfLifeUnit === "week") {
    baseDate.setDate(baseDate.getDate() + amount * 7);
  } else if (shelfLifeUnit === "month") {
    baseDate.setMonth(baseDate.getMonth() + amount);
  } else {
    baseDate.setFullYear(baseDate.getFullYear() + amount);
  }

  return baseDate.toISOString().slice(0, 10);
}

function toShelfLifeDays(
  value: number | undefined,
  unit: ItemShelfLifeUnit,
): number | null {
  if (value === undefined || !Number.isFinite(value) || value < 0) {
    return null;
  }

  const amount = Math.floor(value);
  if (unit === "day") return amount;
  if (unit === "week") return amount * 7;
  if (unit === "month") return amount * 30;
  return amount * 365;
}

function mapShelfLifeDaysToForm(days: number | null): {
  value: number | undefined;
  unit: ItemShelfLifeUnit;
} {
  if (days === null || !Number.isFinite(days) || days < 0) {
    return {
      value: undefined,
      unit: "day",
    };
  }

  const amount = Math.floor(days);
  if (amount !== 0 && amount % 365 === 0) {
    return {
      value: amount / 365,
      unit: "year",
    };
  }

  if (amount !== 0 && amount % 30 === 0) {
    return {
      value: amount / 30,
      unit: "month",
    };
  }

  if (amount !== 0 && amount % 7 === 0) {
    return {
      value: amount / 7,
      unit: "week",
    };
  }

  return {
    value: amount,
    unit: "day",
  };
}

function revokePreviewUrl(url: string | null) {
  if (url?.startsWith("blob:")) {
    URL.revokeObjectURL(url);
  }
}

function mapParsedUnitToFormUnit(
  unit: "day" | "month" | "year" | null | undefined,
): ItemShelfLifeUnit {
  if (unit === "month") return "month";
  if (unit === "year") return "year";
  return "day";
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败。"));
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("读取图片失败。"));
        return;
      }

      resolve(reader.result);
    };

    reader.readAsDataURL(file);
  });
}

async function runBrowserOcr(file: File): Promise<string> {
  const Tesseract = await import("tesseract.js");
  const result = await Tesseract.recognize(file, "chi_sim+eng");
  return result.data.text ?? "";
}

export default function ItemsPage() {
  const searchParams = useSearchParams();
  const { confirm } = useConfirmDialog();

  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState<ItemStatusFilter>("all");
  const [busyItemIds, setBusyItemIds] = useState<Record<string, boolean>>({});

  const [categories, setCategories] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [unitOptions, setUnitOptions] = useState<string[]>(["个"]);

  const [isFormOptionsLoading, setIsFormOptionsLoading] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ItemFormMode>("create");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingItemStatus, setEditingItemStatus] =
    useState<ItemStatus>("active");
  const [formState, setFormState] = useState<ItemFormState>(DEFAULT_FORM_STATE);
  const [editedFields, setEditedFields] = useState<
    Partial<Record<keyof ItemFormState, true>>
  >({});
  const [isFormSubmitting, setIsFormSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [selectedImageFile, setSelectedImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);
  const [existingImageUrl, setExistingImageUrl] = useState<string | null>(null);
  const [isImageProcessing, setIsImageProcessing] = useState(false);
  const [ocrRawText, setOcrRawText] = useState("");
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState("");

  const [viewingItem, setViewingItem] = useState<Item | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isDesktopModal, setIsDesktopModal] = useState(false);

  const [page, setPage] = useState(1);
  const ROWS_PER_PAGE = 10;

  const fetchItems = useCallback(
    async (nextStatus: ItemStatusFilter, nextSearch: string) => {
      setLoading(true);
      setError("");
      setPage(1);
      try {
        const params = new URLSearchParams();
        params.set("status", nextStatus);
        const searchValue = nextSearch.trim();
        if (searchValue) params.set("search", searchValue);

        const response = await fetch(`/api/items?${params.toString()}`);
        const payload = (await response.json()) as ItemsResponse;

        if (!response.ok || !payload.data) {
          setError(payload.error ?? "获取物资列表失败。");
          return;
        }

        setItems(payload.data);
      } catch {
        setError("网络异常，获取物资列表失败。");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const fetchFormOptions = useCallback(async () => {
    setIsFormOptionsLoading(true);
    try {
      const response = await fetch("/api/items/form-options");
      const payload = (await response.json()) as FormOptionsResponse;
      if (!response.ok || !payload.data) {
        return;
      }

      setCategories(payload.data.categories ?? []);
      setLocations(payload.data.locations ?? []);

      const normalizedUnits = (payload.data.units ?? []).filter((item) =>
        item.trim(),
      );
      setUnitOptions(normalizedUnits.length > 0 ? normalizedUnits : ["个"]);
    } finally {
      setIsFormOptionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchItems(statusFilter, searchKeyword);
  }, [fetchItems, statusFilter, searchKeyword]);

  useEffect(() => {
    void fetchFormOptions();
  }, [fetchFormOptions]);

  useEffect(() => {
    return () => {
      revokePreviewUrl(imagePreviewUrl);
    };
  }, [imagePreviewUrl]);

  useEffect(() => {
    if (searchParams.get("quickAdd") !== "1") return;
    openCreateModal();
  }, [searchParams, unitOptions]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");

    const update = () => {
      setIsDesktopModal(mediaQuery.matches);
    };

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  const stats = useMemo(() => {
    return {
      total: items.length,
      active: items.filter((item) => item.status === "active").length,
      warning: items.filter(
        (item) => getExpiryStatus(item.expiryDate) === "warning",
      ).length,
      expired: items.filter(
        (item) => getExpiryStatus(item.expiryDate) === "expired",
      ).length,
    };
  }, [items]);

  const totalPages = Math.ceil(items.length / ROWS_PER_PAGE);
  const pagesCountArray = Array.from({ length: totalPages }, (_, i) => i + 1);

  const paginatedItems = useMemo(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    return items.slice(start, start + ROWS_PER_PAGE);
  }, [items, page]);

  function resetFormAndAttachmentState() {
    setEditedFields({});
    setOcrRawText("");
    setOcrError("");
    setIsOcrLoading(false);
    setSelectedImageFile(null);
    setExistingImageUrl(null);
    setIsImageProcessing(false);
    setImagePreviewUrl((prev) => {
      revokePreviewUrl(prev);
      return null;
    });
  }

  function openCreateModal() {
    setModalMode("create");
    setEditingItemId(null);
    setEditingItemStatus("active");
    setFormError("");
    setFormState({
      ...DEFAULT_FORM_STATE,
      unit: unitOptions[0] || "个",
    });
    resetFormAndAttachmentState();
    setIsModalOpen(true);
  }

  function openEditModal(item: Item) {
    const shelfLifePreset = mapShelfLifeDaysToForm(item.shelfLifeDays);

    setModalMode("edit");
    setEditingItemId(item.id);
    setEditingItemStatus(item.status);
    setFormError("");
    setFormState({
      name: item.name,
      brand: item.brand ?? "",
      manufacturer: item.purchaseChannel ?? "",
      categoryId: item.categoryName ?? item.category ?? "",
      locationId: item.locationName ?? item.location ?? "",
      productionDate: item.productionDate ?? "",
      shelfLifeValue: shelfLifePreset.value,
      shelfLifeUnit: shelfLifePreset.unit,
      expiryDate: item.expiryDate ?? "",
      quantity: item.quantity,
      unit: item.unit || unitOptions[0] || "个",
      barcode: item.barcode ?? "",
      notes: item.notes ?? "",
    });
    resetFormAndAttachmentState();
    setExistingImageUrl(item.imageUrl ?? null);
    setOcrRawText(item.ocrRawText ?? "");
    setIsModalOpen(true);
  }

  function openViewModal(item: Item) {
    setViewingItem(item);
    setIsDetailModalOpen(true);
  }

  function updateFormValue<K extends keyof ItemFormState>(
    key: K,
    value: ItemFormState[K],
    source: "user" | "auto" = "user",
  ) {
    if (source === "user") {
      setEditedFields((prev) => ({
        ...prev,
        [key]: true,
      }));
    }

    setFormState((prev) => {
      const next = { ...prev, [key]: value };

      if (
        key === "productionDate" ||
        key === "shelfLifeValue" ||
        key === "shelfLifeUnit"
      ) {
        const computed = computeExpiryDate(
          key === "productionDate" ? String(value) : prev.productionDate,
          key === "shelfLifeValue"
            ? (value as number | undefined)
            : prev.shelfLifeValue,
          key === "shelfLifeUnit"
            ? (value as ItemShelfLifeUnit)
            : prev.shelfLifeUnit,
        );
        if (computed && (!prev.expiryDate || source === "auto")) {
          next.expiryDate = computed;
        }
      }

      return next;
    });
  }

  function closeModal() {
    setIsModalOpen(false);
    setIsFormSubmitting(false);
    setFormError("");
    setOcrError("");
    setIsOcrLoading(false);
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearchKeyword(searchInput.trim());
  }

  function applyOcrResult(parsed: ParsedOcrData, rawText: string) {
    setOcrRawText(rawText.trim());

    const parsedUnit = mapParsedUnitToFormUnit(parsed.unit);

    if (
      parsed.productionDate &&
      !editedFields.productionDate &&
      !formState.productionDate
    ) {
      updateFormValue("productionDate", parsed.productionDate, "auto");
    }

    if (
      parsed.shelfLife !== null &&
      parsed.shelfLife > 0 &&
      !editedFields.shelfLifeValue &&
      formState.shelfLifeValue === undefined
    ) {
      updateFormValue("shelfLifeValue", parsed.shelfLife, "auto");
    }

    if (
      parsed.shelfLife !== null &&
      parsed.shelfLife > 0 &&
      !editedFields.shelfLifeUnit
    ) {
      updateFormValue("shelfLifeUnit", parsedUnit, "auto");
    }
  }

  async function runServerOcr(base64Image: string): Promise<{
    parsed: ParsedOcrData;
    rawText: string;
    shouldFallbackToBrowser: boolean;
  }> {
    const response = await fetch("/api/items/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image: base64Image }),
    });

    const payload = (await response.json()) as OcrResponse;

    if (response.status === 412) {
      return {
        parsed: {
          productionDate: null,
          shelfLife: null,
          unit: null,
        },
        rawText: "",
        shouldFallbackToBrowser: true,
      };
    }

    if (!response.ok || !payload.data) {
      throw new Error(payload.error ?? "服务端 OCR 调用失败。");
    }

    return {
      parsed: {
        productionDate: payload.data.parsed?.productionDate ?? null,
        shelfLife:
          typeof payload.data.parsed?.shelfLife === "number"
            ? payload.data.parsed.shelfLife
            : null,
        unit: payload.data.parsed?.unit ?? null,
      },
      rawText: payload.data.rawText ?? "",
      shouldFallbackToBrowser: false,
    };
  }

  async function onRunOcr() {
    if (!selectedImageFile) {
      setOcrError("请先选择图片后再识别。");
      return;
    }

    setOcrError("");
    setIsOcrLoading(true);

    try {
      const base64Image = await fileToDataUrl(selectedImageFile);
      const serverResult = await runServerOcr(base64Image);

      if (serverResult.shouldFallbackToBrowser) {
        const browserText = await runBrowserOcr(selectedImageFile);
        const parsed = parseOCRText(browserText);
        applyOcrResult(parsed, browserText);
      } else {
        applyOcrResult(serverResult.parsed, serverResult.rawText);
      }
    } catch (ocrException) {
      const fallbackText = await runBrowserOcr(selectedImageFile);
      const fallbackParsed = parseOCRText(fallbackText);
      applyOcrResult(fallbackParsed, fallbackText);

      if (ocrException instanceof Error && ocrException.message) {
        setOcrError(`已启用前端 OCR 识别。服务端异常：${ocrException.message}`);
      }
    } finally {
      setIsOcrLoading(false);
    }
  }

  async function onSelectImageFile(file: File) {
    setOcrError("");
    setIsImageProcessing(true);

    try {
      const compressed = await compressImageToMaxBytes(file, {
        maxBytes: 2 * 1024 * 1024,
      });

      setSelectedImageFile(compressed.file);

      const nextPreviewUrl = URL.createObjectURL(compressed.file);
      setImagePreviewUrl((prev) => {
        revokePreviewUrl(prev);
        return nextPreviewUrl;
      });
    } catch (error) {
      setSelectedImageFile(null);
      setImagePreviewUrl((prev) => {
        revokePreviewUrl(prev);
        return null;
      });
      setOcrError(
        error instanceof Error ? error.message : "图片压缩失败，请重试。",
      );
    } finally {
      setIsImageProcessing(false);
    }
  }

  function onClearImageAttachment() {
    if (selectedImageFile || imagePreviewUrl) {
      setSelectedImageFile(null);
      setImagePreviewUrl((prev) => {
        revokePreviewUrl(prev);
        return null;
      });
      return;
    }

    if (existingImageUrl) {
      setExistingImageUrl(null);
    }
  }

  async function uploadImageIfNeeded(
    itemName: string,
    categoryName: string,
  ): Promise<string | null> {
    if (!selectedImageFile) {
      return existingImageUrl;
    }

    const formData = new FormData();
    formData.set("file", selectedImageFile);
    formData.set("itemName", itemName);
    formData.set("category", categoryName);

    const response = await fetch("/api/items/upload-image", {
      method: "POST",
      body: formData,
    });

    const payload = (await response.json()) as UploadImageResponse;
    if (!response.ok || !payload.data?.imageUrl) {
      throw new Error(payload.error ?? "图片上传失败。");
    }

    return payload.data.imageUrl;
  }

  async function onSubmitModalForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");

    const normalizedName = formState.name.trim();
    if (!normalizedName) {
      setFormError("商品名称不能为空。");
      return;
    }

    const quantity = formState.quantity;
    if (quantity === undefined || !Number.isFinite(quantity) || quantity < 0) {
      setFormError("数量必须大于等于 0。");
      return;
    }

    const shelfLifeDays = toShelfLifeDays(
      formState.shelfLifeValue,
      formState.shelfLifeUnit,
    );
    if (
      shelfLifeDays !== null &&
      (!Number.isInteger(shelfLifeDays) || shelfLifeDays < 0)
    ) {
      setFormError("保质期（天）必须是大于等于 0 的整数。");
      return;
    }

    setIsFormSubmitting(true);
    try {
      const categoryValue = formState.categoryId.trim();
      const imageUrl = await uploadImageIfNeeded(
        normalizedName,
        categoryValue || "未分类",
      );

      const payload = {
        name: normalizedName,
        brand: formState.brand.trim() || null,
        category: categoryValue || null,
        location: formState.locationId.trim() || null,
        barcode: formState.barcode.trim() || null,
        quantity,
        unit: formState.unit.trim() || "个",
        productionDate: formState.productionDate || null,
        shelfLifeDays,
        expiryDate: formState.expiryDate || null,
        purchaseChannel: formState.manufacturer.trim() || null,
        imageUrl,
        ocrRawText: ocrRawText.trim() || null,
        notes: formState.notes.trim() || null,
        status: editingItemStatus,
      };

      const requestUrl =
        modalMode === "edit" && editingItemId
          ? `/api/items/${editingItemId}`
          : "/api/items";
      const requestMethod = modalMode === "edit" ? "PUT" : "POST";

      const response = await fetch(requestUrl, {
        method: requestMethod,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = (await response.json()) as ItemResponse;
      if (!response.ok || !result.data) {
        setFormError(result.error ?? "保存物资失败。");
        return;
      }

      await fetchItems(statusFilter, searchKeyword);
      closeModal();
    } catch (submitError) {
      setFormError(
        submitError instanceof Error
          ? submitError.message
          : "网络异常，保存物资失败。",
      );
    } finally {
      setIsFormSubmitting(false);
    }
  }

  async function withItemBusyState(
    itemId: string,
    action: () => Promise<void>,
  ) {
    setBusyItemIds((prev) => ({ ...prev, [itemId]: true }));
    try {
      await action();
    } finally {
      setBusyItemIds((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  }

  async function removeItem(item: Item) {
    const shouldDelete = await confirm({
      title: `删除「${item.name}」？`,
      description: "删除后会同时移除物资信息与已上传的图片，此操作不可撤销。",
      confirmText: "确认删除",
      cancelText: "取消",
      status: "danger",
    });

    if (!shouldDelete) return;

    await withItemBusyState(item.id, async () => {
      const response = await fetch(`/api/items/${item.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error ?? "删除物资失败。");
        return;
      }

      setItems((prev) => prev.filter((current) => current.id !== item.id));
      if (viewingItem?.id === item.id) {
        setIsDetailModalOpen(false);
        setViewingItem(null);
      }
    });
  }

  return (
    <main className="px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
      <section className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
            囤囤鼠的库存
          </h1>
        </header>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Card className="group relative overflow-hidden border border-zinc-200/80 bg-gradient-to-b from-white to-zinc-50/50 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800/80 dark:from-zinc-900/90 dark:to-zinc-900/50">
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-zinc-100/50 transition-transform duration-500 group-hover:scale-125 dark:bg-zinc-800/50" />
            <Card.Content className="relative flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className=" text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
                  {stats.total}
                </p>
                <div className="flex items-center justify-between">
                  <p className="mr-2 text-[14px] font-medium text-zinc-500 dark:text-zinc-400">
                    全部物资
                  </p>
                  <Package className="h-5 w-5" />
                </div>
              </div>
            </Card.Content>
          </Card>

          <Card className="group relative overflow-hidden border border-emerald-200/60 bg-gradient-to-b from-emerald-50/50 to-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-emerald-900/40 dark:from-emerald-900/20 dark:to-zinc-900/80">
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-emerald-100/40 transition-transform duration-500 group-hover:scale-125 dark:bg-emerald-900/20" />
            <Card.Content className="relative flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-3xl font-bold tracking-tight text-emerald-950 dark:text-emerald-100">
                  {stats.active}
                </p>
                <div className="flex items-center justify-between">
                  <p className="mr-2 text-[14px] font-medium text-emerald-600 dark:text-emerald-500">
                    还能用
                  </p>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
                </div>
              </div>
            </Card.Content>
          </Card>

          <Card className="group relative overflow-hidden border border-amber-200/60 bg-gradient-to-b from-amber-50/50 to-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-amber-900/40 dark:from-amber-900/20 dark:to-zinc-900/80">
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-amber-100/40 transition-transform duration-500 group-hover:scale-125 dark:bg-amber-900/20" />
            <Card.Content className="relative flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-3xl font-bold tracking-tight text-amber-950 dark:text-amber-100">
                  {stats.warning}
                </p>
                <div className="flex items-center justify-between">
                  <p className="mr-2 text-[14px] font-medium text-amber-600 dark:text-amber-500">
                    临期
                  </p>
                  <Clock className="h-5 w-5 text-amber-600 dark:text-amber-500" />
                </div>
              </div>
            </Card.Content>
          </Card>

          <Card className="group relative overflow-hidden border border-rose-200/60 bg-gradient-to-b from-rose-50/50 to-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md dark:border-rose-900/40 dark:from-rose-900/20 dark:to-zinc-900/80">
            <div className="pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full bg-rose-100/40 transition-transform duration-500 group-hover:scale-125 dark:bg-rose-900/20" />
            <Card.Content className="relative flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-3xl font-bold tracking-tight text-rose-950 dark:text-rose-100">
                  {stats.expired}
                </p>
                <div className="flex items-center justify-between">
                  <p className="mr-2 text-[14px] font-medium text-rose-600 dark:text-rose-500">
                    已过期
                  </p>
                  <AlertTriangle className="h-5 w-5 text-rose-600 dark:text-rose-500" />
                </div>
              </div>
            </Card.Content>
          </Card>
        </div>

        {error ? (
          <div className="flex items-center gap-2 rounded-xl border border-red-200/50 bg-red-50/50 p-3 text-[13px] text-red-600 backdrop-blur-md dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {error}
          </div>
        ) : null}

        <div className="flex flex-col gap-3 lg:flex-row">
          <Button
            onPress={openCreateModal}
            className="h-10 bg-zinc-900 px-4 text-[13px] font-medium text-white shadow-sm transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            <Plus className="mr-1 h-4 w-4" />
            新增物资
          </Button>

          <form
            onSubmit={onSearch}
            className="relative flex flex-1 items-center"
          >
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-3">
              <Search className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            </div>
            <Input
              aria-label="搜索物资"
              placeholder="搜索名称、品牌、条码..."
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200/50 bg-white/50 pl-9 text-[13px] shadow-sm backdrop-blur-md transition-colors hover:border-zinc-300 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-800/50 dark:bg-zinc-900/50 dark:hover:border-zinc-700 dark:focus:border-zinc-400 dark:focus:ring-zinc-400"
            />
          </form>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "全部囤货"],
              ["active", "正常"],
              ["consumed", "已消耗"],
              ["discarded", "已废弃"],
            ] as const
          ).map(([value, text]) => (
            <Button
              key={value}
              size="sm"
              onPress={() => setStatusFilter(value)}
              className={`h-8 rounded-full px-3.5 text-[12px] font-medium transition-colors ${
                statusFilter === value
                  ? "bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-black"
                  : "border border-zinc-200/50 bg-white/50 text-zinc-600 backdrop-blur-md hover:bg-zinc-100 dark:border-zinc-800/50 dark:bg-zinc-900/50 dark:text-zinc-300 dark:hover:bg-zinc-800"
              }`}
            >
              {text}
            </Button>
          ))}
        </div>

        {loading ? (
          <div className="flex h-40 items-center justify-center">
            <Spinner size="lg" color="current" className="text-zinc-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300/50 bg-white/30 py-20 backdrop-blur-sm dark:border-zinc-800/50 dark:bg-zinc-900/20">
            <div className="mb-3 rounded-full bg-zinc-100/80 p-4 dark:bg-zinc-800/50">
              <Package className="h-8 w-8 text-zinc-400 dark:text-zinc-500" />
            </div>
            <p className="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">
              暂无物资记录，点击“新增物资”开始创建
            </p>
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <Table className="w-full">
                <Table.ScrollContainer>
                  <Table.Content
                    aria-label="物资库存表格"
                    className="min-w-[1080px]"
                  >
                    <Table.Header>
                      <Table.Column isRowHeader>物资</Table.Column>
                      <Table.Column>分类</Table.Column>
                      <Table.Column>存放位置</Table.Column>
                      <Table.Column>数量</Table.Column>
                      <Table.Column>保质期</Table.Column>
                      <Table.Column>状态</Table.Column>
                      <Table.Column className="text-right">操作</Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {paginatedItems.map((item) => {
                        const isBusy = Boolean(busyItemIds[item.id]);
                        const expiryStatus = getExpiryStatus(item.expiryDate);
                        const statusClass =
                          expiryStatus === "expired"
                            ? "text-rose-600"
                            : expiryStatus === "warning"
                              ? "text-amber-600"
                              : "text-zinc-500";

                        return (
                          <Table.Row key={item.id} id={item.id}>
                            <Table.Cell>
                              <div className="space-y-0.5">
                                <p className="max-w-[260px] truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                  {item.name}
                                </p>
                                {item.brand || item.barcode ? (
                                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                    {item.brand || item.barcode || "-"}
                                  </p>
                                ) : null}
                              </div>
                            </Table.Cell>
                            <Table.Cell>
                              {item.categoryName || item.category || "未分类"}
                            </Table.Cell>
                            <Table.Cell>
                              {item.locationName || item.location || "未设置"}
                            </Table.Cell>
                            <Table.Cell>
                              {item.quantity} {item.unit}
                            </Table.Cell>
                            <Table.Cell>
                              <span
                                className={`text-xs font-medium ${statusClass}`}
                              >
                                {getExpiryText(item.expiryDate)}
                              </span>
                            </Table.Cell>
                            <Table.Cell>
                              {getStatusText(item.status)}
                            </Table.Cell>
                            <Table.Cell>
                              <div className="flex justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 border-none px-2 text-[12px]"
                                  onPress={() => openViewModal(item)}
                                  isDisabled={isBusy}
                                >
                                  <Eye className="mr-1 h-3.5 w-3.5" />
                                  查看
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 border-none px-2 text-[12px]"
                                  onPress={() => openEditModal(item)}
                                  isDisabled={isBusy}
                                >
                                  <Pencil className="mr-1 h-3.5 w-3.5" />
                                  编辑
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-8 border-none px-2 text-[12px] text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
                                  onPress={() => void removeItem(item)}
                                  isDisabled={isBusy}
                                >
                                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                                  删除
                                </Button>
                              </div>
                            </Table.Cell>
                          </Table.Row>
                        );
                      })}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
                {totalPages > 1 && (
                  <Table.Footer>
                    <Pagination size="sm">
                      <Pagination.Summary>
                        显示 {(page - 1) * ROWS_PER_PAGE + 1} 到{" "}
                        {Math.min(page * ROWS_PER_PAGE, items.length)} 条，共{" "}
                        {items.length} 条记录
                      </Pagination.Summary>
                      <Pagination.Content>
                        <Pagination.Item>
                          <Pagination.Previous
                            isDisabled={page === 1}
                            onPress={() => setPage((p) => Math.max(1, p - 1))}
                          >
                            上一页
                          </Pagination.Previous>
                        </Pagination.Item>
                        {pagesCountArray.map((p) => (
                          <Pagination.Item key={p}>
                            <Pagination.Link
                              isActive={p === page}
                              onPress={() => setPage(p)}
                            >
                              {p}
                            </Pagination.Link>
                          </Pagination.Item>
                        ))}
                        <Pagination.Item>
                          <Pagination.Next
                            isDisabled={page === totalPages}
                            onPress={() =>
                              setPage((p) => Math.min(totalPages, p + 1))
                            }
                          >
                            下一页
                          </Pagination.Next>
                        </Pagination.Item>
                      </Pagination.Content>
                    </Pagination>
                  </Table.Footer>
                )}
              </Table>
            </div>

            <div className="grid grid-cols-1 gap-4 md:hidden">
              {paginatedItems.map((item) => {
                const isBusy = Boolean(busyItemIds[item.id]);
                const expiryStatus = getExpiryStatus(item.expiryDate);
                const statusClass =
                  expiryStatus === "expired"
                    ? "text-rose-600 dark:text-rose-500"
                    : expiryStatus === "warning"
                      ? "text-amber-600 dark:text-amber-500"
                      : "text-zinc-500 dark:text-zinc-400";

                return (
                  <Card
                    key={item.id}
                    className="relative pb-2 overflow-hidden border border-zinc-200/50 bg-white/70 shadow-sm dark:border-zinc-800/50 dark:bg-zinc-900/50"
                  >
                    {isBusy ? (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60 backdrop-blur-sm dark:bg-black/50">
                        <Spinner size="sm" color="current" />
                      </div>
                    ) : null}

                    {/* 卡片主体：左侧信息 + 右侧图片 */}
                    <div className="flex gap-4">
                      <div className="flex min-w-0 flex-1 flex-col justify-center space-y-3">
                        <div>
                          <h3 className="line-clamp-1 text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                            {item.name}
                          </h3>
                          <p className="mt-0.5 line-clamp-1 text-[12px] text-zinc-500 dark:text-zinc-400">
                            {item.brand || item.barcode || "无品牌/条码"}
                          </p>
                        </div>

                        <div className="flex flex-wrap gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                          {item.categoryName || item.category ? (
                            <Chip size="sm" className="px-2">
                              <Tag className="h-3 w-3" />
                              {item.categoryName || item.category || "未分类"}
                            </Chip>
                          ) : (
                            ""
                          )}
                          {item.locationName || item.location ? (
                            <Chip size="sm" className="px-2">
                              <MapPin className="h-3 w-3" />
                              {item.locationName || item.location || "未设置"}
                            </Chip>
                          ) : (
                            ""
                          )}
                          <Chip size="sm" className="px-2">
                            <span className="font-bold">{item.quantity}</span>
                            {item.unit}
                          </Chip>
                        </div>
                      </div>

                      <button
                        type="button"
                        aria-label="查看图片大图片"
                        className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-zinc-200/60 bg-zinc-50 transition-all hover:border-zinc-300 dark:border-zinc-700/60 dark:bg-zinc-900/50"
                        onClick={() => openViewModal(item)}
                      >
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-110"
                          />
                        ) : (
                          <div className="flex flex-col gap-1 h-full w-full items-center justify-center transition-colors group-hover:bg-zinc-100 dark:group-hover:bg-zinc-800/80">
                            <Package className="h-7 w-7 text-zinc-300 dark:text-zinc-600" />
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              未上传图片
                            </span>
                          </div>
                        )}
                        <div className="absolute inset-0 rounded-xl ring-1 ring-inset ring-black/5 dark:ring-white/5" />
                      </button>
                    </div>

                    {/* 卡片底部：状态 + 操作 */}
                    <div className="flex pt-2 items-center justify-between border-t border-zinc-100/80 bg-zinc-50/50 dark:border-zinc-800/50 dark:bg-zinc-900/30">
                      <Chip
                        variant="soft"
                        size="sm"
                        color={
                          expiryStatus === "expired"
                            ? "danger"
                            : expiryStatus === "warning"
                              ? "warning"
                              : "default"
                        }
                        className="h-6 gap-1 pl-2"
                      >
                        <div
                          className={`h-1.5 w-1.5 shrink-0  rounded-full ${
                            expiryStatus === "expired"
                              ? "bg-rose-500"
                              : expiryStatus === "warning"
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                          }`}
                        />
                        <Chip.Label className="text-[11px] font-medium">
                          {getExpiryText(item.expiryDate)}
                        </Chip.Label>
                      </Chip>

                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2 text-[12px]"
                          onPress={() => openEditModal(item)}
                          isDisabled={isBusy}
                        >
                          <span>编辑</span>
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          className="h-7 px-2 text-[12px]"
                          onPress={() => void removeItem(item)}
                          isDisabled={isBusy}
                        >
                          <span>删除</span>
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>

            {totalPages > 1 && (
              <div className="flex flex-col items-center gap-3 pt-4 md:hidden">
                <Pagination size="sm" className="w-full">
                  <Pagination.Summary className="text-center text-xs text-zinc-500 w-full mb-2">
                    显示 {(page - 1) * ROWS_PER_PAGE + 1} 到{" "}
                    {Math.min(page * ROWS_PER_PAGE, items.length)} 条，共{" "}
                    {items.length} 条记录
                  </Pagination.Summary>
                  <Pagination.Content className="justify-center">
                    <Pagination.Item>
                      <Pagination.Previous
                        isDisabled={page === 1}
                        onPress={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        上一页
                      </Pagination.Previous>
                    </Pagination.Item>
                    <Pagination.Item>
                      <Pagination.Link isActive>
                        {page} / {totalPages}
                      </Pagination.Link>
                    </Pagination.Item>
                    <Pagination.Item>
                      <Pagination.Next
                        isDisabled={page === totalPages}
                        onPress={() =>
                          setPage((p) => Math.min(totalPages, p + 1))
                        }
                      >
                        下一页
                      </Pagination.Next>
                    </Pagination.Item>
                  </Pagination.Content>
                </Pagination>
              </div>
            )}
          </>
        )}
      </section>

      <Modal.Backdrop
        isOpen={isModalOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            closeModal();
            return;
          }

          setIsModalOpen(true);
        }}
      >
        <Modal.Container size={isDesktopModal ? "cover" : "full"}>
          <Modal.Dialog className="max-h-[95vh] w-full md:w-60vw md:w-[60vw] overflow-auto p-4">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>
                {modalMode === "edit" ? "编辑物品" : "新增物品"}
              </Modal.Heading>
            </Modal.Header>

            <Modal.Body>
              <Form
                onSubmit={onSubmitModalForm}
                className="flex w-full flex-col gap-4 p-2"
                validationBehavior="native"
              >
                <ImageOcrUploader
                  previewUrl={imagePreviewUrl}
                  existingImageUrl={existingImageUrl}
                  isOcrLoading={isOcrLoading}
                  isImageProcessing={isImageProcessing}
                  ocrError={ocrError}
                  hasOcrRawText={Boolean(ocrRawText.trim())}
                  onSelectFile={onSelectImageFile}
                  onRunOcr={() => void onRunOcr()}
                  onClearImage={onClearImageAttachment}
                />

                <TextField
                  isRequired
                  name="name"
                  className="flex flex-col gap-1.5"
                >
                  <Label>商品名称</Label>
                  <Input
                    value={formState.name}
                    onChange={(event) =>
                      updateFormValue("name", event.target.value)
                    }
                    placeholder="例：海飞丝洗发水"
                    variant="secondary"
                  />
                </TextField>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <TextField name="brand" className="flex flex-col gap-1.5">
                    <Label>品牌</Label>
                    <Input
                      value={formState.brand}
                      onChange={(event) =>
                        updateFormValue("brand", event.target.value)
                      }
                      placeholder="品牌名称"
                      variant="secondary"
                    />
                  </TextField>

                  <TextField
                    name="manufacturer"
                    className="flex flex-col gap-1.5"
                  >
                    <Label>厂家</Label>
                    <Input
                      value={formState.manufacturer}
                      onChange={(event) =>
                        updateFormValue("manufacturer", event.target.value)
                      }
                      placeholder="生产厂家"
                      variant="secondary"
                    />
                  </TextField>

                  <Select
                    isRequired
                    value={formState.categoryId || null}
                    onChange={(value) =>
                      updateFormValue(
                        "categoryId",
                        typeof value === "string" ? value : "",
                      )
                    }
                    placeholder="选择分类"
                    variant="secondary"
                    isDisabled={isFormOptionsLoading}
                  >
                    <Label>分类</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {categories.map((option) => (
                          <ListBox.Item
                            key={option}
                            id={option}
                            textValue={option}
                          >
                            {option}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>

                  <Select
                    isRequired
                    value={formState.locationId || null}
                    onChange={(value) =>
                      updateFormValue(
                        "locationId",
                        typeof value === "string" ? value : "",
                      )
                    }
                    placeholder="选择位置"
                    variant="secondary"
                    isDisabled={isFormOptionsLoading}
                  >
                    <Label>存放位置</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {locations.map((option) => (
                          <ListBox.Item
                            key={option}
                            id={option}
                            textValue={option}
                          >
                            {option}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>

                  <TextField
                    isRequired
                    name="productionDate"
                    className="flex flex-col gap-1.5"
                  >
                    <Label>生产日期</Label>
                    <Input
                      type="date"
                      value={formState.productionDate}
                      onChange={(event) =>
                        updateFormValue("productionDate", event.target.value)
                      }
                      variant="secondary"
                    />
                  </TextField>

                  <TextField
                    isRequired
                    name="shelfLifeDays"
                    className="flex flex-col gap-1.5"
                  >
                    <Label>保质期</Label>
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <NumberField
                        aria-label="保质期数值"
                        minValue={0}
                        value={formState.shelfLifeValue}
                        onChange={(value) =>
                          updateFormValue("shelfLifeValue", value)
                        }
                        variant="secondary"
                      >
                        <NumberField.Group>
                          <NumberField.DecrementButton />
                          <NumberField.Input
                            className="w-full"
                            placeholder="例：365"
                          />
                          <NumberField.IncrementButton />
                        </NumberField.Group>
                      </NumberField>

                      <Select
                        isRequired
                        aria-label="保质期单位"
                        className="min-w-[96px]"
                        value={formState.shelfLifeUnit}
                        onChange={(value) =>
                          updateFormValue(
                            "shelfLifeUnit",
                            (typeof value === "string"
                              ? value
                              : "day") as ItemShelfLifeUnit,
                          )
                        }
                        variant="secondary"
                      >
                        <Select.Trigger>
                          <Select.Value />
                          <Select.Indicator />
                        </Select.Trigger>
                        <Select.Popover>
                          <ListBox>
                            <ListBox.Item id="day" textValue="天">
                              天
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="week" textValue="周">
                              周
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="month" textValue="月">
                              月
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                            <ListBox.Item id="year" textValue="年">
                              年
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          </ListBox>
                        </Select.Popover>
                      </Select>
                    </div>
                  </TextField>

                  <TextField
                    isRequired
                    name="expiryDate"
                    className="flex flex-col gap-1.5"
                  >
                    <Label>过期日期</Label>
                    <Input
                      type="date"
                      value={formState.expiryDate}
                      onChange={(event) =>
                        updateFormValue("expiryDate", event.target.value)
                      }
                      variant="secondary"
                    />
                  </TextField>

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div className="flex flex-col gap-1.5">
                      <TextField
                        isRequired
                        name="quantity"
                        className="flex flex-col gap-1.5"
                      >
                        <Label>数量</Label>
                        <NumberField
                          isRequired
                          aria-label="数量"
                          minValue={0}
                          value={formState.quantity}
                          onChange={(value) =>
                            updateFormValue("quantity", value)
                          }
                          variant="secondary"
                        >
                          <NumberField.Group>
                            <NumberField.DecrementButton />
                            <NumberField.Input className="w-full" />
                            <NumberField.IncrementButton />
                          </NumberField.Group>
                        </NumberField>
                      </TextField>
                    </div>

                    <Select
                      className="min-w-[92px]"
                      value={formState.unit || null}
                      onChange={(value) =>
                        updateFormValue(
                          "unit",
                          typeof value === "string" ? value : "",
                        )
                      }
                      placeholder="单位"
                      variant="secondary"
                      isDisabled={isFormOptionsLoading}
                    >
                      <Label>单位</Label>
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox>
                          {unitOptions.map((option) => (
                            <ListBox.Item
                              key={option}
                              id={option}
                              textValue={option}
                            >
                              {option}
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  </div>

                  <TextField name="barcode" className="flex flex-col gap-1.5">
                    <Label>条形码</Label>
                    <Input
                      value={formState.barcode}
                      onChange={(event) =>
                        updateFormValue("barcode", event.target.value)
                      }
                      placeholder="可选"
                      variant="secondary"
                    />
                  </TextField>

                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label>备注</Label>
                    <TextArea
                      value={formState.notes}
                      onChange={(event) =>
                        updateFormValue("notes", event.target.value)
                      }
                      placeholder="补充说明..."
                      variant="secondary"
                    />
                  </div>
                </div>

                {formError ? (
                  <div className="rounded-xl border border-red-200/50 bg-red-50/70 p-3 text-[13px] text-red-600 dark:border-red-900/30 dark:bg-red-900/20 dark:text-red-400">
                    {formError}
                  </div>
                ) : null}

                <Modal.Footer className="w-full p-0 pt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    className="flex-1"
                    onPress={closeModal}
                    isDisabled={
                      isFormSubmitting || isOcrLoading || isImageProcessing
                    }
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    isPending={isFormSubmitting}
                    isDisabled={isOcrLoading || isImageProcessing}
                  >
                    {isFormSubmitting ? "保存中..." : "保存"}
                  </Button>
                </Modal.Footer>
              </Form>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <ItemDetailModal
        item={viewingItem as DetailItem | null}
        isOpen={isDetailModalOpen}
        onOpenChange={(nextOpen) => {
          setIsDetailModalOpen(nextOpen);
          if (!nextOpen) {
            setViewingItem(null);
          }
        }}
      />

      <div className="pb-10 md:pb-0" />
    </main>
  );
}
