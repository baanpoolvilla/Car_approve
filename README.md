# ระบบบันทึกการใช้รถบริษัท (Car Approve)

Web App แบบ Mobile-first สำหรับขอใช้รถ อนุมัติ ตรวจสภาพรถก่อน–หลังพร้อมรูปถ่าย และรายงานการใช้งาน

- **Stack**: Next.js 15 (App Router) + TypeScript + Tailwind CSS 4
- **ฐานข้อมูล**: Neon PostgreSQL + Drizzle ORM
- **Deploy**: Vercel
- **เขตเวลา**: บันทึกเป็น `timestamptz` ทั้งหมด แสดงผลเป็น Asia/Bangkok

---

## 1. ตั้งค่า Neon (ทำครั้งเดียว)

Vercel deploy ได้แล้ว แต่ยังต่อฐานข้อมูลไม่ได้จนกว่าจะทำ 3 ขั้นนี้

### 1.1 คัดลอก connection string จาก Neon

ที่ Neon Console → project `carapprove` → ปุ่ม **Connect** (มุมขวาบน)

- Branch: `production`
- Database: `neondb`
- **เลือก "Pooled connection"** (สำคัญมาก — host จะมีคำว่า `-pooler`)

จะได้หน้าตาแบบนี้

```
postgresql://neondb_owner:xxxxxxxx@ep-xxxx-xxxx-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require
```

### 1.2 ใส่ Environment Variables ที่ Vercel

Vercel → project `carapprove` → **Settings → Environment Variables** เพิ่ม 2 ตัว
แล้วติ๊กให้ครบทั้ง Production, Preview, Development

| Key | Value |
|---|---|
| `DATABASE_URL` | connection string จากข้อ 1.1 |
| `APP_URL` | `https://carapprove.vercel.app` |

จากนั้นไปที่ **Deployments → ... → Redeploy** เพื่อให้ค่าใหม่มีผล

> `vercel.json` ตั้ง `"regions": ["sin1"]` ไว้แล้ว เพื่อให้ Vercel Function อยู่สิงคโปร์
> ที่เดียวกับ Neon (`ap-southeast-1`) ถ้าย้าย Neon ไป region อื่น ต้องแก้ตรงนี้ตามด้วย
> ไม่งั้นทุก query จะเสียเวลาข้ามทวีป

### 1.3 สร้างตารางและข้อมูลตั้งต้น

ฐานข้อมูล Neon ที่เพิ่งสร้างยังว่างเปล่า ต้องสร้างตารางก่อน เลือกทางใดทางหนึ่ง

#### ทาง A — รันจากเครื่องตัวเอง (แนะนำ)

```bash
npm install
cp .env.example .env.local
```

เปิด `.env.local` วาง connection string ลงบรรทัด `DATABASE_URL` แล้ว

```bash
npm run db:setup
```

ควรเห็น

```
- apply 0000_init.sql ... ok
- apply 0001_pin_auth.sql ... ok
- apply 0002_seed.sql ... ok
Migrations complete.
```

#### ทาง B — วาง SQL ใน Neon Console (ไม่ต้องใช้ terminal)

Neon Console → เมนูซ้าย **SQL Editor** → เปิดไฟล์ในโปรเจกต์แล้วคัดลอกทั้งไฟล์
มาวางแล้วกด **Run** ทีละไฟล์ **ตามลำดับ**

1. `drizzle/0000_init.sql` — สร้าง enum, ตาราง, index, constraint กันจองซ้อน
2. `drizzle/0001_pin_auth.sql` — คอลัมน์สำหรับรหัส 6 หลัก
3. `drizzle/0002_seed.sql` — ผู้ใช้ 13 คน, รถ 2 คัน, checklist, เงื่อนไขการใช้รถ

ทั้ง 3 ไฟล์รันซ้ำได้ ไม่สร้างข้อมูลซ้ำ

#### ตรวจว่าสำเร็จ

รันใน Neon SQL Editor

```sql
SELECT
  (SELECT count(*) FROM users)                  AS ผู้ใช้,
  (SELECT count(*) FROM vehicles)               AS รถ,
  (SELECT count(*) FROM checklist_definitions)  AS checklist,
  (SELECT count(*) FROM terms_versions)         AS เงื่อนไข;
```

ต้องได้ `13 / 2 / 10 / 1`

เสร็จแล้วเปิด https://carapprove.vercel.app ใส่อีเมลตัวเอง → ตั้งรหัส 6 หลัก → ใช้งานได้เลย

---

## 2. รันบนเครื่องตัวเอง (Local dev)

```bash
npm install
cp .env.example .env.local     # ใส่ DATABASE_URL
npm run db:setup               # สร้างตาราง + ข้อมูลตั้งต้น (รันซ้ำได้)
npm run dev                    # http://localhost:3000
```

---

## 3. การเข้าสู่ระบบ

**ไม่ต้องรอรหัสจากอีเมล** ขั้นตอนคือ

1. ใส่อีเมลบริษัท → กด **ยืนยัน**
2. **ครั้งแรก**: ตั้งรหัส 6 หลักของตัวเอง (พิมพ์ 2 ครั้งให้ตรงกัน) แล้วเข้าระบบทันที
3. **ครั้งต่อไป**: ใส่รหัส 6 หลักที่ตั้งไว้ แล้วเข้าระบบได้เลย

Session อยู่ได้ 14 วัน เปลี่ยนรหัสเองได้ที่ **เมนู → เปลี่ยนรหัส 6 หลัก**

**ข้อควรรู้ด้านความปลอดภัย**: การตั้งรหัสครั้งแรกไม่มีการยืนยันตัวตนทางอีเมล
ใครที่รู้อีเมลพนักงานและเข้าหน้าเว็บก่อนจะตั้งรหัสของคนนั้นได้ จึงควรให้ทุกคน
เข้าไปตั้งรหัสของตัวเองให้ครบตั้งแต่วันแรก ผู้ดูแลระบบดูได้ที่หน้า **ผู้ใช้และสิทธิ์**
ว่าใครตั้งรหัสแล้วบ้าง

มาตรการที่ใส่ไว้แล้ว:
- รหัสเก็บแบบ scrypt hash พร้อม salt ต่อคน (ไม่เก็บเลขจริง)
- กรอกผิด 5 ครั้ง ล็อกบัญชี 15 นาที
- ห้ามตั้งรหัสง่ายเกินไป (เลขซ้ำ 6 ตัว หรือเรียงติดกัน เช่น `111111`, `123456`)
- Admin กด **รีเซ็ตรหัส** ได้ที่หน้าผู้ใช้ ซึ่งจะเตะคนนั้นออกจากทุกอุปกรณ์ แล้วให้ตั้งรหัสใหม่
- ทุกครั้งที่ตั้ง / เปลี่ยน / รีเซ็ตรหัส ถูกบันทึกใน Audit Log

### ผู้ใช้ตั้งต้น (จาก seed)

| อีเมล | สิทธิ์ |
|---|---|
| kanitha@baanpoolvilla.com | พนักงาน, **ผู้อนุมัติ** |
| sujita@baanpoolvilla.com | พนักงาน, **ผู้อนุมัติ** |
| thanonchai@baanpoolvilla.com | พนักงาน, **ผู้อนุมัติ** |
| thunchanok@baanpoolvilla.com | พนักงาน, **ผู้อนุมัติ** |
| katawut@baanpoolvilla.com | พนักงาน, **ผู้ดูแลระบบ**, **ผู้ดูแลรถ** |
| ที่เหลืออีก 8 คน | พนักงาน |

แก้สิทธิ์ทั้งหมดได้ที่ **เมนู → ผู้ใช้และสิทธิ์**

### อีเมลแจ้งเตือน (ไม่บังคับ)

การ login ไม่ใช้อีเมลแล้ว แต่ถ้าอยากให้ระบบส่ง**อีเมลแจ้งเตือน**เวลามีคำขอรออนุมัติ
ให้สมัคร Resend ยืนยันโดเมน `baanpoolvilla.com` แล้วใส่ `RESEND_API_KEY` กับ
`EMAIL_FROM` ที่ Vercel ถ้าไม่ใส่ ระบบยังทำงานครบ แค่แจ้งเตือนอยู่ในระบบอย่างเดียว

### Cron

`vercel.json` ตั้ง `/api/cron` ไว้วันละครั้ง (Vercel Hobby จำกัดไว้เท่านี้)
ถ้าอัปเป็น Pro เปลี่ยนเป็น `*/15 * * * *` เพื่อให้เตือนใกล้ถึงเวลาใช้รถและเตือนคืนรถ
เกินเวลาได้ใกล้เคียงเรียลไทม์

Cron ทำ 3 อย่าง: เตือนก่อนถึงเวลาใช้รถ, เตือนคืนรถเกินกำหนด, และเปลี่ยนคำขอที่อนุมัติแล้ว
แต่ไม่มารับรถเป็น `EXPIRED`

---

## 4. Workflow

```
DRAFT → PENDING_APPROVAL → APPROVED → CHECKED_OUT → RETURNED → COMPLETED
                         ↘ REJECTED                          ↗ (ถ้าไม่พบปัญหา ข้าม RETURNED)
DRAFT / PENDING_APPROVAL / APPROVED → CANCELLED
APPROVED ที่เลยเวลาโดยไม่รับรถ → EXPIRED
```

**การอนุมัติเป็นแบบระดับเดียว (any-of)**: คำขอถูกส่งให้ผู้อนุมัติทุกคนพร้อมกัน คนใดคนหนึ่งตัดสินใจก็จบ
ผู้ขอไม่สามารถอนุมัติคำขอของตนเองได้ (ระบบไม่สร้าง approval step ให้ตนเอง)

### กฎที่บังคับในระบบ

- รถหนึ่งคันมีรายการที่อนุมัติแล้วทับช่วงเวลากันไม่ได้ — บังคับด้วย **exclusion constraint** ที่ระดับฐานข้อมูล จึงกันการกดพร้อมกันได้จริง
- เริ่มตรวจรถก่อนใช้ได้เฉพาะรายการที่ `APPROVED`
- รูปต้องครบทุกมุมที่ Admin กำหนด (ค่าเริ่มต้น 6 มุม: หน้า ท้าย ซ้าย ขวา ภายใน เลขไมล์) ทั้งก่อนและหลัง
- ถ้าเลือก "ชำรุด" ต้องกรอกรายละเอียด **และ** แนบรูปจุดเสียหายอย่างน้อย 1 รูป
- เลขไมล์หลังใช้ต้องไม่น้อยกว่าก่อนใช้
- รายการที่มีความเสียหายใหม่หรือมีการแจ้งเหตุ ต้องให้ Fleet Manager ตรวจและปิดงานก่อนถึงจะ `COMPLETED`
- Audit log เป็น append-only — มี trigger ที่ฐานข้อมูลกัน UPDATE/DELETE

---

## 5. รูปถ่าย

รูปถูกบีบอัดที่เครื่องผู้ใช้ก่อนอัปโหลด (ย่อด้านยาวสุดเหลือ 1600px, JPEG q0.75 → ปกติ 150–350KB ต่อรูป)
แล้วเก็บเป็น `bytea` ในตาราง `files` ของ Neon และเสิร์ฟผ่าน `/api/photos/[id]` ซึ่งบังคับให้ต้องล็อกอิน

> เลือกวิธีนี้เพราะโจทย์ระบุแค่ Vercel + Neon โดยไม่มี Object Storage — ที่ปริมาณรถ 2 คัน / 13 คน
> (ประมาณ 12 รูปต่อทริป) ขนาดข้อมูลอยู่ในระดับไม่กี่ GB ต่อปี ซึ่งจัดการได้สบาย
>
> ถ้าภายหลังต้องการย้ายไป S3/Cloudflare R2: ตาราง `files` มีคอลัมน์ `storage` และ `object_key` รออยู่แล้ว
> แก้เฉพาะ `src/app/api/uploads/route.ts` กับ `src/app/api/photos/[id]/route.ts` ให้ presign แทนการเก็บ `data`

---

## 6. โครงสร้างโปรเจกต์

```
drizzle/*.sql                SQL migrations (แหล่งความจริงของ schema จริง)
scripts/migrate.mjs          รัน migration ที่ยังไม่เคยรัน
scripts/seed.mjs             ข้อมูลตั้งต้น
src/db/schema.ts             Drizzle schema (ใช้ query)
src/lib/auth.ts              PIN login, session, RBAC
src/lib/workflow.ts          business logic ทั้งหมด (submit / approve / checkout / return / complete)
src/lib/queries.ts           query ที่ใช้ซ้ำสำหรับหน้ารายการ
src/lib/notify.ts            แจ้งเตือนในระบบ + อีเมล (ส่งหลัง transaction commit)
src/lib/audit.ts             audit log
src/app/(app)/               หน้าจอที่ต้องล็อกอิน
src/app/api/                 REST endpoints
```

หลักการ: **business logic อยู่ใน `src/lib/` ไม่อยู่ในหน้าเว็บ** และการเปลี่ยนสถานะทุกครั้งทำใน transaction
เดียวกับ audit log และการสร้าง notification

### การเชื่อมต่อฐานข้อมูล

ใช้ **node-postgres ผ่าน TCP** ไม่ใช่ Neon serverless driver (WebSocket)
เพราะ Vercel Function เปิด WebSocket ไปหา Neon proxy ไม่ได้ — timeout ทุกครั้ง
ผลตรวจจากรันไทม์จริง:

| วิธี | ผล |
|---|---|
| Neon HTTP driver | ok ~0.8s (แต่ไม่รองรับ transaction) |
| Neon WebSocket | ❌ timeout |
| pg ผ่าน TCP | ok |
| pg ผ่าน TCP + transaction | ok |

ระบบต้องใช้ interactive transaction ทุกครั้งที่เปลี่ยนสถานะ จึงต้องใช้ TCP
`DATABASE_URL` ต้องชี้ไปที่ **pooled endpoint** เสมอ เพื่อให้ PgBouncer ของ Neon
รับหน้าที่ pooling แทน (serverless ทำเองไม่ได้)

---

## 7. หน้าจอ

| Role | หน้าที่เข้าได้ |
|---|---|
| พนักงาน | หน้าหลัก, ขอใช้รถ, รายการของฉัน, ปฏิทิน, ตรวจรถก่อน–หลัง, แจ้งอุบัติเหตุ, แจ้งเตือน, เงื่อนไข |
| ผู้อนุมัติ | + Approval Inbox และประวัติการอนุมัติ |
| ผู้ดูแลรถ | + Fleet Dashboard, คืนรถรอตรวจ, จัดการรถ/ปิดรถชั่วคราว, รายงาน + Export CSV |
| ผู้ดูแลระบบ | + ผู้ใช้และสิทธิ์, Checklist และมุมรูปบังคับ, เงื่อนไขการใช้รถ (versioning), Audit Log |
| ผู้ตรวจสอบ | อ่านอย่างเดียว + Audit Log |

ผู้ใช้หนึ่งคนมีได้หลาย role

---

## 8. คำสั่งที่ใช้บ่อย

```bash
npm run dev          # dev server
npm run build        # production build
npm run db:migrate   # รัน migration อย่างเดียว
npm run db:seed      # seed อย่างเดียว
npx tsc --noEmit     # typecheck
```

## 9. สิ่งที่ยังไม่ได้ทำ (นอกขอบเขต MVP)

- Automated test suite และ load test
- เชื่อมระบบ HR / Google Workspace
- ตั้งค่ากฎผู้อนุมัติหลายระดับผ่านหน้าจอ (ตอนนี้เป็นระดับเดียวแบบ any-of ซึ่งตรงกับที่ตกลงไว้)
- นโยบายลบรูป/ข้อมูลตามอายุการเก็บ (ต้องยืนยันระยะเวลากับบริษัทก่อน)
