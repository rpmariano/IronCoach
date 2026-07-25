# Graph Report - .  (2026-07-19)

## Corpus Check
- Corpus is ~29,626 words - fits in a single context window. You may not need a graph.

## Summary
- 238 nodes · 269 edges · 20 communities (18 shown, 2 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.78)
- Token cost: 90,441 input · 0 output

## Community Hubs (Navigation)
- IronHealth UI Theming & Skills Docs
- Design System Build Tooling
- Badge Component
- Design System Package Config
- Coach Chat Edge Function
- TypeScript Config
- App Theme, Auth & Data Loading
- PWA Manifest
- Chip Component
- Card Component
- ColorSwatch Component
- NavIconButton Component
- ProgressBar Component
- Analyze Meal Edge Function
- Badge Storybook Stories
- Design System Entry Point
- Storybook Preview Config

## God Nodes (most connected - your core abstractions)
1. `compilerOptions` - 12 edges
2. `Automated Fidelity Grading Skipped` - 11 edges
3. `--accent / --accent-dark CSS Custom Properties` - 8 edges
4. `handler()` - 6 edges
5. `IronHealth App (index.html)` - 5 edges
6. `loadAllData()` - 5 edges
7. `scripts` - 4 edges
8. `lib` - 4 edges
9. `runGetNutritionHistory()` - 4 edges
10. `summariseSessions()` - 4 edges

## Surprising Connections (you probably didn't know these)
- `Automated Fidelity Grading Skipped` --semantically_similar_to--> `find-skills Skill`  [INFERRED] [semantically similar]
  design-system/.design-sync/NOTES.md → .agents/skills/find-skills/SKILL.md
- `--accent / --accent-dark CSS Custom Properties` --shares_data_with--> `--accent / --accent-dark (root style block)`  [INFERRED]
  design-system/.design-sync/conventions.md → index.html
- `IronHealth App (index.html)` --references--> `Lightning Bolt App Icon (icon.svg)`  [EXTRACTED]
  index.html → icon.svg
- `IronHealth UI (component library)` --references--> `IronHealth App (index.html)`  [INFERRED]
  design-system/.design-sync/conventions.md → index.html
- `Card (Início energy-tile pattern)` --references--> `IronHealth App (index.html)`  [EXTRACTED]
  design-system/.design-sync/conventions.md → index.html

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Components Consuming --accent / --accent-dark** — design_system__design_sync_conventions_accent_vars, design_system__design_sync_conventions_button, design_system__design_sync_conventions_chip, design_system__design_sync_conventions_tabbutton, design_system__design_sync_conventions_naviconbutton, design_system__design_sync_conventions_colorswatch [EXTRACTED 1.00]
- **First-Sync Components Pending Automated Grade** — design_system__design_sync_notes_badge, design_system__design_sync_notes_button, design_system__design_sync_notes_card, design_system__design_sync_notes_chip, design_system__design_sync_notes_colorswatch, design_system__design_sync_notes_naviconbutton, design_system__design_sync_notes_progressbar, design_system__design_sync_notes_tabbutton [EXTRACTED 1.00]
- **Accent/Theme Selection & Persistence Flow** — index_apply_accent_color, index_select_accent_color, index_accent_colors, index_apply_theme, index_select_theme, index_supabase_client [EXTRACTED 1.00]

## Communities (20 total, 2 thin omitted)

### Community 0 - "IronHealth UI Theming & Skills Docs"
Cohesion: 0.08
Nodes (29): find-skills Skill, Skills CLI (npx skills), skills.sh Leaderboard, --accent / --accent-dark CSS Custom Properties, Button, Card (Início energy-tile pattern), Chip, ColorSwatch (+21 more)

### Community 1 - "Design System Build Tooling"
Cohesion: 0.07
Nodes (27): autoprefixer, devDependencies, autoprefixer, postcss, storybook, @storybook/addon-essentials, @storybook/react, @storybook/react-vite (+19 more)

### Community 2 - "Badge Component"
Cohesion: 0.10
Nodes (21): Badge(), BadgeProps, BadgeTone, tones, Button(), ButtonProps, ButtonVariant, Danger (+13 more)

### Community 3 - "Design System Package Config"
Cohesion: 0.10
Nodes (20): dependencies, lucide-react, react, react-dom, exports, ./styles.css, main, module (+12 more)

### Community 4 - "Coach Chat Edge Function"
Cohesion: 0.16
Nodes (13): aggregateMealsByDate(), buildGymSummary(), buildSystemInstruction(), corsHeaders, DayTotals, GYM_TOOL, handler(), jsonResponse() (+5 more)

### Community 5 - "TypeScript Config"
Cohesion: 0.11
Nodes (17): compilerOptions, isolatedModules, jsx, lib, module, moduleResolution, noEmit, resolveJsonModule (+9 more)

### Community 6 - "App Theme, Auth & Data Loading"
Cohesion: 0.15
Nodes (11): ACCENT_COLORS constant, --accent / --accent-dark (root style block), analyzeMeal(), applyAccentColor(), applyTheme(), isGymEnabled(), loadAllData(), MUSCLE_GROUPS constant (+3 more)

### Community 7 - "PWA Manifest"
Cohesion: 0.17
Nodes (11): background_color, description, display, icons, lang, name, orientation, scope (+3 more)

### Community 8 - "Chip Component"
Cohesion: 0.22
Nodes (8): Chip(), ChipProps, Active, Inactive, MealTypeGroup, meta, RangeGroup, Story

### Community 9 - "Card Component"
Cohesion: 0.25
Nodes (7): Card(), CardProps, paddings, Default, meta, SmallPadding, Story

### Community 10 - "ColorSwatch Component"
Cohesion: 0.25
Nodes (7): ColorSwatch(), ColorSwatchProps, ACCENT_COLORS, meta, Picker, Single, Story

### Community 11 - "NavIconButton Component"
Cohesion: 0.25
Nodes (7): NavIconButton(), NavIconButtonProps, Active, Inactive, meta, Story, Strip

### Community 12 - "ProgressBar Component"
Cohesion: 0.25
Nodes (7): ProgressBar(), ProgressBarProps, Accent, meta, Over, Protein, Story

### Community 13 - "Analyze Meal Edge Function"
Cohesion: 0.25
Nodes (5): analyzeWithGemini(), buildPrompt(), corsHeaders, MEAL_TYPES, RESPONSE_SCHEMA

### Community 14 - "Badge Storybook Stories"
Cohesion: 0.25
Nodes (7): Accent, AllTones, Danger, meta, Neutral, Story, Success

## Knowledge Gaps
- **126 isolated node(s):** `config`, `preview`, `name`, `private`, `version` (+121 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **2 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `devDependencies` connect `Design System Build Tooling` to `Design System Package Config`?**
  _High betweenness centrality (0.031) - this node is a cross-community bridge._
- **Why does `--accent / --accent-dark CSS Custom Properties` connect `IronHealth UI Theming & Skills Docs` to `App Theme, Auth & Data Loading`?**
  _High betweenness centrality (0.019) - this node is a cross-community bridge._
- **What connects `config`, `preview`, `name` to the rest of the system?**
  _126 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `IronHealth UI Theming & Skills Docs` be split into smaller, more focused modules?**
  _Cohesion score 0.07635467980295567 - nodes in this community are weakly interconnected._
- **Should `Design System Build Tooling` be split into smaller, more focused modules?**
  _Cohesion score 0.07407407407407407 - nodes in this community are weakly interconnected._
- **Should `Badge Component` be split into smaller, more focused modules?**
  _Cohesion score 0.10256410256410256 - nodes in this community are weakly interconnected._
- **Should `Design System Package Config` be split into smaller, more focused modules?**
  _Cohesion score 0.09523809523809523 - nodes in this community are weakly interconnected._