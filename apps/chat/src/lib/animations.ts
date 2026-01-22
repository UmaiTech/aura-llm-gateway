// Animation utilities using anime.js
import { animate, stagger } from 'animejs'

// Re-export for compatibility
export { animate as anime, stagger }

// Common animation configurations
export const ANIMATIONS = {
  // Entrance animations
  fadeInUp: {
    opacity: [0, 1],
    translateY: [20, 0],
    duration: 400,
    easing: 'easeOutCubic' as const,
  },
  fadeIn: {
    opacity: [0, 1],
    duration: 300,
    easing: 'easeOutCubic' as const,
  },
  scaleIn: {
    opacity: [0, 1],
    scale: [0.95, 1],
    duration: 250,
    easing: 'easeOutCubic' as const,
  },
  slideInRight: {
    opacity: [0, 1],
    translateX: [20, 0],
    duration: 300,
    easing: 'easeOutCubic' as const,
  },
  slideInLeft: {
    opacity: [0, 1],
    translateX: [-20, 0],
    duration: 300,
    easing: 'easeOutCubic' as const,
  },

  // Exit animations
  fadeOut: {
    opacity: [1, 0],
    duration: 200,
    easing: 'easeInCubic' as const,
  },
  scaleOut: {
    opacity: [1, 0],
    scale: [1, 0.95],
    duration: 200,
    easing: 'easeInCubic' as const,
  },
}

// Helper to animate element entrance
export function animateEntrance(
  element: HTMLElement,
  animation: keyof typeof ANIMATIONS = 'fadeInUp',
  delay: number = 0
) {
  animate(element, {
    ...ANIMATIONS[animation],
    delay,
  })
}

// Helper to animate staggered children
export function animateStaggered(
  container: HTMLElement,
  animation: keyof typeof ANIMATIONS = 'fadeInUp',
  staggerDelay: number = 100
) {
  const children = Array.from(container.children)
  animate(children, {
    ...ANIMATIONS[animation],
    delay: stagger(staggerDelay),
  })
}

// Helper to create expand/collapse animation
export function animateExpand(
  element: HTMLElement,
  isExpanding: boolean,
  onComplete?: () => void
) {
  if (isExpanding) {
    element.style.display = 'block'
    element.style.height = '0px'
    animate(element, {
      height: element.scrollHeight,
      opacity: [0, 1],
      duration: 300,
      easing: 'easeOutCubic',
      onComplete: onComplete,
    })
  } else {
    animate(element, {
      height: 0,
      opacity: [1, 0],
      duration: 250,
      easing: 'easeInCubic',
      onComplete: () => {
        element.style.display = 'none'
        onComplete?.()
      },
    })
  }
}

// Helper for dropdown animations
export function animateDropdown(
  element: HTMLElement,
  isOpening: boolean,
  onComplete?: () => void
) {
  if (isOpening) {
    element.style.display = 'block'
    animate(element, {
      opacity: [0, 1],
      translateY: [-10, 0],
      scale: [0.95, 1],
      duration: 200,
      easing: 'easeOutCubic',
      onComplete: onComplete,
    })
  } else {
    animate(element, {
      opacity: 0,
      translateY: -10,
      scale: 0.95,
      duration: 150,
      easing: 'easeInCubic',
      onComplete: () => {
        element.style.display = 'none'
        onComplete?.()
      },
    })
  }
}

// Helper for modal/overlay fade
export function animateOverlay(
  element: HTMLElement,
  isFadingIn: boolean,
  onComplete?: () => void
) {
  animate(element, {
    opacity: isFadingIn ? [0, 1] : [1, 0],
    duration: 200,
    easing: isFadingIn ? 'easeOutCubic' : 'easeInCubic',
    onComplete: onComplete,
  })
}
