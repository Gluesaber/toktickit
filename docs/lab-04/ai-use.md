# Lab 4 — AI Use and Reflection

**LLM/agent used:** Claude Opus 5.5

## Selected key prompts (6–10)

| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | You'll be continue working on the previously done Lab3 of Software Engineering subject by using SE+Lab+4.<br>Before we start make sure to read the memory then summarize to me what you get from it and then the same for the lab instruction | เตรียมการ agent ให้พร้อมก่อนเริ่มทำงานเพื่อให้มีการทำงานได้ตรงตาม workflow ที่ต้องการ |
| 2 | Let's first discuss the unclear point. I think adding it so that the admin can claim a ticket so that other admin know and won't do the same task. And yes, each ticket need at least one Action taken before resolving | ทำการเคลียร์ปรับความเข้าใจให้ในส่วนที่ไม่ค่อยเคลียร์ต่างๆ เพื่อให้ทำงานออกมาตามที่ labsheet กำหนดไว้ |
| 3 | Let's design a working pipeline similar to what we did in the past labs<br>As for the two gaps from lab 3 let's discuss which part of the pipeline we could smoothly implement it into because from my understanding it's quite related to what the lab requested | ให้ agent ได้วางแพลนแบ่งงานส่วนต่างๆเป็น issues รวมถึงแทรกการแก้ปัญหาที่ค้างจาก lab ก่อนๆให้สอดคล้องกับหัวข้อ issues |
| 4 | the PR is merged check the response I got from my collaborator to discuss and keep as option | ทำให้มั่นใจว่า agent ได้อ่าน feedback แล้วจริงๆ เพื่อที่จะเก็บไว้เป็นตัวช่วยตัดสินใจในการทำ issues ต่อๆไป |
| 5 | Currently there're multiple test account and ticket create during the testing of each lab occupying my container. Is there anyway to clear it and maybe reseed it without changing the code? or what do you recommend? | เพื่อจัดการ test sample จากการทดสอบและทำให้มั่นใจว่าจะไม่ส่งผลกับตัว project |
| 6 | Start working on the last part of lab 4 by finishing up the documents and then try running the project with fresh temporary copy and follow the edited README to check if it work.<br>Leave ai-use and reviewer for me to do. | ให้ agent ทดสอบจาก fresh copy เพื่อที่จะได้ทราบว่า project นี้สามารถทำงานได้จริงแม้จะอยู่ใน version ที่ไม่มีข้อมูลเก่า |

## Reflection

ใน lab 4 นี้ผมมองว่าสโคปงานจะมีความซับซ้อนขึ้นกว่าแลปก่อนหน้า ผมเลยได้เปลี่ยนจาก model Sonnet 5 มาเป็น Opus 5.5 เพื่อทำให้งานดำเนินการได้ดีและลื่นไหลขึ้น รวมถึงได้นำความรู้จากการลองผิดลองถูกเกี่ยวกับการใช้ agent มาร่วมทำงานทำให้สามารถเจอจุดที่มีความไม่เคลียร์ในขั้นตอนวางแผนและสามารถปรับได้ก่อนที่จะมีการลงมือทำจริง  รวมถึงยังได้มีการทำการทดสอบผ่าน  fresh copy เพื่อทำให้แลปนี้มีการทำงานได้จริงๆ