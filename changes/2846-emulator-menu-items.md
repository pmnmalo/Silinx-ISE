In short:

- **The Board Emulator's ⋮ menu** looks and works like the other ⋮ menus: the engine, what it does when hidden and the
  modules shown are menu items with a ✓ on the current choice, no lists inside the menu.

In detail:

- **A ⋮ menu's choices as menu items (#2846):** `toolbar-menu.js` has checkable items for every viewer: `menuChoice` (a
  section title and its options, ✓ on the current one, an option that can't be chosen disabled with its reason as its
  tip) and `menuCheck` (a setting on or off), styled once with the other menus' items (`.tb-menu-item`), and ↑ / ↓ /
  Home / End move among a ⋮ menu's items. The Board Emulator's Engine, When hidden and Show (its modules) use them,
  its own menu styles (`.emu-menu-row`) gone; docs/UI-GUIDELINES.md: a ⋮ menu holds menu items, never form fields.
