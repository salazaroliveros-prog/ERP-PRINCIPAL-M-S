import React from 'react';
import { motion } from 'motion/react';
import { useTheme } from '../contexts/ThemeContext';

export default function MeshBackground() {
  const { currentTheme, isDarkMode } = useTheme();

  // Define colors based on the current theme
  const getColors = () => {
    if (isDarkMode) {
      switch (currentTheme.id) {
        case 'sunset': return ['rgba(249, 115, 22, 0.15)', 'rgba(30, 41, 59, 0)'];
        case 'ocean': return ['rgba(37, 99, 235, 0.15)', 'rgba(15, 23, 42, 0)'];
        case 'forest': return ['rgba(16, 185, 129, 0.15)', 'rgba(2, 44, 34, 0)'];
        case 'aurora': return ['rgba(139, 92, 246, 0.15)', 'rgba(30, 27, 75, 0)'];
        case 'ember': return ['rgba(239, 68, 68, 0.15)', 'rgba(69, 10, 10, 0)'];
        default: return ['rgba(59, 130, 246, 0.1)', 'rgba(15, 23, 42, 0)'];
      }
    } else {
      switch (currentTheme.id) {
        case 'sunset': return ['rgba(255, 237, 213, 0.8)', 'rgba(255, 255, 255, 0)'];
        case 'ocean': return ['rgba(219, 234, 254, 0.8)', 'rgba(255, 255, 255, 0)'];
        case 'forest': return ['rgba(209, 250, 229, 0.8)', 'rgba(255, 255, 255, 0)'];
        case 'aurora': return ['rgba(237, 233, 254, 0.8)', 'rgba(255, 255, 255, 0)'];
        case 'ember': return ['rgba(254, 226, 226, 0.8)', 'rgba(255, 255, 255, 0)'];
        default: return ['rgba(241, 245, 249, 0.8)', 'rgba(255, 255, 255, 0)'];
      }
    }
  };

  const colors = getColors();

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
      <motion.div
        animate={{
          scale: [1, 1.2, 1],
          x: [0, 100, 0],
          y: [0, 50, 0],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "linear"
        }}
        className="absolute -top-[10%] -left-[10%] w-[60%] h-[60%] rounded-full blur-[120px]"
        style={{
          background: `radial-gradient(circle, ${colors[0]} 0%, ${colors[1]} 70%)`,
        }}
      />
      <motion.div
        animate={{
          scale: [1.2, 1, 1.2],
          x: [0, -100, 0],
          y: [0, -50, 0],
        }}
        transition={{
          duration: 25,
          repeat: Infinity,
          ease: "linear"
        }}
        className="absolute -bottom-[10%] -right-[10%] w-[60%] h-[60%] rounded-full blur-[120px]"
        style={{
          background: `radial-gradient(circle, ${colors[0]} 0%, ${colors[1]} 70%)`,
        }}
      />
      <motion.div
        animate={{
          scale: [1, 1.3, 1],
          x: [0, 50, 0],
          y: [0, -100, 0],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: "linear"
        }}
        className="absolute top-[20%] right-[10%] w-[40%] h-[40%] rounded-full blur-[100px]"
        style={{
          background: `radial-gradient(circle, ${colors[0]} 0%, ${colors[1]} 70%)`,
          opacity: 0.6
        }}
      />
    </div>
  );
}
