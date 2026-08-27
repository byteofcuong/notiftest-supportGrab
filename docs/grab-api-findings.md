# Grab Merchant Web → ccmany: kết quả khảo sát

Mục tiêu: theo dõi đơn mới trên `merchant.grab.com` bằng một công cụ chạy trên **PC của quán**,
rồi POST lên API ccmany — cùng vai trò với app Android `notiftest`, nhưng nguồn đơn là web
chứ không phải app merchant trên điện thoại.

Tài liệu này ghi lại những gì đã xác định được từ file `merchant.grab.com.har`
(118 request, 2026-08-27 10:04→10:12 UTC, có đúng 1 đơn thật đi qua). Đọc file này trước
khi viết code — nó là nguồn sự thật, transcript chat sẽ bị tóm tắt dần còn nó thì không.

Phần **công cụ chạy ra sao trong thực tế** (móc vào trình duyệt, trạng thái máy tính, nhiều
quán, tự phục hồi) nằm ở [spec-van-hanh.md](spec-van-hanh.md).

---

## 1. Quyết định đã chốt

| Vấn đề | Chốt |
|---|---|
| Nơi chạy | PC quán, luôn bật |
| Phương án | Node + Playwright, chromium profile riêng, chạy như dịch vụ Windows |
| Phạm vi | **Chỉ đọc rồi gửi** — không bấm nhận đơn, không đổi trạng thái gì |
| Tài khoản | Một tài khoản quản nhiều quán → 1 profile, mỗi quán 1 tab |
| Quy mô | Trước mắt làm 1 quán (`5-C7XUNYEVEADYN2`) cho chạy ổn rồi mới nhân rộng |
| Đơn huỷ / sửa sau khi gửi | Kệ — gửi một lần rồi thôi |
| Đơn đặt trước | Kệ — đến giờ nó tự nhảy sang `PreparingV2` |
| Chế độ nhận đơn | **Bấm tay** (`isManualAcceptMode: true`) |
| **Mốc gửi** | **Ngay khi đơn xuất hiện trong `PreparingV2`** — KHÔNG chờ `acceptedAt`. Xem §5 |
| Xác thực | **Cookie** (`withCredentials: true`), không có bearer token. Xem §2 |
| `total` | `fare.totalDisplay` (= dòng "Tổng cộng") — xem §6.1 |
| Khoá chống trùng | `orderID` → gửi vào **`order_number`**; `displayID` → `order_code`. Xem §6.2 |
| Cấu hình | Một file `stores.json` là nguồn sự thật, thêm quán = thêm một dòng |
| Repo | Riêng, chỉ chia sẻ *contract JSON* với notiftest |

---

## 2. API đã phát hiện

Tất cả trên host `api.grab.com`, gọi từ JS của trang (`initiator: script`).

| Việc | Endpoint |
|---|---|
| **Danh sách đơn** | `GET /delvplatformapi/merchant/v4/orders-pagination?AutoAcceptGroup=1&merchantID={mexID}&PageType={PreparingV2\|Ready\|Upcoming}&searchToken=&size=50` |
| **Chi tiết đơn** | `GET /food/merchant/v3/orders/{orderID}` |
| Trạng thái mở/đóng quán | `GET /food/merchant/v3/open-status` |
| ⚠️ Đánh dấu đã đọc | `POST /food/merchant/orders/mark` — body `{"orderIDs":[...],"markStatus":2}` |
| Rác (analytics) | `POST mcd-gateway.grabtaxi.com/v2/web/track` — bỏ qua |

Trang gọi song song cả 3 `PageType` mỗi lượt. Mình **chỉ cần `PreparingV2`**.

### ⚠️ TUYỆT ĐỐI KHÔNG gọi `/orders/mark`

Khi người dùng bấm mở một đơn trên web, trang tự gọi endpoint này để xoá dấu "chưa đọc"
(`labels.isRead: false → true`). Công cụ của mình **chỉ được `GET`**. Nếu lỡ gọi, nhân viên
sẽ mất dấu báo đơn chưa xem và tưởng đơn đã được xử lý — đây là rủi ro "chỉ đọc" nghiêm
trọng nhất của cả dự án.

### Header

Sáu header tĩnh mà JS của trang tự set (đã xác minh bằng hook `XMLHttpRequest`):

```
merchantid:         5-C7XUNYEVEADYN2
requestsource:      troyPortal
x-client-id:        GrabMerchant-Portal
x-grabkit-clientid: grabmerchant-portal
origin:             https://merchant.grab.com
referer:            https://merchant.grab.com/
accept:             application/json
accept-language:    vi
```

### Xác thực: COOKIE, đã xác minh

Kiểm chứng trực tiếp trên DevTools (2026-08-28):

- Panel *Request Headers*: **có `Cookie`**, **không có `Authorization`**
- Hook `XMLHttpRequest` trong Console: JS chỉ set đúng 6 header
  (`Accept`, `requestSource`, `x-grabkit-clientid`, `x-client-id`, `Accept-Language`, `merchantID`)
  và **`withCredentials: true`**

→ **Toàn bộ xác thực nằm ở cookie do trình duyệt tự gắn. JS không cầm token nào.**

Hệ quả cho thiết kế: **không cần "học header từ chính trang"**. Chỉ cần gọi từ trong page
context với `credentials: 'include'` + 6 header tĩnh ở trên, cookie tự đi kèm.

(HAR export ra không có `Cookie`/`Authorization` vì Chrome/Edge bản mới tự lọc header nhạy cảm
khi export — không phải vì request không có.)

---

## 3. Không có WebSocket — cổng web thuần polling

Dòng thời gian trong HAR:

```
10:07:28  đơn GF-666 được tạo (times.createdAt)
10:08:20  poll orders-pagination → response 105 → 2103 bytes (mới thấy đơn)
10:08:20  nạp lại grabfavicon.ico   ← trang đổi favicon báo đơn mới, ĐÚNG GIÂY ĐÓ
```

Nếu có push thời gian thực, favicon đã đổi lúc 10:07:28. Tức là **chính cổng web của Grab
mất ~52 giây mới biết có đơn mới**.

**Đã xác minh trực tiếp (2026-08-28)**: DevTools → Network → filter **Socket** (Edge gọi là
"Socket" chứ không phải "WS"), reload trang, đợi 2 phút → **không có kết nối nào**.
Kết luận đóng: Grab thuần polling.

**Hệ quả**: mình poll 3–10s là nhanh hơn chính cái web đang mở trên màn hình. Không cần
đua với push.

### `pollInterval` động

Server trả về trường `pollInterval` trong mỗi response danh sách:

| Tình huống | Giá trị |
|---|---|
| Không có đơn nào | `300` |
| Có đơn đang hoạt động | `60` |

Client thực tế vẫn poll đều 60s bất kể giá trị này. Mình nên tôn trọng tinh thần đó:
**rảnh → 10s, có đơn đang chạy → 3–5s**. Đừng poll dày hơn mức cần.

---

## 4. Cấu trúc dữ liệu

### Response danh sách (`orders-pagination`)

```jsonc
{
  "orderStats": { "unreadNumberInNew": 1, "numberInNew": 1 },
  "orders": [{
    "orderID": "001740450298-C8D2EXU3RGMHE2",
    "displayID": "GF-666",
    "eater": { "ID": 525062337, "name": "Nguyễn Văn Đại" },
    "itemInfo": { "count": 4, "items": [ { "itemID", "name", "quantity" } ] },  // KHÔNG có giá
    "times": { "createdAt", "expiredAt", "acceptedAt", "cancelledAt", "readyAt" },
    "state": "ALLOCATING",
    "preparationTaskpoolStatus": "NEW",
    "scheduleOrderInfo": { "isScheduledOrder": false },
    "labels": { "isRead": false, "isOrderEdited": false, "acceptedViaAA": false, "hasPromo": false },
    "flags": { "isManualAcceptMode": true },
    "orderValue": "141.000"
  }],
  "pollInterval": 60,
  "serverTime": "2026-08-27T10:08:21Z"
}
```

**Danh sách không có tiền** → bắt buộc phải gọi thêm detail cho từng đơn mới.

### Response chi tiết (`/v3/orders/{orderID}`, ~7.2 KB)

Có đủ mọi thứ cần cho payload ccmany:

```jsonc
{ "order": {
  "orderID", "displayID": "GF-666", "bookingCode": "A-9OTWTPEGWQGEAV",
  "eater": { "name", "mobileNumber": "+84 9125 0364 3", "comment": "Gặp mặt ở sảnh", "address": null },
  "driver": null,                                  // null khi chưa gán tài xế
  "itemInfo": { "count": 4, "items": [ {
      "name", "quantity",
      "fare": { "priceDisplay": "100.000", "priceFloat": 50000, "priceInMin": 50000,
                "originalItemPriceDisplay", "beforeAdjustedPriceDisplay", "currencySymbol": "₫" },
      "comment": "",                               // ghi chú riêng của món
      "modifierGroups": [],                        // topping — đơn mẫu RỖNG, chưa biết cấu trúc
      "discountInfo": null,
      "itemID", "editedStatus": 0
  } ] },
  "fare": { "subTotalDisplay": "141.000", "totalDisplay": "141.000", "taxDisplay": "0",
            "promotionDisplay": "2.000", "deliveryFeeDisplay": "13.000",
            "passengerTotalDisplay": "152.000", "reducedPriceDisplay": "156.000",
            "mexCommissionDisplay": "0", "smallOrderFeeDisplay": "0",
            "originalPriceInMin": 141000, "taxRate": "0.0000" },
  "times": { "createdAt": "2026-08-27T10:07:20Z", "acceptedAt": null, "cancelledAt": null,
             "expiredAt": "2026-08-27T10:12:28Z", "readyAt": null },
  "state": "ALLOCATING", "preparationTaskpoolStatus": "NEW",
  "merchant": { "ID": "5-C7XUNYEVEADYN2" },
  "paymentMethod": "Cash", "cutlery": 2, "isTakeawayOrder": false,
  "hasPromo": false, "isOrderEdited": false, "orderLevelDiscounts": null,
  "flags": { "isManualAcceptMode": true }
} }
```

### Cấu trúc topping (`modifierGroups`) — từ HAR 2

```jsonc
"name": "Sting Đỏ", "quantity": 1,
"fare": { "priceDisplay": "26.000", "originalItemPriceDisplay": "19.000", "priceFloat": 26000 },
"comment": "note: chọn option 3 và option 2",
"modifierGroups": [ {
  "modifierGroupID": "VNMOG2026082804182653459",
  "modifierGroupName": "test",
  "modifiers": [
    { "modifierID": "…", "modifierName": "option3", "priceDisplay": "4.000",
      "quantity": 1, "revampedPriceDisplay": "4.000", "editedStatus": 0 },
    { "modifierID": "…", "modifierName": "option2", "priceDisplay": "3.000",
      "quantity": 1, "revampedPriceDisplay": "3.000", "editedStatus": 0 }
  ] } ]
```

Kiểm chứng số học trên HAR 2:

```
Sting Đỏ #1:  19.000 + 4.000 + 3.000 = 26.000  ✅ = priceDisplay
Sting Đỏ #2:  19.000 + 3.000 + 2.000 = 24.000  ✅ = priceDisplay
Tổng đơn:  5.000 + 36.000 + 26.000 + 24.000 + 30.000 = 121.000  ✅ = subTotalDisplay
```

**`priceDisplay` của món ĐÃ bao gồm tiền topping.** Nếu ccmany tự cộng
`item.price + modifiers[].price` thì sẽ tính đúp — xem câu hỏi treo #7.

`modifierGroups` là mảng **hai tầng** (nhóm → các tuỳ chọn), trong khi `Order.modifiers` của
notiftest là mảng **một tầng**. Phải trải phẳng, và cân nhắc có giữ `modifierGroupName` không.

### ⚠️ Bẫy: `originalItemPriceDisplay` KHÔNG phải giá trước giảm giá

Nó là **giá món gốc chưa cộng topping** (19.000 với món Sting Đỏ giá hiển thị 26.000).
Ở HAR 1 không có topping nên hai số bằng nhau, không phân biệt được.

`original_price` của ccmany nghĩa là **giá gạch ngang khi có khuyến mãi** — khác hoàn toàn.
→ **Để trống `original_price`**, trừ khi `discountInfo != null` (chưa gặp mẫu nào).

### ⚠️ Cái bẫy giá — ngược quy ước của notiftest

Món `Combo Kem Song Vị` số lượng 2:

```
"priceDisplay": "100.000"   ← TỔNG DÒNG (đã nhân số lượng)  → khớp OrderItem.price
"priceFloat":   50000       ← ĐƠN GIÁ                        → KHÔNG phải giá dòng
```

Kiểm chứng: `5.000 + 100.000 + 36.000 = 141.000 = fare.subTotalDisplay` ✅

Bên notiftest, `OrderItem.price` là **tổng dòng**. Nên phải dùng `priceDisplay` — nhưng nó là
**chuỗi định dạng VN** (`"100.000"` = một trăm nghìn), phải parse chứ không cast thẳng.
Lấy nhầm `priceFloat` là sai tiền ngay lập tức.

Ngoài ra `times.*` là **UTC** (`...Z`), phải +7 trước khi ghi vào `created_at`.

---

## 5. Vòng đời đơn & mốc gửi

Đơn GF-666 (HAR 1) qua 4 lượt poll:

```
10:08:20  PreparingV2  GF-666  state=ALLOCATING  prep=NEW  isRead=false  acceptedAt=null
10:09:20  PreparingV2  GF-666  state=ALLOCATING  prep=NEW  isRead=true   acceptedAt=null
10:10:20  PreparingV2  GF-666  state=ALLOCATING  prep=NEW  isRead=true   acceptedAt=null
10:11:20  PreparingV2  (trống)   ← hết hạn, chưa từng được xác nhận (expiredAt 10:12:28)
```

Đơn GF-547 (HAR 2) y hệt: xuất hiện 04:25:22, biến mất ở lượt 04:27:22, `acceptedAt` luôn `null`,
`expiredAt` 04:29:40.

**Tab "Đang chuẩn bị" (`PreparingV2`) chứa cả đơn CHƯA xác nhận** — đó chính là chỗ mình cần.

### Mốc gửi: NGAY KHI ĐƠN XUẤT HIỆN

**ccmany chính là nơi nhân viên biết có đơn mới để đi xác nhận.** Nên chờ `acceptedAt` rồi mới
gửi là vô nghĩa — lúc đó nhân viên đã biết rồi.

→ **Gửi ngay khi đơn xuất hiện trong `PreparingV2`, không chờ `acceptedAt`.**

Hệ quả chấp nhận: đơn nào hết hạn hoặc bị huỷ trước khi ai kịp bấm thì ccmany vẫn đã nhận
(cả hai đơn trong 2 file HAR đều thế, vì đang test). Nếu sau này phiền thì thêm một cú ping
"đã huỷ" — chưa cần bây giờ, và nó mâu thuẫn với quy tắc "gửi một lần rồi thôi".

**Vì vậy tốc độ poll là thứ quan trọng nhất của cả công cụ**: mỗi giây tiết kiệm được là một
giây nhân viên biết sớm hơn. Cửa sổ xác nhận của Grab chỉ **5 phút** (`expiredAt − createdAt`),
mà cổng web của Grab mất tới 52s mới báo → poll **3–5s** là thắng lớn.

### Trường không được dùng

`times.completedAt` **không phải** "đơn đã hoàn tất": ở cả hai đơn nó được set chỉ 8–9 giây sau
`createdAt` trong khi đơn còn đang `state=ALLOCATING`. Đừng dùng để suy ra trạng thái.

---

## 6. Ánh xạ sang payload ccmany

Contract giữ nguyên như `Order.toApiJson()` của notiftest
(`notiftest/app/src/main/java/com/example/notiftest/model/OrderJson.kt`).

| ccmany | Grab | Ghi chú |
|---|---|---|
| `store_id` | tra `stores.json` theo `merchant.ID` | ccmany cấp, chưa có |
| `store_name` | tra `stores.json` | |
| `order_number` | `order.orderID` | **trường định danh** của ccmany — §6.2 |
| `order_code` | `order.displayID` | `"GF-547"` — số ngắn cho người đọc, KHÔNG duy nhất |
| `created_at` | `order.times.createdAt` | UTC → +7, đổi định dạng |
| `customer.name` | `order.eater.name` | |
| `driver.name/phone` | `order.driver` | `null` → gửi object rỗng, API từ chối JSON null |
| `items[].name` | `item.name` | |
| `items[].quantity` | `item.quantity` | |
| `items[].price` | `item.fare.priceDisplay` **đã parse** | tổng dòng, **đã gồm topping** — §4 |
| `items[].original_price` | **để trống** | `originalItemPriceDisplay` là giá chưa cộng topping, KHÁC nghĩa — §4 |
| `items[].note` | `item.comment` | |
| `items[].modifiers[]` | `item.modifierGroups[].modifiers[]` | trải phẳng mảng 2 tầng; gửi **giá thật** — §6.3 |
| `note` | `order.eater.comment` (+ `cutlery`?) | `"Gặp mặt ở sảnh"`, `cutlery: 2` |
| `subtotal` | `fare.subTotalDisplay` | |
| `discount` | **0** | KHÔNG map `promotionDisplay` — §6.1 |
| `tax` | `fare.taxDisplay` | |
| `total` | `fare.totalDisplay` | dòng "Tổng cộng" — §6.1 |

### 6.1 `total` = `fare.totalDisplay`

Bên notiftest, `total` = tiền quán nhận (`OrderParser` đọc dòng "Tổng tiền quán nhận" của
Green SM). Grab không có trường tên như vậy, nhưng so hai đơn thì lộ ra quy luật:

| | GF-666 (27/08) | GF-547 (28/08) |
|---|---|---|
| `subTotalDisplay` | 141.000 | 121.000 |
| `totalDisplay` | **141.000** | **121.000** |
| `taxDisplay` | 0 | 0 |
| `promotionDisplay` | 2.000 | 5.000 |
| `passengerTotalDisplay` | 152.000 | 129.000 |

`totalDisplay` luôn **bằng** `subTotalDisplay`, và **khuyến mãi không bị trừ vào đó**
(2.000 và 5.000 đều không làm nó giảm) → khuyến mãi là tiền Grab bù cho khách, quán không chịu.
Khớp với giao diện web: "Tổng (tạm tính) 121k" → "Thuế 0đ" → "Tổng cộng".

**Chốt:**

```
subtotal = fare.subTotalDisplay
tax      = fare.taxDisplay
discount = 0            ← KHÔNG map promotionDisplay vào
total    = fare.totalDisplay     (= dòng "Tổng cộng")
```

Không map `promotionDisplay` vào `discount` vì làm thế sẽ phá quan hệ
`total = subtotal − discount − tax` mà ccmany có thể đang dựa vào.

#### Vấn đề chiết khấu sàn — `total` của Grab KHÔNG cùng nghĩa với các sàn khác

`mexCommissionDisplay` = `"0"` ở cả hai đơn, mà chiết khấu GrabFood thực tế không thể 0%.

Điều này quan trọng vì **notiftest hiểu `total` là "tiền quán bỏ túi"**:

- `ShopeeOrderParser.kt:114-116` — `tax = (commission ?: 0) + (withheld ?: 0)`, tức **gộp
  chiết khấu sàn + thuế giữ hộ vào trường `tax`**, rồi `total` = payout Shopee in ra.
- Green SM đọc thẳng dòng "Tổng tiền quán nhận".

Với Grab, `totalDisplay` là **tiền TRƯỚC chiết khấu**. Nên đơn Grab trong ccmany sẽ trông cao
hơn thực nhận và không so sánh được với đơn Green SM / Shopee.

**ĐÃ CHỐT: gửi `totalDisplay` nguyên vẹn, không tự tính chiết khấu.**

Lý do: con số quán nhìn thấy ở dòng "Tổng cộng" trên giao diện Grab mới là con số quán dùng
để đối chiếu. Bịa ra một tỉ lệ chiết khấu không kiểm chứng được thì sai theo cách tệ hơn —
sai mà không ai biết. Chấp nhận đây là tiền **trước** chiết khấu sàn.

Phương án thay thế nếu sau này có sao kê thật để đối chiếu: thêm `commissionRate` vào
`stores.json` (vd `0.25`), `tax = subtotal × rate`, `total = subtotal − tax`. Chỉ là sửa
config, không phải sửa code — nhưng **đừng bật khi chưa có số thật**.

Trong HAR có hai endpoint báo cáo (rỗng vì chưa có đơn hoàn tất) — nơi tiền thực nhận nằm,
nhưng chỉ có sau khi đơn hoàn tất, tức chưa tồn tại lúc mình gửi:

```
GET /food/merchant/v1/merchant-report-summary?startDate=YYYY-MM-DD
    → { totalEarningDisplay, revenueDisplay, completedOrders, cancelledOrders }
GET /delvplatformapi/merchant/v1/reports/daily-pagination?startTime=…&endTime=…
    → { statements: [...] }
```



### 6.2 `order_number` là trường định danh — `displayID` KHÔNG được dùng

**Bằng chứng `displayID` không duy nhất.** Hai mẫu ở hai ngày liền nhau, cùng một quán:

```
27/08  GF-666
28/08  GF-547     ← NHỎ HƠN hôm trước
```

Số **giảm** qua ngày → không phải bộ đếm tăng dần, không phải số chạy theo ngày. Nó là
3 chữ số gần như ngẫu nhiên, tức chỉ ~900 giá trị. Với vài chục đơn/ngày thì đụng nhau là
**chắc chắn trong vòng vài tuần**.

**Bằng chứng ccmany định danh bằng `order_number`.** Từ chính notiftest:

- `ShopeeOrderParser.kt:119-129` — *"The full code is the only lasting identity Shopee gives
  us, and it is what the dedupe cache is keyed on."* Rồi nó gán
  `orderNumber = fullCode` (mã dài, duy nhất), `orderCode = shortNumber` (4 số cuối).
- `OrderParser.kt:79` (Green SM) — thiếu `orderNumber` thì `error("Missing order number")`,
  trong khi `orderCode` cho phép null.

→ `order_number` là định danh, `order_code` chỉ là phụ.

**Chốt cho Grab — theo đúng tiền lệ Shopee:**

```
order_number = orderID     "001500221566-C8D2VEDVCY5WSA"   ← định danh, duy nhất
order_code   = displayID   "GF-547"                        ← số ngắn cho người đọc
dedup nội bộ = orderID
```

Đánh đổi: nhân viên thấy mã dài ở ô "số đơn" trong ccmany — nhưng Shopee cũng vậy, nên
nhất quán giữa các nền tảng. Có thể để cờ config đổi sang `GF-547-28082026` nếu ưu tiên dễ đọc.

### 6.3 Topping: gửi giá thật

ccmany chỉ **lưu** những gì mình gửi, không tự tính lại — nên không có rủi ro tính đúp.
Vì vậy gửi **giá topping thật** (`option3` → 4.000, `option2` → 3.000) thay vì 0.

Phép tính vẫn khít vì `sum(items[].price) = subtotal`; giá topping chỉ là dữ liệu bổ sung,
không tham gia vào tổng.

> ⚠️ Ghi nhớ cho người đọc sau: **`item.price` ĐÃ bao gồm tiền topping** (§4).
> Đừng cộng `item.price + modifiers[].price`.

### 6.4 Chốt kiểm tra lúc chạy

Nếu `total ≠ subtotal − discount − tax` → ghi log cảnh báo + bắn Telegram kèm JSON thô.
Cả hai đơn mẫu đều có `tax = 0` nên chưa xác minh được quan hệ này khi thuế khác 0; chốt
kiểm tra làm cho đơn có thuế đầu tiên tự lộ ra thay vì âm thầm sai.

---

## 7. Thiết kế đề xuất

```
Windows PC (luôn bật)
└── Node service (NSSM / Task Scheduler, tự chạy lúc boot)
    └── Playwright, chromium persistent profile riêng (login tay 1 lần)
        └── 1 tab / quán  (cookie phiên sống trong profile)
                    │
                    ▼
        Poller 3–5s: page.evaluate → fetch(orders-pagination, credentials:'include')
                    │  lọc: chưa có trong cache && createdAt trong cửa sổ thời gian
                    │        (KHÔNG lọc theo acceptedAt — xem §5)
                    ▼
        GET /v3/orders/{orderID}          ← KHÔNG BAO GIỜ gọi /orders/mark
                    ▼
        Mapper Grab → payload ccmany  +  lưu raw JSON ra data/ (để sau còn sửa mapper)
                    ▼
        Uploader: POST x-api-key, retry 3 lần + backoff, CÓ TIMEOUT  →  cache.mark(orderID)
                    ▼
        Telegram: đơn đã gửi + cảnh báo 401 / quán đóng / poll chết
```

### Vì sao gọi từ trong page context

Xác thực là **cookie** (§2), nên `fetch` chạy trong trang với `credentials: 'include'` được
trình duyệt tự gắn cookie — không phải bóc token, không phải làm refresh, không phải học
header. Cookie hết hạn thì cả trang cũng hết hạn, và mình phát hiện bằng HTTP 401 → bắn
Telegram báo cần đăng nhập lại.

Vẫn giữ tab mở thay vì gọi API trần từ Node, vì: cookie tự gia hạn theo phiên trang, và nếu
Grab đổi cơ chế thì mình hỏng theo cách dễ thấy (401) chứ không âm thầm sai.

### Chống trùng: hai lớp

1. **Cache ID** — key `{ccmanyStoreId}:{orderID}`, persist ra đĩa, **ghi sau khi POST thành công**.
   Giống `ProcessedOrderCache` của notiftest, và vẫn đúng cái nguyên tắc: vì công cụ không bao
   giờ bấm nhận đơn, đơn không rời danh sách do mình → **cache là thứ duy nhất chặn gửi trùng**.
2. **Cửa sổ thời gian** — chỉ gửi đơn có `createdAt > max(mốc đã lưu, lúc khởi động − 15 phút)`.

Lớp 2 vá đúng lỗ hổng còn tồn tại ở notiftest: bên đó mất file cache thì đợt sweep kế tiếp coi
mọi đơn còn trong danh sách là mới và bắn lại hết. Ở đây, mất cache thì cùng lắm gửi lại đơn
của 15 phút gần nhất. Nó cũng tự nhiên hơn cách "lượt quét đầu bỏ qua hết" — vì cách đó sẽ nuốt
mất đơn thật nếu đúng lúc khởi động lại có đơn vừa vào.

### `stores.json`

```jsonc
{ "stores": [
  { "grabMerchantID": "5-C7XUNYEVEADYN2", "ccmanyStoreID": "STORE1", "name": "…" }
] }
```

Thêm quán = thêm một dòng, không build lại (khác notiftest — bên đó key nằm trong `BuildConfig`,
đổi key là phải build + cài lại app).

---

## 8. Câu hỏi còn treo — KHÔNG CÒN

Tất cả đã đóng:

| # | Câu | Kết luận |
|---|---|---|
| 1 | Xác thực kiểu gì | **Cookie**, không có bearer — §2 |
| 2 | Có WebSocket không | **Không**, Grab thuần polling — §3 |
| 3 | Chế độ nhận đơn | Bấm tay; nhưng mốc gửi = **ngay khi thấy**, không chờ `acceptedAt` — §5 |
| 4 | Cấu trúc topping | `modifierGroups` 2 tầng, giá đã gộp vào `item.priceDisplay` — §4 |
| 5 | "Tổng cộng" là số nào | 121.000 = `fare.totalDisplay`; đọc thẳng nên quán có thuế ≠ 0 vẫn đúng — §6.1 |
| 6 | ccmany dedup theo gì | **`order_number`** → phải gửi `orderID` vào đó, không phải `displayID` — §6.2 |
| 7 | Topping có bị tính đúp | Không, ccmany chỉ lưu → gửi giá thật — §6.3 |
| 8 | Chiết khấu sàn | Không tự tính; gửi `totalDisplay` nguyên vẹn — §6.1 |

**Spec đã đóng băng, đủ để bắt đầu viết code.**

## 9. Nguồn

- `example/har/1.har` — 118 request, 2026-08-27 10:04→10:12 UTC, quán `5-C7XUNYEVEADYN2`.
  Đơn `GF-666` / `001740450298-C8D2EXU3RGMHE2`: không topping, không khuyến mãi, hết hạn
  không ai nhận. Có 1 lần gọi `/orders/mark`.
- `example/har/2.har` — 50 request, 2026-08-28 04:24→04:27 UTC, cùng quán.
  Đơn `GF-547` / `001500221566-C8D2VEDVCY5WSA`: **có topping** (2 món Sting Đỏ với nhóm
  tuỳ chọn), có ghi chú theo món, `promotionDisplay` 5.000, cũng hết hạn không ai nhận.
  Không gọi `/orders/mark`.

Cả hai **chứa tên + SĐT khách → đã gitignore.**
- Repo đối chiếu: `../notiftest` (cùng workspace) — engine Android bản Green SM / ShopeeFood.
