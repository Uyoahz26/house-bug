"use client";

import { useMemo, useState } from "react";
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
        <Modal.Container placement="center" size="lg">
          <Modal.Dialog className="max-h-[90vh] overflow-auto p-4 sm:p-5">
            <Modal.CloseTrigger />
            <Modal.Header>
              <div className="w-full space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Modal.Heading className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                    {item.name}
                  </Modal.Heading>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${expiryMeta.className}`}
                  >
                    {expiryMeta.text}
                  </span>
                </div>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  {item.brand || "未填写品牌"}
                </p>
              </div>
            </Modal.Header>

            <Modal.Body>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[300px_minmax(0,1fr)]">
                <Card className="border border-zinc-200/70 bg-zinc-50/70 dark:border-zinc-800/70 dark:bg-zinc-900/40">
                  <Card.Content className="space-y-3 p-3">
                    {item.imageUrl ? (
                      <div className="space-y-2">
                        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950/70">
                          <img
                            src={item.imageUrl}
                            alt={`${item.name} 图片`}
                            className="mx-auto max-h-60 w-auto cursor-zoom-in rounded-md object-contain"
                            onClick={() => setIsImagePreviewOpen(true)}
                          />
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="w-full"
                          onPress={() => setIsImagePreviewOpen(true)}
                        >
                          <Eye className="mr-1.5 h-4 w-4" />
                          预览大图
                        </Button>
                      </div>
                    ) : (
                      <div className="flex h-52 items-center justify-center rounded-lg border border-dashed border-zinc-300 text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                        暂无图片
                      </div>
                    )}
                  </Card.Content>
                </Card>

                <Card className="border border-zinc-200/70 bg-white/80 dark:border-zinc-800/70 dark:bg-zinc-900/50">
                  <Card.Content className="space-y-3 p-4">
                    <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                      <div className="rounded-lg border border-zinc-200/70 bg-zinc-50 p-3 dark:border-zinc-800/70 dark:bg-zinc-900/60">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          分类
                        </p>
                        <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                          {item.categoryName || item.category || "未分类"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-zinc-200/70 bg-zinc-50 p-3 dark:border-zinc-800/70 dark:bg-zinc-900/60">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          位置
                        </p>
                        <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                          {item.locationName || item.location || "未设置"}
                        </p>
                      </div>
                      <div className="rounded-lg border border-zinc-200/70 bg-zinc-50 p-3 dark:border-zinc-800/70 dark:bg-zinc-900/60">
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          数量
                        </p>
                        <p className="mt-1 font-medium text-zinc-900 dark:text-zinc-100">
                          {item.quantity} {item.unit}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 rounded-lg border border-zinc-200/70 bg-zinc-50/80 p-3 dark:border-zinc-800/70 dark:bg-zinc-900/50">
                      <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                        <CalendarDays className="h-4 w-4 text-zinc-500" />
                        <span>生产日期：{item.productionDate || "-"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                        <Clock3 className="h-4 w-4 text-zinc-500" />
                        <span>
                          保质期：
                          {item.shelfLifeDays
                            ? `${item.shelfLifeDays} 天`
                            : "-"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                        <Tag className="h-4 w-4 text-zinc-500" />
                        <span>过期日期：{item.expiryDate || "-"}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-200">
                        <Package className="h-4 w-4 text-zinc-500" />
                        <span>
                          状态：
                          {item.status === "active"
                            ? "在库"
                            : item.status === "consumed"
                              ? "已消耗"
                              : "已废弃"}
                        </span>
                      </div>
                    </div>

                    <div className="rounded-lg border border-zinc-200/70 bg-zinc-50/80 p-3 dark:border-zinc-800/70 dark:bg-zinc-900/50">
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">
                        备注
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-200">
                        {item.notes || "暂无备注"}
                      </p>
                    </div>
                  </Card.Content>
                </Card>
              </div>
            </Modal.Body>

            <Modal.Footer>
              <Button variant="secondary" onPress={() => onOpenChange(false)}>
                关闭
              </Button>
            </Modal.Footer>
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
