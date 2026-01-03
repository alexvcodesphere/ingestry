I have implemented the requested UI enhancements for template visibility and editing.

**1. Table Header Info Icons**
*   **Where:** In the Draft Order Grid (`DraftOrderGrid.tsx`).
*   **What:** Added an `Info` icon (ℹ️) next to the column label for any field that is computed via a template.
*   **Behavior:** Hovering over the icon shows a tooltip with the exact template string (e.g., `Template: {brand.code}-{sequence}`), making it clear how the value is derived.

**2. Smart Template Dropdown**
*   **Where:** In the Profile Editor (`TransformTab.tsx` & `template-input.tsx`).
*   **What:** Enhanced the autocomplete suggestions for template fields.
*   **New Features:**
    *   **Context Awareness:** The dropdown now knows which fields are linked to catalogs.
    *   **Code Support:** Automatically suggests `{field.code}` for catalog-linked fields.
    *   **Custom Column Support:** Adds a `{field.custom_col}` suggestion that inserts `{field.` to help you easily access custom columns from your catalog (e.g., `{brand.xentral_id}`).

These changes make the templating system more transparent in the grid and easier to configure in the settings.