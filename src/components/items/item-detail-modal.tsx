"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Card, Modal } from "@heroui/react";
import { CalendarDays, Clock3, Eye, Package, Tag } from "lucide-react";

export type DetailItemStatus = "active" | "consumed" | "discarded";

export interface DetailItem {
  id: string;
  name: string;
  brand: string | null;
  categoryName: string | null;
  category: string | null;
  locationName: string | null;
  location: string | null;
  quantity: number;
  unit: string;
  productionDate: string | null;
  shelfLifeDays: number | null;
  expiryDate: string | null;
  status: DetailItemStatus;
  notes: string | null;
  imageUrl: string | null;
}

interface ItemDetailModalProps {
  item: DetailItem | null;
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

function getDaysUntil(dateText: string | null): number | null {
  if (!dateText) {
    return null;
  }

  const today = new Date();
  const target = new Date(`${dateText}T00:00:00`);
  if (Number.isNaN(target.getTime())) {
    return null;
  }

  const days = Math.floor(
    (target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  return days;
}

function getExpiryTagMeta(expiryDate: string | null): {
  text: string;
  className: string;
} {
  const days = getDaysUntil(expiryDate);
  if (days === null) {
    return {
      text: "未设置保质期",
      className:
        "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/70 dark:text-zinc-300",
    };
  }

  if (days < 0) {
    return {
      text: `已过期 ${Math.abs(days)} 天`,
      className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    };
  }

  if (days <= 30) {
    return {
      text: `临期 ${days} 天`,
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    };
  }

  return {
    text: `剩余 ${days} 天`,
    className:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  };
}

export function ItemDetailModal({
  item,
  isOpen,
  onOpenChange,
}: ItemDetailModalProps) {
  const [isImagePreviewOpen, setIsImagePreviewOpen] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 768px)");

    const update = () => {
      setIsDesktop(mediaQuery.matches);
    };

    update();
    mediaQuery.addEventListener("change", update);
    return () => mediaQuery.removeEventListener("change", update);
  }, []);

  const expiryMeta = useMemo(
    () => getExpiryTagMeta(item?.expiryDate ?? null),
    [item?.expiryDate],
  );

  if (!item) {
    return null;
  }

  return (
    <>
      <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Modal.Container placement="center" size={isDesktop ? "cover" : "full"}>
          <Modal.Dialog className="max-h-[100vh] w-full overflow-hidden p-0 md:w-[60vw]">
            <Modal.CloseTrigger className="absolute right-4 top-4 z-10 text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors" />

            <div className="flex h-full max-h-[100vh] flex-col md:flex-row">
              {/* Left Column: Edge-to-edge image on mobile, full height on desktop */}
              <div className="relative flex min-h-[240px] w-full shrink-0 flex-col items-center justify-center bg-zinc-100/80 dark:bg-zinc-900/50 md:w-[40%]">
                {item.imageUrl ? (
                  <>
                    <img
                      src={item.imageUrl}
                      alt={`${item.name} 图片`}
                      className="absolute inset-0 h-full w-full cursor-zoom-in object-cover opacity-30 blur-xl dark:opacity-20"
                      aria-hidden="true"
                    />
                    <img
                      src={item.imageUrl}
                      alt={`${item.name} 图片`}
                      className="relative z-10 max-h-[40vh] w-auto cursor-zoom-in object-contain p-6 md:max-h-[70vh]"
                      onClick={() => setIsImagePreviewOpen(true)}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="absolute bottom-4 right-4 z-10 shadow-sm backdrop-blur-md bg-white/80 dark:bg-zinc-800/80 hover:bg-white dark:hover:bg-zinc-800"
                      onPress={() => setIsImagePreviewOpen(true)}
                    >
                      <Eye className="mr-1.5 h-4 w-4" />
                      大图
                    </Button>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center text-zinc-400 dark:text-zinc-600">
                    <Package className="mb-3 h-12 w-12 opacity-20" />
                    <span className="text-sm font-medium tracking-wide">
                      暂无图片
                    </span>
                  </div>
                )}
              </div>

              {/* Right Column: Details */}
              <div className="flex w-full flex-col overflow-y-auto p-6 md:p-8">
                <Modal.Header className="px-0 pb-6 pt-0 border-b-0">
                  <div className="space-y-4 w-full">
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 pr-6">
                        <Modal.Heading className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                          {item.name}
                        </Modal.Heading>
                        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                          {item.brand || "未填写品牌"}
                        </p>
                      </div>
                      <span
                        className={`mt-1 shrink-0 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide ${expiryMeta.className}`}
                      >
                        {expiryMeta.text}
                      </span>
                    </div>
                  </div>
                </Modal.Header>

                <Modal.Body className="px-0 py-0 space-y-8">
                  {/* Basic Info Grid */}
                  <div className="grid grid-cols-3 gap-2 sm:gap-4">
                    <div className="group flex flex-col rounded-xl border border-zinc-200/60 bg-white p-3.5 shadow-sm transition-all hover:border-zinc-300 dark:border-zinc-800/60 dark:bg-zinc-900/30 dark:hover:border-zinc-700">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        分类
                      </p>
                      <p
                        className="mt-1.5 truncate font-medium text-zinc-900 dark:text-zinc-100"
                        title={item.categoryName || item.category || "未分类"}
                      >
                        {item.categoryName || item.category || "未分类"}
                      </p>
                    </div>
                    <div className="group flex flex-col rounded-xl border border-zinc-200/60 bg-white p-3.5 shadow-sm transition-all hover:border-zinc-300 dark:border-zinc-800/60 dark:bg-zinc-900/30 dark:hover:border-zinc-700">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        位置
                      </p>
                      <p
                        className="mt-1.5 truncate font-medium text-zinc-900 dark:text-zinc-100"
                        title={item.locationName || item.location || "未设置"}
                      >
                        {item.locationName || item.location || "未设置"}
                      </p>
                    </div>
                    <div className="group flex flex-col rounded-xl border border-zinc-200/60 bg-white p-3.5 shadow-sm transition-all hover:border-zinc-300 dark:border-zinc-800/60 dark:bg-zinc-900/30 dark:hover:border-zinc-700">
                      <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        数量
                      </p>
                      <p className="mt-1.5 font-medium text-zinc-900 dark:text-zinc-100">
                        {item.quantity} {item.unit}
                      </p>
                    </div>
                  </div>

                  {/* Dates & Status List */}
                  <div className="space-y-3.5">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      日期与状态
                    </h4>
                    <div className="divide-y divide-zinc-100 rounded-xl border border-zinc-200/60 bg-white shadow-sm dark:divide-zinc-800/60 dark:border-zinc-800/60 dark:bg-zinc-900/30">
                      <div className="flex items-center justify-between p-3.5">
                        <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400">
                          <CalendarDays className="h-4 w-4" />
                          <span className="text-sm">生产日期</span>
                        </div>
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {item.productionDate || "-"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3.5">
                        <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400">
                          <Clock3 className="h-4 w-4" />
                          <span className="text-sm">保质期</span>
                        </div>
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {item.shelfLifeDays
                            ? `${item.shelfLifeDays} 天`
                            : "-"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3.5">
                        <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400">
                          <Tag className="h-4 w-4" />
                          <span className="text-sm">过期日期</span>
                        </div>
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {item.expiryDate || "-"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between p-3.5">
                        <div className="flex items-center gap-2.5 text-zinc-500 dark:text-zinc-400">
                          <Package className="h-4 w-4" />
                          <span className="text-sm">当前状态</span>
                        </div>
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {item.status === "active"
                            ? "在库"
                            : item.status === "consumed"
                              ? "已消耗"
                              : "已废弃"}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Notes */}
                  {item.notes ? (
                    <div className="space-y-2.5">
                      <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        备注
                      </h4>
                      <p className="whitespace-pre-wrap rounded-xl bg-zinc-50 p-4 text-sm leading-relaxed text-zinc-700 dark:bg-zinc-800/30 dark:text-zinc-300">
                        {item.notes}
                      </p>
                    </div>
                  ) : null}
                </Modal.Body>

                <div className="mt-8 flex justify-end mt-auto pt-4">
                  <Button
                    variant="secondary"
                    className="px-6"
                    onPress={() => onOpenChange(false)}
                  >
                    关闭
                  </Button>
                </div>
              </div>
            </div>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <Modal.Backdrop
        isOpen={isImagePreviewOpen}
        onOpenChange={setIsImagePreviewOpen}
      >
        <Modal.Container placement="center" size="lg">
          <Modal.Dialog className="max-h-[92vh] overflow-auto p-2">
            <Modal.CloseTrigger />
            <Modal.Body>
              {item.imageUrl ? (
                <img
                  src={item.imageUrl}
                  alt={`${item.name} 大图预览`}
                  className="mx-auto max-h-[80vh] w-auto rounded-lg object-contain"
                />
              ) : null}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}
