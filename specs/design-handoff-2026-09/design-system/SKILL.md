---
name: ironcoach-design
description: Use this skill to generate well-branded interfaces and assets for IronCoach (PWA de treino com coach de IA, "a Carol"), either for production or throwaway prototypes/mocks. Contains essential design guidelines, colors, type, motion, the Carol tone guide, and UI components for prototyping.
user-invocable: true
---

Read the readme.md file within this skill, then CAROL.md, and explore the other available files.

**This system shipped.** The `.jsx` files here are the original prototype stubs; the
implementation that ships lives in `src/components/shared/` and `src/styles/tokens/`.
Each component's `.d.ts` and `.prompt.md` were reconciled with that implementation on
2026-09-17 and say at the top whether the component is IMPLEMENTADO (and where) or
PROTÓTIPO (never built with that name, plus what replaced it). When writing production
code, read the file in `src/`; the stubs here are for throwaway mocks only.

If creating visual artifacts (slides, mocks, throwaway prototypes), copy assets out and create static HTML files for the user to view. If working on production code, read the rules here to become an expert in designing with this brand: tokens in `tokens/`, components in `components/`, the 36 reference screens in `IronCoach - App.dc.html`.

Non-negotiables when building for IronCoach:
- Eight colours, one meaning each. Amber is the race and only the race. Warnings are coral, never amber.
- 11px text floor on phone; 44px minimum on any tappable action.
- Glass cards without a white border; the ambient background lives once, in the screen frame.
- The elastic pill ("minhoca") is the navigation signature — 650+170·distance ms on the bottom nav (capped at 1300), 480 ms on subnavs. Never two in motion at once. (Slowed from 420+130/320 on 2026-09-13; `src/utils/useElasticPillIndicator.js` is the source of truth.)
- Motion explains data, never decorates it. Once per session. Respect prefers-reduced-motion.
- The Carol speaks Portuguese (PT), first person, with opinion, no emoji, no exclamation marks. See CAROL.md.

If the user invokes this skill without any other guidance, ask them what they want to build or design, ask some questions, and act as an expert designer who outputs HTML artifacts or production code, depending on the need.
