import { useRef, type ComponentType, type KeyboardEvent, type SVGProps } from "react";

export interface Tab<K extends string> { key: K; label: string; icon?: ComponentType<SVGProps<SVGSVGElement>> }

export const tabId = (key: string) => `tab-${key}`;
export const panelId = (key: string) => `panel-${key}`;

// The ARIA tabs pattern: one tab in the tab order, the arrow keys, Home and End moving between them
// and choosing as they go.
export function Tabs<K extends string>({ tabs, selected, label, onSelect }: {
  tabs: Tab<K>[];
  selected: K;
  label: string;
  onSelect: (key: K) => void;
}) {
  const buttons = useRef(new Map<K, HTMLButtonElement>());
  const move = (event: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const next = { ArrowRight: index === last ? 0 : index + 1, ArrowLeft: index === 0 ? last : index - 1, Home: 0, End: last }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    onSelect(tabs[next].key);
    buttons.current.get(tabs[next].key)?.focus();
  };
  return (
    <div role="tablist" aria-label={label} className="tabs">
      {tabs.map((tab, index) => (
        <button key={tab.key} type="button" role="tab" id={tabId(tab.key)} aria-controls={panelId(tab.key)}
          aria-selected={tab.key === selected} tabIndex={tab.key === selected ? 0 : -1}
          ref={(b) => { if (b) buttons.current.set(tab.key, b); else buttons.current.delete(tab.key); }}
          onClick={() => onSelect(tab.key)} onKeyDown={(e) => move(e, index)}>
          {tab.icon && <tab.icon aria-hidden="true" />}{tab.label}
        </button>
      ))}
    </div>
  );
}
