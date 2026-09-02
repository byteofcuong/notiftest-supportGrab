# Fixture — response thật của Grab

Sinh ra bằng `npm run fixtures` (đọc `example/har/*.har`, ẩn danh, ghi ra đây).
HAR gốc **không có trong repo** (gitignore, vì chứa PII), nên script không chạy lại được trên
bản clone mới — nhưng test thì không cần HAR, chỉ cần các file này.

## Đã ẩn danh

Chỉ ba trường bị thay, giá trị cố định để test khẳng định thẳng vào chúng:

| Trường | Giá trị giả |
|---|---|
| `eater.ID` | `100000001` |
| `eater.name` | `Khach Test` |
| `eater.mobileNumber` | `+84 9000 0000 0` |

Mọi thứ khác **giữ nguyên bit-for-bit**, kể cả `eater.comment` (ghi chú đơn — không định danh
ai, mà lại là dữ liệu test có ích). Script có chốt an toàn: nếu file sinh ra còn dấu vết PII
thật thì nó ném lỗi thay vì ghi.

## Các file

| File | Nguồn | Dùng để kiểm chứng cái gì |
|---|---|---|
| `list-gf666.json` | `1.har` 10:08:20 | Danh sách có đơn; `orderStats.unreadNumberInNew`; `pollInterval: 60` |
| `detail-gf666.json` | `1.har` 10:08:36 | 3 món, **không topping**, `sum(line) = 141.000 = subtotal` |
| `list-gf547.json` | `2.har` 04:25:22 | Như trên, đơn khác ngày |
| `detail-gf547.json` | `2.har` 04:26:10 | **Fixture quan trọng nhất** — xem bên dưới |
| `list-empty.json` | `1.har` 10:04:20 | Danh sách rỗng, `pollInterval: 300` |
| `open-status.json` | `1.har` 10:04:20 | `isOpen: true` |
| `detail-gf497-giam-gia.json` | đơn thật 02/09 | **Giảm giá món**: 1 món + topping, giảm 5.000 |
| `detail-gf806-giam-gia.json` | đơn thật 02/09 | **Giảm giá món**: 2 món, giảm theo tiền *và* theo % |
| `store-search.json` | **viết tay** | Danh sách quán trong nhóm — xem cảnh báo bên dưới |

## Vì sao `detail-gf547.json` là fixture quan trọng nhất

Nó bắt được **cả bốn cái bẫy** đã ghi trong `docs/grab-api-findings.md` §4:

```
1x 🍓 Que Quế Dâu Hồng Ngọt Ngào     line=  5.000  base=  5.000
1x Kem Dưa Hấu- Sầu Matcha           line= 36.000  base= 36.000
1x Sting Đỏ                          line= 26.000  base= 19.000  [option3=4.000, option2=3.000]
1x Sting Đỏ                          line= 24.000  base= 19.000  [option2=3.000, option1=2.000]
1x Kem Nho Matcha                    line= 30.000  base= 30.000
                                     ────────────
                          sum(line) = 121.000 = fare.subTotalDisplay ✓
```

1. **`priceDisplay` đã gồm topping**: `19.000 + 4.000 + 3.000 = 26.000`
2. **`originalItemPriceDisplay` KHÔNG phải giá trước giảm giá** — nó là giá gốc chưa cộng
   topping (19.000). Map nó vào `original_price` là sai nghĩa hoàn toàn.
3. **Hai món trùng tên, khác topping** → phải ra hai dòng riêng, tuyệt đối không gộp.
4. **`modifierGroups` là mảng hai tầng** (nhóm → tuỳ chọn) → phải trải phẳng.

Ngoài ra `promotionDisplay: "5.000"` mà `totalDisplay` vẫn `= subTotalDisplay = 121.000` —
bằng chứng Grab không trừ khuyến mãi vào tiền quán.

> ⚠️ Đơn này **không có giảm giá món nào**, nên nó chỉ chứng minh được nửa vế. Suy ra
> "`discount` luôn bằng 0" từ đây là **sai** — xem `detail-gf497-giam-gia.json` bên dưới.

## Thiếu gì

Chưa có mẫu nào cho: đơn **đã được xác nhận** (`acceptedAt != null`), đơn **có tài xế**
(`driver != null`), đơn **có thuế** (`taxDisplay != 0`), đơn **đã hoàn tất**. Khi gặp ngoài
thực tế thì lưu lại `data/raw/` rồi bổ sung vào đây.

## `store-search.json` là fixture **viết tay**, không phải bản chụp

Mọi file khác trong thư mục này là response thật, chỉ thay ba trường PII. File này thì **không**:
nó được gõ tay theo hình dạng đã đo được trên tài khoản thật (14 quán) và ghi lại ở
`docs/spec-van-hanh.md` §7.1b. Nhật ký chứa response thật đã bị xoay mất trước khi kịp cắt ra.

Nghĩa là **tên trường thì đáng tin, giá trị thì không**. Cụ thể `"status": "ACTIVE"` là suy đoán —
chưa ai thấy Grab trả đúng chuỗi đó. Vì vậy `quanCoTheChon()` đọc `status` theo kiểu *hỏng thì cho
qua*: chỉ hạ cờ khi gặp đúng một trong năm chuỗi chắc chắn là "đã ngừng", còn lạ thì vẫn coi là
đang hoạt động. Đoán sai giá trị ở đây tốn nhiều nhất là một dòng thừa trong bảng chọn, chứ không
giấu mất quán đang bán.

### Thay bằng bản thật thế nào

Chạy một lần với `DEV_THU_CHEO=true` và phiên Grab còn sống, rồi bấm sang một quán khác. Probe ghi
nguyên văn response ra `data/raw/store-search.json` (xem `src/main/thu-cheo.ts`). Đổi tên và địa chỉ
quán sang giá trị giả rồi chép đè lên file này, và **xoá mục cảnh báo này đi**.

## Hai fixture giảm giá — vì sao chúng quan trọng

`detail-gf497-giam-gia.json` và `detail-gf806-giam-gia.json` là đơn **thật**, chụp ngày 02/09/2026,
đã ẩn danh đúng ba trường như trên. Chúng vào đây vì đã bắt được một lỗi tiền thật:

```
GF-497   subtotal  65.000   discount  5.000   total  60.000
GF-806   subtotal 110.000   discount 13.800   total  96.200
```

Trước đó `discount` bị đóng cứng bằng `0` — kết luận rút ra từ hai fixture cũ, mà cả hai đều
**không có giảm giá món nào**. Hậu quả: `subtotal − discount ≠ total`, hoá đơn bên ccmany không
cộng được.

`GF-806` là fixture duy nhất chứng minh dứt điểm rằng **`promotionDisplay` là trường khác**: nó
bằng `16.000` trong khi tiền quán chỉ giảm `13.800`. Đừng xoá đơn này.

Cả hai cũng là mẫu đầu tiên có `discountInfo` khác `null` — trước đó chưa ai thấy cấu trúc của nó.
