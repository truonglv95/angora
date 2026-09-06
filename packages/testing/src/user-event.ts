/**
 * User event simulation utilities for testing Angora components
 */
export const userEvent = {
  click(element: HTMLElement) {
    if (typeof element.focus === 'function') {
      element.focus();
    }
    const evt = new Event('click', { bubbles: true, cancelable: true });
    element.dispatchEvent(evt);
  },

  type(element: HTMLInputElement | HTMLTextAreaElement, text: string) {
    if (typeof element.focus === 'function') {
      element.focus();
    }
    for (const char of text) {
      const keyEvt = new Event('keydown', { bubbles: true });
      (keyEvt as any).key = char;
      element.dispatchEvent(keyEvt);

      element.value += char;

      const inputEvt = new Event('input', { bubbles: true });
      element.dispatchEvent(inputEvt);

      const upEvt = new Event('keyup', { bubbles: true });
      (upEvt as any).key = char;
      element.dispatchEvent(upEvt);
    }
    const changeEvt = new Event('change', { bubbles: true });
    element.dispatchEvent(changeEvt);
  },

  clear(element: HTMLInputElement | HTMLTextAreaElement) {
    element.value = '';
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  },
};
