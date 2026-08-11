---
name: Precision Auctioneer Systems
colors:
  surface: '#fcf8fa'
  surface-dim: '#dcd9db'
  surface-bright: '#fcf8fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f0edef'
  surface-container-high: '#eae7e9'
  surface-container-highest: '#e4e2e4'
  on-surface: '#1b1b1d'
  on-surface-variant: '#45464d'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#0058be'
  on-secondary: '#ffffff'
  secondary-container: '#2170e4'
  on-secondary-container: '#fefcff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#271901'
  on-tertiary-container: '#98805d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#d8e2ff'
  secondary-fixed-dim: '#adc6ff'
  on-secondary-fixed: '#001a42'
  on-secondary-fixed-variant: '#004395'
  tertiary-fixed: '#fcdeb5'
  tertiary-fixed-dim: '#dec29a'
  on-tertiary-fixed: '#271901'
  on-tertiary-fixed-variant: '#574425'
  background: '#fcf8fa'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
typography:
  display-bid:
    fontFamily: Inter
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-caps:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
  timer-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 24px
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  sidebar_width: 360px
  base_unit: 8px
  gutter: 24px
  margin_main: 32px
  touch_target_min: 48px
---

## Brand & Style

This design system is engineered for the high-stakes, fast-paced environment of live auctions. The brand personality is authoritative, reliable, and hyper-functional. It prioritizes clarity over decoration, ensuring that the auctioneer can process information and execute commands with zero cognitive friction.

The aesthetic follows a **Corporate / Modern** approach with a focus on high-utility density. It utilizes a structured grid, clear semantic signaling, and an "information-first" hierarchy. The visual tone is professional and sober, designed to reduce eye strain during long sessions while maintaining the urgency required for live bidding.

## Colors

The palette is anchored by a deep Navy Primary (`#0F172A`), providing a sense of stability and institutional trust. 

*   **Primary (Navy):** Used for headers, primary navigation, and high-level structural containers.
*   **Secondary (Blue):** Dedicated to navigational actions and neutral transitions (e.g., "Next Lot").
*   **Success (Green):** Specifically reserved for "Accept Bid" or "Resume Auction" actions.
*   **Warning (Orange/Yellow):** Used for "Pause" states and timer-related alerts to signal a transition.
*   **Critical (Red):** Reserved for irreversible or session-ending actions like "Retract Bid" or "End Auction."
*   **Surface:** Pure white is used for card backgrounds to maximize the contrast of text and numerical data.

## Typography

This design system utilizes **Inter** for its exceptional legibility and neutral character. A critical requirement for this system is the use of **tabular figures (monospaced numbers)** for bid amounts and timers to prevent visual jumping during rapid updates.

*   **Display Bid:** A massive, high-contrast style for the current leading bid.
*   **Timer MD:** Used for the countdown clock, utilizing bold weights and numeric alignment.
*   **Label Caps:** Used for metadata headers (e.g., "LOT NUMBER", "BIDDER ID") to provide clear categorization without competing with the primary data.

## Layout & Spacing

The layout is a **Fixed Split View** designed for persistent situational awareness.

1.  **Main Content Area (Fluid/Scrollable):** Occupies the left and center. This area contains the active lot management, current bid cards, and the bid history log.
2.  **Fixed Right Sidebar (Fixed 360px):** Always visible. Contains the real-time activity feed, chat, and the current bidder leaderboard.
3.  **Sticky Footer/Action Bar:** A high-visibility zone at the bottom of the main area for primary auctioneer controls (Accept, Pause, Next).

**Responsive Behavior:** 
*   **Desktop:** Full split view with persistent sidebar.
*   **Tablet:** Sidebar becomes a collapsible drawer; control buttons increase in size for touch precision.
*   **Mobile:** Single column view; "Accept Bid" becomes a floating, thumb-accessible action button.

## Elevation & Depth

This design system uses **Low-contrast outlines** combined with **Tonal layers** to maintain a clean, professional look without the "muddiness" of heavy shadows.

*   **Surface Level 0:** Light gray background for the application canvas.
*   **Surface Level 1 (Cards):** Pure white with a subtle 1px border (`#E2E8F0`). This is used for lot cards and bid history.
*   **Surface Level 2 (Active State):** A slight elevation using a soft, 4% opacity navy shadow to indicate the "Active Lot" or "Current Bid."
*   **Sidebar:** Distinguished by a vertical border and a slightly different background tint to visually separate global data from local actions.

## Shapes

The design system employs a **Soft** shape language. Corners are slightly rounded to provide a modern feel while maintaining a disciplined, professional grid.

*   **Standard Elements:** 0.25rem (4px) radius for inputs and small cards.
*   **Primary Action Buttons:** 0.5rem (8px) radius to make them more distinct and touch-inviting.
*   **Status Badges:** Fully rounded (pill-shaped) to differentiate "Status" indicators from "Action" buttons.

## Components

### Buttons
*   **Action Primary (Accept):** Large (min-height 64px), Success Green background, white text. Icon + Label.
*   **Action Secondary (Navigation):** Secondary Blue border or fill.
*   **Utility Buttons:** Ghost style (transparent background, neutral border) for secondary controls like "Edit Lot."

### Bid Cards
High-contrast containers featuring the `display-bid` typography. Current bid should be highlighted with a left-accent border in the primary color.

### Data Sidebar
A vertically scrolling list with a smaller font size (`body-md`). Each entry should have a timestamp and a "Bidder ID" label in the `label-caps` style.

### Input Fields
Strict, rectangular inputs with 1px borders. Focus states must use the Secondary Blue with a 2px outer ring for maximum visibility during manual data entry.

### Timer Component
A high-visibility block, typically using a Warning Yellow background when the timer is under 10 seconds to create urgency without the alarmist nature of red.