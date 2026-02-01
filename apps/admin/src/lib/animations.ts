import anime from 'animejs'

export const animations = {
  // Entrance animations
  fadeInUp: {
    opacity: [0, 1],
    translateY: [20, 0],
    duration: 400,
    easing: 'easeOutCubic',
  },
  fadeIn: {
    opacity: [0, 1],
    duration: 300,
    easing: 'easeOutCubic',
  },
  scaleIn: {
    opacity: [0, 1],
    scale: [0.95, 1],
    duration: 250,
    easing: 'easeOutCubic',
  },
  slideInRight: {
    opacity: [0, 1],
    translateX: [20, 0],
    duration: 300,
    easing: 'easeOutCubic',
  },
  slideInLeft: {
    opacity: [0, 1],
    translateX: [-20, 0],
    duration: 300,
    easing: 'easeOutCubic',
  },

  // Exit animations
  fadeOut: {
    opacity: [1, 0],
    duration: 200,
    easing: 'easeInCubic',
  },
  scaleOut: {
    opacity: [1, 0],
    scale: [1, 0.95],
    duration: 200,
    easing: 'easeInCubic',
  },
}

export function animateEntrance(
  element: HTMLElement | null,
  animation: keyof typeof animations = 'fadeInUp',
  delay: number = 0
) {
  if (!element) return

  anime({
    targets: element,
    ...animations[animation],
    delay,
  })
}

export function animateStaggered(
  elements: NodeListOf<Element> | HTMLElement[],
  animation: keyof typeof animations = 'fadeInUp',
  staggerDelay: number = 50
) {
  if (!elements || elements.length === 0) return

  anime({
    targets: elements,
    ...animations[animation],
    delay: anime.stagger(staggerDelay),
  })
}

export function animateNumber(
  element: HTMLElement | null,
  endValue: number,
  duration: number = 1000,
  format?: (n: number) => string
) {
  if (!element) return

  const obj = { value: 0 }

  anime({
    targets: obj,
    value: endValue,
    duration,
    easing: 'easeOutExpo',
    round: 1,
    update: () => {
      element.textContent = format ? format(obj.value) : obj.value.toString()
    },
  })
}

export function animateChart(
  paths: NodeListOf<Element> | HTMLElement[],
  duration: number = 1000
) {
  if (!paths || paths.length === 0) return

  anime({
    targets: paths,
    strokeDashoffset: [anime.setDashoffset, 0],
    duration,
    easing: 'easeOutCubic',
    delay: anime.stagger(100),
  })
}

export function animateProgress(
  element: HTMLElement | null,
  percentage: number,
  duration: number = 800
) {
  if (!element) return

  anime({
    targets: element,
    width: `${percentage}%`,
    duration,
    easing: 'easeOutCubic',
  })
}

export function animatePulse(element: HTMLElement | null) {
  if (!element) return

  anime({
    targets: element,
    scale: [1, 1.05, 1],
    duration: 300,
    easing: 'easeInOutCubic',
  })
}

export function animateShake(element: HTMLElement | null) {
  if (!element) return

  anime({
    targets: element,
    translateX: [0, -10, 10, -10, 10, 0],
    duration: 400,
    easing: 'easeInOutCubic',
  })
}

export function animateExpand(
  element: HTMLElement | null,
  duration: number = 300
) {
  if (!element) return

  anime({
    targets: element,
    height: [0, element.scrollHeight],
    opacity: [0, 1],
    duration,
    easing: 'easeOutCubic',
  })
}

export function animateCollapse(
  element: HTMLElement | null,
  duration: number = 200
) {
  if (!element) return

  anime({
    targets: element,
    height: [element.scrollHeight, 0],
    opacity: [1, 0],
    duration,
    easing: 'easeInCubic',
  })
}
