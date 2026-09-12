---
name: ironcoach-design
description: Use this skill to generate well-branded interfaces and assets for IronCoach (PWA de treino com coach de IA, "a Carol"), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, motion, the Carol tone guide, and UI components for prototyping.
user-invocable: true
---

Read the readme.md file within this skill, then CAROL.md, and explore the other available files.

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out and create static HTML files for the user to view. If working on production code, read the rules here to become an expert in designing with this brand: tokens in `tokens/`, components in `components/`, the 36 reference screens in `IronCoach - App.dc.html`.

Non-negotiables when building for IronCoach:
- Eight colours, one meaning each. Amber is the race and only the race. Warnings are coral, never amber.
- 11px text floor on phone; 44px minimum on any tappable action.
- Glass cards without a white border; the ambient background lives once, in the screen frame.
- The elastic pill ("minhoca") is the navigation signature — 420+130·distance ms on the bottom nav, 320 ms on subnavs. Never two in motion at once.
- Motion explains data, never decorates it. Once per session. Respect prefers-reduced-motion.
- The Carol speaks Portuguese (PT), first person, with opinion, no emoji, no exclamation marks. See CAROL.md.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts or production code, depending on the need.
