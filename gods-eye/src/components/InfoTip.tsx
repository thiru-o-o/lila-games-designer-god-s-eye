import { useRef, useState } from 'react';
import { SURFACE_2, TEXT_PRIMARY, BORDER, TEXT_TERTIARY } from '../tokens';

/**
 * InfoTip — a small "?" circle that shows a themed fixed-position tooltip on hover.
 * Uses position:fixed so it is never clipped by overflow containers.
 */
export function InfoTip({ text }: { text: string }) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos]         = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLSpanElement>(null);

  const show = () => {
    if (!ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top - 6 });
    setVisible(true);
  };

  return (
    <>
      <span
        ref={ref}
        onMouseEnter={show}
        onMouseLeave={() => setVisible(false)}
        onFocus={show}
        onBlur={() => setVisible(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 14, height: 14, borderRadius: '50%',
          border: `1px solid ${TEXT_TERTIARY}`, color: TEXT_TERTIARY,
          fontSize: 9, cursor: 'help', marginLeft: 5,
          flexShrink: 0, userSelect: 'none',
          transition: 'border-color 0.15s, color 0.15s',
        }}
      >
        ?
      </span>
      {visible && (
        <div style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          transform: 'translate(-50%, -100%)',
          background: SURFACE_2,
          color: TEXT_PRIMARY,
          border: `1px solid ${BORDER}`,
          borderRadius: 6,
          padding: '6px 10px',
          fontSize: 11,
          fontWeight: 400,
          lineHeight: 1.5,
          letterSpacing: 0,
          textTransform: 'none',
          maxWidth: 220,
          width: 'max-content',
          pointerEvents: 'none',
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.45)',
        }}>
          {text}
        </div>
      )}
    </>
  );
}
