I have fixed the keyboard navigation in the template dropdown.

**Issue:**
When navigating the list with Up/Down arrow keys, the selection would move correctly in the background, but the list wouldn't scroll to show the currently selected item. This made it look like navigation was broken for items outside the visible area.

**Fix:**
I added auto-scrolling logic. Now, whenever you press the arrow keys, the dropdown automatically scrolls to keep the highlighted item in view.