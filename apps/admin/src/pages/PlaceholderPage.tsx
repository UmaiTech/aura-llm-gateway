import { Header } from '@/components/layout'
import { Card, CardContent } from '@/components/ui'
import { HammerLine } from '@mingcute/react'

interface PlaceholderPageProps {
  title: string
  description?: string
}

export function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col">
      <Header title={title} description={description} />

      <div className="flex-1 p-6">
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <div className="rounded-full bg-muted p-4 mb-4">
              <HammerLine className="h-8 w-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold mb-2">Coming Soon</h2>
            <p className="text-muted-foreground text-center max-w-md">
              The {title} page is under construction. Check back soon for updates.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
