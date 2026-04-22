import React, { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';

interface ParallaxCardProps {
  children: React.ReactNode;
  className?: string;
  tiltDegrees?: number; // Max tilt in degrees
  perspective?: number; // Perspective depth for the 3D effect
  hoverScale?: number; // Scale on hover
}

export const ParallaxCard: React.FC<ParallaxCardProps> = ({
  children,
  className,
  tiltDegrees = 10,
  perspective = 1000,
  hoverScale = 1.01,
}) => {
  const ref = useRef<HTMLDivElement>(null);

  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const cX = useMotionValue(0);
  const cY = useMotionValue(0);

  const rotateX = useTransform(cY, [0, 1], [tiltDegrees, -tiltDegrees]);
  const rotateY = useTransform(cX, [0, 1], [-tiltDegrees, tiltDegrees]);

  const springConfig = { stiffness: 200, damping: 20 };
  const springRotateX = useSpring(rotateX, springConfig);
  const springRotateY = useSpring(rotateY, springConfig);

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;

    const rect = ref.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    // Normalize mouse position to [-0.5, 0.5]
    const mouseX = (event.clientX - rect.left) / width - 0.5;
    const mouseY = (event.clientY - rect.top) / height - 0.5;

    cX.set(mouseX);
    cY.set(mouseY);
  };

  const handleMouseLeave = () => {
    cX.set(0);
    cY.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        transformStyle: "preserve-3d",
        perspective: perspective,
        rotateX: springRotateX,
        rotateY: springRotateY,
        scale: useTransform(cX, [-0.5, 0.5], [hoverScale, hoverScale]), // Apply hover scale based on mouse activity
      }}
      transition={{ duration: 0.1, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.div>
  );
};
