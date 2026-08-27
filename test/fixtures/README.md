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
bằng chứng Grab không trừ khuyến mãi vào tiền quán, nên `discount` gửi ccmany phải là `0`.

## Thiếu gì

Chưa có mẫu nào cho: đơn **đã được xác nhận** (`acceptedAt != null`), đơn **có tài xế**
(`driver != null`), đơn **có thuế** (`taxDisplay != 0`), đơn **đã hoàn tất**. Khi gặp ngoài
thực tế thì lưu lại `data/raw/` rồi bổ sung vào đây.
