I have improved the template editing experience by making the dropdown smarter and more robust.

**1. Dynamic Custom Fields**
*   **Problem:** The template dropdown only showed a generic `{field.custom_col}` hint.
*   **Solution:** It now dynamically loads the actual custom columns defined in your catalogs.
*   **Result:** If your "Brand" catalog has a custom column named `xentral_id`, the dropdown will explicitly suggest `{brand.xentral_id}`.

**2. Fixed Dropdown Overflow**
*   **Problem:** The autocomplete dropdown was being cut off (clipped) because it was trapped inside the scrollable/collapsible container.
*   **Solution:** I rewrote the dropdown to use a "Portal". This renders it directly on top of the entire page (attached to the document body), bypassing any container restrictions.
*   **Result:** The dropdown now floats freely and is fully visible, even when the input is inside a small scrollable area.