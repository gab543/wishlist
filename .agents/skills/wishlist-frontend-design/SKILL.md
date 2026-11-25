---
name: wishlist-frontend-design
description: "Design, implement, or refine the wishlist site's public and admin interfaces. Use for visual design, responsive layouts, UI components, animations, accessibility, and front-end polish."
---

# Wishlist Frontend Design

Use this skill when creating or changing the wishlist's visual interface.

## Procedure

1. Read `prompt.md`, this project's `AGENTS.md`, and the existing app structure before choosing an implementation.
2. Inspect existing design tokens, components, fonts, and dependencies. Extend established patterns instead of introducing a competing design system.
3. Keep the visual language warm and botanical-contemporary: cream surfaces, deep green or ink text, sage and terracotta accents, expressive typography, generous spacing, and restrained organic details.
4. Design for the actual content and task:
   - Make the home page's sharing-code form the clear primary action.
   - Make wishlist items easy to scan, with image, title, optional description, indicative price, category, and shop link only when available.
   - Keep admin tools functional and visually consistent without making them look like a generic SaaS dashboard.
5. Implement responsive layouts deliberately: card grid on desktop, one-column item flow on mobile, comfortable touch targets, and no horizontal overflow.
6. Include useful empty, loading, validation, and error states. Keep French copy natural and concise.
7. Add motion sparingly for transitions and feedback. Respect `prefers-reduced-motion`; never hide or delay essential information or actions behind animation.
8. Check keyboard navigation, visible focus, semantic controls, image alternatives, and adequate contrast.
9. Run the smallest relevant lint, test, or build checks available and report any visual checks that could not be performed.

## Constraints

- Do not add functionality outside the agreed product scope.
- Do not use decorative effects that harm readability, performance, or accessibility.
- Do not invent stored wishlist content; use project-backed data or clearly identified placeholders during development.
