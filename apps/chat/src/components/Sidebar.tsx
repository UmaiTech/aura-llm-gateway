import { Plus, MessageSquare, Trash2, X } from 'lucide-react'
import { cn, formatDate } from '../lib/utils'
import type { Conversation } from '../lib/types'

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
  conversations: Conversation[]
  currentConversationId: string | null
  onNewConversation: () => void
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
}

export function Sidebar({
  isOpen,
  onToggle,
  conversations,
  currentConversationId,
  onNewConversation,
  onSelectConversation,
  onDeleteConversation,
}: SidebarProps) {
  // Group conversations by date
  const groupedConversations = conversations.reduce((groups, conv) => {
    const dateKey = formatDate(conv.createdAt)
    if (!groups[dateKey]) {
      groups[dateKey] = []
    }
    groups[dateKey].push(conv)
    return groups
  }, {} as Record<string, Conversation[]>)

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed lg:relative inset-y-0 left-0 z-50 w-72 bg-background border-r border-border flex flex-col transition-transform duration-200 ease-in-out",
          isOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0 lg:w-0 lg:opacity-0"
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h2 className="font-semibold">Chats</h2>
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors lg:hidden"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* New chat button */}
        <div className="p-3">
          <button
            onClick={onNewConversation}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 hover:bg-primary-600 text-white font-medium transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Chat
          </button>
        </div>

        {/* Conversations list */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {Object.entries(groupedConversations).map(([date, convs]) => (
            <div key={date} className="mb-4">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 mb-2">
                {date}
              </h3>
              <div className="space-y-1">
                {convs.map((conv) => (
                  <ConversationItem
                    key={conv.id}
                    conversation={conv}
                    isActive={conv.id === currentConversationId}
                    onSelect={() => onSelectConversation(conv.id)}
                    onDelete={() => onDeleteConversation(conv.id)}
                  />
                ))}
              </div>
            </div>
          ))}

          {conversations.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">No conversations yet</p>
              <p className="text-xs mt-1">Start a new chat to begin</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border">
          <div className="text-xs text-muted-foreground text-center">
            Aura LLM Gateway v0.1.0
          </div>
        </div>
      </aside>
    </>
  )
}

interface ConversationItemProps {
  conversation: Conversation
  isActive: boolean
  onSelect: () => void
  onDelete: () => void
}

function ConversationItem({
  conversation,
  isActive,
  onSelect,
  onDelete,
}: ConversationItemProps) {
  return (
    <div
      className={cn(
        "group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
        isActive
          ? "bg-primary-500/10 text-primary-400"
          : "hover:bg-secondary text-foreground"
      )}
      onClick={onSelect}
    >
      <MessageSquare className="h-4 w-4 flex-shrink-0" />
      <span className="flex-1 truncate text-sm">{conversation.title}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onDelete()
        }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/20 hover:text-destructive transition-all"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
