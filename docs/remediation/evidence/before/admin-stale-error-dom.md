# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: admin.spec.ts >> Admin role dependency error keeps the original role and clears after successful retry
- Location: tests/e2e/admin.spec.ts:156:1

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByRole('alert')
Expected: 0
Received: 1
Timeout:  10000ms

Call log:
  - Expect "toHaveCount" getByRole('alert') with timeout 10000ms
  - waiting for getByRole('alert')
    24 × locator resolved to 1 element
       - unexpected value "1"

```

# Page snapshot

```yaml
- generic [ref=f1e3]:
  - banner [ref=f1e4]:
    - link "▦ ExamSpace" [ref=f1e5] [cursor=pointer]:
      - /url: /
    - navigation [ref=f1e6]:
      - link "Tổng quan" [ref=f1e7] [cursor=pointer]:
        - /url: /admin
      - link "Tài khoản" [ref=f1e8] [cursor=pointer]:
        - /url: /admin/users
      - link "Lớp học" [ref=f1e9] [cursor=pointer]:
        - /url: /admin/classes
      - generic [ref=f1e10]: Quản trị viên
      - button "Đăng xuất" [ref=f1e11] [cursor=pointer]
  - main [ref=f1e12]:
    - heading "Quản lý tài khoản" [level=1] [ref=f1e13]
    - generic [ref=f1e14]:
      - heading "Tạo tài khoản" [level=2] [ref=f1e15]
      - generic [ref=f1e16]:
        - generic [ref=f1e17]:
          - generic [ref=f1e18]: Họ tên
          - textbox "Họ tên" [ref=f1e19]
        - generic [ref=f1e20]:
          - generic [ref=f1e21]: Email
          - textbox "Email" [ref=f1e22]
        - generic [ref=f1e23]:
          - generic [ref=f1e24]: Mật khẩu
          - textbox "Mật khẩu" [ref=f1e25]
        - generic [ref=f1e26]:
          - generic [ref=f1e27]: Role
          - combobox "Role" [ref=f1e28]:
            - option "STUDENT" [selected]
            - option "TEACHER"
            - option "ADMIN"
        - button "Tạo tài khoản" [ref=f1e29] [cursor=pointer]
    - alert [ref=f1e30]: Không thể đổi role khi tài khoản đã có dữ liệu nghiệp vụ.
    - generic [ref=f1e31]:
      - textbox "Tìm user" [active] [ref=f1e32]:
        - /placeholder: Tên, email, mã sinh viên
        - text: admin-retry-1791807856975@test.local
      - combobox "Lọc role" [ref=f1e33]:
        - option "Tất cả role" [selected]
        - option "STUDENT"
        - option "TEACHER"
        - option "ADMIN"
    - table [ref=f1e35]:
      - rowgroup [ref=f1e36]:
        - row [ref=f1e37]:
          - columnheader "Họ tên" [ref=f1e38]
          - columnheader "Email" [ref=f1e39]
          - columnheader "Role" [ref=f1e40]
          - columnheader "Trạng thái" [ref=f1e41]
          - columnheader "Thao tác" [ref=f1e42]
      - rowgroup [ref=f1e43]:
        - row [ref=f1e44]:
          - cell "Admin retry" [ref=f1e45]
          - cell "admin-retry-1791807856975@test.local" [ref=f1e46]
          - cell "TEACHER" [ref=f1e47]:
            - combobox "Role Admin retry" [ref=f1e48]:
              - option "ADMIN"
              - option "TEACHER" [selected]
              - option "STUDENT"
          - cell "ACTIVE" [ref=f1e49]
          - cell [ref=f1e50]:
            - button "Khóa tài khoản" [ref=f1e51] [cursor=pointer]
    - generic [ref=f1e52]:
      - button "Trước" [disabled] [ref=f1e53]
      - generic [ref=f1e54]: Trang 1 · 1 kết quả
      - button "Sau" [disabled] [ref=f1e55]
  - contentinfo [ref=f1e56]: ExamSpace · Online Examination & Live Quiz
```

# Test source

```ts
  99  |         status: 500,
  100 |         contentType: "application/json",
  101 |         body: JSON.stringify({
  102 |           error: {
  103 |             code: "INTERNAL_ERROR",
  104 |             message: "Có lỗi hệ thống. Vui lòng thử lại.",
  105 |           },
  106 |         }),
  107 |       }),
  108 |     { times: 1 },
  109 |   );
  110 |   await locked.getByRole("button", { name: "Mở khóa", exact: true }).click();
  111 |   await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  112 |   await expect(
  113 |     dialog.getByText("Có lỗi hệ thống. Vui lòng thử lại."),
  114 |   ).toBeVisible();
  115 |   await expect(
  116 |     dialog.getByRole("button", { name: "Xác nhận", exact: true }),
  117 |   ).toBeEnabled();
  118 |   await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  119 |   await expect(dialog).not.toBeVisible();
  120 |   await expect(
  121 |     locked.getByRole("cell", { name: "ACTIVE", exact: true }),
  122 |   ).toBeVisible();
  123 |   await locked.getByRole("combobox").selectOption("TEACHER");
  124 |   await expect(locked.getByRole("combobox")).toHaveValue("TEACHER");
  125 |   await page.reload();
  126 |   const teacher = await search(page, email);
  127 |   await expect(teacher.getByRole("combobox")).toHaveValue("TEACHER");
  128 |   await expect(
  129 |     teacher.getByRole("cell", { name: "ACTIVE", exact: true }),
  130 |   ).toBeVisible();
  131 |   await teacher.getByRole("combobox").selectOption("STUDENT");
  132 |   await expect(teacher.getByRole("combobox")).toHaveValue("STUDENT");
  133 |   await page.reload();
  134 |   await expect((await search(page, email)).getByRole("combobox")).toHaveValue(
  135 |     "STUDENT",
  136 |   );
  137 |   await page.screenshot({
  138 |     path: info.outputPath("admin-restored.png"),
  139 |     fullPage: true,
  140 |   });
  141 |   const self = await search(page, "admin@exam.local");
  142 |   await self
  143 |     .getByRole("button", { name: "Khóa tài khoản", exact: true })
  144 |     .click();
  145 |   await dialog.getByRole("button", { name: "Xác nhận", exact: true }).click();
  146 |   await expect(
  147 |     dialog.getByText("Không thể khóa hoặc đổi role của chính mình."),
  148 |   ).toBeVisible();
  149 |   await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  150 |   await self.getByRole("combobox").selectOption("STUDENT");
  151 |   await expect(page.getByRole("alert")).toContainText(
  152 |     "Không thể khóa hoặc đổi role của chính mình.",
  153 |   );
  154 |   await expect(self.getByRole("combobox")).toHaveValue("ADMIN");
  155 | });
  156 | test("Admin role dependency error keeps the original role and clears after successful retry", async ({
  157 |   page,
  158 |   context,
  159 | }) => {
  160 |   await login(page, "admin@exam.local");
  161 |   const email = `admin-retry-${Date.now()}@test.local`;
  162 |   const created = await mutate(context, "/admin/users", {
  163 |     email,
  164 |     password: "DevOnly!2026",
  165 |     fullName: "Admin retry",
  166 |     role: "STUDENT",
  167 |   });
  168 |   expect(created.status()).toBe(201);
  169 |   const id = (await created.json()).data.id;
  170 |   await page.goto("/admin/users");
  171 |   const row = await search(page, email);
  172 |   await page.route(
  173 |     `${base}/admin/users/${id}/role`,
  174 |     (route) =>
  175 |       route.fulfill({
  176 |         status: 409,
  177 |         contentType: "application/json",
  178 |         body: JSON.stringify({
  179 |           error: {
  180 |             code: "ROLE_HAS_DEPENDENCIES",
  181 |             message:
  182 |               "Không thể đổi role khi tài khoản đã có dữ liệu nghiệp vụ.",
  183 |           },
  184 |         }),
  185 |       }),
  186 |     { times: 1 },
  187 |   );
  188 |   await row.getByRole("combobox").selectOption("TEACHER");
  189 |   await expect(page.getByRole("alert")).toContainText(
  190 |     "Không thể đổi role khi tài khoản đã có dữ liệu nghiệp vụ.",
  191 |   );
  192 |   await expect(row.getByRole("combobox")).toHaveValue("STUDENT");
  193 |   const response = page.waitForResponse(
  194 |     (r) => r.url().endsWith(`/admin/users/${id}/role`) && r.status() === 200,
  195 |   );
  196 |   await row.getByRole("combobox").selectOption("TEACHER");
  197 |   await response;
  198 |   await expect(row.getByRole("combobox")).toHaveValue("TEACHER");
> 199 |   await expect(page.getByRole("alert")).toHaveCount(0);
      |                                         ^ Error: expect(locator).toHaveCount(expected) failed
  200 | });
  201 | test("Teacher and Student cannot enter Admin or mutate accounts through direct APIs", async ({
  202 |   browser,
  203 | }) => {
  204 |   for (const email of ["teacher2@exam.local", "student2@exam.local"]) {
  205 |     const context = await browser.newContext();
  206 |     const page = await context.newPage();
  207 |     await login(page, email);
  208 |     await page.goto("/admin/users");
  209 |     await expect(
  210 |       page.getByRole("heading", { name: "Bạn không có quyền truy cập." }),
  211 |     ).toBeVisible();
  212 |     expect((await context.request.get(`${base}/admin/users`)).status()).toBe(
  213 |       403,
  214 |     );
  215 |     const me = (await (await context.request.get(`${base}/auth/me`)).json())
  216 |       .data;
  217 |     for (const [action, value] of [
  218 |       ["role", "ADMIN"],
  219 |       ["status", "LOCKED"],
  220 |       ["status", "ACTIVE"],
  221 |     ] as const) {
  222 |       expect(
  223 |         (
  224 |           await mutate(
  225 |             context,
  226 |             `/admin/users/${me.id}/${action}`,
  227 |             { [action]: value },
  228 |             "PATCH",
  229 |           )
  230 |         ).status(),
  231 |       ).toBe(403);
  232 |     }
  233 |     await context.close();
  234 |   }
  235 | });
  236 | 
```