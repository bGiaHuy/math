import { useEffect, useRef } from 'react';

// Keep keyboard navigation inside an open dialog and return to its trigger.
export default function useModalFocus(active, onClose, returnFocus) {
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const returnFocusRef = useRef(returnFocus);
  returnFocusRef.current = returnFocus;
  useEffect(() => {
    if (!active || !dialogRef.current) return;
    const dialog = dialogRef.current;
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const controls = () => [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]')].filter(el => el.getClientRects().length);
    (controls()[0] || dialog).focus();
    const keyboard = event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeRef.current?.(); }
      if (event.key !== 'Tab') return;
      const items = controls(), first = items[0], last = items.at(-1);
      if (!first) { event.preventDefault(); dialog.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('keydown', keyboard);
    return () => {
      dialog.removeEventListener('keydown', keyboard);
      document.body.style.overflow = overflow;
      if (previous?.isConnected && previous !== document.body) {
        const disclosure = previous.closest('details');
        (disclosure && !disclosure.open ? disclosure.querySelector('summary') : previous)?.focus();
      } else {
        returnFocusRef.current?.()?.focus();
      }
    };
  }, [active]);
  return dialogRef;
}
