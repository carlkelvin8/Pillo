# Marketing Hero Polish

## Intent

Make Pillo's landing-page opening easier for clinic owners to understand and act on, while keeping the animated product story and Dr. Pill mascot.

## Goals

- Make the product value, headline, and primary signup action clear in the first screen.
- Keep the hero balanced across desktop, tablet, and short mobile viewports without clipping.
- Preserve the existing story animation, brand tokens, and reduced-motion behavior.

## Non-goals

- Rewriting the chapter sequence or adding new product claims.
- Replacing the mascot or adding a new animation dependency.

## Approaches

1. **Keep the story and tighten the opening** — Rebalance the current responsive hero grid, text width, mascot scale, and vertical spacing so the headline and signup action stay prominent. This is the selected approach because the user asked to keep the story.
2. **Replace it with a static hero** — Simpler to scan and less motion-heavy, but removes the distinctive story presentation. Not selected.

## Constraints and calls

- Preserve existing headline and supporting copy unless a layout issue makes them unreadable.
- Keep all content in the hero available without relying on animation or scroll.
- Ensure fixed navigation and the scroll cue do not overlap the primary content.
- Use the existing design tokens and existing motion-reduction behavior.

## Acceptance checks

- Desktop first screen presents the headline, signup CTA, and mascot without collisions.
- Narrow and short mobile viewports show the headline and signup CTA without clipping or horizontal overflow.
- Reduced-motion and no-script visitors can still read the full hero content.
