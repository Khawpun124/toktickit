# Lab 1 — Test Plan and Evidence

All test files live under `server/tests/lab-01/` and `client/tests/lab-01/`.

| # | Tool | Test | Result |
|---|------|------|--------|
| 1 | Supertest | `GET /api/health` returns 200, status=ok | PASSED |
| 2 | Supertest | `GET /api/categories` returns 4 seeded categories in id order | PASSED |
| 3 | Vitest | Heading renders | PASSED |
| 4 | Vitest | Success state shows Online + category list | PASSED |
| 5 | Vitest | Error state shows Offline + message | PASSED |

## Terminal Test Execution Outputs

### Backend Tests (`server/`)
```text
> toktickit-server@1.0.0 test
> vitest run

 RUN  v2.1.9 D:/ปี3/Term1/CPE334/toktickit/server

 ✓ tests/lab-01/health.test.ts (1 test) 22ms
 ✓ tests/lab-01/categories.test.ts (1 test) 142ms

 Test Files  2 passed (2)
      Tests  2 passed (2)
   Start at  00:56:30
   Duration  6.83s
```

### Frontend Tests (`client/`)
```text
> toktickit-client@1.0.0 test
> vitest run

 RUN  v2.1.9 D:/ปี3/Term1/CPE334/toktickit/client

 ✓ tests/lab-01/App.test.tsx (4 tests) 184ms

 Test Files  1 passed (1)
      Tests  4 passed (4)
   Start at  00:56:44
   Duration  17.87s
```
