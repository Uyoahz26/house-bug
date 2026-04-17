"use client";

import { useRef } from "react";
import { Button, Spinner } from "@heroui/react";
import {
  Camera,
  RefreshCw,
  ScanText,
  Trash2,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Image as ImageIcon,
} from "lucide-react";

interface ImageOcrUploaderProps {
  previewUrl: string | null;
  existingImageUrl: string | null;
  isOcrLoading: boolean;
  isImageProcessing: boolean;
  ocrError: string;
  hasOcrRawText: boolean;
  onSelectFile: (file: File) => Promise<void> | void;
  onRunOcr: () => void;
  onClearImage: () => void;
}

export function ImageOcrUploader({
  previewUrl,
  existingImageUrl,
  isOcrLoading,
  isImageProcessing,
  ocrError,
  hasOcrRawText,
  onSelectFile,
  onRunOcr,
  onClearImage,
}: ImageOcrUploaderProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  function triggerFileInput(captureMode: "camera" | "album") {
    if (!fileRef.current) {
      return;
    }

    if (captureMode === "camera") {
      fileRef.current.setAttribute("capture", "environment");
    } else {
      fileRef.current.removeAttribute("capture");
    }

    fileRef.current.click();
  }

  function handleInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    void onSelectFile(file);
    event.target.value = "";
  }

  const displayImageUrl = previewUrl || existingImageUrl;

  return (
    <section className="font-sans dark:border-zinc-800/80 dark:from-zinc-900/50 dark:to-zinc-950/50 sm:col-span-2">
      <div className="mb-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex shrink-0 items-center justify-end gap-2">
          {displayImageUrl ? (
            <>
              <Button
                type="button"
                size="sm"
                className="h-8 bg-indigo-600 px-3 text-[12px] font-medium text-white shadow-md shadow-indigo-600/20 transition-all hover:bg-indigo-700 active:scale-95 disabled:bg-indigo-600/50 disabled:text-white/70 dark:bg-indigo-500"
                onPress={onRunOcr}
                isDisabled={!previewUrl || isOcrLoading || isImageProcessing}
              >
                {isOcrLoading ? (
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ScanText className="mr-1.5 h-3.5 w-3.5" />
                )}
                开始识别
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-8 border border-rose-200/50 bg-rose-50 px-3 text-[12px] font-medium text-rose-600 shadow-sm transition-colors hover:bg-rose-100 dark:border-rose-900/30 dark:bg-rose-500/10 dark:text-rose-400 dark:hover:bg-rose-500/20"
                onPress={onClearImage}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                移除图片
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 bg-zinc-100 px-3 text-[12px] font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                onPress={() => triggerFileInput("camera")}
                isDisabled={isImageProcessing}
              >
                <Camera className="mr-1.5 h-3.5 w-3.5" />
                拍照
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="h-8 bg-zinc-100 px-3 text-[12px] font-medium text-zinc-700 shadow-sm transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                onPress={() => triggerFileInput("album")}
                isDisabled={isImageProcessing}
              >
                <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
                上传图片
              </Button>
            </>
          )}
        </div>
      </div>

      {displayImageUrl ? (
        <div className="relative overflow-hidden rounded-xl border border-zinc-200/80 bg-zinc-100/50 p-2 shadow-inner dark:border-zinc-800/80 dark:bg-zinc-950/50">
          <img
            src={displayImageUrl}
            alt="商品图片预览"
            className="mx-auto max-h-[300px] w-auto rounded-lg object-contain drop-shadow-md"
          />
          {isOcrLoading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm dark:bg-black/50">
              <div className="flex items-center gap-2 rounded-full border border-zinc-200/80 bg-white/90 px-4 py-2 text-[13px] font-medium text-zinc-700 shadow-sm backdrop-blur-md dark:border-zinc-700/80 dark:bg-zinc-900/90 dark:text-zinc-200">
                <Spinner size="sm" color="current" />
                正在深度识别中...
              </div>
            </div>
          ) : null}
          {isImageProcessing ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 backdrop-blur-sm dark:bg-black/50">
              <div className="flex items-center gap-2 rounded-full border border-zinc-200/80 bg-white/90 px-4 py-2 text-[13px] font-medium text-zinc-700 shadow-sm backdrop-blur-md dark:border-zinc-700/80 dark:bg-zinc-900/90 dark:text-zinc-200">
                <Spinner size="sm" color="current" />
                图片压缩优化中...
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => triggerFileInput("album")}
          className="group flex h-[140px] w-full flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 text-[13px] text-zinc-500 transition-all hover:border-indigo-400 hover:bg-indigo-50/30 dark:border-zinc-700 dark:bg-zinc-900/20 dark:hover:border-indigo-500/50 dark:hover:bg-indigo-900/10"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm transition-transform group-hover:scale-110 dark:bg-zinc-800">
            <ImageIcon className="h-5 w-5 text-zinc-400 group-hover:text-indigo-500 dark:text-zinc-500 dark:group-hover:text-indigo-400" />
          </div>
          <p className="font-medium tracking-tight group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
            点击此处上传或使用上方菜单选取
          </p>
        </button>
      )}

      {hasOcrRawText ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200/60 bg-emerald-50/50 px-3 py-2.5 text-[12px] text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/20 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          已成功提取商品信息并尝试填表
        </div>
      ) : null}

      {ocrError ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-200/60 bg-rose-50/50 px-3 py-2.5 text-[12px] text-rose-600 dark:border-rose-900/30 dark:bg-rose-900/20 dark:text-rose-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {ocrError}
        </div>
      ) : null}

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleInputChange}
      />
    </section>
  );
}
