# VM Reservation Calendar

A small static web app for reserving virtual machines from `08:00` to `20:00`.

## Use

Open `index.html` in a browser, create an account with email and password, then reserve available VM slots on the calendar.

## Features

- Account creation and sign-in with Supabase Auth
- Shared Supabase database so all users see the same reservations
- Weekly calendar from `08:00-09:00` through `19:00-20:00`
- One shared VM, shown by weekday columns instead of VM columns
- Reserve one hour, multiple hours, or the whole day from `08:00` to `20:00`
- Prevents double-booking any time slot in the selected range
- Prevents one user from reserving more than once in the same hour
- Users can cancel their own reservation blocks

## Storage

This version uses Supabase Auth and a shared `reservations` table.

## Supabase setup

1. Create a Supabase project.
2. In the Supabase SQL Editor, run `supabase-schema.sql`.
3. Copy your project URL and publishable/anon key into `supabase-config.js`.
4. In Supabase Auth settings, enable email/password login. For simple internal use, you can turn off email confirmation.

If you already created the older multi-VM table, run `supabase-single-vm-migration.sql` once in the Supabase SQL Editor. If the old table has multiple reservations at the same date/hour across different VMs, remove the duplicates before adding the new single-VM unique rule.
