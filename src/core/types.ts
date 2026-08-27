/**
 * Hop dong du lieu voi ccmany — giu y het `Order.toApiJson()` cua notiftest
 * (`app/src/main/java/com/example/notiftest/model/OrderJson.kt`), de don Grab
 * va don Green SM / ShopeeFood nam cung mot dang trong ccmany.
 *
 * Hai cho de sai, deu la co y:
 *  - `original_price` viet DUNG chinh ta (JSON gui Telegram ben notiftest con
 *    giu loi go "orginal_price", API thi khong).
 *  - `driver` khi khong co tai xe phai la OBJECT RONG, khong duoc la null —
 *    API tu choi null o day.
 */

export interface CcmanyModifier {
  name: string;
  price: number;
  quantity: number;
}

export interface CcmanyItem {
  name: string;
  quantity: number;
  /** Tong dong, DA gom topping. ccmany chi luu, khong tu cong lai. */
  price: number;
  original_price: number | null;
  note: string;
  modifiers: CcmanyModifier[];
}

export interface CcmanyPayload {
  store_id: string;
  store_name: string;
  order_number: string;
  order_code: string;
  /** Dinh dang "DD/MM/YYYY - HH:mm" theo gio Viet Nam (UTC+7). */
  created_at: string;
  customer: { name: string };
  driver: { name: string; phone: string };
  items: CcmanyItem[];
  subtotal: number | null;
  discount: number;
  tax: number;
  total: number | null;
}

/** Mot quan trong config/stores.json. */
export interface StoreConfig {
  /** Ma quan Grab, lay tu URL trang don hang. Vd "5-C7XUNYEVEADYN2". */
  grabMerchantID: string;
  /** Ma quan do ccmany cap. Vd "STORE1". */
  ccmanyStoreID: string;
  storeName: string;
  enabled: boolean;
}

export interface StoresFile {
  stores: StoreConfig[];
}
