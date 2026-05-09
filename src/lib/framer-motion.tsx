import React, { useEffect, useRef, useState } from 'react'

type MotionValue = string | number

type ViewportOptions = {
  once?: boolean
  amount?: number
}

type Transition = {
  duration?: number
  delay?: number
  ease?: string | number[]
  repeat?: number
  repeatType?: 'loop' | 'reverse' | 'mirror'
}

type MotionProps<T extends HTMLElement> = React.HTMLAttributes<T> & {
  initial?: Record<string, MotionValue>
  animate?: Record<string, MotionValue>
  whileInView?: Record<string, MotionValue>
  whileHover?: Record<string, MotionValue>
  transition?: Transition
  viewport?: ViewportOptions
}

function toTransform(values?: Record<string, MotionValue>) {
  if (!values) return undefined
  const parts: string[] = []
  if (values.x !== undefined) parts.push(`translateX(${typeof values.x === 'number' ? `${values.x}px` : values.x})`)
  if (values.y !== undefined) parts.push(`translateY(${typeof values.y === 'number' ? `${values.y}px` : values.y})`)
  if (values.scale !== undefined) parts.push(`scale(${values.scale})`)
  if (values.rotate !== undefined) parts.push(`rotate(${typeof values.rotate === 'number' ? `${values.rotate}deg` : values.rotate})`)
  return parts.length ? parts.join(' ') : undefined
}

function styleFrom(values?: Record<string, MotionValue>): React.CSSProperties {
  if (!values) return {}
  const style: React.CSSProperties = {}
  if (values.opacity !== undefined) style.opacity = Number(values.opacity)
  const transform = toTransform(values)
  if (transform) style.transform = transform
  return style
}

function createMotionElement<T extends HTMLElement>(tag: keyof JSX.IntrinsicElements) {
  return React.forwardRef<T, MotionProps<T>>(function MotionElement(
    { initial, animate, whileInView, whileHover, transition, viewport, style, onMouseEnter, onMouseLeave, ...props },
    forwardedRef,
  ) {
    const innerRef = useRef<T | null>(null)
    const [inView, setInView] = useState(!whileInView)
    const [hovered, setHovered] = useState(false)

    useEffect(() => {
      if (!whileInView || !innerRef.current || typeof IntersectionObserver === 'undefined') {
        setInView(true)
        return
      }

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setInView(true)
            if (viewport?.once !== false) observer.disconnect()
          } else if (viewport?.once === false) {
            setInView(false)
          }
        },
        { threshold: viewport?.amount ?? 0.25 },
      )
      observer.observe(innerRef.current)
      return () => observer.disconnect()
    }, [viewport?.amount, viewport?.once, whileInView])

    const target = hovered && whileHover ? whileHover : inView ? (whileInView ?? animate) : initial
    const duration = transition?.duration ?? 0.55
    const delay = transition?.delay ?? 0
    const mergedStyle: React.CSSProperties = {
      ...styleFrom(initial),
      ...style,
      ...styleFrom(target),
      transitionProperty: 'opacity, transform, box-shadow, border-color, background-color',
      transitionDuration: `${duration}s`,
      transitionDelay: `${delay}s`,
      transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
      willChange: 'opacity, transform',
    }

    return React.createElement(tag, {
      ...props,
      ref: (node: T | null): void => {
        innerRef.current = node
        if (typeof forwardedRef === 'function') forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      },
      style: mergedStyle,
      onMouseEnter: (event: React.MouseEvent<T>) => {
        setHovered(true)
        onMouseEnter?.(event)
      },
      onMouseLeave: (event: React.MouseEvent<T>) => {
        setHovered(false)
        onMouseLeave?.(event)
      },
    })
  })
}

export const motion = {
  a: createMotionElement<HTMLAnchorElement>('a'),
  article: createMotionElement<HTMLElement>('article'),
  div: createMotionElement<HTMLDivElement>('div'),
  h1: createMotionElement<HTMLHeadingElement>('h1'),
  header: createMotionElement<HTMLElement>('header'),
  li: createMotionElement<HTMLLIElement>('li'),
  main: createMotionElement<HTMLElement>('main'),
  p: createMotionElement<HTMLParagraphElement>('p'),
  section: createMotionElement<HTMLElement>('section'),
  span: createMotionElement<HTMLSpanElement>('span'),
}
