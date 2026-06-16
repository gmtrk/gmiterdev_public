# Ricochet — Manual Browser Verification Checklist

Run `make run`, open http://127.0.0.1:8000/ricochet/ . Tick each item; record device/browser.
Reference: superpowers:verification-before-completion — confirm each observation before claiming done.

## Cold open & core loop
- [ ] Cold-open: a FRESH save (clear `localStorage` key `ricochet:save` first) shows the pre-placed Plinko triangle + 1-2 blocks + paddle, and ball #1 visibly rattles and pays a number within ~2 s.
- [ ] Credits climb on screen; the first Credits-shop upgrade is affordable within ~10 s.
- [ ] 60 fps at the desktop ceiling (DevTools Performance / FPS meter): steady, no long GC pauses over a 60 s storm.

## Physics integrity
- [ ] Late storm (buy speed/kick/bounce + trigger bursts): NO ball tunnels through a peg or thin block — balls always register a contact.
- [ ] Arena saturation indicator in HUD reflects live count nearing the ceiling; slots free as balls drain out the bottom.

## Placement / presets / blueprint
- [ ] Place tab: place + remove pegs/blocks, drag paddle; min-separation overlap prevented; cannot place in the spawn band or outside bounds.
- [ ] Presets (triangle / diamond / funnel) and auto-fill apply within the current budget.
- [ ] Blueprint persists across a Big Bang and is re-applied clamped to the post-reset budget.

## Specials (own pool)
- [ ] Unlock a special: it arrives bundled with 3-4 of that type; clacks are visible.
- [ ] Clacker clack -> credit burst; Splitter clack -> 1-2 cap-exempt balls spawn; Burster fills its charge ring off env bounces + clacks, then bursts into balls and resets to 0.

## Golden
- [ ] Golden balls occasionally pop (extra particles + tiny shake) and a golden block outline shimmers on respawn.

## Offline
- [ ] Reload after >~30 s away with a non-zero earn rate -> "While you were gone..." modal with a Collect button; Collect grants once (immediate reload does NOT re-grant).
- [ ] Future-dated clock (set system clock back) -> NO offline grant.

## Prestige (Big Bang)
- [ ] Big Bang confirm modal shows projected Cores = floor(coreK*sqrt(runCredits/coreScale)) AND a felt-boost line ("next run ~Nx faster / reach here in ~M min").
- [ ] After Big Bang: credits/upgrades/credit-bought specials reset; Cores/lifetimeCores/Cores-shop/blueprint persist.

## Stat-card & leaderboard
- [ ] Stat-card export produces a canvas snapshot with headline numbers + gmiter.dev wordmark; copy-image / download works.
- [ ] Leaderboard submit sends `lifetimeCores` (NOT `cores`); 3 alpha initials accepted; top 10 renders; `lastSubmittedCores` updates.

## Mobile & reduced-motion
- [ ] On a narrow viewport (<= 820px) the layout STACKS HUD -> arena -> panel; the quality toggle remains reachable.
- [ ] Touch: dragging on the arena does NOT scroll the page (`touch-action: none`); Remove mode works by tap.
- [ ] Quality toggle ON: live ceiling drops and fade/shake disable; OFF restores them.
- [ ] OS `prefers-reduced-motion: reduce`: trails OFF, screen-shake OFF, particles dampened (~25%); charge ring still drawn (it is information, not motion).

## Final gate
- [ ] `node --test ricochet/static/ricochet/js/*.test.mjs` -> all pass (`# fail 0`).
- [ ] `make check` -> ruff clean + pytest green.
