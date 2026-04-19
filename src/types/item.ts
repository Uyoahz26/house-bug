export type ItemStatus = "active" | "consumed" | "discarded";

export interface ItemRecord {
  id: string;
  user_id: string;
  category: string | null;
  location: string | null;
  name: string;
  brand: string | null;
  specification: string | null;
  barcode: string | null;
  quantity: number;
  unit: string | null;
  production_date: string | null;
  shelf_life_days: number | null;
  expiry_date: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  purchase_channel: string | null;
  image_url: string | null;
  status: ItemStatus;
  notes: string | null;
  ocr_raw_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface PublicItem {
  id: string;
  categoryId: number | null;
  locationId: number | null;
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

export interface CreateItemInput {
  id: string;
  userId: string;
  category: string | null;
  location: string | null;
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
}

export interface UpdateItemInput {
  id: string;
  category: string | null;
  location: string | null;
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
}

export type ItemStatusFilter = ItemStatus | "all";

export interface ListItemsFilter {
  search?: string;
  status?: ItemStatusFilter;
  limit: number;
  offset: number;
}
