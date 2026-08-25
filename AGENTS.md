# AGENTS.md — Baan Laundry API

แนวทางสำหรับ AI agent / คนที่มาแก้โค้ดหรือ prompt ต่อในโปรเจกต์นี้  
อ่านไฟล์นี้ก่อนเปลี่ยน architecture, schema, หรือ flow สำคัญ

---

## 1) ภาพรวมโปรเจกต์

- **ชื่อ:** `laundry_api` (โฟลเดอร์ `baan_laundry_api`)
- **Stack:** Express 5 + TypeScript + PostgreSQL (`pg`)
- **Entry:** `src/app.ts` (listen ที่นี่ ไม่แยก `server.ts`)
- **API prefix:** `/laundry/api`
- **พอร์ตเริ่มต้น:** `3001` (`PORT` จาก `.env`)
- **Auth:** JWT Bearer ของ admin (`Authorization: Bearer <token>`)
- **Postman:** `postman_collection.json` ที่ root ของ API — แก้ endpoint แล้วควรอัปเดตไฟล์นี้ด้วย

### คำสั่งที่ใช้บ่อย

```bash
npm run dev      # nodemon + ts-node src/app.ts
npm run build    # tsc → dist/
npm start        # node dist/app.js
```

### Env ที่สำคัญ

```
PORT=
NODE_ENV=
DATABASE_URL=
JWT_SECRET=
CORS_ORIGIN=          # ค่าเริ่มต้น http://localhost:3000 หรือคั่นด้วย comma / "*"
```

---

## 2) โครงสร้างโฟลเดอร์ (ต้องทำตามนี้)

```
baan_laundry_api/
├── postman_collection.json
├── package.json
├── tsconfig.json
├── AGENTS.md
├── README.md
└── src/
    ├── app.ts                 # สร้าง Express app, mount routes, listen
    ├── config/
    │   └── database.config.ts # pg Pool จาก DATABASE_URL
    ├── middleware/
    │   └── auth.middleware.ts # JWT → req.admin { adminId, email, role }
    ├── routes/                # กำหนด path + method + middleware
    ├── controllers/           # อ่าน req/res, เรียก service, ส่ง JSON
    ├── services/              # business logic + SQL
    └── db/
        ├── bann_laundry_table.sql   # schema รวม (source of truth สำหรับโครงสร้างเต็ม)
        └── migrations/              # ไฟล์ SQL ทีละขั้น (รันบน DB จริงตามลำดับ)
```

### หน้าที่แต่ละชั้น (อย่าข้ามชั้น)

| ชั้น | เก็บอะไร | ห้ามทำ |
|------|----------|--------|
| `routes/*.route.ts` | path, method, `authMiddleware` | ห้ามเขียน SQL / business logic |
| `controllers/*.controller.ts` | parse param/body/query, เรียก service, จัด response | ห้าม SQL ตรงๆ |
| `services/*.service.ts` | validation, query, transaction, เรียก `insertAdminLog` | ห้ามผูกกับ Express `req`/`res` โดยตรง |
| `middleware/` | auth / กลางๆ ที่ใช้ข้าม module | — |
| `db/` | schema + migrations เท่านั้น | ห้ามใส่ logic แอป |

### กฎตั้งชื่อไฟล์

- หนึ่ง domain ต่อชุด: `users.route.ts` / `users.controller.ts` / `users.service.ts`
- ใช้ `snake_case` ตามชื่อตารางเมื่อเป็น domain หลายคำ เช่น `list_price`, `order_items`, `admin_log`
- URL ใช้ kebab-case: `/list-price`, `/order-items`, `/admin-log`, `/service-type`

### ตอนเพิ่ม module ใหม่ ทำตามลำดับนี้

1. ออกแบบตาราง → ใส่ใน `bann_laundry_table.sql` + สร้าง `migrations/00X_....sql`
2. เขียน `services/<name>.service.ts`
3. เขียน `controllers/<name>.controller.ts`
4. เขียน `routes/<name>.route.ts`
5. mount ใน `src/app.ts` ภายใต้ `/laundry/api/...`
6. อัปเดต `postman_collection.json`
7. `npm run build` ให้ผ่าน

---

## 3) Database

### หลักการทั่วไป

- DB: **PostgreSQL**
- Soft delete: ทุกตารางหลักมี `deleted_at`
  - แถวที่ยังใช้: `WHERE deleted_at IS NULL`
  - Unique สำคัญใช้ **partial unique index** เฉพาะแถวที่ยังไม่ลบ
- มี `created_at`, `updated_at` + trigger `set_updated_at()`
- Schema รวมอยู่ที่ `src/db/bann_laundry_table.sql`
- การเปลี่ยน schema บน DB ที่รันอยู่แล้ว: เพิ่มไฟล์ใน `src/db/migrations/` ลำดับเลขต่อเนื่อง **ห้ามแก้ migration เก่าที่รันไปแล้ว**

### ตารางหลักและความหมาย

| ตาราง | ความหมาย |
|--------|----------|
| `users` | ลูกค้า (phone, name, note) |
| `admins` | โปรไฟล์พนักงาน/แอดมิน + `last_login_at` |
| `admin_auth` | password hash แยกจากโปรไฟล์ admin |
| `service_type` | ประเภทบริการ (เช่น wash, wash_iron) |
| `list_type` | ชนิดผ้า/รายการ (code, name, size) |
| `list_price` | ราคา = คู่ `service_type_id` + `list_type_id` |
| `orders` | ใบรับผ้า (ticket_no, status, payment_status, ยอดเงิน) |
| `order_items` | รายการในใบออเดอร์ |
| `order_log` | ประวัติของ **ออเดอร์หนึ่งใบ** |
| `admin_log` | ประวัติการใช้งานของ **admin ทั้งระบบ** |

### ความต่าง `order_log` vs `admin_log` (สำคัญมาก)

| | `order_log` | `admin_log` |
|--|-------------|-------------|
| โฟกัส | timeline ของใบออเดอร์ | audit ว่า admin ใครทำอะไร |
| ตัวอย่าง | received → processing | admin สร้าง order #42 |
| เขียนจาก | flow ออเดอร์ / note | `insertAdminLog` หลัง mutate สำเร็จ |
| API ภายนอก | GET + POST note เท่านั้น (append-ish) | **GET อย่างเดียว** |

อย่าใช้สองตารางนี้แทนกัน

### ค่าสถานะออเดอร์

`orders.status`:
- `received` → `processing` → `ready` → `completed`
- หรือไป `cancelled` ได้จาก received / processing / ready

`orders.payment_status`:
- `unpaid` | `paid`

### กฎเปลี่ยนสถานะ (บังคับใน service)

กำหนดใน `ORDER_STATUS_TRANSITIONS` ที่ `orders.service.ts`:

| จาก | ไปได้ |
|-----|--------|
| `received` | `processing`, `cancelled` |
| `processing` | `ready`, `cancelled` |
| `ready` | `completed`, `cancelled` |
| `completed` | *(จบ — ห้ามเปลี่ยน)* |
| `cancelled` | *(จบ — ห้ามเปลี่ยน)* |

ใช้ทั้ง `PATCH /orders/:id/status` และ `PUT /orders/:id` ตอนมีการเปลี่ยน status  
ส่งค่าเดิมซ้ำ (ไม่เปลี่ยน) อนุญาต

### Migrations ที่มีอยู่

| ไฟล์ | เนื้อหา |
|------|---------|
| `001_split_admin_auth.sql` | แยก admin_auth |
| `002_seed_service_type.sql` | seed บริการ |
| `003_add_code_to_list_type.sql` | เพิ่ม code |
| `004_seed_list_type.sql` | seed ชนิดผ้า |
| `005_seed_list_price.sql` | seed ราคา |
| `006_add_order_payment_status.sql` | payment_status |
| `007_add_admin_log_and_last_login.sql` | `admin_log` + `admins.last_login_at` |

รันบน DB ตัวอย่าง:

```bash
psql "$DATABASE_URL" -f src/db/migrations/007_add_admin_log_and_last_login.sql
```

---

## 4) API / Auth conventions

### Prefix และ response รูปมาตรฐาน

- Base: `http://localhost:3001/laundry/api`
- สำเร็จ: `{ "success": true, "data": ... }`
- ผิดพลาดจาก domain error: `{ "success": false, "message": "..." }` + status code ที่เหมาะสม
- Error class ใน service เช่น `OrderError`, `UserError`, `AuthError` มี `statusCode`

### Auth

- Login: `POST /auth/login` body `{ email, password }` → `{ token, admin }`
- Register: `POST /auth/register` (ตอนนี้ยังเปิดอยู่ — พิจารณาจำกัดใน production)
- `GET /auth/me` ต้องมี token
- Middleware ใส่ `req.admin = { adminId, email, role }`
- เส้นที่แก้ข้อมูลร้าน (GET รวม) ต้องมี `authMiddleware` ยกเว้น `GET /health` และ login/register

### ส่ง `adminId` ตอน mutate

Controller ต้องส่ง:

```ts
adminId: req.admin?.adminId ?? null
```

เข้า service เสมอเมื่อสร้าง/แก้/ลบ  
เพื่อให้ `insertAdminLog` บันทึกได้

### `insertAdminLog` (แนวทาง)

- อยู่ที่ `services/admin_log.service.ts`
- เรียก **หลัง** งานหลักสำเร็จ
- ถ้าอยู่ใน transaction ให้ส่ง `PoolClient` เป็น arg ที่ 2
- ถ้าไม่มี `adminId` ที่ถูกต้อง → ข้าม ไม่ throw
- ฟิลด์สำคัญ: `action`, `entityType`, `entityId`, `message`, `meta?`

ตัวอย่าง action: `login`, `create`, `update`, `soft_delete`, `hard_delete`, `status_change`, `payment_change`  
ตัวอย่าง entityType: `admin`, `user`, `order`, `order_item`, `service_type`, `list_type`, `list_price`

### Orders flow สำคัญ

**สร้างออเดอร์** `POST /orders` (ต้อง token):

1. สร้าง `orders` (`ticket_no` อัตโนมัติ, `status=received`, `payment_status=unpaid`)
2. สร้าง `order_items` จาก `items[]`
3. คำนวณ subtotal / discount / total
4. เขียน `order_log` action `create`
5. เขียน `admin_log`
6. อยู่ใน transaction เดียวกัน — พังแล้ว rollback ทั้งก้อน

Body หลัก:

```json
{
  "user_id": 1,
  "discount": 0,
  "note": "...",
  "items": [
    { "list_price_id": 1, "qty": 3, "note": "เสื้อ" }
  ]
}
```

แต่ละ item ใช้ `list_price_id` **หรือ** คู่ `service_type_id` + `list_type_id`

**อัปเดตสถานะงาน:** `PATCH /orders/:id/status` `{ "status": "processing" }`  
**อัปเดตจ่ายเงิน:** `PATCH /orders/:id/payment-status` `{ "payment_status": "paid" }`  
**ดู timeline ใบออเดอร์:** `GET /orders/:id/logs`  
**ค้นออเดอร์:** `GET /orders?ticket_no=&status=&payment_status=&phone=&date_from=&date_to=`  
**ค้นลูกค้า:** `GET /users?phone=` (partial) / `?name=` (contains) / `?q=` (เบอร์หรือชื่อ)

### Soft vs Hard delete

- `DELETE /resource/:id` → soft (`deleted_at = NOW()`)
- `DELETE /resource/:id/hard` → hard delete (ระวัง FK / ข้อมูลอ้างอิง)
- โดยทั่วไป production ใช้ soft เป็นหลัก

### order_log API

- Append-oriented: อนุญาต `POST` สำหรับ `action: "note"` เท่านั้น
- ไม่เปิด PUT/DELETE จาก API ภายนอก
- การเปลี่ยนสถานะ/รายการ ระบบเขียน log ให้เอง

### admin_log API

- Read-only: `GET /admin-log`, `GET /admin-log/:id`
- Filter: `admin_id`, `action`, `entity_type`, `entity_id`, `date_from`, `date_to`
- ห้ามทำ CRUD แก้/ลบ log จาก API ภายนอก

---

## 5) แนวทางตอนเขียน / แก้โค้ด (สำหรับ agent)

### ทำ

- รักษาโครงสร้าง route → controller → service
- Soft delete + `deleted_at IS NULL` ใน query ปกติ
- ใช้ transaction เมื่อสร้าง/อัปเดตที่แตะหลายตาราง (โดยเฉพาะ orders)
- เรียก `insertAdminLog` หลัง mutate สำเร็จ
- อัปเดต Postman เมื่อเพิ่ม/เปลี่ยน endpoint
- รัน `npm run build` หลังแก้ TypeScript
- เพิ่ม migration ใหม่เมื่อเปลี่ยน schema — อัปเดต `bann_laundry_table.sql` ให้สอดคล้อง

### ห้าม

- อย่าใส่ SQL ใน controller/route
- อย่าลบ/แก้ migration ที่รันไปแล้ว — สร้างไฟล์ใหม่
- อย่าให้ `order_log` กับ `admin_log` สับสนหน้าที่
- อย่าเปิด GET ข้อมูลร้านแบบไม่มี auth
- อย่าข้ามกฎ `ORDER_STATUS_TRANSITIONS` โดยตั้ง status ตรงๆ ใน SQL โดยไม่ผ่าน assert
- อย่ารีแฟกเตอร์กว้างเกินงานที่ถูกขอ
- อย่า commit / push นอกจากผู้ใช้ขอ

### Response / error style

- Domain error: class ที่ extends Error + `statusCode` ใน service  
- Controller จับแล้วตอบ `{ success: false, message }`  
- Error ที่ไม่รู้จักส่ง `next(error)`

---

## 6) แนวทาง prompt ในอนาคต (ให้ผลดี)

เมื่อสั่งงาน agent แนะนำระบุให้ชัด:

1. **ขอบเขต:** ไฟล์/module ไหน (เช่น orders เท่านั้น)
2. **ผลลัพธ์ที่ต้องการ:** endpoint, schema, หรือ behavior
3. **อย่าทำอะไร:** เช่น ห้ามแก้ frontend, ห้าม hard delete
4. **ของที่ต้องอัปเดตคู่กัน:** migration + schema รวม + Postman + build

ตัวอย่าง prompt ที่ดี:

> เพิ่ม filter `payment_status` ให้ `GET /admin-log` ไม่ได้  
> แก้ที่ service/controller ของ admin_log เท่านั้น  
> อัปเดต Postman และรัน build

ตัวอย่างที่ไม่ดี:

> ทำให้ระบบดีขึ้น  
> (กว้างเกินไป เสี่ยงแก้หลายที่โดยไม่จำเป็น)

---

## 7) แผนงานที่ยังไม่บังคับ (backlog แนะนำ)

เรียงตามความคุ้มก่อน:

1. จำกัด `POST /auth/register` ใน production
2. Pagination มาตรฐาน (`page`, `limit`, `total`) สำหรับ list ใหญ่
3. API สรุปรายวัน/เดือน (ยอดออเดอร์ / paid / unpaid)
4. เก็บ diff ใน `admin_log.meta` ตอน update สำคัญ
5. Role-based permission ละเอียด (owner/admin/staff)

อย่าทำ backlog เหล่านี้โดยอัตโนมัติถ้าผู้ใช้ยังไม่ขอ

---

## 8) เช็กลิสต์สั้นก่อนจบงาน

- [ ] โครงสร้างยังเป็น route / controller / service
- [ ] Query กรอง `deleted_at IS NULL` ตามปกติ
- [ ] Mutate ที่เกี่ยวกับ admin ส่ง `adminId` และมี `insertAdminLog` ถ้าเหมาะสม
- [ ] เปลี่ยน status ออเดอร์ผ่านกฎ transition
- [ ] Schema เปลี่ยนแล้วมี migration ใหม่ + อัปเดต schema รวม
- [ ] อัปเดต Postman
- [ ] `npm run build` ผ่าน

---

อัปเดตไฟล์นี้เมื่อมีการเปลี่ยน architecture, schema สำคัญ, หรือ convention ใหม่ของโปรเจกต์
