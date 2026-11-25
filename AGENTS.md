# Wishlist project guidelines

## Product scope

- Build one personal wishlist managed by one administrator.
- Visitors enter the single active sharing code on the home page to view the wishlist.
- Visitor access is read-only. Do not add multiple wishlists, visitor accounts, reservations, or payments unless requested.
- Keep the sharing code out of URLs.
- Treat `prompt.md` as the product brief. If implementation details conflict with it, preserve the brief or ask before changing product behavior.

## Design and experience

- Use the warm, contemporary botanical direction in `prompt.md`; avoid generic dashboard styling and clichéd eco visuals.
- Keep the public wishlist responsive: visual card grid on desktop and a single column on mobile.
- Make all user-facing copy French, natural, and concise.
- Respect accessibility, keyboard use, and `prefers-reduced-motion`. Motion must remain subtle and must not gate content or actions.

## Implementation

- Inspect the existing stack, project structure, and package scripts before making implementation choices. Reuse existing patterns and dependencies.
- Adapt commands and file paths from upstream skill examples to the current operating system and shell.
- Keep public read access separate from protected administrator access. Never rely on client-side route hiding as the only authorization check.
- Do not present mock data as persisted data. Connect features to the existing storage, or clearly report missing infrastructure.
- Implement loading, empty, success, and error states for user-facing flows.
- Make focused changes, preserve unrelated work, and update directly related documentation.
- Run the smallest relevant checks available in the repository; report commands and results accurately.

## Skills

Load the relevant project skill when working on:

- Public or admin interface design: `.agents/skills/wishlist-frontend-design/SKILL.md`
- Sharing-code access, admin authorization, or related security: `.agents/skills/wishlist-access-control/SKILL.md`
- UI review for accessibility, forms, animation, and web UX: `.agents/skills/web-design-guidelines/SKILL.md`
- React/Next.js performance work, only if that stack is selected: `.agents/skills/vercel-react-best-practices/SKILL.md`
- Browser-based web app testing with Playwright: `.agents/skills/webapp-testing/SKILL.md`

The upstream skills are vendored under `.agents/skills/`; retain their source attribution and license files. The Playwright helper launches server commands through a shell, so only use it with trusted, fixed project commands—never pass untrusted input as a server command.
