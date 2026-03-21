# Design System Specification: The Submersible Interface

## 1. Overview & Creative North Star
**Creative North Star: The Deep-Sea Cartographer**
This design system rejects the "flat web" aesthetic in favor of a high-fidelity, instrumental experience. It is inspired by the precision of oceanic research submersibles and tactical navigation displays. We move beyond generic dark mode by using atmospheric depth, where the UI isn't just a screen, but a window into a pressurized, high-stakes environment.

To break the "template" look, we employ **Intentional Asymmetry**. Layouts should feel like a technical map—where data clusters are balanced by vast, "abyssal" negative space. We utilize overlapping translucent layers and extreme typography scales to create a sense of professional authority and cinematic polish.

---

## 2. Colors & Atmospheric Depth
The palette is built on a foundation of deep-sea immersion. We do not use "gray"; we use varying densities of oceanic pressure.

*   **Primary (#9CCAFF):** A bioluminescent cyan used for data visualization and primary actions.
*   **Secondary (#B3CAD6):** A muted slate for supportive UI elements and navigational structures.
*   **Tertiary (#FFB77D):** A "Safety Orange" derivative used sparingly for critical alerts, warnings, and high-priority wayfinding.

### The "No-Line" Rule
**Explicit Instruction:** Designers are prohibited from using 1px solid borders for sectioning or containment. Boundaries must be defined solely through background color shifts.
*   *Implementation:* Place a `surface-container-high` card against a `surface-dim` background. The shift in tonal value provides the "edge," creating a more sophisticated, integrated look than a harsh stroke.

### Surface Hierarchy & Nesting
Treat the UI as a series of pressurized layers.
*   **Background / Surface Dim (#001525):** The deepest layer. The "ocean floor."
*   **Surface Container Low (#021D30):** Base level for page content.
*   **Surface Container High (#132C40):** Floating modules or interactive "instrument panels."

### The "Glass & Gradient" Rule
To avoid a flat, "dead" dark mode, use **Glassmorphism**. Floating panels should use `surface-container-highest` at 70% opacity with a `backdrop-blur` of 20px. 
*   **Signature Textures:** Apply a subtle linear gradient to main CTAs (transitioning from `primary` to `primary-container`) to simulate the glow of a physical LED display.

---

## 3. Typography: Technical Precision
We pair the geometric, high-tech rigors of **Space Grotesk** with the utilitarian readability of **Manrope**.

*   **The Display Scale (Space Grotesk):** Use `display-lg` (3.5rem) for hero moments. These should feel like coordinates or mission headers—bold, tracking-heavy, and authoritative.
*   **The Narrative Scale (Manrope):** Use `body-md` (0.875rem) for all functional text. Manrope’s neutrality balances the "loudness" of the display face.
*   **Technical Labels:** All `label-sm` elements should be in Space Grotesk, Uppercase, with +5% letter spacing. This mimics the "engraved" look of hardware interfaces.

---

## 4. Elevation & Depth
Depth is achieved through **Tonal Layering** rather than traditional drop shadows.

*   **The Layering Principle:** Stack `surface-container-lowest` (#000F1D) cards on a `surface-container-low` (#021D30) section to create a "recessed" effect. Conversely, use `surface-bright` (#233B50) to "lift" an element toward the user.
*   **Ambient Shadows:** If an element must float (e.g., a modal), use a shadow color of `#000F1D` (a tinted dark blue) with a 40px blur at 15% opacity. Never use pure black shadows.
*   **The "Ghost Border" Fallback:** If a divider is mandatory for accessibility, use the `outline-variant` token at 15% opacity. 100% opaque borders are strictly forbidden.

---

## 5. Components & Interface Elements

### Buttons
*   **Primary:** Fill `primary` (#9CCAFF) with `on-primary` (#003257) text. Apply a subtle 2px glow (outer shadow) of the primary color at 20% opacity.
*   **Tertiary (Safety):** Use only for destructive or high-alert actions. Background: `tertiary_container`. Text: `on_tertiary_container` (#C56B00).

### Cards & Modules
*   **No Dividers:** Never use a line to separate card content. Use a `1.5` (0.3rem) to `3` (0.6rem) spacing increment from the spacing scale to create groupings.
*   **Nesting:** A card sitting on `surface` should be `surface-container-low`. An inner module within that card should be `surface-container-high`.

### Input Fields
*   **State-Based Glow:** Inactive inputs use `surface-container-highest` with no border. On focus, the background remains, but a `primary` "Ghost Border" (20% opacity) appears to signal activity without breaking the dark-mode immersion.

### Precision Chips
*   Used for status indicators. Use `Space Grotesk` at `label-sm`. Backgrounds should be `secondary-container` with 40% opacity to maintain the "glass" aesthetic.

---

## 6. Do’s and Don’ts

### Do:
*   **Do** use extreme white space. Let the "Abyssal" backgrounds breathe.
*   **Do** use `on-surface-variant` (#C3C7CD) for secondary text to maintain low-light comfort.
*   **Do** use asymmetrical layouts where the left column is significantly narrower than the right, mimicking a technical sidebar.

### Don't:
*   **Don't** use 1px solid white or light-gray borders. It ruins the "submerged" feeling.
*   **Don't** use pure black (#000000). It creates "ink bleed" on OLED screens and feels unrefined.
*   **Don't** use standard "Material" elevation shadows. Use tonal shifts and glass blurs instead.
*   **Don't** use "Safety Orange" for decorative elements. It is a functional color reserved for warnings and critical data points.

---

## 7. Spacing Scale
Layouts must adhere to the 0.1rem-based scale to maintain "Instrumental Density."
*   **Tight (1.5 / 0.3rem):** For grouping related data points.
*   **Standard (4 / 0.9rem):** For padding within containers.
*   **Sectional (10 / 2.25rem):** For vertical rhythm between major content blocks.