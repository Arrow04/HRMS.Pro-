import React from 'react';
import { Tooltip as ReactTooltip } from 'react-tooltip';

interface TooltipProps {
  id: string;
  content: string;
  children: React.ReactElement;
  place?: 'top' | 'right' | 'bottom' | 'left';
}

const Tooltip: React.FC<TooltipProps> = ({ id, content, children, place = 'top' }) => {
  return (
    <>
      <div data-tooltip-id={id} data-tooltip-content={content} className="inline-block">
        {children}
      </div>
      <ReactTooltip 
        id={id} 
        place={place} 
        className="!bg-slate-800 !text-white !font-medium !text-xs !px-3 !py-1.5 !rounded-lg !shadow-xl z-50"
        opacity={1}
      />
    </>
  );
};

export default Tooltip;
