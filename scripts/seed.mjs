import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set. Create .env.local from .env.example first.");
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

/** roles: EMPLOYEE is implicit for everyone */
const PEOPLE = [
  { email: "chayanun@baanpoolvilla.com", name: "Chayanun", roles: [] },
  { email: "kanitha@baanpoolvilla.com", name: "Kanitha", roles: ["APPROVER"] },
  { email: "kanthita@baanpoolvilla.com", name: "Kanthita", roles: [] },
  {
    email: "katawut@baanpoolvilla.com",
    name: "Katawut",
    roles: ["ADMIN", "FLEET_MANAGER"],
  },
  { email: "kenika@baanpoolvilla.com", name: "Kenika", roles: [] },
  { email: "pacharapol@baanpoolvilla.com", name: "Pacharapol", roles: [] },
  { email: "somporn@baanpoolvilla.com", name: "Somporn", roles: [] },
  { email: "soravee@baanpoolvilla.com", name: "Soravee", roles: [] },
  { email: "sujita@baanpoolvilla.com", name: "Sujita", roles: ["APPROVER"] },
  { email: "surin@baanpoolvilla.com", name: "Surin", roles: [] },
  { email: "thanonchai@baanpoolvilla.com", name: "Thanonchai", roles: ["APPROVER"] },
  { email: "thunchanok@baanpoolvilla.com", name: "Thunchanok", roles: ["APPROVER"] },
  { email: "waratta@baanpoolvilla.com", name: "Waratta", roles: [] },
];

const VEHICLES = [
  {
    plate: "DEEPAL-01",
    brand: "Deepal",
    model: "S07",
    color: "-",
    seats: 5,
    powerType: "EV",
    note: "แก้ไขเลขทะเบียนจริงได้ที่หน้า Admin > รถ",
  },
  {
    plate: "MG-01",
    brand: "MG",
    model: "-",
    color: "-",
    seats: 5,
    powerType: "EV",
    note: "แก้ไขเลขทะเบียนจริงได้ที่หน้า Admin > รถ",
  },
];

const CHECKLIST = [
  ["EXTERIOR_BODY", "ตัวถัง / สีรอบคัน", "ภายนอก", 10],
  ["TIRES", "ยางและลมยาง", "ภายนอก", 20],
  ["LIGHTS", "ไฟหน้า–ไฟท้าย–ไฟเลี้ยว", "ภายนอก", 30],
  ["MIRRORS_GLASS", "กระจก / กระจกมองข้าง", "ภายนอก", 40],
  ["WIPERS", "ที่ปัดน้ำฝน", "ภายนอก", 50],
  ["INTERIOR_CLEAN", "ความสะอาดภายใน", "ภายใน", 60],
  ["AIRCON", "แอร์", "ภายใน", 70],
  ["DOCUMENTS", "เอกสารประจำรถ (พ.ร.บ./ประกัน)", "อุปกรณ์", 80],
  ["SPARE_TOOLS", "ยางอะไหล่ / เครื่องมือ", "อุปกรณ์", 90],
  ["FIRST_AID", "อุปกรณ์ฉุกเฉิน", "อุปกรณ์", 100],
];

const TERMS = `1. ผู้ขอใช้รถต้องมีใบอนุญาตขับขี่ที่ยังไม่หมดอายุ และเป็นผู้ขับขี่ด้วยตนเอง เว้นแต่ได้รับอนุญาตเป็นกรณีพิเศษ
2. ใช้รถเพื่อธุระของบริษัทตามวัตถุประสงค์ที่ระบุไว้ในคำขอเท่านั้น
3. ห้ามดื่มสุราหรือใช้สารเสพติดก่อนและระหว่างขับขี่ และต้องคาดเข็มขัดนิรภัยทุกที่นั่ง
4. ต้องตรวจสภาพรถและถ่ายรูปให้ครบทุกมุมทั้งก่อนนำรถออกและหลังคืนรถ
5. ค่าปรับจราจร ค่าทางด่วน และค่าใช้จ่ายที่เกิดจากความประมาทของผู้ใช้ ผู้ใช้เป็นผู้รับผิดชอบ
6. หากเกิดอุบัติเหตุ ต้องแจ้งบริษัทและบริษัทประกันทันที และบันทึกเหตุการณ์ในระบบพร้อมรูปถ่าย
7. คืนรถตามเวลาที่ได้รับอนุมัติ พร้อมระดับน้ำมันไม่น้อยกว่าตอนรับรถ
8. การฝ่าฝืนเงื่อนไขอาจถูกระงับสิทธิ์การใช้รถและพิจารณาตามระเบียบบริษัท`;

try {
  for (const p of PEOPLE) {
    const { rows } = await pool.query(
      `INSERT INTO users (email, name, department)
       VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [p.email, p.name, null]
    );
    const userId = rows[0].id;
    const roles = ["EMPLOYEE", ...p.roles];
    for (const role of roles) {
      await pool.query(
        `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)
         ON CONFLICT (user_id, role) DO NOTHING`,
        [userId, role]
      );
    }
  }
  console.log(`Seeded ${PEOPLE.length} users.`);

  for (const v of VEHICLES) {
    await pool.query(
      `INSERT INTO vehicles (plate_number, brand, model, color, seats, power_type, note)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (plate_number) DO NOTHING`,
      [v.plate, v.brand, v.model, v.color, v.seats, v.powerType, v.note]
    );
  }
  console.log(`Seeded ${VEHICLES.length} vehicles.`);

  for (const [code, name, category, sort] of CHECKLIST) {
    await pool.query(
      `INSERT INTO checklist_definitions (code, name, category, sort_order)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category`,
      [code, name, category, sort]
    );
  }
  console.log(`Seeded ${CHECKLIST.length} checklist items.`);

  await pool.query(
    `INSERT INTO terms_versions (version, content, is_active)
     VALUES ('1.0', $1, true)
     ON CONFLICT (version) DO NOTHING`,
    [TERMS]
  );

  await pool.query(
    `INSERT INTO settings (key, value) VALUES
       ('required_photo_angles', $1::jsonb),
       ('reminder_minutes_before', '60'::jsonb)
     ON CONFLICT (key) DO NOTHING`,
    [JSON.stringify(["FRONT", "REAR", "LEFT", "RIGHT", "INTERIOR", "ODOMETER"])]
  );

  console.log("Seed complete.");
} catch (err) {
  console.error("Seed failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
