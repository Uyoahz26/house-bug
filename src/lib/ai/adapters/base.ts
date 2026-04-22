import {
  AiAdapter,
  AiConfig,
  AiMessage,
  AiOcrResult,
  AiResponse,
} from "../types";

export abstract class BaseAiAdapter implements AiAdapter {
  abstract chat(messages: AiMessage[], config: AiConfig): Promise<AiResponse>;

  async extractFromImage(
    imageBase64: string,
    config: AiConfig,
  ): Promise<AiOcrResult> {
    const prompt = `你是专业的商品信息识别助手。请仔细分析这张商品图片，尽可能完整地提取所有信息，并以 JSON 格式输出（不要 markdown 代码块，不要解释）：

{
  "name": "商品完整名称（必填，包含品牌+产品名+规格，如：海飞丝去屑洗发水500ml）",
  "brand": "品牌名称（如：海飞丝、可口可乐、三只松鼠，无法识别填 null）",
  "category": "商品分类（从以下选择最合适的：食品/饮料/日用品/洗护用品/药品/调料/零食/清洁用品/其他）",
  "specification": "规格/净含量（如：500ml、250g、100片，尽量识别，无法识别填 null）",
  "quantity": 数量（默认为 1，如果图片显示多件则填实际数量，必须是正整数）,
  "itemUnit": "单位（如：瓶、袋、盒、罐、包、支、个、件，根据商品类型推断，无法确定填 null）",
  "productionDate": "生产日期（严格 YYYY-MM-DD 格式，如 2024-01-15，常见标注：生产日期/制造日期/MFG/MFD，无法识别填 null）",
  "shelfLife": 保质期数值（纯数字，如 18 表示 18 个月，365 表示 365 天，无法识别填 null）,
  "shelfLifeUnit": "保质期单位（只能是：day/month/year，根据保质期推断，如'18个月'='month'，'2年'='year'，'365天'='day'，无法识别填 null）",
  "manufacturer": "生产厂家全称（如：宝洁（中国）有限公司，常见标注：生产商/制造商/出品方，无法识别填 null）",
  "barcode": "条形码/二维码数字（通常是 13 位或 8 位数字，如：6901234567890，无法识别填 null）",
  "notes": "补充信息（提取其他有用信息，如：口味、功效、适用人群、储存条件等，无则填 null）",
  "rawText": "图片中识别到的所有文字内容（完整提取，用于备查）"
}

识别要点：
1. **商品名称**：尽量完整，包含品牌、产品名、规格（如：蒙牛纯牛奶250ml）
2. **分类判断**：
   - 食品：米面粮油、肉蛋奶、水果蔬菜、速食品
   - 饮料：水、茶、咖啡、果汁、碳酸饮料
   - 零食：糖果、饼干、坚果、膨化食品
   - 调料：酱油、醋、盐、味精、香料
   - 洗护用品：洗发水、沐浴露、牙膏、护肤品
   - 清洁用品：洗衣液、洗洁精、消毒液
   - 日用品：纸巾、垃圾袋、电池等
   - 药品：OTC 药品、保健品
3. **日期格式**：必须转换为 YYYY-MM-DD，如"2024年1月15日"→"2024-01-15"，"24/01/15"→"2024-01-15"
4. **保质期处理**：
   - "18个月" → shelfLife: 18, shelfLifeUnit: "month"
   - "2年" → shelfLife: 2, shelfLifeUnit: "year"  
   - "365天" → shelfLife: 365, shelfLifeUnit: "day"
   - "保质期至2025-12-31" → 需要根据生产日期计算
5. **单位推断**：液体用"瓶/罐"，固体用"袋/盒/包"，药品用"盒/瓶"
6. **数量默认**：如果图片只有一件商品，quantity 填 1
7. **条形码**：通常在商品底部，13 位或 8 位数字
8. **补充信息**：提取口味（如：原味、草莓味）、功效（如：去屑、美白）等

输出要求：
- 只输出 JSON，不要任何解释
- 无法识别的字段必须填 null，不要填空字符串
- 数字类型不要加引号
- 日期必须是字符串且格式正确`;

    const messages: AiMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "image_url",
            image_url: {
              url: imageBase64.startsWith("data:")
                ? imageBase64
                : `data:image/jpeg;base64,${imageBase64}`,
            },
          },
        ],
      },
    ];

    const response = await this.chat(messages, config);
    return this.parseOcrResult(response.content);
  }

  protected parseOcrResult(content: string): AiOcrResult {
    const defaultResult: AiOcrResult = {
      name: null,
      brand: null,
      category: null,
      specification: null,
      quantity: null,
      itemUnit: null,
      productionDate: null,
      shelfLife: null,
      shelfLifeUnit: null,
      manufacturer: null,
      barcode: null,
      notes: null,
      rawText: content,
    };

    try {
      // 尝试提取 JSON
      let jsonStr = content.trim();

      // 移除 markdown 代码块
      const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      }

      // 提取第一个 JSON 对象
      const firstBrace = jsonStr.indexOf("{");
      const lastBrace = jsonStr.lastIndexOf("}");
      if (firstBrace >= 0 && lastBrace > firstBrace) {
        jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
      }

      const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

      return {
        name:
          typeof parsed.name === "string" ? parsed.name.trim() || null : null,
        brand:
          typeof parsed.brand === "string" ? parsed.brand.trim() || null : null,
        category:
          typeof parsed.category === "string"
            ? parsed.category.trim() || null
            : null,
        specification:
          typeof parsed.specification === "string"
            ? parsed.specification.trim() || null
            : null,
        quantity:
          typeof parsed.quantity === "number"
            ? Math.max(0, Math.floor(parsed.quantity))
            : null,
        itemUnit:
          typeof parsed.itemUnit === "string"
            ? parsed.itemUnit.trim() || null
            : null,
        productionDate:
          typeof parsed.productionDate === "string"
            ? parsed.productionDate.trim() || null
            : null,
        shelfLife:
          typeof parsed.shelfLife === "number"
            ? Math.max(0, Math.floor(parsed.shelfLife))
            : null,
        shelfLifeUnit:
          parsed.shelfLifeUnit === "day" ||
          parsed.shelfLifeUnit === "month" ||
          parsed.shelfLifeUnit === "year"
            ? parsed.shelfLifeUnit
            : null,
        manufacturer:
          typeof parsed.manufacturer === "string"
            ? parsed.manufacturer.trim() || null
            : null,
        barcode:
          typeof parsed.barcode === "string"
            ? parsed.barcode.trim() || null
            : null,
        notes:
          typeof parsed.notes === "string" ? parsed.notes.trim() || null : null,
        rawText: typeof parsed.rawText === "string" ? parsed.rawText : content,
      };
    } catch {
      return defaultResult;
    }
  }
}
