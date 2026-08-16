# Lab 1 — Peer Review Record

**Author:** กฤตเมธ นิยมธรรม (Krittamate Niyoumthum) — 67070501053 — GitHub: @Khawpun124  
**Peer reviewer:** วรพล แซ่คู (Worapol Saeku) — 67070501085 — GitHub: @Worapol360  

## 1. Pull Requests I Authored (Reviewed by Partner @Worapol360)

| Issue | Feature Branch | PR Link | Reviewer Verdict |
|-------|----------------|---------|------------------|
| Issue 1: Project Foundation | `feature/1-project-foundation` | [#1](https://github.com/Khawpun124/toktickit/pull/1) | Approved |
| Issue 2: API Health Check | `feature/2-health-check` | [#2](https://github.com/Khawpun124/toktickit/pull/2) | Approved |
| Issue 3: Create & Seed Categories | `feature/3-category-seed` | [#3](https://github.com/Khawpun124/toktickit/pull/3) | Approved |
| Issue 4: Display Category List | `feature/4-category-list` | [#4](https://github.com/Khawpun124/toktickit/pull/4) | Approved |

### Detailed Peer Reviews Received from Partner (@Worapol360):

- **Issue 1 (PR #1):**
  - **Reviewer Comment (@Worapol360):** "ตอนนี้ใน PR มันมีแค่ 4 ไฟล์ โครงสร้างยังไม่ตรง ขาด: client/src/ , docs/lab1(ai_use.md,reviewer.md) , server/prisma/ , server/src/ , server/tests/lab-01 , gitignore  อาจจะลืม get add . ก่อน push"

- **Issue 2 (PR #2):**
  - **Reviewer Comment (@Worapol360):** "ช่วยปรับข้อความ error ตอน Backend ล่ม ใน app.tsx ให้ชัดเจนกว่านี้ได้มั้ย ตาม criteria:A useful error message appears when the backend is unavailable. ในใบแล็บ"

- **Issue 3 (PR #3):**
  - **Reviewer Comment (@Worapol360):** "แก้ไฟล์ docker-compose.yml: มีการใส่ hardcode password ตรงๆ 
  POSTGRES_PASSWORD: toktickit_dev_password ช่วยแก้ให้ดึงค่าจากตัวแปรใน .env แทน"

- **Issue 4 (PR #4):**
  - **Reviewer Comment (@Worapol360):** "ตอนนี้เปิด PR เข้า main ทำให้มีไฟล์ส่วนเกินติดมา ให้เปลี่ยน base branch เป็น lab1-staging , 
เอาไฟล์ส่วนเกินออก ใน PR ดันแค่ไฟล์ source หรือ test ที่เกี่ยวกับ Issue 4 พอ"

---

## 2. Pull Requests I Reviewed for My Partner (@Worapol360)

| Issue | Partner Branch | PR Link | Reviewer Verdict |
|-------|----------------|---------|------------------|
| Issue 1: Project Foundation | `feature/1-project-foundation` | (https://github.com/Worapol360/toktickit/pull/5) | Approved |
| Issue 2: API Health Check | `feature/2-health-check` | (https://github.com/Worapol360/toktickit/pull/6) | Approved |
| Issue 3: Create & Seed Categories | `feature/3-category-seed` | (https://github.com/Worapol360/toktickit/pull/7) | Approved |
| Issue 4: Display Category List | `feature/4-category-list` | (https://github.com/Worapol360/toktickit/pull/8) | Approved |

### Detailed Peer Reviews I Reviewed for My Partner (@Worapol360):

- **Issue 1 (PR #1):**
  - **Reviewer Comment (@Khawpun124):** "ผ่านเกณฑ์ของ Issue 1 ทั้งหมด แต่มีที่อยากให้ดู 2 จุด: prisma.config.ts ตือไฟล์ extra ที่อาจไม่ต้องใช้ใน Issue 1 , ไฟล์ใน docs/lab-01/ ยังขาดใน Issue 1"

- **Issue 2 (PR #2):**
  - **Reviewer Comment (@Khawpun124):** "ครบถ้วนตามเกณฑ์ Issue 2 ทั้งหมด"

- **Issue 3 (PR #3):**
  - **Reviewer Comment (@Khawpun124):** "ครบถ้วนตามเกณฑ์ของ Issue 3 ทั้งหมด"

- **Issue 4 (PR #4):**
  - **Reviewer Comment (@Khawpun124):** "ครบถ้วนตามเกณฑ์ของ Issue4"
