import { NextResponse } from "next/server";
import { requireActiveUser } from "@/lib/auth/authorization";
import { AuthError } from "@/lib/auth/middleware";
import { getDb } from "@/lib/db/client";
import { uploadImageToCos } from "@/lib/storage/cos";

export const runtime = "edge";

const MAX_IMAGE_SIZE_BYTES = 2 * 1024 * 1024;

function isAllowedImageType(contentType: string): boolean {
  return (
    contentType.startsWith("image/jpeg") ||
    contentType.startsWith("image/png") ||
    contentType.startsWith("image/webp") ||
    contentType.startsWith("image/gif")
  );
}

export async function POST(request: Request) {
  try {
    await requireActiveUser(request);

    const formData = await request.formData();
    const file = formData.get("file");
    const category =
      typeof formData.get("category") === "string"
        ? String(formData.get("category")).trim()
        : "";
    const itemName =
      typeof formData.get("itemName") === "string"
        ? String(formData.get("itemName")).trim()
        : "";

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请上传图片文件。" }, { status: 400 });
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return NextResponse.json(
        { error: "图片大小不能超过 2MB。" },
        { status: 400 },
      );
    }

    if (!isAllowedImageType(file.type)) {
      return NextResponse.json(
        { error: "仅支持 JPG、PNG、WEBP、GIF 图片。" },
        { status: 400 },
      );
    }

    const content = await file.arrayBuffer();
    const db = getDb();

    const uploaded = await uploadImageToCos(db, {
      fileName: file.name || "item-image.jpg",
      categoryName: category || "未分类",
      itemName: itemName || "未命名商品",
      mimeType: file.type || "image/jpeg",
      content,
    });

    return NextResponse.json({
      data: {
        imageUrl: uploaded.imageUrl,
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: "未登录。" }, { status: 401 });
    }

    console.error("[POST /api/items/upload-image]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "图片上传失败。",
      },
      { status: 500 },
    );
  }
}
