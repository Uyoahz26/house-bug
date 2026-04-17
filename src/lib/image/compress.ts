const MAX_COMPRESSION_ATTEMPTS = 14;

export interface CompressImageResult {
  file: File;
  originalSize: number;
  compressed: boolean;
}

interface CompressOptions {
  maxBytes: number;
  maxDimension: number;
  minQuality: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getOutputFileName(fileName: string, mimeType: string): string {
  const extension = mimeType === "image/png" ? "png" : "jpg";
  return fileName.replace(/\.[a-z0-9]+$/i, "") + `.${extension}`;
}

function getOutputMimeType(inputMimeType: string): "image/jpeg" | "image/png" {
  if (inputMimeType === "image/png") {
    return "image/png";
  }

  return "image/jpeg";
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("读取图片失败，无法执行压缩。"));
    };

    image.src = objectUrl;
  });
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("图片压缩失败，请重试。"));
          return;
        }

        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

function drawToCanvas(
  image: HTMLImageElement,
  scale: number,
  outputMimeType: "image/jpeg" | "image/png",
): HTMLCanvasElement {
  const width = Math.max(1, Math.floor(image.width * scale));
  const height = Math.max(1, Math.floor(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("浏览器不支持 Canvas 上下文。");
  }

  if (outputMimeType === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }

  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

export async function compressImageToMaxBytes(
  file: File,
  options?: Partial<CompressOptions>,
): Promise<CompressImageResult> {
  const maxBytes = options?.maxBytes ?? 2 * 1024 * 1024;
  const maxDimension = options?.maxDimension ?? 2048;
  const minQuality = clamp(options?.minQuality ?? 0.45, 0.2, 0.95);

  if (!file.type.startsWith("image/")) {
    throw new Error("仅支持压缩图片文件。");
  }

  if (file.size <= maxBytes) {
    return {
      file,
      originalSize: file.size,
      compressed: false,
    };
  }

  const image = await loadImage(file);
  const outputMimeType = getOutputMimeType(file.type);

  const longestSide = Math.max(image.width, image.height);
  const baseScale = longestSide > maxDimension ? maxDimension / longestSide : 1;

  let quality = outputMimeType === "image/png" ? 1 : 0.92;
  let scale = baseScale;

  let bestBlob: Blob | null = null;

  for (let attempt = 0; attempt < MAX_COMPRESSION_ATTEMPTS; attempt += 1) {
    const canvas = drawToCanvas(image, scale, outputMimeType);
    const blob = await canvasToBlob(canvas, outputMimeType, quality);

    if (!bestBlob || blob.size < bestBlob.size) {
      bestBlob = blob;
    }

    if (blob.size <= maxBytes) {
      const compressedFile = new File(
        [blob],
        getOutputFileName(file.name, outputMimeType),
        {
          type: outputMimeType,
          lastModified: Date.now(),
        },
      );

      return {
        file: compressedFile,
        originalSize: file.size,
        compressed: true,
      };
    }

    if (quality > minQuality) {
      quality = clamp(quality - 0.08, minQuality, 0.95);
    } else {
      scale *= 0.85;
      quality = outputMimeType === "image/png" ? 1 : 0.92;
    }
  }

  if (bestBlob && bestBlob.size < file.size) {
    const fallbackFile = new File(
      [bestBlob],
      getOutputFileName(file.name, outputMimeType),
      {
        type: outputMimeType,
        lastModified: Date.now(),
      },
    );

    if (fallbackFile.size <= maxBytes) {
      return {
        file: fallbackFile,
        originalSize: file.size,
        compressed: true,
      };
    }
  }

  throw new Error("图片压缩后仍超过 2MB，请选择更小图片。");
}
