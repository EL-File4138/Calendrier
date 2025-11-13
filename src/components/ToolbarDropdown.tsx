import { useState, useRef, useEffect } from 'react';
import './ToolbarDropdown.css';

interface DropdownItem {
  label: string;
  icon?: string;
  onClick: () => void;
  disabled?: boolean;
}

interface ToolbarDropdownProps {
  label: string;
  icon: string;
  items: DropdownItem[];
  className?: string;
}

export const ToolbarDropdown = ({ label, icon, items, className = '' }: ToolbarDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleItemClick = (item: DropdownItem) => {
    if (!item.disabled) {
      item.onClick();
      setIsOpen(false);
    }
  };

  return (
    <div className={`toolbar-dropdown ${className}`} ref={dropdownRef}>
      <button
        className="toolbar-button dropdown-toggle"
        onClick={() => setIsOpen(!isOpen)}
        title={label}
      >
        {icon} <span className="dropdown-arrow">▼</span>
      </button>
      {isOpen && (
        <div className="dropdown-menu">
          {items.map((item, index) => (
            <button
              key={index}
              className={`dropdown-item ${item.disabled ? 'disabled' : ''}`}
              onClick={() => handleItemClick(item)}
              disabled={item.disabled}
            >
              {item.icon && <span className="dropdown-item-icon">{item.icon}</span>}
              <span className="dropdown-item-label">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
