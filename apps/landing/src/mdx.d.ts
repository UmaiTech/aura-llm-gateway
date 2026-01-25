declare module '*.mdx' {
  import type { ComponentType } from 'react'

  export const frontmatter: {
    title?: string
    description?: string
    [key: string]: unknown
  }

  const MDXComponent: ComponentType<{
    components?: Record<string, ComponentType>
  }>

  export default MDXComponent
}
