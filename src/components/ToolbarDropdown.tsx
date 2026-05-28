import { useState } from 'react';
import type { ReactNode } from 'react';
import { Dropdown, DropdownList, DropdownItem, MenuToggle } from '@patternfly/react-core';

interface DropdownItemType {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

interface ToolbarDropdownProps {
  label: string;
  icon: ReactNode;
  items: DropdownItemType[];
  className?: string;
}

export const ToolbarDropdown = ({ label, icon, items, className = '' }: ToolbarDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false);

  const onToggle = () => {
    setIsOpen(!isOpen);
  };

  const onSelect = () => {
    setIsOpen(false);
  };

  return (
    <Dropdown
      isOpen={isOpen}
      onSelect={onSelect}
      onOpenChange={setIsOpen}
      toggle={(toggleRef) => (
        <MenuToggle
          ref={toggleRef}
          onClick={onToggle}
          isExpanded={isOpen}
          className={className}
        >
          <span className="toolbar-dropdown-toggle__content">
            <span className="toolbar-dropdown-toggle__icon" aria-hidden="true">{icon}</span>
            <span>{label}</span>
          </span>
        </MenuToggle>
      )}
      shouldFocusToggleOnSelect
    >
      <DropdownList>
        {items.map((item, index) => (
          <DropdownItem
            key={index}
            onClick={() => {
              if (!item.disabled) {
                item.onClick();
              }
            }}
            isDisabled={item.disabled}
          >
            {item.icon && <span className="toolbar-dropdown-item__icon" aria-hidden="true">{item.icon}</span>}
            {item.label}
          </DropdownItem>
        ))}
      </DropdownList>
    </Dropdown>
  );
};
