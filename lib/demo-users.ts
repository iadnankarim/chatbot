// Demo accounts created on first start. Passwords are stored hashed (bcrypt) in the database.
// POC only: replace with real accounts (or an admin screen) before any real deployment.

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "Plpa@2026";

export const DEMO_USERS = [
  { username: "admin", name: "System Admin", department: "IT", role: "admin" },
  { username: "ahmed", name: "Ahmed Khan", department: "Operations", role: "user" },
  { username: "sara", name: "Sara Ali", department: "Finance", role: "user" },
  { username: "usman", name: "Usman Raza", department: "HR", role: "user" },
] as const;
