# Lab 1 — AI Use and Reflection

**LLM/agent used:** Antigravity AI Coding Agent (Gemini 3.6 Flash / Gemini 3.5 Flash)

I used the Antigravity coding agent through my Google Cloud Platform account. I mainly used Gemini 3.6 Flash as the LLM with a thinking level of High.

## Selected key prompts (6–10)

| # | Prompt (summarised) | What I did with the result |
|---|---------------------|----------------------------|
| 1 | Plan Lab 1 Implementation | Read the enclosed TokTickIT Lab 1 requirements. Summarize four GitHub Issues and implementation order. |
| 2 | Set Up Full Stack Project | Setup TokTickIT project stack using React, TypeScript, Vite, Bootstrap, Express, and Prisma. |
| 3 | Implement Health Check Endpoint | Add GET /api/health returning HTTP 200 with status ok and service TokTickIT API. Verified with Supertest. |
| 4 | Implement Category Prisma Model & Seed | Create Category model in schema.prisma and write idempotent seed script with 4 categories using upsert. |
| 5 | Implement Category List API & UI Integration | Implement GET /api/categories returning categories in ID order and integrate frontend status render. |
| 6 | Review Code & Automated Tests | Verified Vitest and Supertest test suites pass 100% across server and client. |

## Reflection

Providing clear acceptance criteria and specifying exact tech stack constraints made the agent's prompts much more effective. When setting up Git flow, I had to guide the agent to ensure Pull Requests target `lab1-staging` while keeping `main` as the default branch.
