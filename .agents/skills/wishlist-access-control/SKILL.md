---
name: wishlist-access-control
description: "Implement or review sharing-code access and administrator protection for the wishlist. Use for code validation, private admin routes, CRUD authorization, code rotation, or access-control security."
---

# Wishlist Access Control

Use this skill whenever changing how visitors access the wishlist or how the administrator manages it.

## Procedure

1. Read `prompt.md`, `AGENTS.md`, and inspect the existing authentication, API, persistence, and routing patterns.
2. Trace the full request path for public code validation and every admin read or write operation. Identify which checks run on the server.
3. Keep the sharing code limited to read-only access to the single wishlist. Never put it in a URL, client bundle, or diagnostic log.
4. Validate the code server-side. Return a generic invalid-code response that does not disclose other codes or internal records. Apply rate limiting using the project's existing infrastructure or document the missing protection.
5. Protect every admin data operation server-side using the existing authentication mechanism. A hidden link or client-side route guard is not authorization. If no suitable authentication exists, explain the gap and ask before leaving administrative operations accessible.
6. Generate sharing codes with a cryptographically secure source and sufficient unpredictability. If code renewal exists, ensure the previous code stops working when the new one becomes active.
7. Validate and constrain admin-supplied values, especially external URLs. Preserve the project's established validation and error-reporting conventions.
8. Test both permitted and denied behavior: valid and invalid sharing code, read-only visitor access, unauthenticated admin access, authorized CRUD, and old-code invalidation after rotation when applicable.
9. Run relevant tests and report any security assumptions, infrastructure gaps, and checks not performed.

## Constraints

- Never treat possession of the sharing code as administrator authentication.
- Never rely on frontend-only checks to protect data or mutations.
- Do not silently substitute mock data or weaken authorization when infrastructure is missing.
- Avoid responses that reveal whether another sharing code or private wishlist exists.
