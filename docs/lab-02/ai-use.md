# Lab 2 — AI Use and Reflection

**LLM/agent used:** Claude Sonnet 5

## Selected key prompts (6–10)
| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | Read the "Lab_02_labsheet" file I sent. This continue from prior Lab1. Discuss with me the content of the file and plan out what's need for each part.<br>Make sure to also read memory files I set up and  tell me what you got from reading it | หลังจากให้ Agent อ่าน Labsheet2 และไฟล์ Memory ที่ได้ดึงจากแชทของแลปที่ 1 ก็ทำการวางแผนต่อว่าจะมีขั้นตอนการทำงานยังไงและได้ระบุขอบเขตการทำงานของ Agent ให้ชัดเจน จนได้ออกมาเป็นการทำงานรวม 9 Issues |
| 2 | Check the specification.md by yourself once | ให้ Agent ตรวจสอบไฟล์ specification.md ซ้ำเพื่อลดส่วนที่ผิดพลาดก่อนจะตรวจสอบด้วยตัวเอง
| 3 | About feature 2-3 I want you to dicuss about old lab1 website scaffolding | ได้มีการตัดสินใจลบหน้า Health check ออกและเปลี่ยนเป็นหน้า Requester Login |
| 4 | Discuss with me about the PR feedback [PR link] | มีการวางแผนในการจัดการกับปัญหาที่ทราบจาก PR request change ก่อนที่จะการปล่อยให้ Agent แก้ไขเอง |
| 5 | Shouldn't E2E be use in the next issue not this one? | ได้มีการตรวจเช็คการทำงานและพบว่าโมเดลพยายามจะ Implement E2E ใน Issue7 แทนที่จะเป็น Issue8 |
| 6 | should these screenshot be in the Repo to begin with? shouldnt they just put in pdf file and done?| ได้ตัดสินใจในการเปลี่ยนโครงสร้างการเก็บไฟล์รูปภาพอัดหน้าจอตามรูปแบบที่ Labsheet2 กำหนด |

## Reflection
สิ่งผู้ผมได้เรียนรู้จากการทำ Lab2 นี้เป็นเรื่องเกี่ยวกับการตรวจสอบการทำงานและการสร้างไฟล์ Memory ของ Agent ให้ตรงไปตาม Requirement เนื่องจากแลปนี้เป็นงานที่มีขอบเขตกว้างกว่า Lab1 ทำให้มีบางทีที่ Agent ทำงานได้ไม่ถูกต้องและเหมาะสมกับการเปิด Conversation ใหม่ด้วย Memory จากอันที่แล้วเพื่อทำให้ Agent ทำงานได้มีประสิทธิภาพดียิ่งขึ้น