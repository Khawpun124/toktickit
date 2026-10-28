# Lab 4 — GitHub Issues (พร้อม copy วางทีละอัน)

Kanban statuses: Backlog -> Specified -> Started -> PR Review -> Fixing -> Done

หมายเหตุ: เกณฑ์ที่อ้างถึง BR/AC ด้านล่างเขียนเป็นหัวข้อกว้างๆ เพราะยังไม่มี
specification.md ของ Lab 4 หลัง Issue 1 merge แล้วให้กลับมาใส่เลข BR/AC จริง
ลงในแต่ละ Issue

เกณฑ์กลางที่ใช้กับทุก Issue ที่มีโค้ด (Issue 2-7):
- [ ] Test เดิมของ Lab 1-3 ผ่านครบ ไม่ถูกลบ ลด หรือแก้ assertion เพื่อให้ผ่านง่าย
- [ ] รัน test บน fresh database (docker compose down -v -> up -d -> migrate deploy -> seed) และรันซ้ำอย่างน้อย 2 รอบเพื่อเช็คว่าไม่ flaky
- [ ] ทดสอบ manual ด้วยตัวเองตามเส้นทางหลักของ Issue (ไม่เชื่อรายงานของ agent อย่างเดียว)
- [ ] `git status` สะอาด ไม่มี cookies, test-results, screenshot ที่ถูกเขียนทับ หรือไฟล์ชั่วคราวติดมา
- [ ] CI เขียวบน GitHub จริงก่อนขอ review

---

## Issue 1: Sprint 4 engineering contract

**Type:** Documentation / Spec-Driven Development
**Required branch:** `feature/1-lab4-spec-and-test-plan`
**Depends on:** none (ทำก่อนเสมอ)

### Description
เขียน engineering contract ของ Lab 4 ให้ครบก่อนเริ่มเขียนโค้ด โดยต่อยอดจาก
Lab 1-3 และต้องตัดสินใจเรื่องที่ labsheet ยังไม่ชัดเจนให้เสร็จใน Issue นี้

### Acceptance Criteria
- [ ] `docs/lab-04/specification.md` ครบ 11 หัวข้อตาม labsheet section 9
- [ ] ตัดสินใจและบันทึกใน spec ว่า Actions Taken มีฟิลด์ใดบ้าง
      (action date/time, description, result, performed by (auto),
      follow-up required, follow-up note ที่บังคับเมื่อต้อง follow-up,
      attachment notes) และมี assignee และ status ของตัวเองหรือไม่
      (labsheet Part 6 และ AC-01 พูดถึง assign, complete, cancel,
      inactive-assignee rejection)
- [ ] นิยามให้ชัดว่า "Actions Taken ที่ยังไม่เสร็จ" คือสถานะใด และกฎ
      resolution gate ที่บล็อกการเปลี่ยน Ticket เป็น Resolved
- [ ] Status Transition Matrix ฉบับสุดท้าย ระบุ role ที่ทำได้ และจุดที่
      ต้องยืนยัน รวมกฎ resolution gate
- [ ] นิยาม dashboard ทุก metric ของ Requester และ IT Staff: ชื่อ metric,
      query, timezone และขอบเขตวัน, empty behavior, drill-down destination
- [ ] กลยุทธ์ concurrency/stale-update (เช่น version หรือ updatedAt แล้วตอบ
      409) และเหตุผลการออกแบบฐานข้อมูลอย่างน้อย 2 ข้อ
- [ ] กลยุทธ์ migration, backfill ของ Ticket เก่าที่ไม่มี Actions Taken และ
      rollback/recovery
- [ ] Authorization matrix ครบทุก operation ของ Actions Taken และ dashboard
- [ ] `tests.md`, `ui-spec.md`, `api-spec.md` ครบและสอดคล้องกัน และ AC ทุกข้อ
      แมปกับ test อย่างน้อย 1 ตัว
- [ ] ผ่าน peer review และ merge เข้า `lab4-staging` ก่อน Issue อื่น

---

## Issue 2: Actions Taken foundation

**Type:** Feature (data + API)
**Required branch:** `feature/2-lab4-actions-taken-foundation`
**Depends on:** Issue 1

### Description
สร้างโครงข้อมูลและ API ของ Actions Taken (ลูกของ Ticket) พร้อม authorization
และการป้องกันการแก้ทับกัน โดยไม่ทำให้ข้อมูล Lab 1-3 เสียหาย

### Acceptance Criteria
- [ ] Prisma model และ migration ของ Actions Taken ตาม spec
- [ ] Migration ผ่านการพิสูจน์ด้วยสคริปต์ที่จำลองฐานข้อมูล Lab 3 ที่มีข้อมูล
      อยู่แล้ว (ไม่ใช่ fresh DB) แล้วรัน migration ทับ แสดงตารางเทียบก่อน-หลัง
      ว่า Ticket, Comment, Note, Attachment เดิมครบและถูกต้อง
- [ ] Migration เป็นไฟล์ที่ห่อด้วย `BEGIN; ... COMMIT;` และรันซ้ำได้ (`IF NOT EXISTS`) พร้อม
      backfill `resolvedAt` ที่ idempotent
- [ ] เพิ่มคอลัมน์ `Ticket.statusChangedAt` (เพิ่มแบบ nullable, backfill ด้วย `updatedAt`, แล้วตั้ง
      default และ NOT NULL) และให้ handler เปลี่ยนสถานะเดิมของ Lab 3 ตั้งค่านี้ทุกครั้งที่สถานะเปลี่ยน
      (เจ้าของ, priority, comment และการแก้ Action ไม่เปลี่ยนค่านี้)
- [ ] สร้าง Action เป็น COMPLETED ต้องมี Result (400 ที่ `fields.result` ตรวจจาก request body)
- [ ] สร้างและทดสอบสคริปต์ตาม spec หัวข้อ 7: `db:backup`, `db:snapshot`, `db:verify:lab4`,
      `db:backfill:lab4`, `db:rollback:lab4` และ `prisma/rollback/lab4_down.sql` (โฟลเดอร์
      `backups/` อยู่ใน `.gitignore`)
- [ ] ทดสอบกรณี migration ล้มกลางทาง (ไม่เหลือโครงสร้างค้าง) แล้วแก้สาเหตุ,
      `migrate resolve --rolled-back` และรันซ้ำสำเร็จ
- [ ] ทดสอบ rollback แล้วตรวจว่าข้อมูล Lab 1-3 ทุกตารางตรงกับ snapshot (จำนวนแถวและ checksum
      รายแถว) และ apply migration ซ้ำได้
- [ ] Seed idempotent: Ticket ครบทุกสถานะ/ความสำคัญ มี owner และไม่มี owner
      มี Ticket ที่มี Actions Taken 0, 1 และหลายรายการ
- [ ] API สร้างและแก้ Actions Taken (IT Staff/Admin), ดูได้ตามสิทธิ์
      (Requester ดูของ Ticket ตัวเองเท่านั้น และแก้ไม่ได้)
- [ ] ผู้ทำ (performed by) มาจาก session ไม่ใช่ค่าที่ client ส่งมา
- [ ] Follow-up note บังคับเมื่อเลือก follow-up required (ตรวจที่ backend)
- [ ] ตรวจ inactive assignee และสิทธิ์ที่ backend (ไม่พึ่ง UI)
- [ ] Stale update ตอบ 409 และไม่ทับข้อมูลของอีกคน
- [ ] ไม่รั่วข้อมูลของ Ticket ที่ไม่มีสิทธิ์ (404/403 ตาม pattern เดิม)
- [ ] ครอบคลุม test: API, authorization, concurrency, migration
- [ ] เกณฑ์กลางครบ

---

## Issue 3: Actions Taken UI

**Type:** Feature (UI)
**Required branch:** `feature/3-lab4-actions-taken-ui`
**Depends on:** Issue 2

### Description
เพิ่มส่วน Actions Taken ใน Ticket Detail: รายการ, create mode, view/edit mode
สำหรับ IT Staff/Admin และแบบอ่านอย่างเดียวสำหรับ Requester

### Acceptance Criteria
- [ ] ส่วน Actions Taken ใน IT Staff Ticket Detail: list/table, create,
      view/edit ตาม `ui-spec.md`
- [ ] Requester เห็น Actions Taken ทุกรายการของ Ticket ตัวเองแบบอ่านอย่างเดียว
      และไม่มีทางสร้างหรือแก้
- [ ] Validation แสดงใต้ฟิลด์ (โดยเฉพาะ follow-up note เมื่อ follow-up required)
- [ ] เปลี่ยนสถานะของ Action ผ่านปุ่มเฉพาะ (Start, Mark completed, Cancel action) ที่เรียก
      status endpoint เท่านั้น ปุ่ม Save ไม่เปลี่ยนสถานะ และปุ่มสถานะถูกปิดเมื่อฟอร์มมีการแก้ที่ยังไม่บันทึก
- [ ] ป้องกันการกดซ้ำและเก็บข้อมูลที่กรอกไว้เมื่อเกิด error ที่กู้คืนได้
- [ ] แสดงสถานะ conflict (409) เป็นข้อความที่เข้าใจได้ ไม่ใช่ JSON ดิบ
- [ ] แยกส่วนส่วนตัว/ส่วนสาธารณะให้ชัด ไม่ปะปนกับ Internal Notes
- [ ] Responsive: desktop/tablet/mobile ไม่มี overflow, clipping หรือ overlap
- [ ] Accessibility: label, focus ที่มองเห็น, ใช้คีย์บอร์ดได้
- [ ] ครอบคลุม test: component, style, responsive
- [ ] เกณฑ์กลางครบ

---

## Issue 4: Ticket workflow and resolution gate

**Type:** Feature (business rules)
**Required branch:** `feature/4-lab4-ticket-workflow`
**Depends on:** Issue 2 (แนะนำให้ทำหลัง Issue 3 เพราะแก้ไฟล์ Ticket Detail
ร่วมกัน เพื่อเลี่ยง merge conflict)

### Description
บังคับ Status Transition Matrix ฉบับสุดท้ายและ resolution gate ที่ backend
(รวมกรณีที่ client ข้ามหน้าจอมายิง API ตรง) พร้อมจัดการ stale update

### Acceptance Criteria
- [ ] Transition matrix ฉบับสุดท้ายบังคับที่ backend ตาม spec
- [ ] Resolution gate: ไม่สามารถเปลี่ยนเป็น Resolved ได้เมื่อมี Actions Taken
      ที่ยังไม่เสร็จ (ตรวจที่ backend แม้ยิง API ตรง)
- [ ] การที่ Requester ระบุว่า "ปัญหาน่าจะหาย" เป็นเพียงคำแนะนำ ไม่เปลี่ยน status
- [ ] การเปลี่ยน status ที่ชนกับการแก้ของอีกคนถูกตรวจจับ (409) ไม่ทับกัน
- [ ] UI แสดงเฉพาะ transition ที่ทำได้ และเมื่อสำเร็จ summary status ของ
      Ticket รีเฟรช
- [ ] กรณีถูกบล็อกโดย resolution gate แสดงเหตุผลที่เข้าใจได้
- [ ] ลำดับ/ประวัติแสดงคงที่และเป็น append-only ตามที่ spec กำหนด
- [ ] ครอบคลุม test: workflow, authorization, concurrency, direct API bypass
- [ ] เกณฑ์กลางครบ

---

## Issue 5: Role dashboards

**Type:** Feature
**Required branch:** `feature/5-lab4-role-dashboards`
**Depends on:** Issue 2 (ทำขนานกับ Issue 3-4 ได้เพราะแตะไฟล์ต่างกัน)

### Description
สร้าง dashboard ของ Requester และ IT Staff (Administrator ใช้ของ IT Staff
ได้) โดยให้ backend คำนวณ metric จากข้อมูลจริงและมี drill-down ไปหน้ารายละเอียด

### Acceptance Criteria
- [ ] API dashboard ของ Requester: คืนเฉพาะ metric และ Ticket ล่าสุดของ
      ผู้ใช้นั้น (บังคับที่ backend)
- [ ] API dashboard ของ IT Staff: unassigned, ของฉัน, ตาม status/priority,
      ล่าสุด และ Actions Taken ของผู้ใช้ปัจจุบันตาม spec
- [ ] ตอบเฉพาะ metric และรายการสั้นๆ ไม่ส่ง Ticket ทั้งชุด
- [ ] "Needs your attention" เรียงตาม `statusChangedAt` (รอนานที่สุดก่อน, tie ตาม `id` จากน้อยไปมาก)
      แสดง "Waiting since" และการแก้ไข/คอมเมนต์ภายหลังไม่ทำให้ลำดับเปลี่ยน
- [ ] ใช้ `generatedAt` เดียวต่อหนึ่ง request และหน้าต่าง 30 วันแบบ inclusive ตาม BR-28
      ทดสอบขอบเขต (30 วันพอดีรวมอยู่ 30 วันกับ 1 ms ไม่รวม) และรันภายใต้ TZ หลายค่า
- [ ] ทุก card มี empty behavior และ drill-down ที่เปิด Queue/My Tickets/
      Ticket Detail แบบกรองถูกต้อง
- [ ] ตัวเลขบน dashboard ตรงกับ query ในฐานข้อมูล (มีหลักฐานเทียบ)
- [ ] เมนู Dashboard ตามบทบาท และมี active-page indication
- [ ] Loading, empty, forbidden, safe-failure และ responsive ครบ
- [ ] Requester เข้า dashboard ของ IT Staff ไม่ได้ (403 ที่ backend)
- [ ] ครอบคลุม test: calculation, authorization, UI, drill-down
- [ ] เกณฑ์กลางครบ

---

## Issue 6: Final hardening and regression

**Type:** Quality / Hardening
**Required branch:** `feature/6-lab4-final-hardening`
**Depends on:** Issue 3, Issue 4, Issue 5

### Description
ขัดเกลาและทำให้แอปทั้งหมดของ Lab 1-4 สม่ำเสมอ ปลอดภัย เข้าถึงได้ และพร้อมสาธิต

### Acceptance Criteria
- [ ] Regression ของ Lab 1-3: authentication, role navigation, My Tickets,
      Ticket Detail, Attachments, Public Comments, Internal Notes, Queue,
      Admin user management ทำงานถูกต้อง
- [ ] ข้อความ loading, validation, success, empty/no-results, forbidden,
      conflict, not-found และ API failure สอดคล้องกันทุกหน้า
- [ ] ป้องกันการกดซ้ำและ network retry ในฟอร์มสำคัญ และเก็บข้อมูลที่กรอกไว้
      เมื่อเกิด error ที่กู้คืนได้
- [ ] ลบ UI/ข้อความชั่วคราว ซ้ำซ้อน หรือค้างจากแล็บก่อน ไม่มี placeholder
      หรือปุ่มที่ยังไม่ทำงาน
- [ ] ไม่มี console error และไม่มีลิงก์เสียในเส้นทางหลัก
- [ ] Accessibility: focus ที่มองเห็น, ใช้คีย์บอร์ดได้, label ที่ถูกต้อง,
      มี cue ที่ไม่พึ่งสีอย่างเดียว, modal เข้าถึงได้
- [ ] Performance-smoke test ตามที่ spec กำหนด
- [ ] README อัปเดตให้เป็นปัจจุบัน: setup, Docker, migration, seed, test,
      ขั้นตอนสาธิต และขั้นตอน upgrade จากฐานข้อมูลเดิม
- [ ] `.gitignore` ครอบคลุมไฟล์ชั่วคราวทุกชนิดที่เคยหลุด
- [ ] เกณฑ์กลางครบ

---

## Issue 7: E2E and visual/responsive testing

**Type:** Testing / Quality Assurance
**Required branch:** `feature/7-lab4-e2e-visual-tests`
**Depends on:** Issue 6

### Description
เพิ่มการทดสอบ end-to-end ของ Lab 4 และยืนยัน Zen Green กับ responsive
ในทุกหน้าสำคัญ รวมถึงรัน full regression บน CI

### Acceptance Criteria
- [ ] `e2e/lab-04/actions-taken-flow.spec.ts`: IT Staff สร้างและแก้ Actions
      Taken, Requester เห็นแบบอ่านอย่างเดียว
- [ ] `e2e/lab-04/ticket-resolution.spec.ts`: resolution gate ถูกบล็อกเมื่อ
      Actions Taken ยังไม่เสร็จ และผ่านเมื่อเสร็จ ครอบคลุมกรณียิง API ตรง
- [ ] `e2e/lab-04/dashboards.spec.ts`: Requester และ IT Staff dashboard,
      drill-down, empty state
- [ ] แต่ละ spec ใช้ผู้ใช้ seed ที่แยกกัน ไม่ใช้ผู้ใช้ร่วมกับ spec ของ Lab 2-3
      (บทเรียนเรื่อง test isolation) และรีเซ็ต DB ก่อนรันผ่าน global setup
- [ ] ไม่มี fallback ที่ทำให้ assertion ถูกข้ามเมื่อรันซ้ำ
- [ ] Playwright screenshot ที่ desktop/tablet/mobile ของ Staff Dashboard,
      Requester Dashboard และ Actions Taken ใน `artifacts/lab-04/screenshots/`
- [ ] เปิดดูรูปจริงทุกไฟล์แล้วค่อยติ๊ก visual และ accessibility checklist
      ใน `tests.md` (ห้ามติ๊กโดยไม่ได้ดู)
- [ ] `tests.md` สถานะ Final เป็น Pass เฉพาะรายการที่รันผ่านจริง
- [ ] E2E job ใน CI ครอบคลุม Lab 4 และเขียว
- [ ] Full regression Lab 1-4 ผ่านและเสถียรหลายรอบ
- [ ] เกณฑ์กลางครบ

---

## Branch Flow

```
main
 └── lab4-staging (สร้างหลัง Lab 3 เสร็จสมบูรณ์)
      ├── feature/1-lab4-spec-and-test-plan           -> PR -> lab4-staging
      ├── feature/2-lab4-actions-taken-foundation     -> PR -> lab4-staging
      ├── feature/3-lab4-actions-taken-ui             -> PR -> lab4-staging
      ├── feature/4-lab4-ticket-workflow              -> PR -> lab4-staging
      ├── feature/5-lab4-role-dashboards              -> PR -> lab4-staging
      ├── feature/6-lab4-final-hardening              -> PR -> lab4-staging
      └── feature/7-lab4-e2e-visual-tests             -> PR -> lab4-staging

lab4-staging -> PR -> main (release PR หลังทุก Issue เป็น Done)
```

ห้ามพัฒนาตรงบน `main` หรือ `lab4-staging`

## ลำดับและการทำขนาน

- Issue 1 ต้องเสร็จก่อนทุกอย่าง
- Issue 2 เป็นรากฐาน: Issue 3, 4, 5 ต้องรอ
- Issue 3 กับ 4 แก้ Ticket Detail ไฟล์เดียวกัน ทำตามลำดับ 3 แล้ว 4 จะเสี่ยง
  conflict น้อยกว่าทำพร้อมกัน
- Issue 5 (dashboard) ทำขนานกับ Issue 3-4 ได้
- Issue 6 รอ 3, 4, 5 ส่วน Issue 7 รอ Issue 6
