# VM Reservation Calendar

A small static web app for reserving virtual machines from `08:00` to `20:00`.

## Use

Open `index.html` in a browser, create a username and password, then reserve available one-hour VM slots on the calendar.

## Features

- Account creation and sign-in with username/password
- Passwords are salted and hashed with the browser Web Crypto API before storage when available
- Day calendar from `08:00-09:00` through `19:00-20:00`
- Six default VMs: `VM-01` through `VM-06`
- Reserve one hour, multiple hours, or the whole day from `08:00` to `20:00`
- Prevents double-booking any VM time slot in the selected range
- Prevents one user from reserving more than one VM in the same hour
- Users can cancel their own reservation blocks

## Storage

This version stores users, sessions, and reservations in the browser's `localStorage`. That makes it easy to run without a server, but it is intended for local or prototype use. For shared production use, connect the same UI to a backend database and server-side authentication.
