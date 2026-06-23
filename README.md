# Job Application Tracker

A single-user kanban board for tracking job applications. Each application moves through a fixed
pipeline (Saved → Applied → Interviewing → Offer, then Accepted, Rejected, or Withdrawn), and you can
open any application to see a timeline of every change.

- **Live:** https://job-application-tracker-nine-tan.vercel.app/

## Table of contents

- [Run it locally](#run-it-locally)
- [Who it's for](#who-its-for)
- [Why this problem](#why-this-problem)
- [What's out there, and why I built this](#whats-out-there-and-why-i-built-this)
- [Scope](#scope)
- [Assumptions](#assumptions)
- [Questions I'd ask a real user](#questions-id-ask-a-real-user)
- [How I'd know it works, and what's next](#how-id-know-it-works-and-whats-next)
- [AI usage](#ai-usage)

## Run it locally

You need Node 20+, npm, and a free [Neon](https://neon.tech) Postgres database.

```bash
git clone https://github.com/mch-fauzy/job-application-tracker.git
cd job-application-tracker
npm install

cp .env.example .env
# Set two Neon connection strings:
#   DATABASE_URL          POOLED (host has "-pooler"), used by the app
#   DATABASE_URL_UNPOOLED UNPOOLED, used by migrations and the seed

npm run db:migrate   # apply the schema
npm run db:seed      # optional demo data
npm run dev          # http://localhost:3000
```

| Command | What it does |
|---|---|
| `npm run test` | Unit and component tests (Vitest) |
| `npm run test:coverage` | Tests with a coverage report (80% gate) |
| `npm run test:integration` | Tests against a real Neon database |
| `npm run lint` / `npm run knip` | Lint and import rules / unused code |
| `npm run build` | Production build |

## Who it's for

Someone in an active job search, tracking tens of applications across different companies and stages
over a few weeks. The job it has to do well is to show where every application stands and when each
one got there.

## Why this problem

A job search is a pipeline. Lots of applications, each at a known stage, and you need to see where
they are. A spreadsheet handles this until about 20 or 30 rows, then it gets painful: no board, no
history, every update by hand. The history is the part worth getting right, because a tracker is only
useful if the current status and the record of how it got there never disagree.

## What's out there, and why I built this

Teal and Huntr already do this. Both have moved toward paid AI-resume features, and their free tiers
add account setup and upsell prompts on top of basic tracking (Huntr's free plan caps around 40
jobs). I wanted something small and free that just tracks the pipeline, without the upsell.

## Scope

In the MVP: create, edit, and soft-delete applications; change status by dragging or from a card menu;
an Archived view for finished applications with a Reopen action; a per-application timeline; infinite
scroll per column; and a seed script.

Left out for now, roughly in the order I would add them: auth (the schema already has nullable
`created_by` / `updated_by` / `deleted_by` for it); search, filter, and sort; manual reordering within
a column; list virtualization; normalized companies; a modal detail view; and a lock on finished
applications. Skipping auth was a deliberate choice for a single-user MVP.

## Assumptions

- One user, no login. Anyone with the URL can edit everything. This is the first thing I would add.
- Tens to a few hundred applications. No search or virtualization needed yet.
- Dates can come from the timeline. There is no `appliedAt` column, because the history already
  records when each change happened.
- No strict order. A rejection can come from any stage and people fix mis-clicks, so the backend only
  checks that the target status is valid.

## Questions I'd ask a real user

1. When a card moves on, do you need the previous stage's date saved on its own ("applied May 3"), or
   is the timeline enough? This decides whether I add date columns like `appliedAt`.
2. How many applications do you track at once, and over how long? This tells me whether search and
   virtualization need to move up the list.
3. When you get rejected, do you want the application gone, kept for reference, or brought back if the
   company replies later? This decides whether Archive and Reopen earn their place.

## How I'd know it works, and what's next

It works if the live URL opens to a seeded board and you can create an application, drag it between
columns, mark it finished, reopen it, edit it, and delete it with an undo window. The timeline should
show every change and always match the current status, since both are written together. `npm run test`
should pass, and the repo should run from the steps above.

Next I would add, in order: login and per-user data; search and filter; date columns if users say the
timeline is not enough; a modal detail view; manual reordering within a column; and a restricted
database role for the app.

## AI usage

I built this with Claude Code. I made the architecture and domain calls myself, wrote the rules it had
to follow (in `.claude/rules/`), and reviewed what it produced. It was fastest at scaffolding, writing
tests first, research, and a first draft.

The main guarantee is checked by integration tests. Each change writes its audit row, an unchanged
update writes none, and the database rejects any update, delete, or truncate on the audit log. Run
`npm run test:integration` to see it.

One thing it got wrong: the first audit design labeled the action `status_changed`. That falls apart
when a single edit changes a field and the status at once, because the row would have to be two
actions at the same time. I switched to plain `created` / `updated` / `deleted`, with the details in a
`diff` field, so a status change is an `updated` whose `diff.status` holds the old and new value.
