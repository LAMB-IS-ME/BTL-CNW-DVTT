# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: core.spec.ts >> Exam: login, start, autosave, refresh, realtime monitor, submit, essay grading, released result
- Location: tests/e2e/core.spec.ts:51:1

# Error details

```
Error: locator.fill: Error: strict mode violation: getByLabel('Nhận xét') resolved to 2 elements:
    1) <dialog class="grading-leave" aria-labelledby="grading-leave-title" aria-describedby="grading-leave-description">…</dialog> aka getByLabel('Điểm và nhận xét chưa lưu')
    2) <textarea rows="5" name="feedback" maxlength="10000"></textarea> aka getByRole('textbox', { name: 'Nhận xét' })

Call log:
  - waiting for getByLabel('Nhận xét')

```

# Page snapshot

```yaml
- generic [ref=f2e3]:
  - banner [ref=f2e4]:
    - link "▦ ExamSpace" [ref=f2e5] [cursor=pointer]:
      - /url: /
    - navigation [ref=f2e6]:
      - link "Tổng quan" [ref=f2e7] [cursor=pointer]:
        - /url: /teacher
      - link "Lớp học" [ref=f2e8] [cursor=pointer]:
        - /url: /teacher/classes
      - link "Câu hỏi" [ref=f2e9] [cursor=pointer]:
        - /url: /teacher/question-banks
      - link "Bài thi" [ref=f2e10] [cursor=pointer]:
        - /url: /teacher/exams
      - link "Live Quiz" [ref=f2e11] [cursor=pointer]:
        - /url: /teacher/quizzes
      - generic [ref=f2e12]: Nguyễn Minh Đức
      - button "Đăng xuất" [ref=f2e13] [cursor=pointer]
  - main [ref=f2e14]:
    - generic [ref=f2e15]:
      - navigation "Đường dẫn chấm bài" [ref=f2e16]:
        - link "Bài thi" [ref=f2e17] [cursor=pointer]:
          - /url: /teacher/exams
        - generic [aria-hidden] [ref=f2e18]: /
        - generic [ref=f2e19]: Chấm tự luận
      - generic [ref=f2e20]:
        - generic [ref=f2e21]:
          - paragraph [ref=f2e22]: Chấm tự luận
          - heading "E2E Exam 1791807398908" [level=1] [ref=f2e23]
        - link "Kết quả & công bố →" [ref=f2e24] [cursor=pointer]:
          - /url: /teacher/exams/078aa3f0-3ebf-4ef0-8c78-38b7b4686b14/results
      - status [ref=f2e25]: 1 câu có thay đổi chưa lưu. Bản nháp được giữ khi chuyển trang danh sách; hãy lưu từng câu trước khi rời chấm bài.
      - navigation "Phân trang" [ref=f2e26]:
        - button "Trang trước" [disabled] [ref=f2e27]
        - status [ref=f2e28]: Trang 1
        - button "Trang sau" [disabled] [ref=f2e29]
      - generic [ref=f2e30]:
        - heading "Bài đã nộp" [level=2] [ref=f2e31]
        - generic [ref=f2e32]: Mở bài để đọc và chấm từng câu tự luận
      - group [ref=f2e33]:
        - generic "Nguyễn Hoàng Anh SV001 · Lượt 1 Chờ chấm tự luận −" [ref=f2e34] [cursor=pointer]:
          - generic [aria-hidden] [ref=f2e35]: "01"
          - generic [ref=f2e36]:
            - strong [ref=f2e37]: Nguyễn Hoàng Anh
            - generic [ref=f2e38]: SV001 · Lượt 1
          - generic [ref=f2e39]: Chờ chấm tự luận
          - text: −
        - generic [ref=f2e40]:
          - paragraph [ref=f2e41]: Nộp lúc 19:16:43 12/10/2026
          - generic [ref=f2e42]:
            - generic [ref=f2e43]:
              - heading "Câu 2 Tự luận · 3 điểm" [level=3] [ref=f2e44]:
                - text: Câu 2
                - generic [ref=f2e45]: Tự luận · 3 điểm
              - paragraph [ref=f2e48]: Giải thích vai trò của Session.
              - heading "Bài làm của sinh viên" [level=4] [ref=f2e49]
              - paragraph [ref=f2e50]: Session lưu định danh trên server; cookie HttpOnly chỉ mang session ID.
            - generic [ref=f2e51]:
              - group "Điểm & nhận xét" [ref=f2e52]:
                - generic [ref=f2e54]:
                  - generic [ref=f2e55]: Điểm (0–3)
                  - spinbutton "Điểm (0–3)" [active] [ref=f2e56]: "2.5"
                - paragraph [ref=f2e57]: Tối đa 3 điểm · Bước nhập 0,01
                - generic [ref=f2e58]:
                  - generic [ref=f2e59]: Nhận xét
                  - textbox "Nhận xét" [ref=f2e60]
                - button "Lưu điểm" [ref=f2e61] [cursor=pointer]
              - status [ref=f2e62]: Có thay đổi chưa lưu
  - contentinfo [ref=f2e63]: ExamSpace · Online Examination & Live Quiz
```

# Test source

```ts
  24  |   expect(response.ok(), await response.text()).toBeTruthy();
  25  |   return (await response.json()).data;
  26  | }
  27  | async function question(ctx: BrowserContext, type = "SINGLE_CHOICE") {
  28  |   const b = await mutation<{ id: string }>(ctx, "/teacher/question-banks", {
  29  |     title: `E2E ${Date.now()}`,
  30  |   });
  31  |   return mutation<{ id: string }>(
  32  |     ctx,
  33  |     `/teacher/question-banks/${b.id}/questions`,
  34  |     {
  35  |       type,
  36  |       promptMarkdown:
  37  |         type === "ESSAY"
  38  |           ? "Giải thích vai trò của Session."
  39  |           : "Giá trị $2^3$ là bao nhiêu?",
  40  |       defaultPoints: type === "ESSAY" ? 3 : 2,
  41  |       options:
  42  |         type === "ESSAY"
  43  |           ? []
  44  |           : [
  45  |               { contentMarkdown: "8", isCorrect: true },
  46  |               { contentMarkdown: "6", isCorrect: false },
  47  |             ],
  48  |     },
  49  |   );
  50  | }
  51  | test("Exam: login, start, autosave, refresh, realtime monitor, submit, essay grading, released result", async ({
  52  |   browser,
  53  | }) => {
  54  |   const teacher = await browser.newContext(),
  55  |     student = await browser.newContext();
  56  |   const tp = await teacher.newPage(),
  57  |     sp = await student.newPage();
  58  |   await login(tp, "teacher1@exam.local");
  59  |   const list = await teacher.request.get(
  60  |     `${base}/teacher/students?search=student1@exam.local`,
  61  |   );
  62  |   const students = (await list.json()).data;
  63  |   const c = await mutation<{ id: string }>(teacher, "/teacher/classes", {
  64  |     name: `E2E class ${Date.now()}`,
  65  |   });
  66  |   await mutation(teacher, `/teacher/classes/${c.id}/students`, {
  67  |     studentId: students[0].id,
  68  |   });
  69  |   const q = await question(teacher),
  70  |     essay = await question(teacher, "ESSAY");
  71  |   const exam = await mutation<{ id: string }>(teacher, "/teacher/exams", {
  72  |     title: `E2E Exam ${Date.now()}`,
  73  |     openAt: new Date(Date.now() - 60000).toISOString(),
  74  |     closeAt: new Date(Date.now() + 3600000).toISOString(),
  75  |     durationMinutes: 30,
  76  |     resultReleaseMode: "IMMEDIATE",
  77  |     showCorrectAnswers: true,
  78  |     showExplanations: true,
  79  |   });
  80  |   await mutation(
  81  |     teacher,
  82  |     `/teacher/exams/${exam.id}/classes`,
  83  |     { classIds: [c.id] },
  84  |     "PUT",
  85  |   );
  86  |   await mutation(
  87  |     teacher,
  88  |     `/teacher/exams/${exam.id}/questions`,
  89  |     {
  90  |       questions: [
  91  |         { questionId: q.id, points: 2 },
  92  |         { questionId: essay.id, points: 3 },
  93  |       ],
  94  |     },
  95  |     "PUT",
  96  |   );
  97  |   await mutation(teacher, `/teacher/exams/${exam.id}/publish`, {});
  98  |   await tp.goto(`/teacher/exams/${exam.id}/monitor`);
  99  |   await login(sp, "student1@exam.local");
  100 |   await sp.goto(`/student/exams/${exam.id}`);
  101 |   await sp.getByRole("button", { name: "Bắt đầu làm bài" }).click();
  102 |   await expect(sp.getByLabel("Thời gian còn lại")).toBeVisible();
  103 |   await sp.getByRole("radio", { name: "8", exact: true }).check();
  104 |   await expect(sp.getByRole("status")).toContainText("Đã lưu");
  105 |   await sp.reload();
  106 |   await expect(sp.getByRole("radio", { name: "8", exact: true })).toBeChecked();
  107 |   await expect(tp.getByText("Đang thi", { exact: true })).toBeVisible();
  108 |   await sp.getByRole("button", { name: "Câu tiếp", exact: true }).click();
  109 |   await sp
  110 |     .getByLabel("Bài làm tự luận")
  111 |     .fill(
  112 |       "Session lưu định danh trên server; cookie HttpOnly chỉ mang session ID.",
  113 |     );
  114 |   await expect(sp.getByRole("status")).toContainText("Đã lưu");
  115 |   await sp.getByRole("button", { name: "Nộp bài", exact: true }).click();
  116 |   await sp
  117 |     .getByRole("dialog")
  118 |     .getByRole("button", { name: "Xác nhận", exact: true })
  119 |     .click();
  120 |   await expect(sp.getByText("Đã nộp · Đang chờ chấm tự luận")).toBeVisible();
  121 |   await expect(tp.getByText("Đã nộp", { exact: true })).toBeVisible();
  122 |   await tp.goto(`/teacher/exams/${exam.id}/grading`);
  123 |   await tp.getByLabel("Điểm (0–3)").fill("2.5");
> 124 |   await tp.getByLabel("Nhận xét").fill("Lập luận tốt, cần thêm ví dụ.");
      |                                   ^ Error: locator.fill: Error: strict mode violation: getByLabel('Nhận xét') resolved to 2 elements:
  125 |   await tp.getByRole("button", { name: "Lưu điểm", exact: true }).click();
  126 |   await expect(tp.getByText("Đã lưu điểm", { exact: true })).toBeVisible();
  127 |   await sp.reload();
  128 |   await expect(sp.getByText("4.5/5 · 90.0%")).toBeVisible();
  129 |   await sp.screenshot({
  130 |     path:
  131 |       "docs/screenshots/" +
  132 |       (test.info().title.startsWith("Exam") ? "student-result" : "quiz-final") +
  133 |       ".png",
  134 |     fullPage: true,
  135 |     animations: "disabled",
  136 |   });
  137 |   await teacher.close();
  138 |   await student.close();
  139 | });
  140 | test("Live Quiz: authenticated join, realtime lobby, start, answer, reveal and final leaderboard", async ({
  141 |   browser,
  142 | }) => {
  143 |   const teacher = await browser.newContext(),
  144 |     student = await browser.newContext();
  145 |   const tp = await teacher.newPage(),
  146 |     sp = await student.newPage();
  147 |   await login(tp, "teacher1@exam.local");
  148 |   const q = await question(teacher);
  149 |   const quiz = await mutation<{ id: string }>(teacher, "/teacher/quizzes", {
  150 |     title: `E2E Quiz ${Date.now()}`,
  151 |   });
  152 |   await mutation(
  153 |     teacher,
  154 |     `/teacher/quizzes/${quiz.id}/questions`,
  155 |     {
  156 |       questions: [{ questionId: q.id, timeLimitSeconds: 30, basePoints: 1000 }],
  157 |     },
  158 |     "PUT",
  159 |   );
  160 |   const room = await mutation<{ id: string; code: string }>(
  161 |     teacher,
  162 |     `/teacher/quizzes/${quiz.id}/rooms`,
  163 |     {},
  164 |   );
  165 |   await tp.goto(`/teacher/quiz-rooms/${room.id}/host`);
  166 |   await login(sp, "student1@exam.local");
  167 |   await sp.goto("/student/quiz/join");
  168 |   await sp.getByLabel("Mã phòng").fill(room.code);
  169 |   await sp.getByRole("button", { name: "Vào phòng" }).click();
  170 |   await expect(
  171 |     tp.getByRole("heading", { name: "1 người tham gia" }),
  172 |   ).toBeVisible();
  173 |   await tp.getByRole("button", { name: "Bắt đầu Quiz" }).click();
  174 |   await expect(sp.getByRole("radio", { name: "8", exact: true })).toBeVisible();
  175 |   await sp.getByRole("radio", { name: "8", exact: true }).check();
  176 |   await sp.getByRole("button", { name: "Gửi câu trả lời" }).click();
  177 |   await expect(
  178 |     sp.getByRole("heading", { name: "Kết quả cuối cùng" }),
  179 |   ).toBeVisible();
  180 |   await expect(
  181 |     tp.getByRole("heading", { name: "Kết quả cuối cùng" }),
  182 |   ).toBeVisible();
  183 |   await sp.reload();
  184 |   await expect(
  185 |     sp.getByRole("heading", { name: "Kết quả cuối cùng" }),
  186 |   ).toBeVisible();
  187 |   await sp.screenshot({
  188 |     path:
  189 |       "docs/screenshots/" +
  190 |       (test.info().title.startsWith("Exam") ? "student-result" : "quiz-final") +
  191 |       ".png",
  192 |     fullPage: true,
  193 |     animations: "disabled",
  194 |   });
  195 |   await teacher.close();
  196 |   await student.close();
  197 | });
  198 | test("mobile login and server-backed role guard", async ({ page }) => {
  199 |   await page.setViewportSize({ width: 390, height: 844 });
  200 |   await login(page, "student2@exam.local");
  201 |   await page.goto("/teacher/classes");
  202 |   await expect(
  203 |     page.getByRole("heading", { name: "Bạn không có quyền truy cập." }),
  204 |   ).toBeVisible();
  205 |   expect(
  206 |     await page.evaluate(
  207 |       () => document.documentElement.scrollWidth <= window.innerWidth,
  208 |     ),
  209 |   ).toBe(true);
  210 | });
  211 | 
```