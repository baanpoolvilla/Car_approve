# ระบบบันทึกการใช้รถบริษัท (Car Approve)

Web App แบบ Mobile-first สำหรับขอใช้รถ อนุมัติ ตรวจสภาพรถก่อน–หลังพร้อมรูปถ่าย และรายงานการใช้งาน

- **Stack**: Next.js 15 (App Router) + TypeScript + Tailwind CSS 4
- **ฐานข้อมูล**: Neon PostgreSQL + Drizzle ORM
- **Deploy**: Vercel
- **เขตเวลา**: บันทึกเป็น `timestamptz` ทั้งหมด แสดงผลเป็น Asia/Bangkok

---

## 1. เริ่มใช้งาน (Local)

```bash
npm install
cp .env.example .env.local     # แล้วแก้ค่า DATABASE_URL
npm run db:setup               # สร้างตาราง + ใส่ข้อมูลตั้งต้น
npm run dev                    # http://localhost:3000
```

### สร้างฐานข้อมูล Neon

1. สร้าง project ที่ https://console.neon.tech (เลือก region `ap-southeast-1` เพื่อความเร็ว)
2. คัดลอก **Pooled connection string** (host ต้องมีคำว่า `-pooler`)
3. วางใน `.env.local` เป็นค่า `DATABASE_URL`

`npm run db:setup` จะรัน:
- `drizzle/0000_init.sql` — สร้าง enum, ตาราง, index และ constraint กันจองซ้อน
- `scripts/seed.mjs` — เพิ่มผู้ใช้ 13 คน, รถ 2 คัน, checklist 10 ข้อ และเงื่อนไขการใช้รถฉบับ 1.0

สคริปต์ทั้งสองรันซ้ำได้ (idempotent)

---

## 2. Deploy ขึ้น Vercel

1. push โค้ดขึ้น GitHub แล้ว Import project ใน Vercel
2. ตั้งค่า Environment Variables:

| ตัวแปร | จำเป็น | คำอธิบาย |
|---|---|---|
| `DATABASE_URL` | ✅ | Neon **pooled** connection string |
| `APP_URL` | ✅ | เช่น `https://car.yourcompany.com` ใช้ในลิงก์ของอีเมล |
| `RESEND_API_KEY` | – | ถ้าไม่ตั้ง ระบบจะแสดงรหัส OTP บนหน้าจอแทนการส่งอีเมล |
| `EMAIL_FROM` | – | เช่น `Car Approve <no-reply@baanpoolvilla.com>` |
| `CRON_SECRET` | – | ป้องกัน `/api/cron` (Vercel ใส่ header ให้อัตโนมัติ) |

3. Deploy แล้วรัน migration ครั้งแรกจากเครื่องตัวเอง โดยชี้ `DATABASE_URL` ไปที่ production:

```bash
npm run db:setup
```

### Cron

`vercel.json` ตั้ง `/api/cron` ไว้วันละครั้ง (เหมาะกับ Vercel Hobby)
ถ้าใช้ Plan Pro ให้เปลี่ยนเป็น `*/15 * * * *` เพื่อให้เตือนใกล้ถึงเวลาใช้รถและเตือนคืนรถเกินเวลาได้แบบใกล้เคียงเรียลไทม์

Cron ทำ 3 อย่าง: เตือนก่อนถึงเวลาใช้รถ, เตือนคืนรถเกินกำหนด, และเปลี่ยนคำขอที่อนุมัติแล้วแต่ไม่มารับรถเป็น `EXPIRED`

---

## 3. การเข้าสู่ระบบ

Login ด้วยอีเมล + รหัส OTP 6 หลัก (อายุ 10 นาที) เฉพาะอีเมลที่มีอยู่ในระบบเท่านั้น
Session เก็บใน cookie `httpOnly` อายุ 14 วัน

**ถ้ายังไม่ได้ตั้ง `RESEND_API_KEY`** ระบบจะแสดงรหัสบนหน้าจอ (โหมดทดสอบ) และเขียนลง server log
พร้อมใช้งานจริงเมื่อไหร่ให้สมัคร Resend ยืนยันโดเมน `baanpoolvilla.com` แล้วใส่ key

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
drizzle/0000_init.sql        SQL migration (แหล่งความจริงของ schema จริง)
scripts/migrate.mjs          รัน migration ที่ยังไม่เคยรัน
scripts/seed.mjs             ข้อมูลตั้งต้น
src/db/schema.ts             Drizzle schema (ใช้ query)
src/lib/auth.ts              OTP login, session, RBAC
src/lib/workflow.ts          business logic ทั้งหมด (submit / approve / checkout / return / complete)
src/lib/queries.ts           query ที่ใช้ซ้ำสำหรับหน้ารายการ
src/lib/notify.ts            แจ้งเตือนในระบบ + อีเมล (ส่งหลัง transaction commit)
src/lib/audit.ts             audit log
src/app/(app)/               หน้าจอที่ต้องล็อกอิน
src/app/api/                 REST endpoints
```

หลักการ: **business logic อยู่ใน `src/lib/` ไม่อยู่ในหน้าเว็บ** และการเปลี่ยนสถานะทุกครั้งทำใน transaction
เดียวกับ audit log และการสร้าง notification

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
