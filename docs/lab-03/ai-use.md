# Lab 3 — AI Use and Reflection

**LLM/agent used:** Claude Sonnet 5

## Selected key prompts (6–10)
| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | Check if feature 3-4 is fully committed to repo and check branch location for feature 3-5. then let's discuss and start working on feature 3-5 | ให้ Agent ตรวจเช็คว่า 3-4 merge แล้วและ branch ของ 3-5 พร้อมหรือยัง ก่อนที่จะคุยขอบเขตของ 3-5 และตัดสินใจร่วมกัน 3 เรื่อง (Requester Cancel ทำใน branch นี้เลย, route เป็น /queue/:id, ทำ backend ก่อน frontend) แล้วค่อยให้ Agent เริ่มเขียนโค้ด |
| 2 | Any reason why we update specification? from my understanding shouldnt we be following it? | สงสัยว่าทำไม Agent ถึงแก้สเปกเอง เพราะเข้าใจว่าต้องทำตามสเปก จึงให้ Agent อธิบายเหตุผล และพบว่าเป็นช่องว่างของสเปก (ui-spec ต้องการรายชื่อ staff แต่ไม่มี API) จึงตัดสินใจเก็บไว้และให้ระบุใน PR เพื่อให้ Reviewer ตรวจสอบ |
| 4 | Check the branch and start working on User Management | ให้ Agent ตรวจเช็ค branch ก่อนเริ่ม 3-6 ระหว่างเขียนเทสต์พบว่า LAST_ADMINISTRATOR_PROTECTED ไม่มีทางถูกเรียกใช้ได้จริง จึงแก้เทสต์ให้ตรงกับพฤติกรรมจริงและบันทึกไว้ใน tests.md |
| 5 | Check the PR request change and discuss with me how we would fix it | ให้ Agent ดู review ของ Reviewer ซึ่งขอให้แก้ Playwright ที่เกิด race condition จาก search debounce จึงให้แก้เป็น locator ที่ระบุแถวของ user โดยตรงและรันซ้ำจนผ่านทุกรอบ |
| 6 | Check why the account jamie.whitfield@example.edu password cant be change after entering default password. and why does everytime we include new feature I need to enter default and change password of the logined account | สังเกตว่าต้องตั้งรหัสผ่านของ jamie ใหม่ทุกครั้งที่เพิ่ม feature จึงให้ Agent ตรวจสอบ และพบว่า E2E helper ที่ Agent เขียนเองเขียนทับรหัสผ่านของบัญชีนี้ทุกครั้งที่รันเทสต์ จึงตัดสินใจแยกบัญชีสำหรับ bootstrap ออกมาเป็นของตัวเอง |
| 7 | update readme and ui-spec and test. as for screenshot discuss with me first whether the lab sheet require it or not? | ให้ Agent อัปเดตเอกสารก่อน ส่วนเรื่อง screenshot ให้คุยกันก่อนว่า labsheet กำหนดไหม แทนที่จะให้ Agent เดาเอง ระหว่างอัปเดตพบว่า checklist ใน ui-spec 2 ข้อยังไม่มีเทสต์รองรับครบ จึงให้เพิ่มเทสต์ก่อนติ๊ก |

## Reflection
หลังจากที่ได้ใช้ agent มาเป็นส่วนช่วยในการทำงานเป็นแลปที่ 3 แล้ว ผมก็ได้มีความคล่องในการใช้งานรวมถึงทราบจุดที่ควรตรวจสอบการทำงานของมันมากขึ้น แต่ถ้าจะมีซักเรื่องที่ผมรู้สึกว่าอยากปรับและแก้ไขก็น่าจะเป็นเรื่องของการไปเรียนรู้และปรับใช้ส่วนของการ optimization และสร้าง skill ของ agent มากขึ้น เพราะมีหลายๆครั้งที่ผมทำการพิมพ์ prompt ใกล้เคียงกับเดิมเพื่อให้ agent ตรวจสอบ pipeline การทำงาน ซึ่งในส่วนนี้คิดว่าถ้าจั้งให้ทำงานเองหลังทำเสร็จ 1 feature ก็คงจะทำให้ขั้นตอนการทำงานเร็วขึ้นและใช้ tokens ได้มีประสิทธิภาพมากขึ้น