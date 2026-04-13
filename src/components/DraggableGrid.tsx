import React, { useRef, useState } from 'react';

interface DraggableGridProps {
  children: React.ReactNode[];
  cols?: number;
  gap?: number;
}

// Un grid drag & drop simple para widgets
export const DraggableGrid: React.FC<DraggableGridProps> = ({ children, cols = 4, gap = 24 }) => {
  const [order, setOrder] = useState(children.map((_, i) => i));
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleDragStart = (idx: number) => {
    dragItem.current = idx;
  };
  const handleDragEnter = (idx: number) => {
    dragOverItem.current = idx;
  };
  const handleDragEnd = () => {
    const from = dragItem.current;
    const to = dragOverItem.current;
    if (from !== null && to !== null && from !== to) {
      const newOrder = [...order];
      const [removed] = newOrder.splice(from, 1);
      newOrder.splice(to, 0, removed);
      setOrder(newOrder);
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap,
      }}
    >
      {order.map((childIdx, idx) => (
        <div
          key={idx}
          draggable
          onDragStart={() => handleDragStart(idx)}
          onDragEnter={() => handleDragEnter(idx)}
          onDragEnd={handleDragEnd}
          style={{ cursor: 'grab', userSelect: 'none', transition: 'box-shadow 0.2s', boxShadow: '0 2px 8px 0 #0001' }}
        >
          {children[childIdx]}
        </div>
      ))}
    </div>
  );
};

export default DraggableGrid;
